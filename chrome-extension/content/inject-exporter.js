(async function injectExporter() {
    const EXPECTED_VERSION = '1.6.0';
    const activeVersion = document.documentElement.getAttribute('data-chatgpt-exporter-version');
    if (window.__CHATGPT_EXPORTER_INJECTED__ === EXPECTED_VERSION && activeVersion === EXPECTED_VERSION) return;
    window.__CHATGPT_EXPORTER_INJECTED__ = EXPECTED_VERSION;

    const normalizeLanguage = value => ['auto', 'zh-CN', 'en'].includes(value) ? value : 'auto';
    const applyLanguage = language => {
        language = normalizeLanguage(language);
        document.documentElement.setAttribute('data-chatgpt-exporter-language', language);
        window.postMessage({
            type: 'CHATGPT_EXPORTER_COMMAND', action: 'SET_LANGUAGE', payload: { language }
        }, location.origin);
    };
    const { language } = await chrome.storage.sync.get('language');
    applyLanguage(language);
    if (window.__CHATGPT_EXPORTER_LANGUAGE_LISTENERS__) {
        chrome.storage.onChanged.removeListener(window.__CHATGPT_EXPORTER_LANGUAGE_LISTENERS__.storage);
        window.removeEventListener('message', window.__CHATGPT_EXPORTER_LANGUAGE_LISTENERS__.message);
    }
    const onStorageChanged = (changes, area) => {
        if (area === 'sync' && changes.language) applyLanguage(changes.language.newValue);
    };
    const onLanguageMessage = event => {
        if (event.source !== window || event.origin !== location.origin) return;
        if (event.data?.type !== 'CHATGPT_EXPORTER_LANGUAGE_CHANGED') return;
        if (!['auto', 'zh-CN', 'en'].includes(event.data.language)) return;
        chrome.storage.sync.set({ language: event.data.language });
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    window.addEventListener('message', onLanguageMessage);
    window.__CHATGPT_EXPORTER_LANGUAGE_LISTENERS__ = { storage: onStorageChanged, message: onLanguageMessage };

    // Only skip when the page is already running this exact version.
    if (activeVersion === EXPECTED_VERSION) {
        return;
    }

    const jszipScript = document.createElement('script');
    jszipScript.src = chrome.runtime.getURL('jszip.min.js');
    jszipScript.type = 'text/javascript';
    jszipScript.onload = () => {
        jszipScript.remove();
        // Inject main script only after JSZip is loaded
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('exporter.user.js');
        script.type = 'text/javascript';
        script.onload = () => script.remove();
        document.documentElement.appendChild(script);
    };
    document.documentElement.appendChild(jszipScript);
})();
