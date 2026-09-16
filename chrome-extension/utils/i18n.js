// UI language follows the browser's first preferred language. Unsupported
// languages use English; conversation content and export filenames are untouched.
export function normalizeLanguage(value) {
    return ['auto', 'zh-CN', 'en'].includes(value) ? value : 'auto';
}

export function resolveLanguage(preference = 'auto', languages = globalThis.navigator?.languages) {
    const normalized = normalizeLanguage(preference);
    if (normalized !== 'auto') return normalized;
    const primary = languages?.[0] || globalThis.navigator?.language || 'en';
    return /^zh(?:-|_|$)/i.test(primary) ? 'zh-CN' : 'en';
}

export function createI18n(messages, preference = 'auto') {
    let selected = normalizeLanguage(preference);
    return {
        get preference() { return selected; },
        get language() { return resolveLanguage(selected); },
        setLanguage(value) { selected = normalizeLanguage(value); },
        t(message, values = {}) {
            const template = resolveLanguage(selected) === 'zh-CN' ? message : (messages[message] ?? message);
            return template.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
        }
    };
}
