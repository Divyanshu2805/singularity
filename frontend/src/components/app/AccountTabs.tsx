/**
 * The switch at the head of the three account pages: Profile, Plans & billing, Security.
 *
 * Handles: showing which of the three the person is on, and going to another.
 *
 * The account menu has one Account entry, and these three pages are what is behind it. Each is still a page with an
 * address of its own (/account, /settings/billing, /settings/security), so links to billing and security from
 * elsewhere in the app keep working, and the same switch at the head of each is what makes them read as one place.
 * The pages themselves are listed in lib/account-pages. It is the workspace's Preview/Code track with three stops; the chip is placed for the page being drawn rather than
 * slid, since going to another tab loads another page.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { ACCOUNT_PAGES } from "@/lib/account-pages";
import { cn } from "@/lib/utils";

const CHIP_AT = ["translate-x-0", "translate-x-full", "translate-x-[200%]"];

export function AccountTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = Math.max(0, ACCOUNT_PAGES.findIndex((page) => page.to === pathname));

  return (
    <div role="tablist" aria-label="Account" className="app-track relative grid w-[22rem] max-w-full grid-cols-3 p-0.5">
      <span aria-hidden="true" className={cn("seg-pill absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)]", CHIP_AT[active])} />
      {ACCOUNT_PAGES.map((page, index) => (
        <button
          key={page.to}
          type="button"
          role="tab"
          aria-selected={index === active}
          onClick={() => index !== active && navigate(page.to)}
          className={cn(
            "relative z-10 flex h-7 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            index === active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {page.label}
        </button>
      ))}
    </div>
  );
}
