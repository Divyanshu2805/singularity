/**
 * Panels a person can resize by dragging the divider between them.
 *
 * Handles: the panel group, each panel, the drag handle, and the gutter - a handle that is a narrow gap between two
 * rounded windows rather than a line, showing a gold line down its middle only while hovered or dragged. Used for
 * the splits on a project's page, where every pane is its own window (index.css, .ws-window).
 */
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

const ResizableGutter = ({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle>) => (
  <ResizableHandle
    className={cn(
      "w-2 bg-transparent after:inset-y-[22%] after:w-0.5 after:rounded-full after:bg-[hsl(42.4_100%_78%)] after:opacity-0 after:transition-opacity after:duration-300 hover:after:opacity-70 data-[resize-handle-state=drag]:after:opacity-80 focus-visible:ring-0 focus-visible:after:opacity-70",
      className,
    )}
    {...props}
  />
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, ResizableGutter };
