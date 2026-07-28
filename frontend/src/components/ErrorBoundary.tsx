import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * The last line of defence: catches a render error anywhere below it and shows something instead of a blank page.
 *
 * Handles: rendering a short apology with a reload button, and logging the error and component stack to the
 * console where it can be read. Reloading is offered rather than a reset in place because a component that threw
 * while rendering has left unknown state behind, and a full load is the one recovery that is always correct.
 *
 * A React error boundary must be a class component - there is no hook equivalent for catching render errors.
 */
interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error while rendering:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
        <p className="max-w-md text-muted-foreground">
          This page stopped working. Reloading usually fixes it - your projects and chats are saved on the server,
          so nothing here is lost.
        </p>
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    );
  }
}
