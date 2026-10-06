/**
 * The landing page's footer: the brand with one line about the product, the page's and the account's links, and the
 * name set very large as the last thing on the page.
 *
 * Handles: a thin fading rule as the footer's only divider (home.css, .home-rule); the horizon mark and the name with
 * the sentence that says what the product does; two groups of links - the page's sections, which glide to their
 * anchors, and the account's, which leave for the sign-in pages by the page slide - each underlining itself from the
 * left (.wipe-link); and the closing wordmark (FooterWordmark).
 *
 * Links to the source, a privacy page and a terms page are in the content plan and are not here: none of them
 * exists to link to yet. It was part of pages/Home.tsx until the page being rebuilt (pages/Genesis.tsx) needed the
 * same footer; both pages show this one.
 */
import { BrandName, HorizonMark } from "@/components/HorizonMark";
import { SlideLink } from "@/components/SlideLink";
import { FooterWordmark } from "./FooterWordmark";
import { Reveal } from "./Reveal";

const FOOTER_GROUPS: { name: string; links: { label: string; href?: string; to?: string }[] }[] = [
  {
    name: "Product",
    links: [
      { label: "How it works", href: "#workbench" },
      { label: "What you can build", href: "#examples" },
      { label: "Understand", href: "#understand" },
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    name: "Account",
    links: [
      { label: "Create an account", to: "/signup" },
      { label: "Sign in", to: "/login" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden">
      <div aria-hidden="true" className="home-rule mx-auto w-[min(72rem,88%)]" />
      <div className="landing-wrap flex flex-col gap-10 pt-14 md:flex-row md:items-start md:justify-between">
        <Reveal className="max-w-sm">
          <span className="flex items-center gap-2.5">
            <HorizonMark className="h-8 w-8" />
            <BrandName className="text-[22px]" />
          </span>
          <p className="mt-3 text-[13.5px] leading-[1.65] text-muted-foreground">
            Describe an idea, answer a few questions, and watch a real project get built, run and explained.
          </p>
        </Reveal>
        <Reveal delay={90}>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-16 gap-y-8">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.name}>
                <p className="text-[13px] font-medium text-foreground/85">{group.name}</p>
                <ul className="mt-3 space-y-2.5 text-[13.5px] text-muted-foreground">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.to ? (
                        <SlideLink to={link.to} className="wipe-link">
                          {link.label}
                        </SlideLink>
                      ) : (
                        <a href={link.href} className="wipe-link">
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </Reveal>
      </div>
      <FooterWordmark className="mt-10 sm:mt-12" />
    </footer>
  );
}
