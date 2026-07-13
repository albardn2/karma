import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * App-wide error boundary: a render crash anywhere used to unmount the whole
 * React tree, leaving a blank white page. Show a recovery card instead.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
          <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-6 text-center space-y-4 shadow-sm">
            <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
            <p className="text-sm text-gray-500 break-words" data-testid="text-render-error">
              {this.state.error.message}
            </p>
            <div className="flex justify-center gap-3">
              <button
                className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50"
                onClick={() => {
                  this.setState({ error: null });
                  window.history.back();
                }}
                data-testid="button-error-back"
              >
                Go back
              </button>
              <button
                className="px-4 py-2 text-sm font-medium rounded-md bg-[#5469D4] text-white hover:bg-[#4356C7]"
                onClick={() => window.location.reload()}
                data-testid="button-error-reload"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
