const WAV_HEADER_BYTES = 44;

function appendBytes(left, right) {
    if (!left.length) return right;
    const combined = new Uint8Array(left.length + right.length);
    combined.set(left);
    combined.set(right, left.length);
    return combined;
}

export function parseCanonicalWavHeader(header) {
    if (header.byteLength < WAV_HEADER_BYTES) throw new Error('Incomplete WAV header');
    const ascii = (start, length) => String.fromCharCode(...header.slice(start, start + length));
    if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE' || ascii(36, 4) !== 'data') {
        throw new Error('Streaming response is not a canonical PCM WAV stream');
    }
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const format = view.getUint16(20, true);
    const channels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);
    if (format !== 1 || bitsPerSample !== 16 || channels < 1 || sampleRate < 1) {
        throw new Error(`Unsupported WAV stream: PCM16 required (format=${format}, channels=${channels}, bits=${bitsPerSample})`);
    }
    return { channels, sampleRate, bitsPerSample };
}

/** Read an indefinite WAV response and deliver its header and raw PCM chunks. */
export async function consumeWavStream(response, onFormat, onPcm) {
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
    if (!response.body?.getReader) throw new Error('Streaming response body is unavailable');

    const reader = response.body.getReader();
    let pending = new Uint8Array();
    let format = null;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (value?.byteLength) pending = appendBytes(pending, new Uint8Array(value));
            if (!format && pending.length >= WAV_HEADER_BYTES) {
                format = parseCanonicalWavHeader(pending.slice(0, WAV_HEADER_BYTES));
                pending = pending.slice(WAV_HEADER_BYTES);
                await onFormat(format);
            }
            if (format && pending.length) {
                await onPcm(pending);
                pending = new Uint8Array();
            }
            if (done) break;
        }
        if (!format) throw new Error('Streaming response ended before the WAV header arrived');
    } finally {
        reader.releaseLock?.();
    }
}

/** Gapless PCM playback backed by a prebuffered AudioWorklet queue. */
export class PcmStreamPlayer {
    constructor({ audioContextClass, audioWorkletNodeClass, workletUrl, prebufferSeconds = 0.75 } = {}) {
        this.AudioContextClass = audioContextClass
            ?? globalThis.AudioContext
            ?? globalThis.webkitAudioContext;
        this.AudioWorkletNodeClass = audioWorkletNodeClass ?? globalThis.AudioWorkletNode;
        this.workletUrl = workletUrl ?? new URL('./pcm-player-worklet.js', import.meta.url).href;
        this.prebufferSeconds = prebufferSeconds;
        this.context = null;
        this.node = null;
        this.format = null;
        this.drained = null;
    }

    async initialize(format) {
        if (this.node) {
            const sameFormat = this.format.sampleRate === format.sampleRate
                && this.format.channels === format.channels
                && this.format.bitsPerSample === format.bitsPerSample;
            if (!sameFormat) throw new Error('Audio format changed while streamed playback was active');
            return;
        }

        this.context = new this.AudioContextClass({ sampleRate: format.sampleRate });
        await this.context.audioWorklet.addModule(this.workletUrl);
        this.node = new this.AudioWorkletNodeClass(this.context, 'tts-server-pcm-player', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [format.channels],
            processorOptions: { ...format, prebufferSeconds: this.prebufferSeconds },
        });
        this.format = format;
        this.drained = new Promise((resolve, reject) => {
            this.node.port.onmessage = (event) => {
                if (event.data?.type === 'drained') resolve();
                if (event.data?.type === 'error') reject(new Error(event.data.detail));
            };
        });
        this.node.connect(this.context.destination);
        await this.context.resume();
    }

    /** Append another streamed WAV response to the same playback queue. */
    async append(response) {
        if (!this.AudioContextClass) throw new Error('Web Audio is not available in this browser');
        await consumeWavStream(
            response,
            async (format) => this.initialize(format),
            async (pcm) => {
                const buffer = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
                this.node.port.postMessage({ type: 'pcm', buffer }, [buffer]);
            },
        );
    }

    /** Play one response to completion. Prefer append() for a multi-request session. */
    async play(response) {
        try {
            await this.append(response);
            this.node.port.postMessage({ type: 'end' });
            await this.drained;
        } finally {
            await this.stop();
        }
    }

    async stop() {
        try { this.node?.disconnect(); } catch (_) { /* already disconnected */ }
        this.node = null;
        this.format = null;
        this.drained = null;
        const context = this.context;
        this.context = null;
        if (context && context.state !== 'closed') {
            try { await context.close(); } catch (_) { /* already closing */ }
        }
    }
}
