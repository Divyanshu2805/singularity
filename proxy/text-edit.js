/**
 * Changing a previewed page's words by hand, from inside the page: the half of "Edit text" that runs in the frame.
 *
 * Handles: while the Preview tab has the mode on, outlining the piece of text under the pointer, opening it for
 * typing in place when it is clicked, keeping every press, click and key from reaching the app meanwhile, finishing
 * on Enter or on leaving it and giving up on Escape, and posting what the text was, what it is now and where React
 * says it was written - then putting the old words back if the tab answers that it could not save them.
 *
 * Nothing here writes a file. The tab finds the words in the project's source and saves them by hand, as the Code
 * tab's editor does (frontend/src/lib/text-edit.ts), so no model is called. What it posts is only a claim - the page
 * is code an AI wrote - and the tab treats it as one: it changes nothing but the inside of a text or string node in
 * the source, escaped for that node.
 *
 * What is edited is one text node, never an element: a button with an icon and a word, or a paragraph with a link
 * in it, has its words edited and its other children left alone. The node is lent to a span of our own for as long
 * as it is open, so the browser's editing happens inside our span and not to the app's elements, and is put back
 * where it was - the same node, which React still holds - with its new words, before anything is posted. A hot
 * reload that follows sets the same words again. A node whose span has been taken out of the page by the app while
 * it was open is let go without a post.
 *
 * The source hints are React's own: in development every element carries the file and line of the JSX that made it,
 * and the chain of components above a text node says where it may have been written - a Button's label is written
 * where the Button is used, not in button.tsx. A page that is not React sends none, and the tab searches instead.
 *
 * Written as one plain function with no closure over this module, in ES5, because the reporter embeds its source
 * text in the page. text-edit.test.js runs it against a stand-in window.
 */
function textEditor(win, post) {
    var ACCENT = '#f5a524';
    var MAX_CHARS = 2000;
    var doc = win.document;
    var on = false;
    var open = null;
    var box = null;
    var nextId = 0;
    var sent = {};

    function textNodeAt(x, y) {
        var node = null;
        if (doc.caretRangeFromPoint) {
            var range = doc.caretRangeFromPoint(x, y);
            node = range && range.startContainer;
        } else if (doc.caretPositionFromPoint) {
            var position = doc.caretPositionFromPoint(x, y);
            node = position && position.offsetNode;
        }
        if (!node || node.nodeType !== 3 || !/\S/.test(node.nodeValue || '')) return null;
        if (node.nodeValue.length > MAX_CHARS) return null;
        var parent = node.parentNode;
        if (!parent || parent.nodeType !== 1) return null;
        if (/^(SCRIPT|STYLE|TEXTAREA|OPTION|TITLE|NOSCRIPT)$/.test(parent.tagName)) return null;
        if (parent.isContentEditable) return null;
        var rects = nodeRects(node);
        for (var i = 0; i < rects.length; i++) {
            var r = rects[i];
            if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) return node;
        }
        return null;
    }

    function nodeRects(node) {
        try {
            var range = doc.createRange();
            range.selectNodeContents(node);
            return range.getClientRects();
        } catch (e) {
            return [];
        }
    }

    function showBox(node) {
        if (!node) { hideBox(); return; }
        var range = doc.createRange();
        range.selectNodeContents(node);
        var r = range.getBoundingClientRect();
        if (!box) {
            box = doc.createElement('div');
            box.setAttribute('data-singularity-edit-box', '');
            box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border-radius:3px;' +
                'outline:2px dashed ' + ACCENT + ';outline-offset:2px;background:rgba(245,165,36,0.08)';
            doc.documentElement.appendChild(box);
        }
        box.style.left = r.left + 'px';
        box.style.top = r.top + 'px';
        box.style.width = r.width + 'px';
        box.style.height = r.height + 'px';
        box.style.display = 'block';
    }

    function hideBox() {
        if (box) box.style.display = 'none';
    }

    function sourceHints(node) {
        var hints = [];
        var element = node.parentNode;
        var keys = Object.keys(element);
        var fiber = null;
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf('__reactFiber$') === 0) { fiber = element[keys[i]]; break; }
        }
        for (var steps = 0; fiber && steps < 60 && hints.length < 8; steps++) {
            var source = fiber._debugSource;
            if (source && typeof source.fileName === 'string' && typeof source.lineNumber === 'number') {
                var last = hints[hints.length - 1];
                if (!last || last.file !== source.fileName || last.line !== source.lineNumber) {
                    hints.push({ file: source.fileName.slice(0, 500), line: source.lineNumber });
                }
            }
            fiber = fiber.return;
        }
        return hints;
    }

    function begin(node) {
        var parent = node.parentNode;
        var span = doc.createElement('span');
        span.setAttribute('data-singularity-edit', '');
        try { span.contentEditable = 'plaintext-only'; } catch (e) {}
        if (span.contentEditable !== 'plaintext-only') span.contentEditable = 'true';
        span.spellcheck = false;
        span.style.outline = '2px solid ' + ACCENT;
        span.style.outlineOffset = '2px';
        span.style.borderRadius = '2px';
        span.style.cursor = 'text';
        parent.insertBefore(span, node);
        span.appendChild(node);
        open = { span: span, node: node, parent: parent, before: node.nodeValue };
        hideBox();
        span.addEventListener('blur', function () { finish(true); });
        span.focus();
        var selection = win.getSelection && win.getSelection();
        if (selection) {
            var range = doc.createRange();
            range.selectNodeContents(span);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    function finish(keep) {
        var was = open;
        if (!was) return;
        open = null;
        if (was.span.parentNode !== was.parent) return;
        var after = String(was.span.textContent || '').replace(/\s*[\r\n]+\s*/g, ' ').slice(0, MAX_CHARS);
        was.parent.replaceChild(was.node, was.span);
        if (!keep || after === was.before || !/\S/.test(after)) {
            was.node.nodeValue = was.before;
            return;
        }
        was.node.nodeValue = after;
        nextId += 1;
        sent[nextId] = { node: was.node, before: was.before, after: after };
        post('PreviewTextEdit', null, { id: nextId, before: was.before, after: after, hints: sourceHints(was.node) });
    }

    function inside(target) {
        return !!open && !!target && (target === open.span || (open.span.contains && open.span.contains(target)));
    }

    function onPointer(e) {
        if (!on) return;
        var within = inside(e.target);
        e.stopPropagation();
        if (e.type === 'click' || e.type === 'dblclick' || e.type === 'auxclick') {
            e.preventDefault();
            if (within || e.type !== 'click') return;
            finish(true);
            var node = textNodeAt(e.clientX, e.clientY);
            if (node) begin(node);
            return;
        }
        if (e.type === 'mousedown' && !within) e.preventDefault();
    }

    function onMove(e) {
        if (!on || open) return;
        showBox(textNodeAt(e.clientX, e.clientY));
    }

    function onKey(e) {
        if (!on || !inside(e.target)) return;
        e.stopPropagation();
        if (e.type === 'keyup') { e.preventDefault(); return; }
        if (e.type !== 'keydown') return;
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    }

    function onTyping(e) {
        if (on && inside(e.target)) e.stopPropagation();
    }

    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'touchstart', 'touchend', 'submit']
        .forEach(function (type) { win.addEventListener(type, onPointer, true); });
    win.addEventListener('mousemove', onMove, true);
    win.addEventListener('scroll', hideBox, true);
    ['keydown', 'keypress', 'keyup'].forEach(function (type) { win.addEventListener(type, onKey, true); });
    ['beforeinput', 'input', 'paste', 'cut', 'copy', 'compositionstart', 'compositionend', 'focusin', 'focusout']
        .forEach(function (type) { win.addEventListener(type, onTyping, true); });

    return {
        setOn: function (value) {
            on = value === true;
            if (!on) { finish(true); hideBox(); }
        },
        isOn: function () { return on; },
        answered: function (id, saved) {
            var edit = sent[id];
            if (!edit) return;
            delete sent[id];
            if (!saved && edit.node.nodeValue === edit.after) edit.node.nodeValue = edit.before;
        },
    };
}

module.exports = { textEditor };
