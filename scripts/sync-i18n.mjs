// Keep standalone scripts self-contained without adding a runtime dependency.
// Edit utils/i18n.js and utils/exporter-messages.js, then run this script.
import { readFileSync, writeFileSync } from 'node:fs';
const core = readFileSync('chrome-extension/utils/i18n.js', 'utf8');
const messages = readFileSync('chrome-extension/utils/exporter-messages.js', 'utf8');
const embedded = (core + '\n' + messages).replace(/^export /gm, '').trim().split('\n').map(line => line ? `    ${line}` : '').join('\n');
for (const path of ['chrome-extension/exporter.user.js', 'Tampermonkey.js']) {
    const source = readFileSync(path, 'utf8');
    const updated = source.replace(/    \/\/ BEGIN GENERATED I18N[\s\S]*?    \/\/ END GENERATED I18N/, `    // BEGIN GENERATED I18N\n${embedded}\n    // END GENERATED I18N`);
    if (process.argv.includes('--check')) {
        if (source !== updated) throw new Error(`${path}: run node scripts/sync-i18n.mjs`);
    } else {
        writeFileSync(path, updated);
    }
}
