# SillyTavern Local TTS Server Provider

Third-party SillyTavern extension that registers the local TTS server as a native SillyTavern TTS provider.

The provider uses SillyTavern's built-in TTS playback, voice maps, replay buttons, autoplay, cancellation, and chat-change behavior. It only supplies local-server settings, voice discovery, preview, and generation requests.

## Install

Copy or clone this directory into:

```text
SillyTavern/public/scripts/extensions/third-party/tts-server
```

Restart or reload SillyTavern.

## Usage

1. Start the local TTS server.
2. Open SillyTavern TTS settings.
3. Select `Local TTS Server` as the TTS provider.
4. Set the server base URL, usually `http://127.0.0.1:7851`.
5. Use SillyTavern's native `Reload` button (in the TTS panel) to refresh the
   voice list — the provider exposes `onRefreshClick()` and SillyTavern owns the
   button.
6. Assign voices in SillyTavern's native voice map.
7. Use SillyTavern TTS normally.

### Settings

- **Engine** — shows the server's currently active engine. The server runs one
  engine at a time, so this is effectively read-only; other engines appear
  disabled for discoverability.
- **Format** — `mp3` (default) or `wav`.
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
