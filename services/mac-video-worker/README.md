# Mac video worker

Pull worker for the Lines video API. It runs on the Mac mini, claims one job at a time, and drives MoneyPrinterTurbo's local API (Colima). The API never calls the Mac. When the mini is off, the same worker can run on the MacBook **only if the external drive is mounted**. Nothing in this process is allowed to use the internal disk.

Brand spelling in Arabic narration instructions: «اكسبرتو».

## Layout on `/Volumes/Data`

```
/Volumes/Data/lines-video-worker/
  app/                      # this directory (services/mac-video-worker)
  MoneyPrinterTurbo/        # git checkout, not a submodule of lines-studio
  colima/                   # Colima/Lima disk, via the symlink below
  cache/                    # XDG_CACHE_HOME, Edge TTS / model cache
  tmp/
  logs/
  secrets/worker-token      # mode 0600, the worker bearer, one line
  mpt/config.toml           # Pixabay key and storage paths live here
```

`LINES_WORKER_ROOT` must be `/Volumes/Data/lines-video-worker` (or another directory under `/Volumes/Data`). The process exits before creating files if the root, the MoneyPrinterTurbo checkout, or the token file is anywhere else (`/tmp`, `/Users`, the internal SSD).

## MoneyPrinterTurbo

Clone onto the drive:

```bash
git clone https://github.com/harry0703/MoneyPrinterTurbo.git \
  /Volumes/Data/lines-video-worker/MoneyPrinterTurbo
```

Copy `config.example.toml` to `/Volumes/Data/lines-video-worker/mpt/config.toml` and set:

- `video_source = "pixabay"`
- `pixabay_api_keys = ["…"]` (the key stays in this file, mode `0600`, not in git)
- `material_directory = "/Volumes/Data/lines-video-worker/MoneyPrinterTurbo/storage/cache_videos"`
- LLM provider settings for script generation when the caller sends a prompt and no script
- Arabic font file `NotoNaskhArabic-Regular.ttf` inside MoneyPrinterTurbo's font directory. The worker sends `font_name = "NotoNaskhArabic-Regular.ttf"` so Arabic subtitles shape.

Edge TTS voice for Arabic is `ar-SA-HamedNeural` (also `ar-SA-ZariyahNeural`). English defaults to `en-US-JennyNeural`.

Keep Colima's virtual disk off the internal SSD:

```bash
mkdir -p /Volumes/Data/lines-video-worker/colima
ln -sfn /Volumes/Data/lines-video-worker/colima ~/.colima
colima start --cpu 4 --memory 8 --disk 60 \
  --mount /Volumes/Data/lines-video-worker:w --mount-type virtiofs
```

Run MoneyPrinterTurbo inside that VM with its task and cache directories on the mount, listening on `127.0.0.1:8080` on the Mac (`MPT_BASE_URL`). The worker talks to `POST /api/v1/videos` and polls `GET /api/v1/tasks/{id}`. It downloads the MP4 only from that host, or copies a file that is already under `LINES_WORKER_ROOT`.

Style mapping:

| Style | Stock terms | Voice rate | Paragraphs at 15/30/60s |
|---|---|---|---|
| promo | product commercial city | 1.05 | 1 / 2 / 4 |
| story | cinematic story b-roll | 1.00 | 1 / 2 / 4 |
| calm | nature calm aesthetic | 0.92 | 1 / 2 / 4 |

`format` is passed through as MoneyPrinterTurbo's `video_aspect` (`9:16`, `16:9`, `1:1`). A caller-supplied `script.text` is `video_script`. A `prompt` alone becomes `video_script_prompt` so the local LLM writes the narration.

Subtitles are off unless the job sets `subtitles: true` (`subtitle_enabled`). A job that omits the field is not captioned. `voiceover: false` sends MoneyPrinterTurbo `voice_name: "no-voice"` and turns background music off, so the clip does not call TTS. The default remains voiceover on.

## Showcase

`style: "showcase"` (engine `showcase`) does not call MoneyPrinterTurbo or Pixabay. The worker downloads `imageUrl` and encodes a 720×1280 H.264 MP4 with local `ffmpeg`:

- duration is the job's `seconds` (6, 7, 8, 9, or 10)
- the still is fit inside the frame; a blurred, darkened cover of the same still fills the rest
- a slow zoom and pan returns to the opening frame so the clip can loop
- no drawtext, no logo, no audio stream, no subtitle stream

`imageUrl` must already have been accepted by the API. The worker checks it again and will not follow a redirect. Allowed URLs are `https://lines.studio/work/<id>.webp` (also png or jpeg, and `www.lines.studio`) and `https://api.lines.studio/v1/jobs/<uuid>/artifacts/<uuid>` with optional `exp` and `sig`. DNS answers in private, loopback, or link-local ranges are refused. `LINES_IMAGE_HOSTS` adds hostnames the same way as on the API.

The worker key has to include `showcase`. On the API host, this keeps the current token:

```bash
LINES_DATA_DIR=/data node src/keys-cli.js set-engines --id mac-mini --engines moneyprinter,showcase
```

`ffmpeg` must be on `PATH`, or set `LINES_FFMPEG` to the binary (Homebrew is often `/opt/homebrew/bin/ffmpeg` on Apple silicon and `/usr/local/bin/ffmpeg` on Intel). Launchd does not inherit a login `PATH`, so put that variable in the LaunchAgent environment.

## Worker process

```bash
export LINES_WORKER_ROOT=/Volumes/Data/lines-video-worker
export LINES_API_BASE=https://api.lines.studio
export LINES_WORKER_TOKEN_FILE=/Volumes/Data/lines-video-worker/secrets/worker-token
export MPT_BASE_URL=http://127.0.0.1:8080
export MPT_CHECKOUT=/Volumes/Data/lines-video-worker/MoneyPrinterTurbo
node /Volumes/Data/lines-video-worker/app/src/index.js
```

Create the token on the API host (`create-worker --id mac-mini`) and put the single line in `secrets/worker-token`. Do not put the token in the plist.

LaunchAgent template: `launchd/com.lines.video-worker.plist`. Copy it to `~/Library/LaunchAgents/` (the plist is a pointer; logs and the token stay on the drive) and `launchctl load` it. If `node` is not `/usr/local/bin/node`, edit only that path. `~/Library/LaunchAgents` holds the plist, not video data.

The worker heartbeats, uploads the MP4 plus a JPEG frame, then `complete`. On failure it calls `fail`. A heartbeat of `cancelRequested: true` stops the render and reports `cancelled`. The API allows one render at a time (`LINES_MAX_CONCURRENCY`, default 1).

## MacBook fallback

When the Mac mini is asleep or off:

1. Plug the same external drive into the MacBook. Do not copy the checkout, cache, or Colima disk onto the internal SSD.
2. Repeat the `~/.colima` symlink if this Mac does not have it yet, then `colima start` with the same mount.
3. Start MoneyPrinterTurbo and load the same LaunchAgent.

Only one of the two machines should run the worker. If both poll, the API still leases a job to one worker and the global concurrency stays 1. If `/Volumes/Data` is not mounted, the process exits and does not fall back to `$HOME`.

## Environment

| Name | Role |
|---|---|
| `LINES_WORKER_ROOT` | Required. Must be under `/Volumes/Data`. |
| `LINES_API_BASE` | Video API origin, no trailing path. |
| `LINES_WORKER_TOKEN_FILE` | Preferred. File must be inside the worker root. |
| `LINES_WORKER_TOKEN` | Inline token if the file is not set. Prefer the file. |
| `MPT_BASE_URL` | Default `http://127.0.0.1:8080`. |
| `MPT_CHECKOUT` | Default `$LINES_WORKER_ROOT/MoneyPrinterTurbo`. |
| `MPT_FONT_NAME` | Default `NotoNaskhArabic-Regular.ttf`. Used only when `subtitles` is true. |
| `LINES_FFMPEG` | ffmpeg binary for showcase and thumbnails. Default `ffmpeg`. |
| `LINES_IMAGE_HOSTS` | Extra showcase image hosts. Same rules as the API. |
| `LINES_WORKER_POLL_MS` | Idle poll. Default 5000. |
| `LINES_HEARTBEAT_MS` | Default 30000. Keep this under the API lease (120s). |
| `MPT_POLL_MS` | Task poll. Default 3000. |
| `TMPDIR` / `XDG_CACHE_HOME` | Set by the process to `tmp/` and `cache/` on the drive. |

## Updating the copy on the Mac mini

The process that launchd runs is `/Volumes/Data/lines-video-worker/app`. Leave the checkout, cache, and Colima disk on that drive.

1. Deploy the API first (Coolify, `api.lines.studio`) so it accepts `subtitles`, `voiceover`, and `style: "showcase"`.
2. On the API host, add the engine without rotating the bearer: `LINES_DATA_DIR=/data node src/keys-cli.js set-engines --id mac-mini --engines moneyprinter,showcase`. `list` shows the key id if it is not `mac-mini`. Do not run `create-worker` again for an existing id; that replaces the token.
3. On the Mac mini, from a checkout of this repo:

```bash
rsync -a --delete --exclude node_modules \
  services/mac-video-worker/ /Volumes/Data/lines-video-worker/app/
```

4. Point `LINES_FFMPEG` at the ffmpeg binary in the LaunchAgent if launchd's `PATH` does not include it.
5. `launchctl kickstart -k gui/$(id -u)/com.lines.video-worker`

Only one of the Mac mini and the MacBook should run the worker.

## Tests

`npm test` in this directory does not need the drive, Colima, or a token. It checks the request mapping, the `/Volumes/Data` guard, the MoneyPrinterTurbo poll loop against a fake HTTP client, and a local ffmpeg showcase render (needs `ffmpeg` and `ffprobe` on `PATH`).
