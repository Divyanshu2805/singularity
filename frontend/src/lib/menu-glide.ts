/**
 * One highlight that glides between the items of every open menu, the way the sidebar's does.
 *
 * Handles: watching the page for menus and select lists as they open (role="menu" and role="listbox"), giving each a
 * single highlight element, and moving it onto whichever item Radix marks data-highlighted - by pointer or by
 * keyboard - by writing its box into CSS variables the stylesheet transitions (index.css, .menu-glide-pill). The first
 * placement in a menu snaps and fades in; later ones slide. It stays put in the gap between two items (Radix clears its highlight there) and only fades out when the pointer leaves the
 * menu, which is what lets it glide rather than reappear. The wash is gold on every item but one that deletes
 * (data-danger="delete"), where the pill is told to turn red (data-tone) while it rests there (index.css). The items' own highlight backgrounds are switched off inside a menu that has a pill
 * ([data-menu-glide], index.css) so the two never stack. A menu and its items animate in as it opens, so the pill is
 * measured again whenever one of those animations finishes - measured mid-way it sat a few pixels off its item.
 *
 * The keyboard search's list (cmdk, ProjectCommandPalette) gets the same pill, with two differences. Its chosen row
 * is marked data-selected rather than data-highlighted, and one row is always chosen - Enter opens it wherever the
 * pointer is - so there the pill does not fade when the pointer leaves the list; it goes only when the filter leaves
 * nothing to choose. And typing reorders the rows without changing which one is chosen, so the list's children are
 * watched as well as its attributes, or the pill would stay where the row used to be.
 */
const MENU_SELECTOR = '[role="menu"], [role="listbox"]';
const HIGHLIGHTED = '[data-highlighted], [cmdk-item][data-selected="true"]';
const attached = new WeakSet<Element>();

function attach(menu: HTMLElement) {
  if (attached.has(menu)) return;
  attached.add(menu);
  const host = menu.querySelector<HTMLElement>("[data-radix-select-viewport]") ?? menu;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  const sticky = menu.matches("[cmdk-list]");
  const pill = document.createElement("span");
  pill.setAttribute("aria-hidden", "true");
  pill.className = "menu-glide-pill";
  pill.dataset.on = "false";
  host.prepend(pill);
  menu.dataset.menuGlide = "";

  const place = () => {
    const item = menu.querySelector<HTMLElement>(HIGHLIGHTED);
    if (!item || !host.contains(item)) {
      if (sticky) pill.dataset.on = "false";
      return;
    }
    const box = host.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    pill.dataset.snap = String(pill.dataset.on !== "true");
    pill.dataset.tone = item.matches('[data-danger="delete"]') ? "danger" : "gold";
    pill.style.setProperty("--gx", `${rect.left - box.left + host.scrollLeft}px`);
    pill.style.setProperty("--gy", `${rect.top - box.top + host.scrollTop}px`);
    pill.style.setProperty("--gw", `${rect.width}px`);
    pill.style.setProperty("--gh", `${rect.height}px`);
    pill.dataset.on = "true";
  };

  const observer = new MutationObserver(place);
  observer.observe(menu, { attributes: true, attributeFilter: ["data-highlighted", "data-selected"], subtree: true, childList: sticky });
  menu.addEventListener("pointerleave", () => {
    if (!sticky) pill.dataset.on = "false";
  });
  menu.addEventListener("animationend", place);
  place();
}

export function installMenuGlide() {
  const scan = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(MENU_SELECTOR)) attach(node);
    node.querySelectorAll<HTMLElement>(MENU_SELECTOR).forEach(attach);
  };
  document.querySelectorAll<HTMLElement>(MENU_SELECTOR).forEach(attach);
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(scan))).observe(document.body, {
    childList: true,
    subtree: true,
  });
}
