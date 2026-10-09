/**
 * Markdown in a chat message.
 *
 * Handles: rendering the text, giving each fenced block the editor's own syntax colours so a snippet in a reply
 * looks like the same code in the editor beside it, and drawing links and images as text written by a model has to
 * be drawn. Inline code is left to the stylesheet.
 *
 * A link opens in a new tab, cut off from this one, and only a web or mail address is a link at all; anything else
 * is left as its words. When a link's words do not name the site it leads to, the site is written after it, so
 * "Sign in again" cannot quietly lead somewhere else (lib/safe-link). An image is never fetched: the text can name
 * any address, and asking for it would tell that address who is reading. It is drawn as its description, linked the
 * same guarded way. Raw HTML in the text is not rendered - the renderer is used without that plugin.
 */
import { memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightCode } from "@/lib/highlight-code";
import { safeLink, saysWhereItGoes } from "@/lib/safe-link";
import { cn } from "@/lib/utils";

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
  return (
    <code>
      {tokens.map((token, index) =>
        token.cls ? <span key={index} className={token.cls}>{token.text}</span> : token.text
      )}
    </code>
  );
}

function GuardedLink({ href, children }: { href?: string; children?: ReactNode }) {
  const link = safeLink(href);
  if (!link) return <>{children}</>;
  const words = typeof children === "string" ? children : Array.isArray(children) ? children.filter((part) => typeof part === "string").join("") : "";
  return (
    <>
      <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" title={link.href}>{children}</a>
      {!saysWhereItGoes(words, link.site) && <span className="text-muted-foreground"> ({link.site})</span>}
    </>
  );
}

const COMPONENTS: Components = {
  a({ href, children }) {
    return <GuardedLink href={href}>{children}</GuardedLink>;
  },
  img({ src, alt }) {
    const label = alt?.trim() || "image";
    return <GuardedLink href={typeof src === "string" ? src : undefined}>{label}</GuardedLink>;
  },
  code({ className, children, ...props }) {
    const text = String(children ?? "");
    const language = /language-(\w+)/.exec(className ?? "")?.[1];
    const isFenced = language !== undefined || text.includes("\n");
    if (!isFenced) {
      return <code className={className} {...props}>{children}</code>;
    }
    return <CodeBlock code={text.replace(/\n$/, "")} language={language} />;
  },
};

export const ChatMarkdown = memo(function ChatMarkdown({ children, className }: {
  children: string;
  className?: string;
}): ReactNode {
  return (
    <div className={cn("chat-markdown", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
