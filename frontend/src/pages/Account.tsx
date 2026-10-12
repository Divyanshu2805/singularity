/**
 * The account's first page: who is signed in, and how to have the account deleted.
 *
 * Handles: showing the person's name, email and plan, and saying how an account is deleted.
 *
 * It is the Profile stop of the three account pages; Plans & billing and Security are the other two, reached by the
 * switch at its head (components/app/AccountTabs), and the account menu's one Account entry opens here. The owner
 * asked for the account to be one thing - the name with billing and security - and Settings another, so the profile
 * and the way out moved here from the Settings page, which now holds only preferences.
 *
 * The name and email are shown and not edited: they come from the sign-in provider. The plan is named, and changed
 * on the next tab. Deleting an account is by request, as the Privacy page says, so that part leads to where to ask
 * rather than to a button that could not keep its promise.
 *
 * It stands on the app's night like the two pages beside it - the shared page heading over raised panels.
 */
import { Nebula } from "@/components/app/Nebula";
import { PageHeading } from "@/components/app/PageHeading";
import { AccountTabs } from "@/components/app/AccountTabs";
import { useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Trash2, UserRound } from "lucide-react";
import { AppSidebar, SidebarSpacer } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/hooks/use-billing";
import { useSidebar } from "@/hooks/use-sidebar";
import { getUserInfo, isAuthenticated, loginRedirectPath } from "@/lib/api";
import { CONTACT_URL } from "@/lib/legal";

const PAGE_GLOW: CSSProperties = {
  backgroundImage: [
    "radial-gradient(70% 45% at 50% -8%, hsl(40.7 99.9% 76.1% / 0.07) 0%, transparent 70%)",
    "radial-gradient(35% 30% at 92% 0%, hsl(41.3 100% 85.6% / 0.04) 0%, transparent 70%)",
  ].join(", "),
};

export function Account() {
  const navigate = useNavigate();
  const sidebar = useSidebar();
  const { subscription } = useBilling();
  const user = getUserInfo();

  useEffect(() => {
    if (!isAuthenticated()) navigate(loginRedirectPath());
  }, [navigate]);

  return (
    <div className="dash-night dash-sky relative flex h-screen overflow-hidden bg-background">
      <Nebula />
      <SidebarSpacer sidebar={sidebar} />

      <div className="dash-frame relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PAGE_GLOW} />
        <header className="relative flex h-12 shrink-0 items-center gap-2 px-2" />

        <main className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-16 pt-4 sm:px-6">
            <div className="mb-6">
              <PageHeading eyebrow="Account" title="Your" accent="account" actions={<AccountTabs />}>
                Who you are here, your plan, and how you sign in.
              </PageHeading>
            </div>

            <section className="app-glass app-rise rounded-[22px] p-5" style={{ "--i": 1 } as CSSProperties}>
              <p className="app-label">Profile</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <UserRound className="h-4 w-4 text-primary" /> Who you are here
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">Your name and email come from how you sign in, so they are changed there.</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <span className="avatar-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-primary-foreground">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user?.name || "Signed in"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.username}</p>
                </div>
                {subscription && (
                  <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-white/[0.06] px-3 text-xs font-medium text-foreground/85">
                    {subscription.plan.name} plan
                  </span>
                )}
              </div>
            </section>

            <section className="app-glass app-rise rounded-[22px] p-5" style={{ "--i": 2 } as CSSProperties}>
              <p className="app-label">The way out</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <Trash2 className="h-4 w-4 text-primary" /> Delete your account
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                There is no button for this yet: an account and everything in it is deleted by request, by hand.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 text-xs text-muted-foreground">Write to the maker and say which email you sign in with.</p>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
                    Where to write <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </section>
          </div>
        </main>
      </div>

      <AppSidebar sidebar={sidebar} inset />
    </div>
  );
}
