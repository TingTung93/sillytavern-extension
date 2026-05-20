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

- **Format** — `mp3` (default) or `wav`.
- **Voice list** — choose whether the dropdown exposes plain voices, voice+preset
  combinations, or both.
- **Fallback voices** — comma-separated selector list used when server discovery
  fails. Click **Snapshot discovered** to capture the currently loaded voices
  into this field so they remain available offline.
- **Speed / Exaggeration / Temperature / Seed** — generation overrides. Leave
  numeric fields blank to use the server's defaults.
- **Request timeout (ms)** — how long to wait for a single fetch before
  aborting. Default 60000.
- **Paralinguistic tags / Semantic tags** — three-state controls:
  - `Server default` — the request omits the field so server presets decide.
  - `Force on` — always send `true`.
  - `Force off` — always send `false`.

## Server APIs Used

- `GET /status`
- `GET /api/voices`
- `GET /api/presets`
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
