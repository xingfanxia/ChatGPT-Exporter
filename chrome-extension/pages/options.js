import { DEFAULT_SETTINGS, normalizeSettings, calculateNextTrigger } from '../utils/schedule.js';
import { storage, runtime } from '../utils/chrome-helpers.js';
import { createI18n, normalizeLanguage } from '../utils/i18n.js';
import { PAGE_MESSAGES, translatePage } from '../utils/page-messages.js';

const i18n = createI18n(PAGE_MESSAGES);
const form = document.getElementById('settings-form');
const languageEl = document.getElementById('language');
const frequencyEl = document.getElementById('frequency');
const timeEl = document.getElementById('timeOfDay');
const weekdayEl = document.getElementById('weekday');
const saveStateEl = document.getElementById('save-state');
const resetBtn = document.getElementById('reset-btn');
let statusMessage = '';
let statusTimeout;

document.addEventListener('DOMContentLoaded', loadSettings);
frequencyEl.addEventListener('change', toggleSections);
form.addEventListener('input', renderPreview);
languageEl.addEventListener('change', async () => {
    const language = normalizeLanguage(languageEl.value);
    i18n.setLanguage(language);
    renderLanguage();
    await storage.set({ language });
    showStatus('语言设置已保存');
});
resetBtn.addEventListener('click', resetSettings);
form.addEventListener('submit', onSubmit);

async function loadSettings() {
    const { settings, language } = await storage.get(['settings', 'language']);
    i18n.setLanguage(language);
    const normalized = normalizeSettings(settings);
    frequencyEl.value = normalized.frequency;
    timeEl.value = normalized.timeOfDay;
    weekdayEl.value = normalized.weekday;
    toggleSections();
    renderLanguage();
}

function renderLanguage() {
    languageEl.value = i18n.preference;
    translatePage(i18n);
    saveStateEl.textContent = i18n.t(statusMessage);
    renderPreview();
}

function readSettings() {
    return {
        frequency: frequencyEl.value,
        timeOfDay: timeEl.value || DEFAULT_SETTINGS.timeOfDay,
        weekday: Number(weekdayEl.value)
    };
}

function renderPreview() {
    const nextTrigger = calculateNextTrigger(readSettings());
    document.getElementById('schedule-preview').textContent = nextTrigger
        ? i18n.t('下次提醒：{date}', { date: new Date(nextTrigger).toLocaleString(i18n.language) })
        : i18n.t('未启用定时提醒');
}

function showStatus(message) {
    clearTimeout(statusTimeout);
    statusMessage = message;
    saveStateEl.textContent = i18n.t(message);
    statusTimeout = setTimeout(() => {
        statusMessage = '';
        saveStateEl.textContent = '';
    }, 2500);
}

function toggleSections() {
    const showWeekday = frequencyEl.value === 'weekly';
    document.getElementById('weekday-section').style.display = showWeekday ? 'flex' : 'none';
    document.getElementById('time-section').style.display = frequencyEl.value === 'off' ? 'none' : 'flex';
    renderPreview();
}

async function onSubmit(event) {
    event.preventDefault();
    const nextSettings = readSettings();
    await storage.set({ settings: nextSettings });
    await runtime.sendMessage({ type: 'CHATGPT_EXPORTER_RESCHEDULE' });
    showStatus('已保存并重新调度');
}

async function resetSettings() {
    await storage.set({ settings: DEFAULT_SETTINGS, language: 'auto' });
    await runtime.sendMessage({ type: 'CHATGPT_EXPORTER_RESCHEDULE' });
    await loadSettings();
    showStatus('已恢复默认设置');
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.language) return;
    i18n.setLanguage(changes.language.newValue);
    renderLanguage();
});
