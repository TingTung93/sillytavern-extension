const WAV_HEADER_BYTES = 44;

function appendBytes(left, right) {
    if (!left.length) return right;
    const combined = new Uint8Array(left.length + right.length);
    combined.set(left);
    combined.set(right, left.length);
    return combined;
}

function playableWavResponse(sourceHeader, pcm) {
    const header = sourceHeader.slice();
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    view.setUint32(4, 36 + pcm.byteLength, true);
    view.setUint32(40, pcm.byteLength, true);
    return new Response(new Blob([header, pcm], { type: 'audio/wav' }), {
        status: 200,
        headers: { 'Content-Type': 'audio/wav' },
    });
}

function validateWavHeader(header) {
    const ascii = (start, length) => String.fromCharCode(...header.slice(start, start + length));
    if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE' || ascii(36, 4) !== 'data') {
        throw new Error('Streaming response is not a canonical PCM WAV stream');
    }
}

/**
 * Convert the server's indefinite WAV stream into finite WAV responses that
 * SillyTavern can queue and play while synthesis is still in progress.
 */
export async function* playableWavChunks(response, chunkDurationMs = 500) {
    if (!response?.body?.getReader) {
        yield response;
        return;
    }

    const reader = response.body.getReader();
    let pending = new Uint8Array();
    let header = null;
    let blockAlign = 2;
    let targetBytes = 0;

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (value?.byteLength) pending = appendBytes(pending, new Uint8Array(value));

            if (!header && pending.length >= WAV_HEADER_BYTES) {
                header = pending.slice(0, WAV_HEADER_BYTES);
                pending = pending.slice(WAV_HEADER_BYTES);
                validateWavHeader(header);
                const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
                blockAlign = Math.max(1, view.getUint16(32, true));
                const byteRate = view.getUint32(28, true);
                targetBytes = Math.max(blockAlign, Math.floor(byteRate * chunkDurationMs / 1000 / blockAlign) * blockAlign);
            }

            while (header && targetBytes && pending.length >= targetBytes) {
                const pcm = pending.slice(0, targetBytes);
                pending = pending.slice(targetBytes);
                yield playableWavResponse(header, pcm);
            }

            if (done) break;
        }

        if (!header) throw new Error('Streaming response ended before the WAV header arrived');
        const alignedLength = pending.length - (pending.length % blockAlign);
        if (alignedLength > 0) yield playableWavResponse(header, pending.slice(0, alignedLength));
    } finally {
        reader.releaseLock?.();
    }
}
