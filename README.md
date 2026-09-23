# SillyTavern Local TTS Server Provider

Third-party SillyTavern extension that registers the local TTS server as a native SillyTavern TTS provider.

The provider uses SillyTavern's built-in TTS playback, voice maps, replay buttons, autoplay, cancellation, and chat-change behavior. It only supplies local-server settings, voice discovery, preview, and generation requests.

## Install

Copy or clone this directory into:

```text
SillyTavern/public/scripts/extensions/third-party/tts-server
```

Restart or reload SillyTavern.

The extension loads immediately before SillyTavern's native TTS extension so
the `Local TTS Server` provider is registered when SillyTavern restores the
last selected provider.

## Usage

1. Start the local TTS server.
2. Open SillyTavern TTS settings.
3. Select `Local TTS Server` as the TTS provider.
4. Set the server base URL, usually `http://127.0.0.1:7851` on the host or
   `http://<server-LAN-IP>:7851` from another device.
5. Use SillyTavern's native `Reload` button (in the TTS panel) to refresh the
   voice list — the provider exposes `onRefreshClick()` and SillyTavern owns the
   button.
6. Assign voices in SillyTavern's native voice map.
7. Use SillyTavern TTS normally.

Markdown and HTML syntax is removed automatically before synthesis. Link and
image labels remain readable, while tags, emphasis markers, table delimiters,
hidden HTML, and raw URLs are not sent to the speech model.

For VoxCPM2 voice cloning, first open the TTS Server web UI at the configured
base URL and upload reference audio in its **Voices** tab. Then click Reload in
SillyTavern and assign the discovered server voice. A fallback label is not a
voice clone and is only used when discovery cannot reach the server.

### Settings

- **Engine** — switches the server's active engine. For resident GPU models
  such as VoxCPM2, MOSS-TTS Nano, and Audio8, the extension asks the server to
  stop the current model container, start the selected runtime, wait for its
  health check, and then activate its adapter. Runtime startup can take a few
  minutes on the first model load.
- **Streaming** — starts playback while the model is still generating. It is
  enabled by default for engines that advertise streaming support. The provider
  automatically locks the output format to WAV and sends `stream: true`; streamed
  PCM is prebuffered and played continuously through one persistent Web Audio
  queue. Paragraph narration reuses that queue and starts generating the next
  paragraph as soon as the previous network stream ends, covering VoxCPM2's
  per-request startup latency instead of draining playback between requests.
  The control is disabled when the active engine cannot stream.
- **Input safety** — the provider chunks cleaned text at sentence and word
  boundaries using the server-advertised request budget. Conservative fallbacks
  are 3,000 characters for Fish S2 and 2,000 characters for Qwen3-TTS, VoxCPM2,
  Higgs, and MOSS. Audio8 uses 140 speech units (Latin words or individual
  non-Latin characters), below the official demo's 150-unit guard; the direct
  vLLM-Omni adapter does not publish a strict text ceiling. Chatterbox,
  CosyVoice, DramaBox, and OmniVoice additionally chunk inside the server.
- **Format** — `mp3` or `wav` for buffered generation. Streaming always uses WAV.
- **Voice list** — choose whether the dropdown exposes plain voices, voice+preset
  combinations, or both.
- **Fallback voices** — comma-separated selector list used when server discovery
  fails. Click **Snapshot discovered** to capture the currently loaded voices
  into this field so they remain available offline.
- **Generation parameters** — rendered dynamically from the server's
  `/api/capabilities` for the active engine (e.g. exaggeration / temperature /
  top P / top K / repetition penalty for Chatterbox; temperature / top P /
  repetition penalty / seed / lead-in tag for Fish S2). Leave a field blank to
  use the server's default.
- **Discovery timeout (ms)** — how long to wait for `/status`, voices, presets,
  and capabilities calls before aborting. Default 60000.
- **Generation timeout (ms)** — how long to wait for `/v1/audio/speech`. Long TTS
  on local hardware can take minutes. Default 600000.
- **Paralinguistic tags / Semantic tags** — three-state controls:
  - `Server default` — the request omits the field so server presets decide.
  - `Force on` — always send `true`.
  - `Force off` — always send `false`.

## Server APIs Used

- `GET /status`
- `GET /api/voices`
- `GET /api/presets`
- `GET /api/capabilities`
- `GET /api/capabilities/{engine}`
- `GET /api/runtimes` (optional; runtime-capable servers)
- `POST /api/engine`
- `POST /api/runtime/{runtime}` (resident GPU engines)
- `POST /v1/audio/speech`

## Voice Selectors

The provider can expose plain voice selectors:

```text
alice
```

It can also expose voice+preset selectors:

```text
alice+calm
alice+excited
```

Composite selectors are resolved by the TTS server at generation time.

## Development

Run helper tests:

```bash
npm test
```

The extension is intentionally separate from the Python server so it can be distributed as a SillyTavern third-party extension.
