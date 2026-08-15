import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon, RefreshCcw } from "lucide-react";

interface GuardProps {
  children: ReactNode;
}

interface GuardState {
  crashed: boolean;
  reason: string | null;
}

const OUTER = "flex h-screen w-screen items-center justify-center bg-aurora-bg p-8";
const PANEL =
  "w-full max-w-md rounded-[28px] border border-aurora-line bg-white/80 p-8 text-center shadow-2xl backdrop-blur dark:bg-aurora-surface/90";

export class ErrorBoundary extends Component<GuardProps, GuardState> {
  state: GuardState = { crashed: false, reason: null };

  static getDerivedStateFromError(caught: unknown): GuardState {
    return { crashed: true, reason: caught instanceof Error ? caught.message : "Unknown failure" };
  }

  componentDidCatch(thrown: Error, trace: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught render failure:", thrown, trace);
  }

  private retry = (): void => {
    window.location.reload();
  };

  private renderFailure(): ReactNode {
    return (
      <div className={OUTER}>
        <div className={PANEL}>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-aurora-rose/10">
            <AlertOctagon className="h-8 w-8 text-aurora-rose" />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-aurora-ink">Something broke</h1>
          <p className="mb-6 text-sm text-aurora-muted">
            The screen could not be rendered. A quick reload usually fixes it.
          </p>

          {this.state.reason && (
            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-xs text-aurora-muted transition-colors hover:text-aurora-ink">
                Error details
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded-xl bg-aurora-line/30 p-3 text-left text-xs text-rose-500">
                {this.state.reason}
              </pre>
            </details>
          )}

          <button
            onClick={this.retry}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora-violet to-aurora-lavender px-6 py-3 font-medium text-white shadow-lavender transition-colors hover:brightness-105"
          >
            <RefreshCcw className="h-4 w-4" />
            Reload app
          </button>
        </div>
      </div>
    );
  }

  render(): ReactNode {
    return this.state.crashed ? this.renderFailure() : this.props.children;
  }
}
