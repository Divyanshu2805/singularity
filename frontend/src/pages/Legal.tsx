/**
 * The Privacy and Terms pages: one layout, two documents.
 *
 * Handles: showing a document from lib/legal - its title, when it last changed, its one-sentence summary and its
 * sections - with a way home, a link across to the other document, and links to the source and to where to write.
 *
 * It is set in the app's night like the page for a wrong address (the quiet sky, a Fraunces headline), and is plain
 * reading text otherwise: these are pages someone reads once, on any screen, and nothing on them should move.
 */
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { SlideLink } from "@/components/SlideLink";
import { Button } from "@/components/ui/button";
import { CONTACT_URL, PRIVACY, SOURCE_URL, TERMS, type LegalDocument } from "@/lib/legal";

function LegalPage({ document, other }: { document: LegalDocument; other: { label: string; to: string } }) {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <LandingBackdrop mode="quiet" />
      <main className="relative mx-auto w-full max-w-2xl px-6 py-14 sm:py-20">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          style={{ "--icon-hover": "translateX(-2px)" } as CSSProperties}
          className="-ml-3 mb-8 gap-1.5 text-muted-foreground"
        >
          <ArrowLeft />
          Home
        </Button>

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

        <footer className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.08] pt-6 text-[13.5px] text-muted-foreground">
          <SlideLink to={other.to} className="wipe-link">{other.label}</SlideLink>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="wipe-link">Source code</a>
          <a href={CONTACT_URL} target="_blank" rel="noreferrer" className="wipe-link">Ask a question</a>
        </footer>
      </main>
    </div>
  );
}

export const Privacy = () => <LegalPage document={PRIVACY} other={{ label: "Terms", to: "/terms" }} />;
export const Terms = () => <LegalPage document={TERMS} other={{ label: "Privacy", to: "/privacy" }} />;
