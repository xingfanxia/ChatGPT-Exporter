import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createI18n, normalizeLanguage, resolveLanguage } from '../chrome-extension/utils/i18n.js';
import { exporterMessages } from '../chrome-extension/utils/exporter-messages.js';
import { PAGE_MESSAGES } from '../chrome-extension/utils/page-messages.js';

test('automatic language follows the primary browser language; manual choice wins', () => {
    for (const language of ['zh', 'zh-CN', 'zh-TW', 'zh-Hant-HK']) {
        assert.equal(resolveLanguage('auto', [language, 'en']), 'zh-CN');
    }
    for (const language of ['en-US', 'fr-FR', 'ja-JP']) {
        assert.equal(resolveLanguage('auto', [language, 'zh-CN']), 'en');
    }
    assert.equal(resolveLanguage('en', ['zh-CN']), 'en');
    assert.equal(resolveLanguage('zh-CN', ['en-US']), 'zh-CN');
    assert.equal(normalizeLanguage('unsupported'), 'auto');
});

test('switching languages interpolates values without translating conversation data', () => {
    const i18n = createI18n(exporterMessages, 'en');
    const title = '我的对话 <sample> {count}';
    assert.equal(i18n.t('项目: {title}', { title }), `Project: ${title}`);
    assert.equal(i18n.t('导出选中 ({count})', { count: 0 }), 'Export selected (0)');
    i18n.setLanguage('zh-CN');
    assert.equal(i18n.t('项目: {title}', { title }), `项目: ${title}`);
    assert.equal(i18n.t('⬇ 导出此对话'), '⬇ 导出此对话');
});

test('Chinese and English translations preserve the same interpolation fields', () => {
    const fields = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const catalog of [exporterMessages, PAGE_MESSAGES]) {
        for (const [source, translation] of Object.entries(catalog)) {
            assert.deepEqual(fields(source), fields(translation), source);
        }
    }
});

test('extension language bridge syncs live preferences and accepts only language values', async () => {
    const attributes = new Map([['data-chatgpt-exporter-version', '1.6.0']]);
    const messages = [];
    const writes = [];
    let storageListener;
    let messageListener;
    const window = {
        postMessage: message => messages.push(message),
        addEventListener: (event, listener) => { if (event === 'message') messageListener = listener; }
    };
    const chrome = {
        storage: {
            sync: { get: async () => ({ language: 'en' }), set: value => writes.push(value) },
            onChanged: { addListener: listener => { storageListener = listener; } }
        }
    };
    const context = vm.createContext({ window, chrome, location: { origin: 'https://chatgpt.com' }, document: {
        documentElement: { getAttribute: key => attributes.get(key) ?? null, setAttribute: (key, value) => attributes.set(key, value) }
    } });
    await vm.runInContext(readFileSync('chrome-extension/content/inject-exporter.js', 'utf8'), context);
    assert.equal(attributes.get('data-chatgpt-exporter-language'), 'en');
    storageListener({ language: { newValue: 'zh-CN' } }, 'sync');
    assert.equal(messages.at(-1).payload.language, 'zh-CN');
    const event = { source: window, origin: 'https://chatgpt.com', data: { type: 'CHATGPT_EXPORTER_LANGUAGE_CHANGED', language: 'auto' } };
    messageListener(event);
    assert.equal(JSON.stringify(writes), '[{"language":"auto"}]');
    messageListener({ ...event, source: {} });
    messageListener({ ...event, origin: 'https://other.example' });
    messageListener({ ...event, data: { ...event.data, language: 'invalid' } });
    assert.equal(writes.length, 1);
});
