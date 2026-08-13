import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const SCRIPT_PATHS = [
    'Tampermonkey.js',
    'chrome-extension/exporter.user.js'
];

function loadExporter(scriptPath) {
    const elements = new Map();
    const attributes = new Map();
    const hook = {};

    const createElement = (tagName) => ({
        tagName: tagName.toUpperCase(),
        id: '',
        style: {},
        dataset: {},
        childNodes: [],
        disabled: false,
        textContent: '',
        appendChild(child) {
            this.childNodes.push(child);
            if (child.id) elements.set(child.id, child);
            return child;
        },
        addEventListener() {},
        remove() {
            if (this.id) elements.delete(this.id);
        },
        click() {},
        querySelector() { return null; }
    });

    const documentElement = createElement('html');
    documentElement.getAttribute = name => attributes.get(name) ?? null;
    documentElement.setAttribute = (name, value) => attributes.set(name, String(value));

    const body = createElement('body');
    const document = {
        body,
        documentElement,
        cookie: 'oai-did=test-device; _account=ws-test',
        createElement,
        getElementById: id => elements.get(id) ?? null,
        querySelector: () => null
    };

    const initialFetch = async () => new Response('', { status: 404 });
    const window = {
        __CHATGPT_EXPORTER_TEST_HOOK__: hook,
        fetch: initialFetch,
        addEventListener() {},
        dispatchEvent() {},
        postMessage() {}
    };

    class MockXMLHttpRequest {
        addEventListener() {}
        getRequestHeader() { return null; }
        open() {}
    }

    const context = vm.createContext({
        window,
        document,
        history: { pushState() {}, replaceState() {} },
        location: { origin: 'https://chatgpt.com', pathname: '/' },
        localStorage: { length: 0, key: () => null, getItem: () => null },
        XMLHttpRequest: MockXMLHttpRequest,
        CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
        fetch: initialFetch,
        Headers,
        Response,
        URL,
        URLSearchParams,
        Uint8Array,
        Blob,
        console: { log() {}, info() {}, warn() {}, error() {} },
        alert() {},
        confirm: () => true,
        setTimeout: callback => { callback(); return 0; },
        clearTimeout() {}
    });
    window.window = window;

    const testExports = `
    Object.assign(window.__CHATGPT_EXPORTER_TEST_HOOK__, {
        safeAttachmentName,
        collectVisibleAttachments,
        fetchAttachmentBinary,
        convertConversationToMarkdown,
        createAttachmentReport,
        addConversationToZip
    });

    window.ChatGPTExporter = window.ChatGPTExporter || {};`;
    const source = readFileSync(scriptPath, 'utf8').replace(
        '    window.ChatGPTExporter = window.ChatGPTExporter || {};',
        testExports
    );
    vm.runInContext(source, context, { filename: scriptPath });
    return { context, hook, window };
}

function conversationFixture() {
    return {
        conversation_id: 'conv-123',
        title: 'Attachment coverage',
        mapping: {
            user: {
                message: {
                    id: 'msg-user',
                    author: { role: 'user' },
                    metadata: {
                        attachments: [{ id: 'file_upload01', name: 'notes.pdf', mime_type: 'application/pdf' }]
                    },
                    content: {
                        content_type: 'multimodal_text',
                        parts: [
                            'Please inspect these files.',
                            { content_type: 'image_asset_pointer', asset_pointer: 'file-service://file_image01' },
                            { content_type: 'file_asset_pointer', asset_pointer: 'file-service://file_upload01' }
                        ]
                    }
                },
                children: ['assistant']
            },
            assistant: {
                message: {
                    id: 'msg-assistant',
                    author: { role: 'assistant' },
                    metadata: {
                        attachments: [{ file_id: 'file_generated01', file_name: 'summary.xlsx' }]
                    },
                    content: {
                        content_type: 'text',
                        parts: ['Done: [download report](sandbox:/mnt/data/final%20report.csv)']
                    }
                },
                children: ['tool']
            },
            tool: {
                message: {
                    id: 'msg-tool',
                    author: { role: 'tool' },
                    metadata: {},
                    content: {
                        content_type: 'multimodal_text',
                        parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://file_image02' }]
                    }
                },
                children: ['canvas']
            },
            canvas: {
                message: {
                    id: 'msg-canvas',
                    author: { role: 'assistant' },
                    metadata: {},
                    content: {
                        content_type: 'canvas_asset_pointer',
                        asset_pointer: 'file-service://file_canvas01'
                    }
                },
                children: ['hidden']
            },
            hidden: {
                message: {
                    id: 'msg-hidden',
                    author: { role: 'assistant' },
                    metadata: {
                        is_visually_hidden_from_conversation: true,
                        attachments: [{ id: 'file_hidden01', name: 'hidden.txt' }]
                    },
                    content: { content_type: 'text', parts: ['hidden'] }
                },
                children: []
            }
        }
    };
}

for (const scriptPath of SCRIPT_PATHS) {
    test(`${scriptPath}: canonicalizes untrusted attachment names`, () => {
        const { hook } = loadExporter(scriptPath);
        assert.equal(hook.safeAttachmentName('../../private/secret.txt'), 'secret.txt');
        assert.equal(hook.safeAttachmentName('..%2F..%2Fprivate%2Fsecret.txt'), 'secret.txt');
        assert.equal(hook.safeAttachmentName('\u0000bad:name?.csv'), 'bad-name-.csv');
    });

    test(`${scriptPath}: discovers uploads and generated artifacts without duplicates`, () => {
        const { hook } = loadExporter(scriptPath);
        const references = JSON.parse(JSON.stringify(hook.collectVisibleAttachments(conversationFixture())));

        assert.equal(references.length, 6);
        assert.equal(references.filter(reference => reference.fileId === 'file_upload01').length, 1);
        assert.equal(references.find(reference => reference.fileId === 'file_upload01').kind, 'upload');
        assert.equal(references.find(reference => reference.fileId === 'file_image01').kind, 'upload');
        assert.equal(references.find(reference => reference.fileId === 'file_generated01').kind, 'generated_file');
        assert.equal(references.find(reference => reference.fileId === 'file_image02').kind, 'generated_image');
        assert.equal(references.find(reference => reference.fileId === 'file_canvas01').kind, 'canvas');
        assert.equal(references.find(reference => reference.kind === 'sandbox').sandboxPath,
            'sandbox:/mnt/data/final%20report.csv');
        assert.equal(references.some(reference => reference.fileId === 'file_hidden01'), false);
    });

    test(`${scriptPath}: rewrites downloaded links in Markdown`, () => {
        const { hook } = loadExporter(scriptPath);
        const markdown = hook.convertConversationToMarkdown(conversationFixture(), {
            files: [
                { name: 'notes.pdf', path: 'Attachment_files/notes.pdf', kind: 'upload', messageId: 'msg-user', ownerRole: 'user', isImage: false },
                { name: 'summary.xlsx', path: 'Attachment_files/summary.xlsx', kind: 'generated_file', messageId: 'msg-assistant', ownerRole: 'assistant', isImage: false },
                { name: 'generated.png', path: 'Attachment_files/generated.png', kind: 'generated_image', messageId: 'msg-tool', ownerRole: 'tool', isImage: true }
            ],
            sandboxPaths: new Map([
                ['msg-assistant|sandbox:/mnt/data/final%20report.csv', 'Attachment_files/final%20report.csv']
            ])
        });

        assert.match(markdown, /📎 \[notes\.pdf\]\(Attachment_files\/notes\.pdf\)/);
        assert.match(markdown, /📎 \[summary\.xlsx\]\(Attachment_files\/summary\.xlsx\)/);
        assert.match(markdown, /\[download report\]\(Attachment_files\/final%20report\.csv\)/);
        assert.match(markdown, /# Attachments[\s\S]*!\[generated\.png\]\(Attachment_files\/generated\.png\)/);
    });

    test(`${scriptPath}: falls back to project file metadata and downloads same-origin bytes with auth`, async () => {
        const runtime = loadExporter(scriptPath);
        await runtime.window.fetch('/capture-token', {
            headers: { Authorization: 'Bearer test-token' }
        });
        const requests = [];
        const fetchMock = async (url, options = {}) => {
            const href = String(url);
            requests.push({ href, options });
            if (href.includes('conversation_id=conv-123')) {
                return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
            }
            if (href.includes('gizmo_id=g-p-project')) {
                return new Response(JSON.stringify({
                    status: 'success',
                    download_url: '/backend-api/estuary/content?id=asset'
                }), { status: 200, headers: { 'content-type': 'application/json' } });
            }
            if (href.includes('/backend-api/estuary/content')) {
                return new Response(new Uint8Array([1, 2, 3]), {
                    status: 200,
                    headers: {
                        'content-type': 'text/csv',
                        'content-disposition': "attachment; filename*=UTF-8''result%20data.csv"
                    }
                });
            }
            throw new Error(`Unexpected request: ${href}`);
        };
        runtime.context.fetch = fetchMock;
        runtime.window.fetch = fetchMock;

        const downloaded = await runtime.hook.fetchAttachmentBinary(
            { kind: 'upload', fileId: 'file_upload01', name: 'fallback', messageId: 'msg-user' },
            conversationFixture(),
            'ws-test',
            'g-p-project'
        );

        assert.equal(downloaded.filename, 'result data.csv');
        assert.deepEqual(Array.from(downloaded.data), [1, 2, 3]);
        assert.match(requests[0].href, /conversation_id=conv-123/);
        assert.match(requests[1].href, /gizmo_id=g-p-project/);
        assert.match(requests[2].href, /\/backend-api\/estuary\/content/);
        assert.equal(requests[2].options.headers.Authorization, 'Bearer test-token');
    });

    test(`${scriptPath}: never forwards the bearer token to cross-origin signed downloads`, async () => {
        const runtime = loadExporter(scriptPath);
        await runtime.window.fetch('/capture-token', {
            headers: { Authorization: 'Bearer private-token' }
        });
        const requests = [];
        const fetchMock = async (url, options = {}) => {
            const href = String(url);
            requests.push({ href, options });
            if (href.startsWith('/backend-api/files/download/')) {
                return new Response(JSON.stringify({
                    download_url: 'https://files.oaiusercontent.com/signed/file'
                }), { status: 200, headers: { 'content-type': 'application/json' } });
            }
            if (href === 'https://files.oaiusercontent.com/signed/file') {
                return new Response(new Uint8Array([9]), {
                    status: 200,
                    headers: { 'content-type': 'application/octet-stream' }
                });
            }
            throw new Error(`Unexpected request: ${href}`);
        };
        runtime.context.fetch = fetchMock;
        runtime.window.fetch = fetchMock;

        await runtime.hook.fetchAttachmentBinary(
            { kind: 'upload', fileId: 'file_external01', name: 'external.bin', messageId: 'msg-user' },
            conversationFixture(),
            'ws-test'
        );

        assert.equal(requests.length, 2);
        assert.equal(requests[0].options.headers.Authorization, 'Bearer private-token');
        assert.equal(requests[1].options.headers, undefined);
        assert.equal(requests[1].options.credentials, undefined);
    });

    test(`${scriptPath}: keeps the conversation export usable when an attachment is unavailable`, async () => {
        const runtime = loadExporter(scriptPath);
        const fetchMock = async () => new Response('not found', {
            status: 404,
            headers: { 'content-type': 'text/plain' }
        });
        runtime.context.fetch = fetchMock;
        runtime.window.fetch = fetchMock;

        const entries = new Map();
        const target = {
            file(name, value) {
                entries.set(name, value);
                return this;
            },
            folder(name) {
                return {
                    file(filename, value) {
                        entries.set(`${name}/${filename}`, value);
                        return this;
                    }
                };
            }
        };
        const conversation = {
            conversation_id: 'conv-missing',
            title: 'Missing attachment',
            mapping: {
                root: {
                    message: {
                        id: 'msg-root',
                        author: { role: 'user' },
                        metadata: { attachments: [{ id: 'file_missing01', name: 'missing.pdf' }] },
                        content: { content_type: 'text', parts: ['Keep this message.'] }
                    },
                    children: []
                }
            }
        };
        const report = runtime.hook.createAttachmentReport();

        await runtime.hook.addConversationToZip(target, conversation, null, report);

        assert.equal(report.detected, 1);
        assert.equal(report.downloaded, 0);
        assert.equal(report.failed, 1);
        assert.equal(report.conversations[0].failures[0].file_id, 'file_missing01');
        assert.equal(Array.from(entries.keys()).some(name => name.endsWith('.json')), true);
        assert.equal(Array.from(entries.keys()).some(name => name.endsWith('.md')), true);
        assert.match(Array.from(entries.entries()).find(([name]) => name.endsWith('.md'))[1], /Keep this message\./);
    });
}
