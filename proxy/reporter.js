/**
 * What the preview proxy adds to a page on its way out: the script that reports back to the Preview tab, and the
 * pages the proxy shows when it has no app to show.
 *
 * Handles: injecting the reporter into a page load's HTML; from inside the page, telling the tab the page is up,
 * where it is and whether there is anywhere to go back or forward to, reporting uncaught errors, unhandled
 * rejections and the dev server's compile-error overlay - and that the overlay has gone again, relaying what the app
 * writes to its console, noticing a page that loaded and drew nothing, and carrying out the tab's back, forward,
 * reload and go-to-address requests; and building the status pages, which say what they are to the tab too.
 *
 * Pulled out of index.js so it can be tested without a server: reporter.test.js runs the script against a stand-in
 * window. The script is written for whatever browser opens the preview, with no build step, so it stays ES5.
 *
 * The preview is another origin inside a sandboxed frame, so messages are the only channel in either direction.
 * Outbound ones go to the parent whatever its origin - the script cannot know which app is showing it - and carry
 * nothing the page could not already read about itself. Inbound ones are taken only from the parent window and can
 * only do what a person at the page's own address bar could: go back, go forward, reload, or open a path on this
 * same origin. A path that resolves to any other origin is ignored.
 *
 * Back and forward use the page's own history. A sandboxed frame without leave to navigate its parent has a
 * traversal that would move the parent refused by the browser, and the tab only offers the buttons when the frame
 * says it has somewhere to go: from the Navigation API where the browser has it, otherwise from counting the page's
 * own pushes and pops.
 *
 * The first message is PreviewReady. The tab treats a frame that loaded and never said so as one that is not showing
 * the app, which is how it tells a working preview from a page that came from somewhere else. A status page says
 * PreviewStatusPage with its HTTP status for the same reason: the tab cannot read a cross-origin frame's status, and
 * what it should do differs - fetch a fresh link for a 401, ask the server what happened for a 404, wait for a 502.
 *
 * Console lines are batched and capped, so an app logging in a loop costs the tab a trickle and not a flood, and
 * each argument is cut to a length a person would read. Nothing about relaying them changes what the app's own
 * console shows.
 *
 * A page counts as blank when, a moment after loading, its body has no text and nothing that draws - no image,
 * canvas, control or frame - and the compile-error overlay is not up. It is re-checked as the page changes, so an
 * app that renders late takes the notice back.
 */
const REPORTER_SOURCE = `(function () {
  if (window.parent === window) return;
  var parentWindow = window.parent;
  var sent = {};
  function post(type, subType, payload) {
    try { parentWindow.postMessage({ type: type, subType: subType, payload: payload }, '*'); } catch (e) {}
  }
  function report(subType, payload) {
    var key = subType + '|' + payload.message;
    if (sent[key]) return;
    sent[key] = true;
    post('PreviewError', subType, payload);
  }
  window.addEventListener('error', function (e) {
    if (!e.message) return;
    report('Runtime error', { message: e.message, stack: e.error && e.error.stack, source: e.filename, lineno: e.lineno, colno: e.colno });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    report('Unhandled promise rejection', { message: String(r.message || r), stack: r.stack });
  });

  var overlayUp = false;
  function checkOverlay(node) {
    if (!node || node.tagName !== 'VITE-ERROR-OVERLAY' || !node.shadowRoot) return;
    overlayUp = true;
    var root = node.shadowRoot;
    var text = function (sel) { var el = root.querySelector(sel); return el ? el.textContent.trim() : undefined; };
    report('Build error', { message: text('.message') || 'Build failed', stack: text('.frame') || text('.stack'), source: text('.file') });
  }
  function checkOverlayGone(node) {
    if (!node || node.tagName !== 'VITE-ERROR-OVERLAY' || !overlayUp) return;
    overlayUp = false;
    for (var key in sent) { if (key.indexOf('Build error|') === 0) delete sent[key]; }
    post('PreviewErrorCleared', 'Build error', null);
  }

  var blankReported = false;
  var blankTimer = null;
  function isBlank() {
    if (overlayUp) return false;
    var body = document.body;
    if (!body) return true;
    if (String(body.innerText || body.textContent || '').replace(/\\s+/g, '')) return false;
    return !body.querySelector('img,svg,canvas,video,iframe,input,button,textarea,select');
  }
  function checkBlank() {
    blankTimer = null;
    var blank = isBlank();
    if (blank && !blankReported) { blankReported = true; post('PreviewBlank', null, null); }
    else if (!blank && blankReported) { blankReported = false; post('PreviewRendered', null, null); }
  }
  function scheduleBlankCheck(delay) {
    if (blankTimer !== null) return;
    blankTimer = setTimeout(checkBlank, delay);
  }
  window.addEventListener('load', function () { scheduleBlankCheck(2500); });

  new MutationObserver(function (records) {
    records.forEach(function (r) {
      r.addedNodes.forEach(checkOverlay);
      r.removedNodes.forEach(checkOverlayGone);
    });
    if (blankReported) scheduleBlankCheck(300);
  }).observe(document.documentElement, { childList: true, subtree: true });

  var position = 0;
  var furthest = 0;
  var asked = 0;
  function canGo() {
    var nav = window.navigation;
    if (nav && typeof nav.canGoBack === 'boolean') return { back: nav.canGoBack, forward: nav.canGoForward };
    return { back: position > 0, forward: position < furthest };
  }
  function whereAmI(kind) {
    if (kind === 'push') { position += 1; furthest = position; }
    if (kind === 'pop') { position = Math.max(0, Math.min(furthest, position + (asked || -1))); asked = 0; }
    var go = canGo();
    return { path: window.location.pathname + window.location.search + window.location.hash, canGoBack: go.back, canGoForward: go.forward };
  }
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      post('PreviewLocation', null, whereAmI(name === 'pushState' ? 'push' : 'replace'));
      return result;
    };
  });
  window.addEventListener('popstate', function () { post('PreviewLocation', null, whereAmI('pop')); });
  window.addEventListener('hashchange', function () { post('PreviewLocation', null, whereAmI('replace')); });

  window.addEventListener('message', function (e) {
    if (e.source !== parentWindow || !e.data || e.data.type !== 'PreviewCommand') return;
    var command = e.data.command;
    var go = canGo();
    if (command === 'back' && go.back) { asked = -1; history.back(); }
    else if (command === 'forward' && go.forward) { asked = 1; history.forward(); }
    else if (command === 'reload') { window.location.reload(); }
    else if (command === 'navigate' && typeof e.data.path === 'string') {
      var target;
      try { target = new URL(e.data.path, window.location.origin); } catch (err) { return; }
      if (target.origin !== window.location.origin) return;
      window.location.assign(target.pathname + target.search + target.hash);
    }
  });

  var MAX_ARG = 2000;
  var MAX_LINES_PER_FLUSH = 40;
  var lines = [];
  var dropped = 0;
  var flushTimer = null;
  function show(value) {
    var text;
    if (typeof value === 'string') text = value;
    else if (value && typeof value === 'object' && typeof value.message === 'string' && typeof value.stack === 'string') text = value.stack || value.message;
    else {
      try {
        var seen = [];
        text = JSON.stringify(value, function (k, v) {
          if (typeof v === 'object' && v !== null) { if (seen.indexOf(v) !== -1) return '[circular]'; seen.push(v); }
          if (typeof v === 'function') return '[function]';
          return v;
        });
      } catch (err) { text = undefined; }
      if (text === undefined) text = String(value);
    }
    return text.length > MAX_ARG ? text.slice(0, MAX_ARG) + '...' : text;
  }
  function flush() {
    flushTimer = null;
    var batch = lines;
    var missed = dropped;
    lines = [];
    dropped = 0;
    if (missed) batch.push({ level: 'warn', text: '... ' + missed + ' more lines not shown' });
    if (batch.length) post('PreviewConsole', null, { lines: batch });
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level];
    if (typeof original !== 'function') return;
    console[level] = function () {
      try {
        if (lines.length >= MAX_LINES_PER_FLUSH) dropped += 1;
        else {
          var parts = [];
          for (var i = 0; i < arguments.length; i++) parts.push(show(arguments[i]));
          lines.push({ level: level, text: parts.join(' ') });
        }
        if (flushTimer === null) flushTimer = setTimeout(flush, 150);
      } catch (err) {}
      return original.apply(console, arguments);
    };
  });

  post('PreviewReady', null, whereAmI('replace'));
})();`;

const REPORTER = `<script>${REPORTER_SOURCE}</script>`;

function injectReporter(html) {
    const head = html.search(/<head[^>]*>/i);
    if (head === -1) return REPORTER + html;
    const end = html.indexOf('>', head) + 1;
    return html.slice(0, end) + REPORTER + html.slice(end);
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function statusPageHtml(status, title, message, { refreshSeconds } = {}) {
    const refresh = refreshSeconds ? `<meta http-equiv="refresh" content="${Number(refreshSeconds)}">` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}
<title>${escapeHtml(title)}</title><style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 14px/1.5 system-ui, sans-serif;
         background: Canvas; color: CanvasText; }
  main { max-width: 360px; padding: 24px; text-align: center; }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
  p { margin: 0; opacity: .7; }
</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main>
<script>if (window.parent !== window) { try { window.parent.postMessage({ type: 'PreviewStatusPage', payload: { status: ${Number(status)} } }, '*'); } catch (e) {} }</script>
</body></html>`;
}

module.exports = { REPORTER, REPORTER_SOURCE, injectReporter, statusPageHtml };
