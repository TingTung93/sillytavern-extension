// ESM loader hooks that satisfy provider.js's `import ... from '../../tts/index.js'`.
// That path only resolves inside a real SillyTavern install, so for tests we
// serve a virtual module whose exports delegate to globalThis.__ttsMock, letting
// each test observe saveTtsProviderSettings() calls and stub getPreviewString().

const VIRTUAL_URL = 'virtual:tts-index';

export function resolve(specifier, context, next) {
    if (specifier.endsWith('tts/index.js')) {
        return { url: VIRTUAL_URL, shortCircuit: true };
    }
    return next(specifier, context);
}

export function load(url, context, next) {
    if (url === VIRTUAL_URL) {
        const source = `
            export function registerTtsProvider(...a) {
                return globalThis.__ttsMock?.registerTtsProvider?.(...a);
            }
            export function saveTtsProviderSettings(...a) {
                return globalThis.__ttsMock?.saveTtsProviderSettings?.(...a);
            }
            export function getPreviewString(...a) {
                return globalThis.__ttsMock?.getPreviewString?.(...a) ?? 'This is a preview.';
            }
        `;
        return { format: 'module', source, shortCircuit: true };
    }
    return next(url, context);
}
