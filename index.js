import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

export { init };

const MODULE_NAME = 'tts_server';
const DEFAULT_SETTINGS = {
    endpoint: 'http://127.0.0.1:7851',
};

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = value;
        }
    }

    return extension_settings[MODULE_NAME];
}

function normalizeEndpoint(value) {
    return String(value || DEFAULT_SETTINGS.endpoint).trim().replace(/\/+$/, '');
}

function providerEndpoint(baseUrl) {
    return `${normalizeEndpoint(baseUrl)}/v1/audio/speech`;
}

function setStatus(message, state = '') {
    const status = $('#tts_server_extension_status');
    status.removeClass('success error');
    if (state) {
        status.addClass(state);
    }
    status.text(message);
}

async function refreshServerStatus() {
    const settings = getSettings();
    const endpoint = normalizeEndpoint($('#tts_server_extension_endpoint').val());
    settings.endpoint = endpoint;
    saveSettingsDebounced();

    $('#tts_server_extension_provider_endpoint').text(providerEndpoint(endpoint));
    setStatus('Checking server...');

    try {
        const response = await fetch(`${endpoint}/status`, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const status = await response.json();
        const ready = status.ready ? 'ready' : 'not ready';
        const model = status.model || 'unknown model';
        setStatus(`Server reachable: ${ready}, ${model}`, 'success');
    } catch (error) {
        setStatus(`Server check failed: ${error.message}`, 'error');
    }
}

async function init() {
    const settings = getSettings();
    const html = await renderExtensionTemplateAsync('third-party/tts-server', 'settings');
    $('#extensions_settings').append(html);

    $('#tts_server_extension_endpoint')
        .val(settings.endpoint)
        .on('input', () => {
            const endpoint = normalizeEndpoint($('#tts_server_extension_endpoint').val());
            settings.endpoint = endpoint;
            $('#tts_server_extension_provider_endpoint').text(providerEndpoint(endpoint));
            saveSettingsDebounced();
        });

    $('#tts_server_extension_provider_endpoint').text(providerEndpoint(settings.endpoint));
    $('#tts_server_extension_check').on('click', refreshServerStatus);
}
