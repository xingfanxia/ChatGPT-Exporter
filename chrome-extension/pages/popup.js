import { normalizeSettings, calculateNextTrigger } from '../utils/schedule.js';
import { storage, tabs } from '../utils/chrome-helpers.js';

const nextRunEl = document.getElementById('next-run');
const reminderNoteEl = document.getElementById('reminder-note');
const openDialogBtn = document.getElementById('open-dialog-btn');
const exportCurrentBtn = document.getElementById('export-current-btn');
const openOptionsBtn = document.getElementById('open-options-btn');
const hintEl = document.getElementById('hint');

// 个人 / 项目 / GPT 对话页地址均形如 .../c/<uuid>（项目页可能带前缀，如 .../g/<gizmo>/c/<uuid>）。
// 允许 c/ 之前出现任意路径段，与页面侧 getCurrentConversationId() 的匹配逻辑保持一致，避免两边判定漂移。
const CONVERSATION_URL_RE = /^https:\/\/(?:[^/]*\.)?(?:chatgpt\.com|chat\.openai\.com)\/(?:[^?#]*\/)?c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

document.addEventListener('DOMContentLoaded', init);

async function init() {
    const { settings } = await storage.get('settings');
    const normalized = normalizeSettings(settings);
    renderSchedule(normalized);
    await refreshCurrentState();

    exportCurrentBtn.addEventListener('click', () => triggerExport('EXPORT_CURRENT_PAGE'));
    openDialogBtn.addEventListener('click', () => triggerExport('OPEN_EXPORT_DIALOG'));
    openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function renderSchedule(settings) {
    const nextTrigger = calculateNextTrigger(settings);
    if (!nextTrigger) {
        nextRunEl.textContent = '未启用定时提醒';
    } else {
        const date = new Date(nextTrigger);
        nextRunEl.textContent = `下次提醒：${date.toLocaleString()}`;
    }
    reminderNoteEl.textContent = '提醒只负责通知，不会自动导出';
}

// 仅当活动标签页是一个具体对话页面时，才启用“导出当前对话”。
async function refreshCurrentState() {
    const tab = await getActiveChatGPTTab();
    const onConversation = !!tab && CONVERSATION_URL_RE.test(tab.url || '');
    exportCurrentBtn.disabled = !onConversation;
    if (!tab) {
        hintEl.textContent = '请先打开 chatgpt.com，再导出';
    } else if (!onConversation) {
        hintEl.textContent = '“导出当前对话”需在某个对话页面（.../c/...）使用';
    } else {
        hintEl.textContent = '';
    }
}

async function triggerExport(messageType) {
    const needsConversation = messageType === 'EXPORT_CURRENT_PAGE';
    const tab = await getActiveChatGPTTab();
    if (!tab) {
        // “导出当前对话”在非 ChatGPT 标签页上没有意义，不要新开主页。
        if (needsConversation) return;
        chrome.tabs.create({ url: 'https://chatgpt.com/' });
        return;
    }
    // 弹窗打开后页面可能已跳转，点击时重新校验，避免在非对话页发送无效指令。
    if (needsConversation && !CONVERSATION_URL_RE.test(tab.url || '')) {
        await refreshCurrentState();
        return;
    }
    const isNoReceiverError = (err) => {
        const message = err?.message || String(err || '');
        return message.includes('Receiving end does not exist') || message.includes('Could not establish connection');
    };
    try {
        await tabs.sendMessage(tab.id, { type: messageType });
        return;
    } catch (error) {
        if (!isNoReceiverError(error)) {
            console.warn('Failed to reach content scripts, retrying after injection...', error);
        }
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/inject-exporter.js', 'content/auto-export.js']
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        await tabs.sendMessage(tab.id, { type: messageType });
    } catch (retryError) {
        alert('无法连接到页面脚本。请尝试刷新 ChatGPT 页面后再试。');
        console.error('Retry failed:', retryError);
    }
}

async function getActiveChatGPTTab() {
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    const isChatGPT = /^https:\/\/(.*\.)?chatgpt\.com/.test(url);
    const isOpenAI = /^https:\/\/(.*\.)?chat\.openai\.com/.test(url);

    if (tab && (isChatGPT || isOpenAI)) {
        return tab;
    }
    return null;
}
