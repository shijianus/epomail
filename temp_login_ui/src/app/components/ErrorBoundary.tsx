import React, { Component, ErrorInfo, ReactNode } from "react";
import { createT, resolveAuthLang } from "../i18n/authLocale";

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in EpoMail Auth UI:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/login/");
        window.location.reload();
      }
    }
  };

  public render() {
    const t = createT(resolveAuthLang());
    if (this.state.hasError) {
      return (
        <div className="relative z-50 flex min-h-screen items-center justify-center p-6 bg-[#05060F] text-white">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900/90 p-8 backdrop-blur-xl shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 border border-red-500/30">
              <span className="text-2xl text-red-400">⚠️</span>
            </div>
            <h2 className="text-base font-bold tracking-wider text-red-400 font-mono uppercase">
              {t('crashTitle')}
            </h2>
            <p className="mt-3 text-xs text-slate-400 leading-relaxed font-mono">
              {this.state.error?.message || t('crashFallback')}
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-all shadow-lg cursor-pointer"
              >
                {t('crashReset')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
