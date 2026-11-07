// A small abstract site mock built from a design's colors.
export default function Preview({ c, height = 200 }) {
  const bar = (w, h, bg) => ({ height: h, width: w, background: bg, borderRadius: 4 });
  return (
    <div className="preview" aria-hidden="true" style={{ background: c.bg, height }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={bar(48, 12, c.accent)} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={bar(28, 8, c.ink)} />
          <div style={bar(28, 8, c.ink)} />
          <div style={bar(28, 8, c.ink)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={bar('90%', 14, c.head)} />
          <div style={bar('100%', 8, c.ink)} />
          <div style={bar('70%', 8, c.ink)} />
          <div style={{ height: 26, width: 80, marginTop: 6, borderRadius: 8, background: c.accent }} />
        </div>
        <div style={{ width: '44%', height: 110, borderRadius: 12, background: c.tint }} />
      </div>
    </div>
  );
}
