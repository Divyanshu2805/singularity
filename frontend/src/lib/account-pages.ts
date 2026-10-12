/**
 * The three pages behind the account menu's one Account entry, and telling whether an address is one of them.
 *
 * Handles: the label and address of each - Profile, Plans & billing, Security - in the order their switch shows
 * them, and the check the sidebar uses to mark Account as the page being looked at on any of the three.
 */
export const ACCOUNT_PAGES = [
  { label: "Profile", to: "/account" },
  { label: "Plans & billing", to: "/settings/billing" },
  { label: "Security", to: "/settings/security" },
] as const;

export const isAccountPath = (pathname: string) => ACCOUNT_PAGES.some((page) => page.to === pathname);
