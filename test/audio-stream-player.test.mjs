import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmStreamPlayer, consumeWavStream, parseCanonicalWavHeader } from '../audio-stream-player.js';

function wavHeader(sampleRate = 8000, channels = 1) {
    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);
    const text = (offset, value) => [...value].forEach((char, i) => { header[offset + i] = char.charCodeAt(0); });
    text(0, 'RIFF'); text(8, 'WAVE'); text(12, 'fmt '); text(36, 'data');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
    return header;
}

test('parseCanonicalWavHeader reads the PCM stream format', () => {
    assert.deepEqual(parseCanonicalWavHeader(wavHeader(48000, 2)), {
        channels: 2, sampleRate: 48000, bitsPerSample: 16,
    });
});

test('consumeWavStream handles a split header and forwards PCM without WAV segmentation', async () => {
    const header = wavHeader();
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(header.slice(0, 17));
            controller.enqueue(new Uint8Array([...header.slice(17), ...pcm.slice(0, 2)]));
            controller.enqueue(pcm.slice(2));
            controller.close();
        },
    });
    let format;
    const received = [];
    await consumeWavStream(
        new Response(body, { headers: { 'Content-Type': 'audio/wav' } }),
        (value) => { format = value; },
        (value) => received.push(...value),
    );
    assert.equal(format.sampleRate, 8000);
    assert.deepEqual(received, [...pcm]);
});

test('PcmStreamPlayer appends consecutive responses to one worklet without ending it', async () => {
    const messages = [];
    const contexts = [];
    class MockContext {
        constructor(options) {
            this.options = options;
            this.state = 'running';
            this.destination = {};
            this.audioWorklet = { addModule: async () => {} };
            contexts.push(this);
        }
        async resume() {}
        async close() { this.state = 'closed'; }
    }
    class MockNode {
        constructor(_context, _name, options) {
            this.options = options;
            this.port = { postMessage: (message) => messages.push(message), onmessage: null };
        }
        connect() {}
        disconnect() {}
    }
    const response = (pcm) => new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array([...wavHeader(48000), ...pcm]));
            controller.close();
        },
    }), { headers: { 'Content-Type': 'audio/wav' } });
    const player = new PcmStreamPlayer({
        audioContextClass: MockContext,
        audioWorkletNodeClass: MockNode,
        workletUrl: 'mock-worklet.js',
        prebufferSeconds: 0.75,
    });

    await player.append(response([1, 2]));
    await player.append(response([3, 4]));

    assert.equal(contexts.length, 1, 'reuses one AudioContext across paragraph responses');
    assert.equal(player.node.options.processorOptions.prebufferSeconds, 0.75);
    assert.deepEqual(messages.map(message => message.type), ['pcm', 'pcm']);
    assert.ok(!messages.some(message => message.type === 'end'), 'keeps the shared queue open');
    await player.stop();
    assert.equal(contexts[0].state, 'closed');
});
