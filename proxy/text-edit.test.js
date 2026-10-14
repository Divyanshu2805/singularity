/**
 * Covers proxy/text-edit.js: the in-page half of "Edit text", run here against a stand-in window and document.
 *
 * Handles: nothing happening while the mode is off; a click on words opening that one text node in a span of our own
 * and the click never reaching the app; Enter putting the same node back with its new words and posting them with
 * React's source hints; Escape, unchanged words and emptied words posting nothing and restoring the old words; a
 * second click finishing the first edit; turning the mode off finishing an open edit; a refused save putting the old
 * words back unless the app has changed them since; and a click on nothing that is text opening nothing.
 *
 * Where a real browser puts the caret, and what typing into a contenteditable span does to its nodes, a stand-in
 * cannot show; that is on the preview checklist.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { textEditor } = require('./text-edit');

class FakeNode {
    constructor(nodeType) { this.nodeType = nodeType; this.parentNode = null; this.childNodes = []; }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((c) => c.textContent).join(''); }
    contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; }
    appendChild(child) { return this.insertBefore(child, null); }
    insertBefore(child, ref) {
        if (child.parentNode) child.parentNode.removeChild(child);
        const at = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
        this.childNodes.splice(at, 0, child);
        child.parentNode = this;
        return child;
    }
    removeChild(child) {
        this.childNodes.splice(this.childNodes.indexOf(child), 1);
        child.parentNode = null;
        return child;
    }
    replaceChild(next, old) {
        if (next.parentNode) next.parentNode.removeChild(next);
        this.childNodes[this.childNodes.indexOf(old)] = next;
        next.parentNode = this;
        old.parentNode = null;
        return old;
    }
}

function element(tag) {
    const el = new FakeNode(1);
    el.tagName = tag.toUpperCase();
    el.attributes = {};
    el.style = {};
    el.listeners = {};
    el.isContentEditable = false;
    el.setAttribute = (name, value) => { el.attributes[name] = value; };
    el.addEventListener = (type, fn) => { (el.listeners[type] = el.listeners[type] || []).push(fn); };
    el.focus = () => {};
    return el;
}

function text(value) {
    const node = new FakeNode(3);
    node.nodeValue = value;
    return node;
}

function standIn() {
    const listeners = {};
    const posted = [];
    let underPointer = null;
    const html = element('html');
    const button = element('button');
    const label = text('Save changes');
    const icon = element('svg');
    button.appendChild(icon);
    button.appendChild(label);
    button['__reactFiber$abc'] = {
        _debugSource: { fileName: '/app/src/components/ui/button.tsx', lineNumber: 40 },
        return: { _debugSource: { fileName: '/app/src/pages/Index.tsx', lineNumber: 12 }, return: null },
    };
    html.appendChild(button);
    const rect = { left: 10, right: 110, top: 10, bottom: 30, width: 100, height: 20 };
    const document = {
        documentElement: html,
        createElement: (tag) => element(tag),
        caretRangeFromPoint: () => (underPointer ? { startContainer: underPointer } : null),
        createRange: () => ({
            selectNodeContents() {},
            getClientRects: () => [rect],
            getBoundingClientRect: () => rect,
        }),
    };
    const win = {
        document,
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    };
    const editor = textEditor(win, (type, subType, payload) => posted.push({ type, payload }));
    const event = (type, extra = {}) => {
        const e = { type, clientX: 50, clientY: 20, stopped: false, prevented: false, ...extra };
        e.stopPropagation = () => { e.stopped = true; };
        e.preventDefault = () => { e.prevented = true; };
        (listeners[type] || []).forEach((fn) => fn(e));
        return e;
    };
    return {
        editor, posted, button, label, icon,
        pointAt: (node) => { underPointer = node; },
        click: (target) => event('click', { target }),
        key: (key, target) => event('keydown', { key, target }),
        span: () => button.childNodes.find((n) => n.attributes && 'data-singularity-edit' in n.attributes),
    };
}

test('with the mode off, a click reaches the app and opens nothing', () => {
    const p = standIn();
    p.pointAt(p.label);

    const e = p.click(p.label);

    assert.equal(e.stopped, false);
    assert.equal(e.prevented, false);
    assert.equal(p.span(), undefined);
});

test('a click on words opens that one text node in a span of ours, and the app never sees the click', () => {
    const p = standIn();
    p.editor.setOn(true);
    p.pointAt(p.label);

    const e = p.click(p.label);

    assert.equal(e.stopped, true);
    assert.equal(e.prevented, true);
    const span = p.span();
    assert.ok(span);
    assert.deepEqual(span.childNodes, [p.label]);
    assert.equal(p.button.childNodes[0], p.icon);
});

test('Enter puts the same node back with its new words and posts them with where React says they were written', () => {
    const p = standIn();
    p.editor.setOn(true);
    p.pointAt(p.label);
    p.click(p.label);
    p.label.nodeValue = 'Save\n   everything';

    const e = p.key('Enter', p.span());

    assert.equal(e.prevented, true);
    assert.equal(p.span(), undefined);
    assert.deepEqual(p.button.childNodes, [p.icon, p.label]);
    assert.equal(p.label.nodeValue, 'Save everything');
    assert.deepEqual(p.posted, [{
        type: 'PreviewTextEdit',
        payload: {
            id: 1, before: 'Save changes', after: 'Save everything',
            hints: [{ file: '/app/src/components/ui/button.tsx', line: 40 }, { file: '/app/src/pages/Index.tsx', line: 12 }],
        },
    }]);
});

test('Escape, unchanged words and emptied words post nothing and leave the old words', () => {
    for (const [change, key] of [['Something else', 'Escape'], [null, 'Enter'], ['   ', 'Enter']]) {
        const p = standIn();
        p.editor.setOn(true);
        p.pointAt(p.label);
        p.click(p.label);
        if (change !== null) p.label.nodeValue = change;

        p.key(key, p.span());

        assert.deepEqual(p.posted, []);
        assert.equal(p.label.nodeValue, 'Save changes');
        assert.equal(p.span(), undefined);
    }
});

test('turning the mode off finishes an open edit', () => {
    const p = standIn();
    p.editor.setOn(true);
    p.pointAt(p.label);
    p.click(p.label);
    p.label.nodeValue = 'Keep it';

    p.editor.setOn(false);

    assert.equal(p.span(), undefined);
    assert.equal(p.posted[0].payload.after, 'Keep it');
});

test('a refused save puts the old words back, unless the app has changed them since', () => {
    const p = standIn();
    p.editor.setOn(true);
    p.pointAt(p.label);
    p.click(p.label);
    p.label.nodeValue = 'Typed';
    p.key('Enter', p.span());

    p.editor.answered(1, false);
    assert.equal(p.label.nodeValue, 'Save changes');

    p.click(p.label);
    p.label.nodeValue = 'Typed again';
    p.key('Enter', p.span());
    p.label.nodeValue = 'Changed by the app';
    p.editor.answered(2, false);
    assert.equal(p.label.nodeValue, 'Changed by the app');
});

test('keys typed into the open span never reach the app', () => {
    const p = standIn();
    p.editor.setOn(true);
    p.pointAt(p.label);
    p.click(p.label);

    const e = p.key('a', p.span());

    assert.equal(e.stopped, true);
    assert.equal(e.prevented, false);
});

test('a click on nothing that is text opens nothing, and words in a script or an editor of the app are left alone', () => {
    const p = standIn();
    p.editor.setOn(true);

    p.pointAt(null);
    p.click(p.button);
    assert.equal(p.span(), undefined);

    p.pointAt(text('   '));
    p.click(p.button);
    assert.equal(p.span(), undefined);

    p.button.isContentEditable = true;
    p.pointAt(p.label);
    p.click(p.label);
    assert.equal(p.span(), undefined);
});

test('it is written for any browser: no arrow functions, let, const or template strings', () => {
    assert.doesNotMatch(textEditor.toString(), /=>|\blet\s|\bconst\s|`/);
});
