import { memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightCode } from "@/lib/highlight-code";
import { cn } from "@/lib/utils";

/** Renders one fenced block with the editor's syntax colours. Inline code is left to the stylesheet. */
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

const COMPONENTS: Components = {
  code({ className, children, ...props }) {
    const text = String(children ?? "");
    // react-markdown gives fenced blocks a `language-x` class; inline code has none.
    const language = /language-(\w+)/.exec(className ?? "")?.[1];
    const isFenced = language !== undefined || text.includes("\n");
    if (!isFenced) {
      return <code className={className} {...props}>{children}</code>;
    }
    return <CodeBlock code={text.replace(/\n$/, "")} language={language} />;
  },
};

/**
 * Markdown for chat replies, with fenced code syntax-highlighted using the same parsers and palette as the
 * editor. Shared by the project chat and the code-notes panel so a snippet looks the same wherever it's read.
 */
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
