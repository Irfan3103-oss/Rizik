import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
  isPermissionError: boolean;
}

function ErrorFallbackCard({
  errorMessage,
  isPermissionError,
  onReset,
}: {
  errorMessage: string | null;
  isPermissionError: boolean;
  onReset: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-300 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-lg font-extrabold text-[var(--text-primary)]">
            {t('errors.somethingWrong')}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {isPermissionError
              ? t('errors.permissionMessage')
              : t('errors.genericMessage')}
          </p>
        </div>
        {errorMessage && (
          <p className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-subtle)] rounded-xl px-3 py-2 break-words text-left max-h-28 overflow-y-auto">
            {errorMessage}
          </p>
        )}
        <button
          type="button"
          onClick={onReset}
          className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          <span>{t('errors.reloadBtn')}</span>
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
    isPermissionError: false,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = error.message;
    let isPermissionError = false;

    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        displayMessage = `${parsed.operationType ?? 'operation'} (${parsed.path ?? 'unknown'}): ${parsed.error}`;
        if (parsed.error.toLowerCase().includes('permission')) {
          isPermissionError = true;
        }
      }
    } catch {
      if (error.message.toLowerCase().includes('permission')) {
        isPermissionError = true;
      }
    }

    return {
      hasError: true,
      errorMessage: displayMessage,
      isPermissionError,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: null, isPermissionError: false });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallbackCard
          errorMessage={this.state.errorMessage}
          isPermissionError={this.state.isPermissionError}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}
