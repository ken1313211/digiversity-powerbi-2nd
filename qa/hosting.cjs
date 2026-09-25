const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const fn = source.slice(source.indexOf('async function initializeLiveRoom('), source.indexOf('\nfunction trackLobbyRegistrations('));

async function scenario({ denied = false, disabled = false, collision = false, qrFails = false, storageFails = false, concurrent = false } = {}) {
    const elements = new Map();
    const button = { textContent: 'Launch Challenge', disabled: false };
    const alerts = [];
    let calls = 0;
    let view = null;
    const context = vm.createContext({
        roomCreationInProgress: false, isFirebaseEnabled: !disabled,
        database: {}, SESSION_ROOT: 'powerbiSessions',
        currentSessionPin: null, gameSessionRef: null, currentRole: null,
        currentQuizData: null, sessionTotalAnswersCount: 0, sessionTotalCorrectAnswersCount: 0,
        document: {
            querySelectorAll: () => [button],
            getElementById: id => {
                if (!elements.has(id)) elements.set(id, {});
                return elements.get(id);
            }
        },
        window: { location: { origin: 'https://example.test' } },
        sessionStorage: { setItem() { if (storageFails) throw new Error('Quota exceeded'); } },
        clearHostSessionStorage() { if (storageFails) throw new Error('Storage unavailable'); },
        ref: (_, path) => path,
        runTransaction: async (_, update) => {
            calls++;
            if (denied) throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
            assert.equal(update({ status: 'lobby' }), undefined, 'Never overwrite an occupied PIN');
            assert.equal(update(null).publicState.status, 'lobby');
            return { committed: !(collision && calls === 1) };
        },
        QRCode: function () { if (qrFails) throw new Error('QR unavailable'); },
        updateHostPinDisplays() {}, trackLobbyRegistrations() {},
        switchView: next => { view = next; }, alert: message => alerts.push(message),
        console: { warn() {}, error() {} }, setTimeout, clearTimeout
    });
    vm.runInContext(fn, context);
    const quiz = { title: 'Test', questions: [{ type: 'poll', text: 'Test?' }] };
    const launch = context.initializeLiveRoom(quiz);
    if (concurrent) await context.initializeLiveRoom(quiz);
    await launch;
    assert.equal(context.roomCreationInProgress, false);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Launch Challenge');
    if (denied || disabled) {
        assert.equal(view, null);
        assert.equal(context.currentSessionPin, null);
        assert.match(alerts[0], denied ? /Firebase denied access/ : /Firebase could not initialize/);
    } else {
        assert.equal(view, 'hostLobby');
        assert.match(context.currentSessionPin, /^\d{6}$/);
        assert.equal(alerts.length, 0);
        assert.equal(calls, collision ? 2 : 1);
    }
}

(async () => {
    for (const options of [{}, { denied: true }, { disabled: true }, { collision: true }, { qrFails: true }, { storageFails: true }, { concurrent: true }]) await scenario(options);
    const html = fs.readFileSync('index.html', 'utf8');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML IDs');
    const refs = [...source.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map(match => match[1]);
    const missing = [...new Set(refs.filter(id => !ids.includes(id) && !source.includes(`id="${id}"`)))];
    assert.deepEqual(missing, [], 'Missing literal DOM IDs');
    const css = fs.readFileSync('style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
    let depth = 0;
    for (const char of css) { if (char === '{') depth++; if (char === '}') depth--; assert.ok(depth >= 0); }
    assert.equal(depth, 0, 'CSS braces');
    console.log('PASS: 7 hosting scenarios, HTML IDs, DOM references, CSS braces. Firebase and DOM are simulated.');
})().catch(error => { console.error(error); process.exitCode = 1; });
