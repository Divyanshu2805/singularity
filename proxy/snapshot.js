/**
 * Taking a small picture of a previewed page, from inside the page.
 *
 * Handles: copying the page as it stands - its elements, the rules of every stylesheet it can read, what is typed
 * into its fields, what its canvases show and its first few images - into one self-contained SVG, drawing that on a
 * canvas at thumbnail size, and handing back a WebP or JPEG data URL small enough to post; and saying it could not,
 * with a reason, when any step fails or takes too long.
 *
 * It is how a project's card gets a picture of the app (the workspace asks through the reporter, proxy/reporter.js,
 * and stores what comes back). The preview is another origin in a sandboxed frame, so nothing outside the page can
 * photograph it, and the cluster has no browser of its own to do it with; the page drawing itself is the one way
 * that needs neither.
 *
 * How the picture is made. An SVG image may hold HTML in a foreignObject and the browser lays it out with the same
 * engine, so the copy is styled by the page's own rules rather than by thousands of inlined properties: the rules
 * are read from document.styleSheets (the dev server delivers CSS as style elements, which are always readable) and
 * put in one style element inside the copy. In that image the root is the svg element, so custom properties set on
 * :root still reach everything, and html and body are ordinary elements that their own selectors still match. The
 * image is always 1280 wide and five-eighths as tall, whatever size the preview's frame happens to be - a card
 * should show the app as a desktop sees it even when its owner was looking at the phone width - so breakpoints and
 * viewport units resolve against that, and what is drawn is the top of the page.
 *
 * What an image like that cannot do is fetch: no script runs in it and nothing outside it loads. So scripts, frames
 * and media are taken out of the copy, a canvas is replaced by a picture of itself, and an img is replaced by its
 * bytes as a data URL - the first few, each within a size limit, the rest left blank. Fonts the page loads from
 * elsewhere fall back to the next in their stack; a thumbnail survives that.
 *
 * It is given a data URL and not a blob URL because a browser refuses to read back a canvas an SVG blob was drawn
 * on. One browser family refuses either way; there the answer is "could not", and the card keeps its colours.
 *
 * Written as one plain function with no closure over this module, in ES5, because the reporter embeds its source
 * text in the page: whatever browser opens the preview runs it as it is written here. snapshot.test.js runs the
 * same function against a stand-in window.
 */
function takeSnapshot(win, done) {
    var PAGE_WIDTH = 1280;
    var OUT_WIDTH = 640;
    var OUT_HEIGHT = 400;
    var MAX_CSS_CHARS = 900000;
    var MAX_MARKUP_CHARS = 1500000;
    var MAX_IMAGES = 8;
    var MAX_IMAGE_BYTES = 400000;
    var MAX_RESULT_CHARS = 260000;
    var TIMEOUT_MS = 6000;
    var doc = win.document;
    var finished = false;
    var timer = null;

    function finish(dataUrl, reason) {
        if (finished) return;
        finished = true;
        if (timer !== null) win.clearTimeout(timer);
        done(dataUrl, reason || null);
    }

    function readCss() {
        var css = '';
        var sheets = doc.styleSheets || [];
        for (var i = 0; i < sheets.length; i++) {
            var rules;
            try { rules = sheets[i].cssRules; } catch (e) { continue; }
            if (!rules) continue;
            for (var j = 0; j < rules.length; j++) {
                if (rules[j].type === 3) continue;
                var text = rules[j].cssText;
                if (css.length + text.length > MAX_CSS_CHARS) return css;
                css += text + '\n';
            }
        }
        return css;
    }

    function each(list, fn) {
        for (var i = 0; i < list.length; i++) fn(list[i], i);
    }

    function carryFieldValues(original, copy) {
        var from = original.querySelectorAll('input,textarea,select');
        var to = copy.querySelectorAll('input,textarea,select');
        each(from, function (field, i) {
            var target = to[i];
            if (!target) return;
            var tag = field.tagName;
            if (tag === 'TEXTAREA') { target.textContent = field.value; return; }
            if (tag === 'SELECT') {
                each(target.options || [], function (option, k) {
                    if (k === field.selectedIndex) option.setAttribute('selected', 'selected');
                    else option.removeAttribute('selected');
                });
                return;
            }
            if (field.type === 'password') { target.setAttribute('value', ''); return; }
            if (field.type === 'checkbox' || field.type === 'radio') {
                if (field.checked) target.setAttribute('checked', 'checked');
                else target.removeAttribute('checked');
                return;
            }
            target.setAttribute('value', field.value);
        });
    }

    function carryCanvases(original, copy) {
        var from = original.querySelectorAll('canvas');
        var to = copy.querySelectorAll('canvas');
        each(from, function (canvas, i) {
            var target = to[i];
            if (!target || !target.parentNode) return;
            var picture = doc.createElement('img');
            try { picture.setAttribute('src', canvas.toDataURL('image/png')); } catch (e) { return; }
            if (canvas.className) picture.setAttribute('class', canvas.className);
            if (canvas.getAttribute('style')) picture.setAttribute('style', canvas.getAttribute('style'));
            picture.setAttribute('width', String(canvas.clientWidth || canvas.width));
            picture.setAttribute('height', String(canvas.clientHeight || canvas.height));
            target.parentNode.replaceChild(picture, target);
        });
    }

    function inlineImages(original, copy, then) {
        var from = original.querySelectorAll('img');
        var to = copy.querySelectorAll('img');
        var jobs = [];
        each(from, function (image, i) {
            var target = to[i];
            if (!target) return;
            target.removeAttribute('srcset');
            target.removeAttribute('loading');
            var source = image.currentSrc || image.src || '';
            if (source.indexOf('data:') === 0) { target.setAttribute('src', source); return; }
            target.removeAttribute('src');
            if (source && jobs.length < MAX_IMAGES && typeof win.fetch === 'function') jobs.push({ source: source, target: target });
        });
        var left = jobs.length;
        if (left === 0) { then(); return; }
        function one() { left -= 1; if (left === 0) then(); }
        each(jobs, function (job) {
            win.fetch(job.source, { credentials: 'omit' }).then(function (response) {
                if (!response.ok) throw new Error('not ok');
                return response.blob();
            }).then(function (blob) {
                if (blob.size > MAX_IMAGE_BYTES || String(blob.type).indexOf('image/') !== 0) { one(); return; }
                var reader = new win.FileReader();
                reader.onload = function () { job.target.setAttribute('src', String(reader.result)); one(); };
                reader.onerror = one;
                reader.readAsDataURL(blob);
            })['catch'](one);
        });
    }

    function draw(svg, width, height) {
        var image = new win.Image();
        image.onload = function () {
            try {
                var canvas = doc.createElement('canvas');
                canvas.width = OUT_WIDTH;
                canvas.height = OUT_HEIGHT;
                var context = canvas.getContext('2d');
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, OUT_WIDTH, OUT_HEIGHT);
                context.drawImage(image, 0, 0, width, height, 0, 0, OUT_WIDTH, OUT_HEIGHT);
                var qualities = [0.82, 0.6, 0.4];
                for (var i = 0; i < qualities.length; i++) {
                    var result = canvas.toDataURL('image/webp', qualities[i]);
                    if (result.indexOf('data:image/webp') !== 0) result = canvas.toDataURL('image/jpeg', qualities[i]);
                    if (result.indexOf('data:image/webp') !== 0 && result.indexOf('data:image/jpeg') !== 0) break;
                    if (result.length <= MAX_RESULT_CHARS) { finish(result); return; }
                }
                finish(null, 'too large');
            } catch (e) {
                finish(null, 'could not read the picture back');
            }
        };
        image.onerror = function () { finish(null, 'could not draw the page'); };
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    try {
        timer = win.setTimeout(function () { finish(null, 'timed out'); }, TIMEOUT_MS);
        var root = doc.documentElement;
        if (!root || !doc.body) { finish(null, 'no page'); return; }
        var width = PAGE_WIDTH;
        var height = Math.round(width * OUT_HEIGHT / OUT_WIDTH);
        var css = readCss();
        var copy = root.cloneNode(true);
        each(copy.querySelectorAll('script,noscript,link,style,iframe,object,embed,video,audio,vite-error-overlay,template'), function (node) {
            if (node.parentNode) node.parentNode.removeChild(node);
        });
        carryFieldValues(root, copy);
        carryCanvases(root, copy);
        var style = doc.createElement('style');
        style.textContent = css;
        var head = copy.querySelector('head');
        if (head) head.appendChild(style);
        else copy.insertBefore(style, copy.firstChild);

        inlineImages(root, copy, function () {
            if (finished) return;
            try {
                var markup = new win.XMLSerializer().serializeToString(copy);
                if (markup.length > MAX_MARKUP_CHARS) { finish(null, 'page too large'); return; }
                var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">'
                    + '<foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' + markup + '</foreignObject></svg>';
                draw(svg, width, height);
            } catch (e) {
                finish(null, 'could not copy the page');
            }
        });
    } catch (e) {
        finish(null, 'could not copy the page');
    }
}

module.exports = { takeSnapshot };
