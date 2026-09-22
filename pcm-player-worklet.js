class TtsServerPcmPlayer extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const config = options.processorOptions || {};
        this.channels = Math.max(1, Number(config.channels) || 1);
        const prebufferSeconds = Math.max(0, Number(config.prebufferSeconds) || 0.75);
        this.prebufferFrames = Math.max(128, Math.floor((Number(config.sampleRate) || sampleRate) * prebufferSeconds));
        this.queue = [];
        this.bufferedFrames = 0;
        this.playing = false;
        this.started = false;
        this.ended = false;
        this.drained = false;
        this.pendingBytes = new Uint8Array();
        this.port.onmessage = (event) => this.onData(event.data || {});
    }

    onData(message) {
        if (message.type === 'end') {
            this.ended = true;
            return;
        }
        if (message.type !== 'pcm' || !message.buffer) return;

        const incoming = new Uint8Array(message.buffer);
        const combined = new Uint8Array(this.pendingBytes.length + incoming.length);
        combined.set(this.pendingBytes);
        combined.set(incoming, this.pendingBytes.length);
        const frameBytes = this.channels * 2;
        const completeBytes = combined.length - (combined.length % frameBytes);
        this.pendingBytes = combined.slice(completeBytes);
        if (!completeBytes) return;

        const samples = new Int16Array(combined.buffer.slice(0, completeBytes));
        const frames = samples.length / this.channels;
        const channelData = Array.from({ length: this.channels }, () => new Float32Array(frames));
        for (let frame = 0; frame < frames; frame += 1) {
            for (let channel = 0; channel < this.channels; channel += 1) {
                channelData[channel][frame] = samples[frame * this.channels + channel] / 32768;
            }
        }
        this.queue.push({ channelData, frames, offset: 0 });
        this.bufferedFrames += frames;
    }

    process(_inputs, outputs) {
        const output = outputs[0];
        if (!output?.length || this.drained) return true;
        if (!this.playing && (
            (this.started && this.bufferedFrames > 0)
            || this.bufferedFrames >= this.prebufferFrames
            || (this.ended && this.bufferedFrames > 0)
        )) {
            this.playing = true;
            this.started = true;
        }

        let target = 0;
        while (this.playing && target < output[0].length && this.queue.length) {
            const head = this.queue[0];
            const take = Math.min(output[0].length - target, head.frames - head.offset);
            for (let channel = 0; channel < output.length; channel += 1) {
                const source = head.channelData[Math.min(channel, head.channelData.length - 1)];
                output[channel].set(source.subarray(head.offset, head.offset + take), target);
            }
            head.offset += take;
            target += take;
            this.bufferedFrames -= take;
            if (head.offset >= head.frames) this.queue.shift();
        }

        if (this.playing && this.bufferedFrames === 0) {
            this.playing = false;
            if (this.ended) {
                this.drained = true;
                this.port.postMessage({ type: 'drained' });
            }
        } else if (!this.playing && this.ended && this.bufferedFrames === 0) {
            this.drained = true;
            this.port.postMessage({ type: 'drained' });
        }
        return true;
    }
}

registerProcessor('tts-server-pcm-player', TtsServerPcmPlayer);
