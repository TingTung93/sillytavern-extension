import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTtsText, countSpeechUnits, requestBudget, splitTextForSpeech } from '../text.js';

test('cleanTtsText removes Markdown and HTML syntax but keeps readable labels', () => {
    const input = `# Heading\n\n<p>Hello <strong>world</strong> &amp; friends.<br>Visit [the docs](https://example.test).</p>\n- **First** item\n- ~~Second~~ item\n\n![portrait](image.png)`;
    assert.equal(
        cleanTtsText(input),
        'Heading\n\nHello world & friends.\nVisit the docs.\nFirst item\nSecond item\n\nportrait',
    );
});

test('cleanTtsText removes hidden HTML and raw URLs while retaining code content', () => {
    const input = '<script>alert("bad")</script>Use `voice_id` at https://example.test/path and <em>speak</em>.';
    assert.equal(cleanTtsText(input), 'Use voice id at and speak.');
});

test('cleanTtsText removes escaped HTML without swallowing comparison prose', () => {
    assert.equal(cleanTtsText('&lt;em&gt;Hello&lt;/em&gt; while 2 < 3 and 4 > 1.'), 'Hello while 2 < 3 and 4 > 1.');
});

test('countSpeechUnits matches Audio8 Latin-word and non-Latin-character accounting', () => {
    assert.equal(countSpeechUnits("one two's three-four 42"), 4);
    assert.equal(countSpeechUnits('你好 world'), 3);
});

test('requestBudget consumes server-advertised limits and has engine fallbacks', () => {
    assert.deepEqual(
        requestBudget('audio8', { chunking: { request_limit: 120, request_unit: 'speech_units' } }),
        { limit: 120, unit: 'speech_units' },
    );
    assert.deepEqual(requestBudget('voxcpm2'), { limit: 2000, unit: 'chars' });
});

test('splitTextForSpeech guarantees the limit without paragraph boundaries', () => {
    const chunks = splitTextForSpeech('one two three four five six seven', { limit: 13, unit: 'chars' });
    assert.deepEqual(chunks, ['one two three', 'four five six', 'seven']);
    assert.ok(chunks.every(chunk => chunk.length <= 13));
});

test('splitTextForSpeech safely splits unspaced CJK against speech-unit limits', () => {
    const chunks = splitTextForSpeech('你好世界欢迎回来', { limit: 4, unit: 'speech_units' });
    assert.deepEqual(chunks, ['你好世界', '欢迎回来']);
    assert.ok(chunks.every(chunk => countSpeechUnits(chunk) <= 4));
});
