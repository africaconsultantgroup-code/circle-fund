import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { loadCustomerPayouts, type FundRelease, type PayoutPreview } from "@/lib/payout-releases";
import { formatCurrency } from "@/lib/diaspora";

export function PayoutStatusCard({ circleId, piggyId }: { circleId?: string; piggyId?: string }) {
  const [previews, setPreviews] = useState<PayoutPreview[]>([]);
  const [releases, setReleases] = useState<FundRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCustomerPayouts({ circleId, piggyId }).then((result) => {
      setPreviews(result.previews);
      setReleases(result.releases);
      setError(result.error ?? "");
      setLoading(false);
    });
  }, [circleId, piggyId]);

  const latestRelease = releases[0];
  const preview = previews[0];
  const status = latestRelease ? releaseLabel(latestRelease.status) : previewLabel(preview);
  const amount = latestRelease?.amount ?? preview?.amount ?? 0;
  const currency = latestRelease?.currency ?? preview?.currency ?? "GHS";

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="font-display text-sm font-semibold">Payout status</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Funds stay protected until a payment provider confirms completion.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking payout status
        </p>
      ) : error ? (
        <p className="mt-4 flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5" /> {error}
        </p>
      ) : preview || latestRelease ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Tile label="Amount" value={formatCurrency(Number(amount), currency)} />
          <Tile label="Status" value={status} />
          <Tile
            label="Maturity"
            value={
              preview?.maturity_date ? formatDate(preview.maturity_date) : "Recorded on release"
            }
          />
          <Tile
            label="Destination"
            value={
              preview?.payment_destination_summary ??
              latestRelease?.payment_destination_type ??
              "Not verified"
            }
          />
          {latestRelease?.provider_reference && (
            <div className="col-span-2 rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Receipt/reference
              </p>
              <p className="mt-0.5 text-xs font-semibold">{latestRelease.provider_reference}</p>
            </div>
          )}
          {preview?.blocking_reason && (
            <p className="col-span-2 mt-1 text-[11px] text-muted-foreground">
              {preview.blocking_reason}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No protected payout candidate exists yet.
        </p>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold">{value}</p>
    </div>
  );
}

function previewLabel(preview?: PayoutPreview) {
  if (!preview) return "Upcoming";
  if (preview.eligibility === "READY") return "Ready for release";
  if (preview.eligibility === "BLOCKED_NOT_MATURED") return "Locked";
  return "Protected — under review";
}

function releaseLabel(status: string) {
  if (status === "released") return "Paid";
  if (status === "provider_processing") return "Processing";
  if (["provider_failed", "provider_status_unknown", "retry_pending"].includes(status)) {
    return "Protected — payout delayed";
  }
  return "Ready for review";
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" });
}
