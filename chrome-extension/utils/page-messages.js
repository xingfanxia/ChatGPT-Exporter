export const PAGE_MESSAGES = {
    '计划状态加载中...': 'Loading reminder schedule...',
    '导出当前对话': 'Export current conversation',
    '批量导出…': 'Bulk export…',
    '请先打开 chatgpt.com，再导出': 'Open chatgpt.com to export conversations.',
    '打开设置': 'Open settings',
    '未启用定时提醒': 'Scheduled reminders are off',
    '下次提醒：{date}': 'Next reminder: {date}',
    '提醒只负责通知，不会自动导出': 'Reminders only notify you; they do not export automatically.',
    '“导出当前对话”需在某个对话页面（.../c/...）使用': 'Open a conversation (.../c/...) to export the current conversation.',
    '页面仍在运行旧版导出器 ({version})': 'The page is still running an older exporter ({version})',
    '无法连接到页面脚本。请尝试刷新 ChatGPT 页面后再试。': 'Could not connect to the page. Refresh ChatGPT and try again.',
    'ChatGPT Exporter 设置': 'ChatGPT Exporter Settings',
    '导出与提醒设置': 'Export and reminder settings',
    '界面语言': 'Interface language',
    '自动（跟随浏览器）': 'Automatic (browser language)',
    '提醒频率': 'Reminder frequency',
    '关闭': 'Off',
    '每天': 'Daily',
    '每周': 'Weekly',
    '提醒时间': 'Reminder time',
    '提醒日（周模式）': 'Reminder day (weekly)',
    '周一': 'Monday',
    '周二': 'Tuesday',
    '周三': 'Wednesday',
    '周四': 'Thursday',
    '周五': 'Friday',
    '周六': 'Saturday',
    '周日': 'Sunday',
    '保存设置': 'Save settings',
    '恢复默认': 'Restore defaults',
    '已保存并重新调度': 'Settings saved and reminders updated',
    '已恢复默认设置': 'Default settings restored',
    '语言设置已保存': 'Language preference saved',
    'ChatGPT 导出提醒': 'ChatGPT export reminder',
    '到每周导出时间啦，打开扩展手动导出即可。': 'It is time for your weekly export. Open the extension to export your conversations.',
    '到每日导出时间啦，打开扩展手动导出即可。': 'It is time for your daily export. Open the extension to export your conversations.'
};

export function translatePage(i18n) {
    document.documentElement.lang = i18n.language;
    document.querySelectorAll('[data-i18n]').forEach(element => {
        element.textContent = i18n.t(element.dataset.i18n);
    });
}
