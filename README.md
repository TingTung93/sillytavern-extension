# SillyTavern Local TTS Server Extension

Third-party SillyTavern helper extension for the local TTS server in the parent project.

The extension does not replace SillyTavern's built-in TTS provider. It gives users a small settings panel that:

- stores the local TTS server base URL,
- checks `/status`,
- shows the OpenAI-compatible provider endpoint,
- shows the expected model and voice selector format.

## Install

Copy or clone this repository into:

```text
SillyTavern/public/scripts/extensions/third-party/tts-server
```

Then restart or reload SillyTavern and open the extensions panel.

## SillyTavern TTS Settings

Use SillyTavern's built-in OpenAI-compatible TTS provider with:

```text
Provider Endpoint: http://127.0.0.1:7851/v1/audio/speech
Model: chatterbox-turbo
Available Voices: alice,alice+calm
```

Composite voice selectors use `voice_id+preset_id`.

## Development

This directory is intentionally its own Git repository so the extension can be versioned and distributed separately from the Python server.
