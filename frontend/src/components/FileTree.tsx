import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { FileNode } from "@/lib/types";
import { getFileColor, getFileIcon } from "@/lib/file-icons";
import { cn } from "@/lib/utils";

/**
 * "Expand all" / "Collapse all" from the Files header. A fresh `id` each click, so pressing the same one twice (after
 * opening a few folders by hand in between) applies it again.
 */
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
  /** Files with changes from the present chat that haven't been opened yet - marked with a dot. */
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
  // A folder that only mounts after "Expand all" (its parent just opened because of it) starts open too.
  const [isExpanded, setIsExpanded] = useState(() => (expansion ? expansion.mode === "expand" : depth < 2));

  // Each folder owns its open state so clicking one never re-renders the rest; the header's command just sets it.
  useEffect(() => {
    if (expansion) setIsExpanded(expansion.mode === "expand");
  }, [expansion]);
  const labelRef = useRef<HTMLSpanElement>(null);
  // Where to draw the full name when this row's is cut off; null while it fits or isn't hovered.
  const [overflowBox, setOverflowBox] = useState<{ top: number; left: number; height: number } | null>(null);

  const showFullNameIfClipped = () => {
    const label = labelRef.current;
    if (!label) return;
    // Only when the name is genuinely cut off - a tooltip over a fully readable name is just noise.
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
        title={node.path}
        aria-expanded={isDirectory ? isExpanded : undefined}
        onClick={() => (isDirectory ? setIsExpanded(!isExpanded) : onSelectFile(node.path))}
        onMouseEnter={showFullNameIfClipped}
        onMouseLeave={() => setOverflowBox(null)}
        onFocus={showFullNameIfClipped}
        onBlur={() => setOverflowBox(null)}
        className={cn(
          "flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
          // Hover only tints the text; selection gets the filled orange row, so the two never look alike.
          isSelected
            ? "bg-primary/20 font-medium text-primary ring-1 ring-inset ring-primary/45"
            : "text-muted-foreground hover:bg-muted/50 hover:text-primary"
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {isDirectory ? (
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150", isExpanded && "rotate-90")}
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

      {/*
        The name continued past the panel edge, the way an IDE does it: a portal, because the tree scrolls
        and would otherwise clip anything drawn outside it. Pointer-events off so it can't swallow the click
        that the row underneath is still expecting.
      */}
      {overflowBox && createPortal(
        <span
          aria-hidden="true"
          style={{ top: overflowBox.top, left: overflowBox.left, height: overflowBox.height }}
          className={cn(
            // Above everything the name can extend over - the editor's line-number gutter sits at z-index 200, which
            // hid this at z-50 even though it rendered. The full border and slight left bleed make it read as the row
            // itself grown past the column edge, the way IntelliJ draws it.
            "pointer-events-none fixed z-[1000] -ml-1 flex items-center whitespace-nowrap rounded-md border py-0 pl-1 pr-2.5 text-[13px] shadow-lg shadow-black/50",
            // Matches the row it continues: orange like the hover state, or the selected row's own styling.
            isSelected
              ? "border-primary/45 bg-[hsl(var(--panel))] font-medium text-primary"
              : "border-border/60 bg-[hsl(var(--panel))] text-primary"
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
  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex animate-pulse items-center gap-2">
            <div className="h-4 w-4 rounded bg-muted" />
            <div className="h-3.5 rounded bg-muted" style={{ width: `${40 + i * 9}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return <div className="p-4 text-center text-xs text-muted-foreground">No files yet</div>;
  }

  return (
    <div className="p-1.5">
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
