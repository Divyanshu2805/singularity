/**
 * Markdown in a chat message.
 *
 * Handles: rendering the text, and giving each fenced block the editor's own syntax colours so a snippet in a reply
 * looks like the same code in the editor beside it. Inline code is left to the stylesheet.
 */
import { memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightCode } from "@/lib/highlight-code";
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

const COMPONENTS: Components = {
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
