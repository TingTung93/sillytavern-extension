import test from 'node:test';
import assert from 'node:assert/strict';
import { playableWavChunks } from '../streaming.js';

function wavHeader(dataBytes = 0, sampleRate = 8000) {
    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);
    const text = (offset, value) => [...value].forEach((char, i) => { header[offset + i] = char.charCodeAt(0); });
    text(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, dataBytes, true);
    return header;
}

test('playableWavChunks yields finite playable WAV segments before EOF', async () => {
    const pcm = new Uint8Array(24_000).fill(7);
    const source = new ReadableStream({
        start(controller) {
            controller.enqueue(wavHeader());
            controller.enqueue(pcm.slice(0, 8_000));
            controller.enqueue(pcm.slice(8_000));
            controller.close();
        },
    });
    const chunks = [];
    for await (const response of playableWavChunks(new Response(source, { headers: { 'Content-Type': 'audio/wav' } }), 500)) {
        chunks.push(new Uint8Array(await response.arrayBuffer()));
    }

    assert.equal(chunks.length, 3);
    for (const chunk of chunks) {
        assert.equal(new TextDecoder().decode(chunk.slice(0, 4)), 'RIFF');
        const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        assert.equal(view.getUint32(40, true), chunk.length - 44);
        assert.equal(view.getUint32(4, true), chunk.length - 8);
    }
});

test('playableWavChunks rejects malformed streams', async () => {
    const source = new Response(new Uint8Array(44));
    await assert.rejects(async () => {
        for await (const _ of playableWavChunks(source)) void _;
    }, /canonical PCM WAV/);
});
