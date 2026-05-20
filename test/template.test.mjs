import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSettingsHtml } from '../template.js';

test('renderSettingsHtml is a pure constant template independent of settings', () => {
    const a = renderSettingsHtml();
    const b = renderSettingsHtml();
    assert.equal(a, b);
});

test('renderSettingsHtml does not interpolate user-controlled values into HTML', () => {
    const malicious = '"><script>window.__xss=1</script>';
    const html = renderSettingsHtml({
        provider_endpoint: malicious,
        model: malicious,
        fallback_voices: malicious,
        speed: malicious,
        exaggeration: malicious,
        temperature: malicious,
        seed: malicious,
    });
    assert.ok(!html.includes('<script'), 'rendered HTML must not contain <script tag from settings');
    assert.ok(!html.includes('window.__xss'), 'rendered HTML must not contain script payload from settings');
});

test('renderSettingsHtml exposes the input IDs that loadSettings binds to', () => {
    const html = renderSettingsHtml();
    const requiredIds = [
        'local_tts_server_endpoint',
        'local_tts_server_model',
        'local_tts_server_format',
        'local_tts_server_selector_mode',
        'local_tts_server_fallback_voices',
        'local_tts_server_speed',
        'local_tts_server_speed_output',
        'local_tts_server_exaggeration',
        'local_tts_server_temperature',
        'local_tts_server_seed',
        'local_tts_server_paralinguistic_tags',
        'local_tts_server_semantic_tags',
        'local_tts_server_status',
    ];
    for (const id of requiredIds) {
        assert.ok(html.includes(`id="${id}"`), `template must include id=\"${id}\"`);
    }
});

test('renderSettingsHtml exposes the snapshot-fallback control', () => {
    const html = renderSettingsHtml();
    assert.ok(html.includes('id="local_tts_server_snapshot_fallback"'), 'template must expose snapshot-fallback button');
});
