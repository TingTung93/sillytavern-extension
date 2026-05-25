import test from 'node:test';
import assert from 'node:assert/strict';
import {
    renderSettingsHtml,
    readSchemaValues,
    buildSpeechRequest,
} from '../schema.js';

const SAMPLE_GLOBAL = {
    current_engine: 'chatterbox-turbo',
    engines: [
        { id: 'chatterbox-turbo', label: 'Chatterbox Turbo', is_active: true },
        { id: 'fish-s2-pro', label: 'Fish S2 Pro', is_active: false },
        { id: 'placeholder', label: 'Placeholder', is_active: false },
    ],
    response_formats: [
        { id: 'mp3', label: 'MP3' },
        { id: 'wav', label: 'WAV' },
    ],
    request_fields: [
        { id: 'paralinguistic_tags', type: 'tristate', label: 'Paralinguistic tags', default: 'default' },
        { id: 'semantic_tags',       type: 'tristate', label: 'Semantic tags',       default: 'default' },
    ],
};

const SAMPLE_CHATTERBOX = {
    id: 'chatterbox-turbo',
    label: 'Chatterbox Turbo',
    parameters: [
        { id: 'exaggeration',       type: 'float', label: 'Exaggeration',       min: 0, max: 2, step: 0.05, default: 0.5 },
        { id: 'temperature',        type: 'float', label: 'Temperature',        min: 0, max: 2, step: 0.05, default: 0.8 },
        { id: 'top_p',              type: 'float', label: 'Top P',              min: 0, max: 1, step: 0.01, default: 0.95 },
        { id: 'top_k',              type: 'int',   label: 'Top K',              min: 1,         step: 1,    default: 1000 },
        { id: 'repetition_penalty', type: 'float', label: 'Repetition penalty', min: 0,         step: 0.05, default: 1.2 },
    ],
};

const SAMPLE_FISH = {
    id: 'fish-s2-pro',
    label: 'Fish S2 Pro',
    parameters: [
        { id: 'temperature',        type: 'float', label: 'Temperature',        min: 0, max: 2, step: 0.05, default: 0.8 },
        { id: 'top_p',              type: 'float', label: 'Top P',              min: 0, max: 1, step: 0.01, default: 0.95 },
        { id: 'repetition_penalty', type: 'float', label: 'Repetition penalty', min: 0,         step: 0.05, default: 1.2 },
        { id: 'seed',               type: 'int',   label: 'Seed',                              step: 1,    default: null },
        { id: 'lead_in_tag',        type: 'string', label: 'Lead-in tag',                                  default: '', description: 'Optional tag.' },
    ],
};

// ──────────────────────────────────────────────────────────────
// renderSettingsHtml
// ──────────────────────────────────────────────────────────────

test('renderSettingsHtml is pure: same input produces same output', () => {
    const a = renderSettingsHtml(SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    const b = renderSettingsHtml(SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    assert.equal(a, b);
});

test('renderSettingsHtml escapes engine/format labels (no XSS via server response)', () => {
    const malicious = {
        ...SAMPLE_GLOBAL,
        engines: [{ id: 'evil"><script>x=1</script>', label: '<script>y=1</script>', is_active: true }],
    };
    const html = renderSettingsHtml(malicious, null);
    assert.ok(!html.includes('<script>x=1</script>'));
    assert.ok(!html.includes('<script>y=1</script>'));
    assert.ok(html.includes('&lt;script'));
});

test('renderSettingsHtml emits an <option> for each engine and marks the active one selected', () => {
    const html = renderSettingsHtml(SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    assert.match(html, /<option value="chatterbox-turbo"[^>]*selected/);
    assert.match(html, /<option value="fish-s2-pro"(?![^>]*selected)/);
    assert.match(html, /<option value="placeholder"(?![^>]*selected)/);
});

test('renderSettingsHtml disables engine options that are not the server-active engine', () => {
    // Server only runs one engine at a time; selecting any other guarantees a
    // request validation 400. The dropdown should still show known engines for
    // discoverability but make non-active ones unselectable.
    const html = renderSettingsHtml(SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    assert.match(html, /<option value="fish-s2-pro"[^>]*disabled/);
    assert.match(html, /<option value="placeholder"[^>]*disabled/);
    assert.doesNotMatch(html, /<option value="chatterbox-turbo"[^>]*disabled/);
});

test('renderSettingsHtml emits an input for each engine-specific parameter', () => {
    const html = renderSettingsHtml(SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    for (const param of SAMPLE_CHATTERBOX.parameters) {
        assert.ok(html.includes(`data-param="${param.id}"`), `missing input for ${param.id}`);
    }
});

test('renderSettingsHtml omits parameters that do not belong to the active engine', () => {
    const html = renderSettingsHtml(SAMPLE_GLOBAL, SAMPLE_FISH);
    assert.ok(!html.includes('data-param="top_k"'), 'fish-s2-pro has no top_k');
    assert.ok(!html.includes('data-param="exaggeration"'), 'fish-s2-pro has no exaggeration');
    assert.ok(html.includes('data-param="seed"'), 'fish-s2-pro should expose seed');
});

test('renderSettingsHtml shows the global tristate request_fields (Default/On/Off)', () => {
    const html = renderSettingsHtml(SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    assert.ok(html.includes('data-param="paralinguistic_tags"'));
    assert.ok(html.includes('data-param="semantic_tags"'));
    // tristate options
    assert.match(html, /<option value="default"[^>]*>/);
    assert.match(html, /<option value="on"[^>]*>/);
    assert.match(html, /<option value="off"[^>]*>/);
});

test('renderSettingsHtml falls back gracefully when no engine capability is provided', () => {
    const html = renderSettingsHtml(SAMPLE_GLOBAL, null);
    // Engine dropdown still rendered, but no per-engine param inputs.
    assert.match(html, /<select[^>]*data-field="engine"/);
    for (const param of SAMPLE_CHATTERBOX.parameters) {
        assert.ok(!html.includes(`data-param="${param.id}"`), `unexpected ${param.id} input`);
    }
});

test('renderSettingsHtml renders string parameters as a text input, not a number input', () => {
    const html = renderSettingsHtml(SAMPLE_GLOBAL, SAMPLE_FISH);
    assert.match(html, /<input id="local_tts_server_param_lead_in_tag" type="text"[^>]*data-type="string"/);
});

// ──────────────────────────────────────────────────────────────
// readSchemaValues
// ──────────────────────────────────────────────────────────────

test('readSchemaValues coerces float parameters to numbers when set, keeps blank as undefined', () => {
    const read = (id) => ({ exaggeration: '0.6', temperature: '', top_p: '0.9' })[id];
    const values = readSchemaValues(read, SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    assert.equal(values.exaggeration, 0.6);
    assert.equal(values.temperature, undefined);
    assert.equal(values.top_p, 0.9);
});

test('readSchemaValues coerces int parameters and treats blank/-1 seed as undefined', () => {
    const read = (id) => ({ top_k: '500', seed: '' })[id];
    const valuesA = readSchemaValues(read, SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    assert.equal(valuesA.top_k, 500);

    const fishRead = (id) => ({ seed: '-1' })[id];
    const valuesB = readSchemaValues(fishRead, SAMPLE_GLOBAL, SAMPLE_FISH);
    assert.equal(valuesB.seed, undefined, 'seed = -1 means "random" and should be omitted');
});

test('readSchemaValues passes tristate values verbatim and omits "default"', () => {
    const read = (id) => ({ paralinguistic_tags: 'on', semantic_tags: 'default' })[id];
    const values = readSchemaValues(read, SAMPLE_GLOBAL, SAMPLE_CHATTERBOX);
    assert.equal(values.paralinguistic_tags, true);
    assert.equal(values.semantic_tags, undefined);
});

test('readSchemaValues keeps non-blank string parameters and omits blank ones', () => {
    const read = (id) => ({ lead_in_tag: '  expressive storytelling  ' })[id];
    const values = readSchemaValues(read, SAMPLE_GLOBAL, SAMPLE_FISH);
    assert.equal(values.lead_in_tag, 'expressive storytelling');

    const blankRead = (id) => ({ lead_in_tag: '   ' })[id];
    const blankValues = readSchemaValues(blankRead, SAMPLE_GLOBAL, SAMPLE_FISH);
    assert.equal('lead_in_tag' in blankValues, false);
});

test('readSchemaValues ignores fields not in the active engine schema', () => {
    // top_k is chatterbox-only; reading from a fish session should ignore it.
    const read = (id) => ({ top_k: '999', temperature: '0.7' })[id];
    const values = readSchemaValues(read, SAMPLE_GLOBAL, SAMPLE_FISH);
    assert.equal(values.top_k, undefined);
    assert.equal(values.temperature, 0.7);
});

// ──────────────────────────────────────────────────────────────
// buildSpeechRequest
// ──────────────────────────────────────────────────────────────

test('buildSpeechRequest emits only schema-allowed fields plus the base envelope', () => {
    const request = buildSpeechRequest({
        engineId: 'chatterbox-turbo',
        response_format: 'mp3',
        input: 'Hello',
        voice: 'alice',
        values: { temperature: 0.7, top_k: 500 },
        engineCapability: SAMPLE_CHATTERBOX,
        globalCapabilities: SAMPLE_GLOBAL,
    });
    assert.deepEqual(request, {
        model: 'chatterbox-turbo',
        input: 'Hello',
        voice: 'alice',
        response_format: 'mp3',
        speed: 1,
        stream: false,
        temperature: 0.7,
        top_k: 500,
    });
});

test('buildSpeechRequest excludes fields the active engine does not support', () => {
    const request = buildSpeechRequest({
        engineId: 'fish-s2-pro',
        response_format: 'wav',
        input: 'Hi',
        voice: 'alice',
        values: { temperature: 0.5, top_k: 999, exaggeration: 1.5, seed: 42 },
        engineCapability: SAMPLE_FISH,
        globalCapabilities: SAMPLE_GLOBAL,
    });
    assert.equal('top_k' in request, false, 'fish-s2-pro does not accept top_k');
    assert.equal('exaggeration' in request, false, 'fish-s2-pro does not accept exaggeration');
    assert.equal(request.temperature, 0.5);
    assert.equal(request.seed, 42);
});

test('buildSpeechRequest includes tristate tag flags only when not "default"', () => {
    const request = buildSpeechRequest({
        engineId: 'chatterbox-turbo',
        response_format: 'mp3',
        input: 'Hi',
        voice: 'alice',
        values: { paralinguistic_tags: true, semantic_tags: undefined },
        engineCapability: SAMPLE_CHATTERBOX,
        globalCapabilities: SAMPLE_GLOBAL,
    });
    assert.equal(request.paralinguistic_tags, true);
    assert.equal('semantic_tags' in request, false);
});

test('buildSpeechRequest defaults to mp3 / speed 1 / stream false when not overridden', () => {
    const request = buildSpeechRequest({
        engineId: 'placeholder',
        input: 'Hi',
        voice: 'alice',
        values: {},
        engineCapability: { id: 'placeholder', label: 'Placeholder', parameters: [] },
        globalCapabilities: SAMPLE_GLOBAL,
    });
    assert.equal(request.response_format, 'mp3');
    assert.equal(request.speed, 1);
    assert.equal(request.stream, false);
});
