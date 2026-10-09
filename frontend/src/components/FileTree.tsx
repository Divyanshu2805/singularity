/**
 * The project's files as a tree.
 *
 * Handles: folders that open and close, the expand-all and collapse-all commands from the Files header, per-file
 * icons and colours, and selecting a file to open.
 *
 * Each expand-or-collapse command carries a fresh id, so pressing the same one twice - after opening a few folders by
 * hand in between - applies it again rather than being ignored as unchanged.
 *
 * It moves the way the sidebar does: one hover highlight glides from row to row (use-glide-highlight - every row is
 * marked data-glide and positioned so it paints over it), the open file takes the app's selected look (index.css,
 * .row-active - a faint gold glass fill inside a gold hairline, the landing navigation's chip), and a folder's chevron turns as it opens.
 */
import { useGlideHighlight } from "@/hooks/use-glide-highlight";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { FileNode } from "@/lib/types";
import { getFileColor, getFileIcon } from "@/lib/file-icons";
import { cn } from "@/lib/utils";

export interface TreeExpansionCommand {
  mode: "expand" | "collapse";
  id: number;
}

interface FileTreeProps {
  expansion?: TreeExpansionCommand | null;
  files: FileNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  isLoading?: boolean;
  changedPaths?: ReadonlySet<string>;
}

interface FileTreeItemProps {
  expansion?: TreeExpansionCommand | null;
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  changedPaths?: ReadonlySet<string>;
}

function FileTreeItem({ node, depth, selectedPath, onSelectFile, changedPaths, expansion }: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(() => (expansion ? expansion.mode === "expand" : depth < 2));

  useEffect(() => {
    if (expansion) setIsExpanded(expansion.mode === "expand");
  }, [expansion]);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [overflowBox, setOverflowBox] = useState<{ top: number; left: number; height: number } | null>(null);

  const showFullNameIfClipped = () => {
    const label = labelRef.current;
    if (!label) return;
    if (label.scrollWidth <= label.clientWidth) return;
    const box = label.getBoundingClientRect();
    setOverflowBox({ top: box.top, left: box.left, height: box.height });
  };

  const isDirectory = node.type === "directory";
  const isSelected = selectedPath === node.path;
  const hasChanges = !isDirectory && !!changedPaths?.has(node.path);
  const Icon = isDirectory ? (isExpanded ? FolderOpen : Folder) : getFileIcon(node.name);
  const iconColor = isDirectory ? "text-amber-400/90" : getFileColor(node.name);

  return (
    <div>
      <button
        type="button"
        data-glide
        title={node.path}
        aria-expanded={isDirectory ? isExpanded : undefined}
        onClick={() => (isDirectory ? setIsExpanded(!isExpanded) : onSelectFile(node.path))}
        onMouseEnter={showFullNameIfClipped}
        onMouseLeave={() => setOverflowBox(null)}
        onFocus={showFullNameIfClipped}
        onBlur={() => setOverflowBox(null)}
        className={cn(
          "relative flex h-7 w-full items-center gap-1.5 rounded-xl pr-2 text-left text-[13px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
          isSelected ? "row-active font-medium" : "text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {isDirectory ? (
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", isExpanded && "rotate-90")}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
        <span ref={labelRef} className="truncate">{node.name}</span>
        {hasChanges && (
          <span aria-label="Changed in this chat" className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        )}
      </button>

      {overflowBox && createPortal(
        <span
          aria-hidden="true"
          style={{ top: overflowBox.top, left: overflowBox.left, height: overflowBox.height }}
          className={cn(
            "pointer-events-none fixed z-[1000] -ml-1 flex items-center whitespace-nowrap rounded-md border py-0 pl-1 pr-2.5 text-[13px] shadow-lg shadow-black/50",
            isSelected
              ? "border-primary/30 bg-[hsl(30_11%_17%)] font-medium text-white"
              : "border-white/[0.12] bg-[hsl(var(--ws-card-head))] text-foreground"
          )}
        >
          {node.name}
        </span>,
        document.body
      )}

      {isDirectory && isExpanded && node.children?.map((child) => (
        <FileTreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          changedPaths={changedPaths}
          expansion={expansion}
        />
      ))}
    </div>
  );
}

export function FileTree({ files, selectedPath, onSelectFile, isLoading, changedPaths, expansion }: FileTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null);
  const glideRef = useGlideHighlight(treeRef);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="app-skeleton h-4 w-4 rounded" />
            <div className="app-skeleton h-3.5 rounded" style={{ width: `${40 + i * 9}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return <div className="p-4 text-center text-xs leading-relaxed text-muted-foreground">No files yet. Ask for something in the chat and they will appear here.</div>;
  }

  return (
    <div ref={treeRef} className="relative p-1.5">
      <span ref={glideRef} aria-hidden="true" className="glide-pill" />
      {files.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          changedPaths={changedPaths}
          expansion={expansion}
        />
      ))}
    </div>
  );
}
