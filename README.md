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
5. Click `Reload`.
6. Assign voices in SillyTavern's native voice map.
7. Use SillyTavern TTS normally.

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
