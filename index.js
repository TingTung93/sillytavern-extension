import { registerTtsProvider } from '../../tts/index.js';
import { LocalTtsServerProvider } from './provider.js';

export { init };

let registered = false;

function init() {
    if (registered) {
        return;
    }
    registerTtsProvider('Local TTS Server', LocalTtsServerProvider);
    registered = true;
}
