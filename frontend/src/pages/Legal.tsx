/**
 * The Privacy and Terms page: one page, two documents, and a switch between them.
 *
 * Handles: showing a document from lib/legal - its title, when it last changed, its one-sentence summary and its
 * sections - with a way home, a sliding switch across to the other document, and links to the source and to where to
 * write.
 *
 * Both addresses, /privacy and /terms, draw this one component, and the address decides which document shows. That
 * is what lets the switch slide: the page stays mounted while the address changes under it, so the chip glides from
 * one name to the other instead of the page being drawn again. Each document keeps its own address, so a link to
 * either still lands on it, and the switch replaces the address rather than adding to the history - going back
 * leaves the page, it does not walk through the two tabs. They were two pages with a link to each other at the foot
 * until the owner asked for one entry in the account menu and both documents behind it.
 *
 * It is set in the app's night like the page for a wrong address (the quiet sky, a Fraunces headline), and is plain
 * reading text otherwise: these are pages someone reads once, on any screen, and nothing on them moves but the
 * switch.
 */
import { useRef, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageBackdrop } from "@/components/app/PageBackdrop";
import { Button } from "@/components/ui/button";
import { CONTACT_URL, PRIVACY, SOURCE_URL, TERMS, type LegalDocument } from "@/lib/legal";
import { useGlideHighlight } from "@/hooks/use-glide-highlight";
import { cn } from "@/lib/utils";

const DOCUMENTS: { label: string; to: string; document: LegalDocument }[] = [
  { label: "Privacy", to: "/privacy", document: PRIVACY },
  { label: "Terms", to: "/terms", document: TERMS },
];

export function Legal() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = pathname.startsWith("/terms") ? 1 : 0;
  const switchRef = useRef<HTMLDivElement>(null);
  const glideRef = useGlideHighlight(switchRef);
  const { document } = DOCUMENTS[active];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <PageBackdrop mode="quiet" />
      <main className="relative mx-auto w-full max-w-2xl px-6 py-14 sm:py-20">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            style={{ "--icon-hover": "translateX(-2px)" } as CSSProperties}
            className="-ml-3 gap-1.5 text-muted-foreground"
          >
            <ArrowLeft />
            Home
          </Button>

          <div ref={switchRef} role="tablist" aria-label="Document" className="app-track relative grid w-52 grid-cols-2 p-0.5">
            <span ref={glideRef} aria-hidden="true" className="glide-pill rounded-full" />
            <span
              aria-hidden="true"
              className={cn(
                "seg-pill absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] transition-transform duration-[650ms] ease-[cubic-bezier(0.34,1.35,0.64,1)] motion-reduce:transition-none",
                active === 1 && "translate-x-full"
              )}
            />
            {DOCUMENTS.map((entry, index) => (
              <button
                key={entry.to}
                type="button"
                role="tab"
                aria-selected={index === active}
                data-glide=""
                onClick={() => index !== active && navigate(entry.to, { replace: true })}
                className={cn(
                  "relative z-10 flex h-7 items-center justify-center rounded-full px-3.5 text-xs font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  index === active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <article key={document.title} role="tabpanel" aria-label={document.title} className="animate-fade-in">
          <p className="app-eyebrow">Last changed {document.updated}</p>
          <h1 className="landing-heading mt-3 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[44px]">
            {document.title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-foreground/85">{document.summary}</p>

          <div className="mt-10 flex flex-col gap-9">
            {document.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-base font-semibold text-foreground">{section.heading}</h2>
                <div className="mt-2.5 flex flex-col gap-3 text-sm leading-[1.7] text-muted-foreground">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>

        <footer className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.08] pt-6 text-[13.5px] text-muted-foreground">
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="wipe-link">Source code</a>
          <a href={CONTACT_URL} target="_blank" rel="noreferrer" className="wipe-link">Ask a question</a>
        </footer>
      </main>
    </div>
  );
}
