/**
 * Renders whatever is currently in the toast queue.
 *
 * Handles: subscribing to the queue and drawing each toast like a system notification: the app's mark and name with the close button on top, the title and message, and, if it has actions, their buttons side by side below. Every toast stays
 * three seconds; the draining line in index.css (.app-toast) runs for the same three.
 */
import { TOAST_DURATION_MS, useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={TOAST_DURATION_MS}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="" aria-hidden="true" className="h-4 w-4 rounded-[4px]" />
              <span className="text-[11px] font-medium tracking-wide text-foreground/55">Singularity</span>
              <ToastClose className="-mr-1 ml-auto" />
            </div>
            <div className="mt-2.5 grid gap-0.5">
              {title && <ToastTitle className="text-[15px]">{title}</ToastTitle>}
              {description && <ToastDescription className="text-[13px] leading-snug opacity-70">{description}</ToastDescription>}
            </div>
            {action && (
              <div className="mt-3.5 grid grid-flow-col auto-cols-fr gap-2">{action}</div>
            )}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
