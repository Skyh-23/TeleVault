import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon, RefreshCcw } from "lucide-react";

interface GuardProps {
  children: ReactNode;
}

interface GuardState {
  crashed: boolean;
  reason: string | null;
}

const OUTER = "h-screen w-screen flex items-center justify-center bg-telegram-bg p-8";
const PANEL = "max-w-md w-full bg-telegram-surface border border-telegram-border rounded-2xl p-8 text-center shadow-2xl";

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
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <AlertOctagon className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-telegram-text">Something broke</h1>
          <p className="mb-6 text-sm text-telegram-subtext">
            The screen could not be rendered. A quick reload usually fixes it.
          </p>

          {this.state.reason && (
            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-xs text-telegram-subtext transition-colors hover:text-telegram-text">
                Error details
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-telegram-hover p-3 text-left text-xs text-red-400">
                {this.state.reason}
              </pre>
            </details>
          )}

          <button
            onClick={this.retry}
            className="inline-flex items-center gap-2 rounded-lg bg-telegram-primary px-6 py-3 font-medium text-black transition-colors hover:bg-telegram-primary/90"
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
