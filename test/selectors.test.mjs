import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSpeechRequest,
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

test('builds speech request with optional generation controls', () => {
    const request = buildSpeechRequest(
        {
            model: 'chatterbox-turbo',
            response_format: 'mp3',
            speed: 1.1,
            exaggeration: '0.6',
            temperature: '0.8',
            seed: '42',
            paralinguistic_tags: 'on',
            semantic_tags: 'off',
        },
        'Hello.',
        'alice+calm',
    );

    assert.deepEqual(request, {
        model: 'chatterbox-turbo',
        input: 'Hello.',
        voice: 'alice+calm',
        response_format: 'mp3',
        speed: 1.1,
        stream: false,
        paralinguistic_tags: true,
        semantic_tags: false,
        exaggeration: 0.6,
        temperature: 0.8,
        seed: 42,
    });
});

test('omits seed when seed is negative', () => {
    const request = buildSpeechRequest(
        {
            model: 'chatterbox-turbo',
            response_format: 'wav',
            speed: 1,
            exaggeration: '',
            temperature: '',
            seed: '-1',
            paralinguistic_tags: 'off',
            semantic_tags: 'on',
        },
        'Hello.',
        'alice',
    );

    assert.deepEqual(request, {
        model: 'chatterbox-turbo',
        input: 'Hello.',
        voice: 'alice',
        response_format: 'wav',
        speed: 1,
        stream: false,
        paralinguistic_tags: false,
        semantic_tags: true,
    });
});

test('omits paralinguistic_tags and semantic_tags when set to "default" (preserves server preset defaults)', () => {
    const request = buildSpeechRequest(
        {
            model: 'chatterbox-turbo',
            response_format: 'mp3',
            speed: 1,
            exaggeration: '',
            temperature: '',
            seed: -1,
            paralinguistic_tags: 'default',
            semantic_tags: 'default',
        },
        'Hello.',
        'alice',
    );

    assert.equal('paralinguistic_tags' in request, false, 'default mode must omit paralinguistic_tags from payload');
    assert.equal('semantic_tags' in request, false, 'default mode must omit semantic_tags from payload');
});

test('overrides take precedence over settings for tag fields', () => {
    const request = buildSpeechRequest(
        { model: 'm', response_format: 'mp3', speed: 1, exaggeration: '', temperature: '', seed: -1, paralinguistic_tags: 'default', semantic_tags: 'default' },
        'Hi.',
        'alice',
        { paralinguistic_tags: true, semantic_tags: false },
    );
    assert.equal(request.paralinguistic_tags, true);
    assert.equal(request.semantic_tags, false);
});
