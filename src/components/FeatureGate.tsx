import type { ReactNode } from 'react';
import { AlertCircle, Key, Loader2, Sparkles } from 'lucide-react';
import { useAiReadiness } from '@/hooks/useAiReadiness';
import { useUiStore } from '@/store/ui.store';

export function FeatureGate({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  const readiness = useAiReadiness();
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  if (readiness.state === 'ready') {
    return <>{children}</>;
  }

  const icon =
    readiness.state === 'no-key' ? (
      <Key className="h-7 w-7 text-accent-muted" />
    ) : readiness.state === 'building-index' || readiness.state === 'loading-transcript' ? (
      <Loader2 className="h-7 w-7 animate-spin text-accent-muted" />
    ) : readiness.state === 'index-error' ? (
      <AlertCircle className="h-7 w-7 text-red-300" />
    ) : (
      <Sparkles className="h-7 w-7 text-accent-muted" />
    );

  return (
    <div
      className={
        compact
          ? 'mx-3 my-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3'
          : 'flex h-full min-h-[240px] items-center justify-center p-6'
      }
    >
      <div className={compact ? 'flex items-start gap-3' : 'max-w-sm text-center'}>
        <div className={compact ? 'shrink-0 pt-0.5' : 'mx-auto mb-3'}>{icon}</div>
        <div className={compact ? 'min-w-0' : ''}>
          <p className="text-sm font-medium text-white">
            {readiness.state === 'no-key'
              ? 'API key required'
              : readiness.state === 'loading-transcript'
                ? 'Loading transcript'
                : readiness.state === 'building-index'
                  ? 'Building AI index'
                  : readiness.state === 'index-error'
                    ? 'Index error'
                    : 'Transcript needed'}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/55">{readiness.message}</p>
          {'stage' in readiness && readiness.stage && (
            <p className="mt-1 text-[11px] text-white/40">{readiness.stage}</p>
          )}
          {readiness.state === 'no-key' && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="mt-3 rounded-xl bg-accent/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/35"
            >
              Open Settings
            </button>
          )}
          {readiness.state === 'no-transcript' && (
            <button
              type="button"
              onClick={() => setActiveTab('transcript')}
              className="mt-3 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
            >
              Go to Transcript
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function RagStatusBanner() {
  const readiness = useAiReadiness();
  if (readiness.state === 'ready') return null;

  return <FeatureGate compact>{null}</FeatureGate>;
}
