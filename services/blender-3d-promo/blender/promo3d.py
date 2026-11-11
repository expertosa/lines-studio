"""Lines Studio — procedural 3D promo scene for Blender.

Builds the whole scene from a JSON spec (no .blend template, no addons) and
renders a PNG frame sequence. Text is NOT drawn here: Blender's text objects
do not shape Arabic, so titles and captions are composited afterwards by
ffmpeg/libass (see src/overlay.js).

Run with Blender 3.6 – 5.x:

    blender -b --factory-startup -noaudio -P blender/promo3d.py -- \
        --spec spec.json --frames out/frames [--still 90] [--save-blend out/scene.blend]

or with the `bpy` Python module:

    python blender/promo3d.py -- --spec spec.json --frames out/frames

Spec (version 1), produced by src/spec.js:

    {
      "version": 1, "width": 1080, "height": 1920, "fps": 30, "seconds": 15,
      "palette": {"background": "#0B1F33", "primary": "#E8C872", "accent": "#4FD1C5", "text": "#F7F3EA"},
      "hero": {"type": "phone" | "laptop" | "orb", "image": "/abs/screen.png" | null, "focus": 0.5},
      "scenes": [{"start": 0, "end": 5, "shot": "reveal" | "orbit" | "close" | "detail" | "outro"}],
      "quality": "draft" | "final", "renderEngine": "eevee" | "cycles" | "workbench", "seed": 7
    }
"""

import argparse
import json
import math
import os
import random
import sys

import bpy  # must come first: the bpy wheel provides bmesh
import bmesh  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arabic  # noqa: E402  (blender/arabic.py, stdlib only)

# ---------------------------------------------------------------- helpers


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="promo3d.py")
    parser.add_argument("--spec", required=True)
    parser.add_argument("--frames", required=True, help="directory for frame_####.png")
    parser.add_argument("--still", type=int, default=0, help="render only this frame (1-based)")
    parser.add_argument("--save-blend", default="", help="also save the generated .blend")
    return parser.parse_args(argv)


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def color(hex_value, scale=1.0, alpha=1.0):
    value = str(hex_value).lstrip("#")
    if len(value) != 6:
        raise ValueError("palette colors must be #RRGGBB")
    rgb = [srgb_to_linear(int(value[i:i + 2], 16) / 255.0) * scale for i in (0, 2, 4)]
    return (rgb[0], rgb[1], rgb[2], alpha)


def set_input(node, names, value):
    """Principled BSDF socket names changed across Blender versions."""
    for name in names if isinstance(names, (list, tuple)) else [names]:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return socket
    return None


def socket(node, names):
    for name in names:
        found = node.inputs.get(name)
        if found is not None:
            return found
    return None


def principled(name, base, roughness=0.4, metallic=0.0, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = base  # Workbench preview colour
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    set_input(bsdf, "Base Color", base)
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "Metallic", metallic)
    if emission is not None:
        set_input(bsdf, ["Emission Color", "Emission"], emission)
        set_input(bsdf, "Emission Strength", strength)
    return mat


def emissive(name, rgba, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = rgba
    emit.inputs["Strength"].default_value = strength
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def link_object(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_object(name, build, material=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    if material is not None:
        mesh.materials.append(material)
    return link_object(obj)


def box(bm, sx, sy, sz):
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)


def bevel(obj, width, segments=6):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return mod


def quad_with_uv(name, width, height, material):
    """A front-facing (-Y) plane with UVs, used as a device screen."""
    mesh = bpy.data.meshes.new(name)
    w, h = width / 2.0, height / 2.0
    mesh.from_pydata([(-w, 0, -h), (w, 0, -h), (w, 0, h), (-w, 0, h)], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name="UVMap")
    for loop, coord in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop.uv = coord
    mesh.materials.append(material)
    return link_object(bpy.data.objects.new(name, mesh))


def curve_object(name, points, bevel_depth, material, cyclic=False, kind="BEZIER"):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = bevel_depth
    data.bevel_resolution = 4
    data.use_fill_caps = True
    spline = data.splines.new(kind)
    if kind == "BEZIER":
        spline.bezier_points.add(len(points) - 1)
        for point, co in zip(spline.bezier_points, points):
            point.co = co
            point.handle_left_type = "AUTO"
            point.handle_right_type = "AUTO"
    else:
        spline.points.add(len(points) - 1)
        for point, co in zip(spline.points, points):
            point.co = (co[0], co[1], co[2], 1.0)
    spline.use_cyclic_u = cyclic
    data.materials.append(material)
    return link_object(bpy.data.objects.new(name, data))


def key(target, path, frame, value=None):
    if value is not None:
        setattr(target, path, value)
    target.keyframe_insert(data_path=path, frame=frame)


def screen_material(palette, image_path, screen_aspect, focus=0.5):
    """Screen shader. An image is cover-fitted (centre crop) to the screen aspect."""
    mat = bpy.data.materials.new("Screen")
    mat.use_nodes = True
    mat.diffuse_color = color(palette["primary"])
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    set_input(bsdf, "Roughness", 0.18)
    set_input(bsdf, "Emission Strength", 0.55)
    emission_socket = socket(bsdf, ["Emission Color", "Emission"])
    base_socket = socket(bsdf, ["Base Color"])
    source = None
    if image_path and os.path.isfile(image_path):
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(image_path)
        tex.extension = "EXTEND"
        img_w, img_h = tex.image.size
        if img_w and img_h:
            image_aspect = img_w / float(img_h)
            sx = min(1.0, screen_aspect / image_aspect)  # crop width when the image is wider
            sy = min(1.0, image_aspect / screen_aspect)  # crop height when the image is taller
            coords = nodes.new("ShaderNodeTexCoord")
            mapping = nodes.new("ShaderNodeMapping")
            mapping.inputs["Scale"].default_value = (sx, sy, 1.0)
            # keep the top of a tall page (hero section); focus 0 = left edge, 1 = right edge
            mapping.inputs["Location"].default_value = ((1.0 - sx) * focus, 1.0 - sy, 0.0)
            links.new(coords.outputs["UV"], mapping.inputs["Vector"])
            links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        source = tex.outputs["Color"]
    else:
        coords = nodes.new("ShaderNodeTexCoord")
        grad = nodes.new("ShaderNodeTexGradient")
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = color(palette["background"], 1.4)
        ramp.color_ramp.elements[1].color = color(palette["accent"])
        mid = ramp.color_ramp.elements.new(0.55)
        mid.color = color(palette["primary"])
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(65))
        links.new(coords.outputs["UV"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
        links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
        source = ramp.outputs["Color"]
    links.new(source, base_socket)
    if emission_socket is not None:
        links.new(source, emission_socket)
    return mat


# ---------------------------------------------------------------- scene parts


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.context.preferences.edit.keyframe_new_interpolation_type = "BEZIER"
    except Exception:  # noqa: BLE001 - preferences differ in background mode
        pass
    return bpy.context.scene


def build_world(scene, palette):
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.color = color(palette["background"])[:3]
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = color(palette["background"])
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world


def build_stage(palette, hero_type):
    floor = mesh_object(
        "Floor",
        lambda bm: bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400.0),
        principled("Floor", color(palette["background"], 0.55), roughness=0.22),
    )
    floor.location.z = 0.0
    radius = 2.1 if hero_type == "laptop" else 1.55
    podium = mesh_object(
        "Podium",
        lambda bm: bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=radius, radius2=radius, depth=0.22),
        principled("Podium", color(palette["background"], 1.8), roughness=0.35, metallic=0.4),
        smooth=True,
    )
    podium.location.z = 0.11
    ring_points = [(math.cos(a) * (radius + 0.02), math.sin(a) * (radius + 0.02), 0.22)
                   for a in [i / 96.0 * 2 * math.pi for i in range(96)]]
    curve_object("PodiumGlow", ring_points, 0.018, emissive("PodiumGlow", color(palette["accent"]), 6.0),
                 cyclic=True, kind="POLY")
    return 0.22  # top of the podium


def build_phone(palette, image_path, base_z, focus=0.5):
    pivot = link_object(bpy.data.objects.new("Hero", None))
    pivot.location = (0.0, 0.0, base_z + 1.75)
    body = mesh_object(
        "PhoneBody",
        lambda bm: box(bm, 1.55, 0.16, 3.2),
        principled("PhoneBody", color("#1A1D24"), roughness=0.25, metallic=0.85),
    )
    bevel(body, 0.075, 8)
    body.parent = pivot
    material = screen_material(palette, image_path, 1.42 / 3.06, focus)
    screen = quad_with_uv("PhoneScreen", 1.42, 3.06, material)
    screen.location = (0.0, -0.0815, 0.0)
    screen.parent = pivot
    return pivot, {"parent": pivot, "center": (0.0, -0.0815, 0.0), "size": (1.42, 3.06), "material": material}


def build_laptop(palette, image_path, base_z, frames, focus=0.5):
    pivot = link_object(bpy.data.objects.new("Hero", None))
    pivot.location = (0.0, 0.0, base_z + 0.05)
    shell = principled("LaptopShell", color("#B9BEC7"), roughness=0.3, metallic=0.9)
    base = mesh_object("LaptopBase", lambda bm: box(bm, 3.2, 2.15, 0.09), shell)
    bevel(base, 0.035, 5)
    base.parent = pivot
    deck = mesh_object("LaptopDeck", lambda bm: box(bm, 2.8, 1.0, 0.01),
                       principled("Keys", color("#22252B"), roughness=0.6))
    deck.location = (0.0, 0.2, 0.05)
    deck.parent = pivot
    hinge = link_object(bpy.data.objects.new("Hinge", None))
    hinge.location = (0.0, 1.075, 0.045)
    hinge.parent = pivot
    lid = mesh_object("LaptopLid", lambda bm: box(bm, 3.2, 0.07, 2.05), shell)
    bevel(lid, 0.03, 5)
    lid.location = (0.0, 0.0, 1.025)
    lid.parent = hinge
    material = screen_material(palette, image_path, 2.95 / 1.84, focus)
    screen = quad_with_uv("LaptopScreen", 2.95, 1.84, material)
    screen.location = (0.0, -0.037, 1.025)
    screen.parent = hinge
    # Lid opens during the first scene: closed (lying flat) -> ~105 degrees open.
    open_end = max(2, int(frames * 0.18))
    key(hinge, "rotation_euler", 1, (math.radians(-88), 0.0, 0.0))
    key(hinge, "rotation_euler", open_end, (math.radians(14), 0.0, 0.0))
    return pivot, {"parent": hinge, "center": (0.0, -0.037, 1.025), "size": (2.95, 1.84), "material": material}


def build_orb(palette, base_z, frames):
    pivot = link_object(bpy.data.objects.new("Hero", None))
    pivot.location = (0.0, 0.0, base_z + 1.55)
    orb = mesh_object(
        "Orb",
        lambda bm: bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.15),
        principled("Orb", color(palette["primary"]), roughness=0.12, metallic=1.0),
        smooth=True,
    )
    orb.parent = pivot
    for index, (radius, tilt) in enumerate([(1.7, 18), (2.05, -28)]):
        points = [(math.cos(a) * radius, math.sin(a) * radius, 0.0)
                  for a in [i / 96.0 * 2 * math.pi for i in range(96)]]
        ring = curve_object(f"OrbRing{index}", points, 0.03,
                            emissive(f"OrbRing{index}", color(palette["accent"]), 5.0), cyclic=True, kind="POLY")
        ring.parent = pivot
        key(ring, "rotation_euler", 1, (math.radians(tilt), 0.0, 0.0))
        key(ring, "rotation_euler", frames, (math.radians(tilt), 0.0, math.radians(140 if index else -140)))
    return pivot, None


def animate_hero(pivot, frames, fps, hero_type):
    turn = 0.0 if hero_type == "laptop" else 0.55
    key(pivot, "rotation_euler", 1, (0.0, 0.0, -turn))
    key(pivot, "rotation_euler", frames, (0.0, 0.0, turn * 0.7))
    z0 = pivot.location.z
    step = max(1, int(fps * 1.5))
    for index, frame in enumerate(range(1, frames + 1, step)):
        key(pivot, "location", frame, (0.0, 0.0, z0 + (0.06 if index % 2 else -0.04)))


def build_lines(palette, rng, frames, fps, count, outro_frame):
    """The brand motif: glowing lines that draw themselves around the hero.

    Arcs stay behind the hero (the camera looks from -Y) so they frame the
    screen instead of crossing it, and retract when the outro starts.
    """
    group = link_object(bpy.data.objects.new("Lines", None))
    materials = [
        emissive("LinePrimary", color(palette["primary"]), 4.5),
        emissive("LineAccent", color(palette["accent"]), 5.5),
    ]
    draw_window = max(2, int(frames * 0.45))
    for index in range(count):
        radius = rng.uniform(2.3, 4.4)
        start_angle = rng.uniform(-0.12, 0.3) * math.pi
        sweep = rng.uniform(0.55, 0.95) * math.pi
        z0 = rng.uniform(0.35, 3.6)
        dz = rng.uniform(-1.2, 1.4)
        wobble = rng.uniform(0.1, 0.35)
        points = []
        for step in range(10):
            t = step / 9.0
            angle = start_angle + sweep * t
            r = radius + math.sin(t * math.pi * 2 + index) * wobble
            points.append((math.cos(angle) * r, math.sin(angle) * r, z0 + dz * t + math.sin(t * math.pi) * 0.4))
        line = curve_object(f"Line{index:02d}", points, rng.uniform(0.008, 0.026), materials[index % 2])
        line.parent = group
        data = line.data
        begin = 1 + int(rng.uniform(0, draw_window * 0.8))
        length = int(fps * rng.uniform(1.0, 2.4))
        key(data, "bevel_factor_end", 1, 0.0)
        key(data, "bevel_factor_end", begin, 0.0)
        key(data, "bevel_factor_end", min(frames, begin + length), 1.0)
        retract = outro_frame + int(rng.uniform(0, fps * 0.3))
        key(data, "bevel_factor_start", 1, 0.0)
        key(data, "bevel_factor_start", retract, 0.0)
        key(data, "bevel_factor_start", min(frames, retract + int(fps * 0.6)), 1.0)
    key(group, "rotation_euler", 1, (0.0, 0.0, math.radians(-10)))
    key(group, "rotation_euler", frames, (0.0, 0.0, math.radians(12)))
    return group


def build_exploded_ui(screen, frames, fps, window, rng):
    """Slices of the screenshot lift off the screen toward the camera, then settle back.

    Each slice reuses the screen material with a sub-range of the screen UVs, so
    it shows exactly the pixels it covers and is invisible until it moves.
    """
    if screen is None or window is None:
        return
    width, height = screen["size"]
    cx, cy, cz = screen["center"]
    bands = [(0.80, 0.97), (0.45, 0.78), (0.18, 0.43)]  # top bar, headline, call to action (v from bottom)
    start, end = window
    for index, (v0, v1) in enumerate(bands):
        mesh = bpy.data.meshes.new(f"UiLayer{index}")
        w = width / 2.0
        z0, z1 = (v0 - 0.5) * height, (v1 - 0.5) * height
        mesh.from_pydata([(-w, 0, z0), (w, 0, z0), (w, 0, z1), (-w, 0, z1)], [], [(0, 1, 2, 3)])
        uv = mesh.uv_layers.new(name="UVMap")
        for loop, coord in zip(uv.data, [(0, v0), (1, v0), (1, v1), (0, v1)]):
            loop.uv = coord
        mesh.materials.append(screen["material"])
        layer = link_object(bpy.data.objects.new(f"UiLayer{index}", mesh))
        layer.parent = screen["parent"]
        rest = (cx, cy - 0.003 - index * 0.001, cz)
        lift = 0.6 + index * 0.45
        out = (cx + rng.uniform(-0.12, 0.12), cy - lift, cz + (index - 1) * 0.06)
        tilt = (math.radians(rng.uniform(-4, 4)), 0.0, math.radians(rng.uniform(-6, 6)))
        delay = int(index * fps * 0.12)
        up = min(frames, start + delay)
        held = min(frames, up + int(fps * 0.45))
        back = max(held + 1, min(frames, end - int(fps * 0.5) + delay // 2))
        home = min(frames, back + int(fps * 0.4))
        for frame, loc, rot, scale in ((1, rest, (0, 0, 0), 1.0), (up, rest, (0, 0, 0), 1.0),
                                       (held, out, tilt, 1.06), (back, out, tilt, 1.06),
                                       (home, rest, (0, 0, 0), 1.0)):
            key(layer, "location", frame, loc)
            key(layer, "rotation_euler", frame, rot)
            key(layer, "scale", frame, (scale, scale, scale))


def build_title3d(spec, palette, frames, fps, outro_frame, title_y, title_z, width_target):
    """Extruded, bevelled title that flips up in the outro. Arabic is shaped by arabic.py."""
    info = spec.get("title3d") or {}
    font_path = info.get("font")
    if not font_path or not os.path.isfile(font_path):
        return None
    data = bpy.data.curves.new("Title3D", "FONT")
    data.body = arabic.visual(spec["title"])
    data.font = bpy.data.fonts.load(font_path)
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    data.size = 1.0
    data.extrude = 0.09
    data.bevel_depth = 0.018
    data.bevel_resolution = 3
    data.materials.append(principled("Title3D", color(palette["primary"]), roughness=0.22, metallic=0.85,
                                     emission=color(palette["primary"]), strength=0.35))
    title = link_object(bpy.data.objects.new("Title3D", data))
    bpy.context.view_layer.update()
    measured = max(0.01, title.dimensions.x)
    scale = width_target / measured
    final_loc = (0.0, title_y, title_z)
    begin = min(frames, outro_frame + int(fps * 0.15))
    land = min(frames, begin + int(fps * 0.55))
    settle = min(frames, land + int(fps * 0.2))
    key(title, "hide_render", 1, True)
    key(title, "hide_render", max(1, begin - 1), True)
    key(title, "hide_render", begin, False)
    key(title, "location", begin, (0.0, title_y, title_z - 0.9))
    key(title, "rotation_euler", begin, (math.radians(150), 0.0, 0.0))
    key(title, "scale", begin, (scale * 0.7,) * 3)
    key(title, "location", land, (0.0, title_y, title_z + 0.06))
    key(title, "rotation_euler", land, (math.radians(84), 0.0, 0.0))
    key(title, "scale", land, (scale * 1.04,) * 3)
    key(title, "location", settle, final_loc)
    key(title, "rotation_euler", settle, (math.radians(90), 0.0, 0.0))
    key(title, "scale", settle, (scale,) * 3)
    key(title, "rotation_euler", frames, (math.radians(90), 0.0, math.radians(-3)))
    return title, measured * scale, data.size * scale


def build_emblem_lines(palette, frames, fps, outro_frame, title_y, title_z, span, text_h, rtl):
    """Parallel strokes that sweep in behind the title: the lines become the sign-off."""
    mats = [emissive("EmblemPrimary", color(palette["primary"]), 5.0),
            emissive("EmblemAccent", color(palette["accent"]), 6.0)]
    rows = [(-0.62, 1.0, 0.02), (-0.78, 0.7, 0.014), (0.66, 0.55, 0.012), (-0.92, 0.42, 0.01)]
    for index, (dz, length, depth) in enumerate(rows):
        half = span * 0.5
        x0, x1 = (half, half - span * length) if rtl else (-half, -half + span * length)
        z = title_z + dz * text_h
        line = curve_object(f"Emblem{index}", [(x0, title_y + 0.25, z), (x1, title_y + 0.25, z)], depth,
                            mats[index % 2], kind="POLY")
        begin = min(frames, outro_frame + int(fps * (0.35 + index * 0.12)))
        key(line.data, "bevel_factor_end", 1, 0.0)
        key(line.data, "bevel_factor_end", begin, 0.0)
        key(line.data, "bevel_factor_end", min(frames, begin + int(fps * 0.5)), 1.0)


def build_particles(palette, rng, frames, count):
    mat = emissive("Dust", color(palette["accent"], 1.0), 2.5)
    for index in range(count):
        radius = rng.uniform(0.012, 0.04)
        dot = mesh_object(f"Dust{index:02d}",
                          lambda bm, r=radius: bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r), mat)
        angle = rng.uniform(0, 2 * math.pi)
        dist = rng.uniform(1.8, 7.0)
        x, y, z = math.cos(angle) * dist, math.sin(angle) * dist, rng.uniform(0.2, 5.0)
        key(dot, "location", 1, (x, y, z))
        key(dot, "location", frames, (x, y, z + rng.uniform(0.4, 1.2)))


def build_lights(palette):
    def area(name, location, energy, size, rgba, rotation):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        data.color = rgba[:3]
        obj = link_object(bpy.data.objects.new(name, data))
        obj.location = location
        obj.rotation_euler = [math.radians(v) for v in rotation]
        return obj

    area("Key", (-4.5, -5.0, 6.5), 900, 5.0, (1.0, 0.97, 0.93, 1.0), (50, 0, -40))
    area("Rim", (4.0, 4.5, 4.0), 700, 3.0, color(palette["accent"]), (-60, 0, 140))
    area("Fill", (5.5, -4.0, 2.0), 250, 4.0, color(palette["primary"]), (75, 0, 50))


# ---------------------------------------------------------------- camera

# Spherical poses around the hero: (azimuth deg, elevation deg, distance multiplier, target z offset).
SHOTS = {
    "reveal": ((-38, 26, 1.65, 0.0), (-14, 12, 1.0, 0.0)),
    "orbit": ((-14, 12, 1.0, 0.0), (42, 18, 1.0, 0.0)),
    "close": ((26, 6, 0.62, 0.2), (6, 3, 0.55, 0.25)),
    "detail": ((-62, 32, 0.85, -0.1), (-30, 22, 0.72, 0.0)),
    "outro": ((-10, 16, 1.3, -0.75), (0, 11, 1.18, -0.75)),
    # three-quarter view so the lifted UI layers read as depth, not as a glitch
    "explode": ((-58, 16, 0.95, 0.1), (-36, 10, 0.86, 0.1)),
}


OUTRO_DIST = (1.3, 1.15)  # camera distance multipliers at the start/end of the outro


def frame_distance(width, height, hero_type):
    aspect = width / float(height)
    base = 11.5 if hero_type == "laptop" else 10.0
    # sensor_fit AUTO maps 36mm to the longer side, so a vertical frame is as tall as a
    # landscape one is wide: move in so the hero fills it.
    if aspect < 1.0:
        return base * (0.8 if hero_type == "laptop" else 0.72)
    if aspect == 1.0:
        return base * 0.85
    return base


def build_camera(scene, spec, target_z, hero_type, outro_target=None, explode_scene=None):
    width, height, fps = spec["width"], spec["height"], spec["fps"]
    data = bpy.data.cameras.new("Camera")
    data.lens = 50
    data.sensor_fit = "AUTO"
    cam = link_object(bpy.data.objects.new("Camera", data))
    scene.camera = cam
    target = link_object(bpy.data.objects.new("CameraTarget", None))
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    if spec.get("quality") == "final":
        data.dof.use_dof = True
        data.dof.focus_object = target
        data.dof.aperture_fstop = 3.2

    distance = frame_distance(width, height, hero_type)
    frames = int(spec["seconds"] * fps)

    def place(frame, pose):
        azimuth, elevation, mult, dz = pose
        az, el = math.radians(azimuth), math.radians(elevation)
        r = distance * mult
        location = (math.sin(az) * r * math.cos(el), -math.cos(az) * r * math.cos(el),
                    target_z + r * math.sin(el))
        key(cam, "location", frame, location)
        key(target, "location", frame, (0.0, 0.0, target_z + dz))

    def place_outro(frame, azimuth, elevation, dist):
        ty, tz = outro_target
        az, el = math.radians(azimuth), math.radians(elevation)
        location = (math.sin(az) * dist * math.cos(el), ty - math.cos(az) * dist * math.cos(el),
                    tz + dist * math.sin(el))
        key(cam, "location", frame, location)
        key(target, "location", frame, (0.0, ty, tz))

    for scene_spec in spec["scenes"]:
        first = 1 + int(round(scene_spec["start"] * fps))
        last = max(first, min(frames, int(round(scene_spec["end"] * fps))))
        if scene_spec.get("shot") == "outro" and outro_target is not None:
            place_outro(first, -14, 14, distance * OUTRO_DIST[0])
            place_outro(last, -2, 7, distance * OUTRO_DIST[1])
            continue
        shot = "explode" if scene_spec is explode_scene else scene_spec.get("shot")
        start_pose, end_pose = SHOTS.get(shot, SHOTS["orbit"])
        place(first, start_pose)
        place(last, end_pose)
    return cam


# ---------------------------------------------------------------- render setup


def pick_engine(scene, wanted):
    options = {
        "eevee": ["BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"],
        "cycles": ["CYCLES"],
        "workbench": ["BLENDER_WORKBENCH"],
    }.get(wanted, ["BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"])
    for engine in options:
        try:
            scene.render.engine = engine
            return engine
        except TypeError:
            continue
    scene.render.engine = "BLENDER_WORKBENCH"
    return "BLENDER_WORKBENCH"


def configure_render(scene, spec, frames_dir):
    final = spec.get("quality") == "final"
    engine = pick_engine(scene, spec.get("renderEngine", "eevee"))
    render = scene.render
    render.resolution_x = spec["width"]
    render.resolution_y = spec["height"]
    render.resolution_percentage = 100 if final else 50
    render.fps = spec["fps"]
    render.film_transparent = False
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGB"
    render.filepath = os.path.join(frames_dir, "frame_####")
    scene.frame_start = 1
    scene.frame_end = int(spec["seconds"] * spec["fps"])
    try:
        scene.view_settings.view_transform = "Standard"  # keep brand colours exact
    except TypeError:
        pass

    if engine.startswith("BLENDER_EEVEE"):
        eevee = scene.eevee
        eevee.taa_render_samples = 64 if final else 16
        for attr, value in (("use_raytracing", final), ("use_gtao", True), ("use_bloom", True),
                            ("use_ssr", final), ("use_soft_shadows", final)):
            if hasattr(eevee, attr):
                setattr(eevee, attr, value)
    elif engine == "CYCLES":
        scene.cycles.samples = 128 if final else 24
        scene.cycles.use_denoising = True
    else:
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.color_type = "MATERIAL"
    add_glow(scene)
    return engine


def add_glow(scene):
    """Bloom via the compositor (EEVEE Next dropped the built-in bloom). Best effort."""
    try:
        scene.use_nodes = True
        tree = scene.node_tree
        if tree is None:
            return
        for node in list(tree.nodes):
            tree.nodes.remove(node)
        layers = tree.nodes.new("CompositorNodeRLayers")
        glare = tree.nodes.new("CompositorNodeGlare")
        glare.glare_type = "FOG_GLOW"
        glare.quality = "MEDIUM"
        glare.threshold = 0.9
        glare.size = 7
        out = tree.nodes.new("CompositorNodeComposite")
        tree.links.new(layers.outputs["Image"], glare.inputs["Image"])
        tree.links.new(glare.outputs["Image"], out.inputs["Image"])
    except Exception:  # noqa: BLE001 - compositor API changed in Blender 5
        scene.use_nodes = False


def report_progress(total):
    def handler(scene, *_args):
        print(f"PROMO3D_FRAME {scene.frame_current} {total}", flush=True)
    bpy.app.handlers.render_write.append(handler)


# ---------------------------------------------------------------- main


def explode_scene(spec):
    """The first close/detail scene (else the orbit) gets the exploded-UI moment."""
    scenes = spec["scenes"][:-1]
    chosen = next((s for s in scenes if s.get("shot") in ("close", "detail")), None)
    chosen = chosen or next((s for s in scenes if s.get("shot") == "orbit"), None)
    if chosen is None or chosen["end"] - chosen["start"] < 1.5:
        return None
    return chosen


def explode_window(chosen, fps, frames):
    if chosen is None:
        return None
    return (1 + int(round((chosen["start"] + 0.3) * fps)), min(frames, int(round(chosen["end"] * fps))))


def build(spec, frames_dir):
    scene = reset_scene()
    palette = spec["palette"]
    hero = spec.get("hero") or {}
    hero_type = hero.get("type", "phone")
    rng = random.Random(int(spec.get("seed", 7)))
    fps = int(spec["fps"])
    frames = int(spec["seconds"] * fps)

    build_world(scene, palette)
    base_z = build_stage(palette, hero_type)
    focus = float(hero.get("focus", 0.5))
    if hero_type == "laptop":
        pivot, screen = build_laptop(palette, hero.get("image"), base_z, frames, focus)
        target_z = base_z + 1.0
    elif hero_type == "orb":
        pivot, screen = build_orb(palette, base_z, frames)
        target_z = pivot.location.z
    else:
        pivot, screen = build_phone(palette, hero.get("image"), base_z, focus)
        target_z = pivot.location.z
    animate_hero(pivot, frames, fps, hero_type)

    outro = spec["scenes"][-1]
    outro_frame = 1 + int(round(outro["start"] * fps))
    exploding = explode_scene(spec) if spec.get("explode", True) and hero.get("image") and screen else None
    if exploding is not None:
        build_exploded_ui(screen, frames, fps, explode_window(exploding, fps, frames), rng)
    build_lines(palette, rng, frames, fps, 14 if spec.get("quality") == "final" else 10, outro_frame)
    build_particles(palette, rng, frames, 60 if spec.get("quality") == "final" else 30)
    build_lights(palette)

    outro_target = None
    distance = frame_distance(spec["width"], spec["height"], hero_type)
    title_y = -2.3 if hero_type == "laptop" else -1.9
    title_z = base_z + 0.75
    outro_target_y = title_y * 0.45
    cam_to_title = distance * OUTRO_DIST[1] - (outro_target_y - title_y)
    sensor_w = 36.0 if spec["width"] >= spec["height"] else 36.0 * spec["width"] / spec["height"]
    visible_w = cam_to_title * sensor_w / 50.0
    made = build_title3d(spec, palette, frames, fps, outro_frame, title_y, title_z, visible_w * 0.78)
    if made:
        _, span, text_h = made
        build_emblem_lines(palette, frames, fps, outro_frame, title_y, title_z, span * 1.15, text_h,
                           spec.get("language") == "ar")
        outro_target = (outro_target_y, (title_z + target_z) / 2.0)
    build_camera(scene, spec, target_z, hero_type, outro_target, exploding)
    engine = configure_render(scene, spec, frames_dir)
    return scene, engine, frames


def main():
    args = parse_args()
    with open(args.spec, "r", encoding="utf-8") as handle:
        spec = json.load(handle)
    if spec.get("version") != 1:
        raise SystemExit("unsupported spec version")
    os.makedirs(args.frames, exist_ok=True)
    scene, engine, frames = build(spec, os.path.abspath(args.frames))
    print(f"PROMO3D_READY engine={engine} frames={frames}", flush=True)
    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save_blend))
    if args.still:
        scene.frame_set(max(1, min(frames, args.still)))
        scene.render.filepath = os.path.join(os.path.abspath(args.frames), f"still_{args.still:04d}.png")
        bpy.ops.render.render(write_still=True)
        print("PROMO3D_DONE still", flush=True)
        return
    report_progress(frames)
    bpy.ops.render.render(animation=True)
    print("PROMO3D_DONE animation", flush=True)


if __name__ == "__main__":
    main()
