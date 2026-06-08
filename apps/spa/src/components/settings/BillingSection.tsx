import { useEffect } from 'react';
import { useBillingStore } from '@/stores/billingStore';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import type { BillingSummary } from '@/api/billing';

const PLAN_LABELS: Record<BillingSummary['plan'], string> = {
  FREE: 'Free',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

const primaryBtn = cn(
  'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue',
  'transition-colors hover:bg-accent-teal-hover disabled:cursor-not-allowed disabled:opacity-60',
);

const secondaryBtn = cn(
  'inline-flex items-center gap-2 rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm font-semibold text-text-primary',
  'transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60',
);

function Meter({
  label,
  used,
  total,
}: {
  label: string;
  used: number;
  total: number | null;
}): JSX.Element {
  const pct = total && total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
        <span>{label}</span>
        <span className="text-text-primary">
          {used.toLocaleString()}
          {total === null ? '' : ` / ${total.toLocaleString()}`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-feedback-error' : 'bg-accent-teal')}
          style={{ width: `${total === null ? 6 : pct}%` }}
        />
      </div>
    </div>
  );
}

export function BillingSection(): JSX.Element {
  const { summary, status, error, redirecting, load, checkout, portal } = useBillingStore();

  useEffect(() => {
    void load();
  }, [load]);

  if (status === 'loading' || status === 'idle') {
    return <p className="text-sm text-text-secondary">Loading plan…</p>;
  }
  if (status === 'error' || !summary) {
    return <p className="text-sm text-error">{error ?? 'Could not load billing.'}</p>;
  }

  const isPastDue = summary.status === 'PAST_DUE' || summary.status === 'UNPAID';

  return (
    <div className="space-y-4">
      {isPastDue && (
        <p
          role="alert"
          className="rounded-md border border-feedback-error/40 bg-feedback-error/10 px-3 py-2 text-sm text-feedback-error"
        >
          Payment is past due — update your payment method to keep this workspace active.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">Current plan</p>
          <p className="text-lg font-semibold text-text-primary">{PLAN_LABELS[summary.plan]}</p>
        </div>
        {summary.cancelAtPeriodEnd && summary.currentPeriodEnd && (
          <span className="text-xs text-text-secondary">
            Cancels {new Date(summary.currentPeriodEnd).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <Meter label="Members (seats)" used={summary.seats.used} total={summary.seats.max} />
        <Meter
          label="Runs this period"
          used={summary.runs.used}
          total={summary.runs.hardCap ?? summary.runs.included}
        />
      </div>

      {!summary.configured ? (
        <p className="text-xs text-text-muted">Billing is not enabled on this server.</p>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          {summary.plan === 'FREE' ? (
            <button
              type="button"
              className={primaryBtn}
              disabled={redirecting}
              onClick={() => void checkout('PRO')}
            >
              {redirecting && <Spinner size="sm" label="Redirecting" />}
              <span>Upgrade to Pro</span>
            </button>
          ) : (
            <button
              type="button"
              className={secondaryBtn}
              disabled={redirecting}
              onClick={() => void portal()}
            >
              {redirecting && <Spinner size="sm" label="Redirecting" />}
              <span>Manage billing</span>
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
