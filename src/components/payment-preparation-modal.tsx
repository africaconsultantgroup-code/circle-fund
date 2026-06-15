import { CheckCircle2, X } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";
import type { PaymentTransaction } from "@/lib/db";

const placeholderMessage = "Hubtel payment is being prepared. Real payment will be enabled once API credentials are added.";

export function PaymentPreparationModal({
  open,
  transaction,
  title = "Payment prepared",
  details,
  onClose,
}: {
  open: boolean;
  transaction: PaymentTransaction | null;
  title?: string;
  details?: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 pb-4 sm:items-center sm:pb-0">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-elevated">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
            aria-label="Close payment preparation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-4 font-display text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{placeholderMessage}</p>

        {transaction && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <PaymentMetric label="Amount" value={formatCurrency(Number(transaction.amount), (transaction.currency || "GHS") as CurrencyCode)} />
            <PaymentMetric label="Status" value={transaction.status} />
            <PaymentMetric label="Type" value={formatPaymentType(transaction.payment_type)} />
            <PaymentMetric label="Provider" value={transaction.provider} />
            <div className="col-span-2 rounded-2xl bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reference</p>
              <p className="mt-0.5 truncate font-mono text-xs font-semibold">{transaction.provider_reference ?? "pending"}</p>
            </div>
          </div>
        )}

        {details && <div className="mt-4">{details}</div>}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function PaymentMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold capitalize">{value}</p>
    </div>
  );
}

function formatPaymentType(value: string) {
  return value.replace(/_/g, " ");
}
