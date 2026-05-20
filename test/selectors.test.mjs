import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildVoiceOptions,
    normalizeEndpoint,
    parseFallbackVoices,
    speechEndpoint,
} from '../selectors.js';

test('normalizes local server endpoint', () => {
    assert.equal(normalizeEndpoint(' http://127.0.0.1:7851/// '), 'http://127.0.0.1:7851');
    assert.equal(speechEndpoint('http://127.0.0.1:7851/'), 'http://127.0.0.1:7851/v1/audio/speech');
});

test('builds plain and preset voice options', () => {
    const result = buildVoiceOptions(
        [{ voice_id: 'alice', name: 'Alice' }, { voice_id: 'bob', name: 'Bob' }],
        [{ id: 'calm' }, { id: 'excited' }],
        'plain-plus-presets',
    );

    assert.deepEqual(result, [
        { name: 'Alice', voice_id: 'alice', lang: 'en-US' },
        { name: 'Alice + calm', voice_id: 'alice+calm', lang: 'en-US' },
        { name: 'Alice + excited', voice_id: 'alice+excited', lang: 'en-US' },
        { name: 'Bob', voice_id: 'bob', lang: 'en-US' },
        { name: 'Bob + calm', voice_id: 'bob+calm', lang: 'en-US' },
        { name: 'Bob + excited', voice_id: 'bob+excited', lang: 'en-US' },
    ]);
});

test('builds presets-only voice options', () => {
    const result = buildVoiceOptions(
        [{ voice_id: 'alice', name: 'Alice' }],
        [{ id: 'calm' }],
        'presets-only',
    );

    assert.deepEqual(result, [
        { name: 'Alice + calm', voice_id: 'alice+calm', lang: 'en-US' },
    ]);
});

test('parses fallback voice csv', () => {
    assert.deepEqual(parseFallbackVoices('alice, alice+calm, bob'), [
        { name: 'alice', voice_id: 'alice', lang: 'en-US' },
        { name: 'alice+calm', voice_id: 'alice+calm', lang: 'en-US' },
        { name: 'bob', voice_id: 'bob', lang: 'en-US' },
    ]);
});

// buildSpeechRequest moved to schema.js — covered by test/schema.test.mjs.
