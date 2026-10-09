/**
 * Deciding what a link written by a model may do.
 *
 * Handles: accepting only web and mail addresses, and naming the site a web link really leads to so it can be shown
 * beside the link's own words.
 *
 * A model's reply is shaped by what it reads, and it reads project files - which a collaborator can edit and a fork
 * inherits from its first author. Text planted in one can come back in the assistant's voice as "sign in again to
 * continue" with a link under it. Such a link must never run script, never leave in the app's own tab, and never
 * hide where it goes: the page draws the site's name after any link whose words do not already say it.
 */

export interface SafeLink {
  href: string;
  site: string | null;
}

const WEB = new Set(["http:", "https:"]);

export function safeLink(href: string | undefined | null): SafeLink | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  if (url.protocol === "mailto:") return { href: url.href, site: null };
  if (!WEB.has(url.protocol) || !url.hostname) return null;
  if (url.username || url.password) return null;
  return { href: url.href, site: url.hostname.replace(/^www\./, "") };
}

export function saysWhereItGoes(text: string, site: string | null): boolean {
  if (!site) return true;
  return text.toLowerCase().includes(site.toLowerCase());
}
