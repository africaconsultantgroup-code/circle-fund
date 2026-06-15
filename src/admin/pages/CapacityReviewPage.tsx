import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { getAdminOverview, manageCapacityReview, type AdminCapacityReview } from "@/admin/api";
import { formatCurrency } from "@/lib/diaspora";

export function CapacityReviewPage() {
  const [reviews, setReviews] = useState<AdminCapacityReview[]>([]);
  const [busyId, setBusyId] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadReviews = async () => {
    setIsLoading(true);
    const { data, error } = await getAdminOverview();
    setReviews(data?.capacityReviews ?? []);
    setError(error?.message ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    void loadReviews();
  }, []);

  const handleReview = async (reviewId: string, action: "approve" | "reject") => {
    setBusyId(reviewId);
    setError("");
    setMessage("");

    const { error } = await manageCapacityReview(reviewId, action, notes);
    setBusyId("");

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(`Capacity review ${action === "approve" ? "approved" : "rejected"}.`);
    setNotes("");
    await loadReviews();
  };

  return (
    <section>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Compliance</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Capacity Review</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review users requesting to join more than 3 active susu groups. Circle admins cannot approve these requests until SikaCircle approves capacity.
        </p>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card">
        <label className="text-xs font-medium text-muted-foreground">Review notes</label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Record income/employment notes, reason for joining, or risk observations."
          className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3 text-sm outline-none"
        />
      </div>

      {message && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-4 text-success">
          <CheckCircle2 className="h-4 w-4" />
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading capacity reviews
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-sm font-semibold">{review.userName || review.userEmail || review.user_id}</p>
                    <StatusPill value={review.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{review.circleName || review.circle_id}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Metric label="Active circles" value={String(review.active_circle_count)} />
                    <Metric label="Obligation" value={formatCurrency(Number(review.estimated_periodic_obligation ?? 0), "GHS")} />
                    <Metric label="Missed/late" value={String(review.missed_late_contribution_count ?? 0)} />
                    <Metric label="Trust score" value={review.trust_score ? String(review.trust_score) : "Not set"} />
                    <Metric label="Verification" value={review.verification_status ?? "not_started"} />
                    <Metric label="Requested" value={formatDate(review.created_at)} />
                  </div>
                  {review.review_notes && <p className="mt-3 text-xs text-muted-foreground">Notes: {review.review_notes}</p>}
                </div>

                {review.status === "pending" && (
                  <div className="grid min-w-48 grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busyId === review.id}
                      onClick={() => handleReview(review.id, "approve")}
                      className="flex items-center justify-center gap-1 rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success disabled:opacity-60"
                    >
                      {busyId === review.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === review.id}
                      onClick={() => handleReview(review.id, "reject")}
                      className="flex items-center justify-center gap-1 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-60"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
          {reviews.length === 0 && (
            <li className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
              No extra-circle capacity reviews yet.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold capitalize">{value.replace("_", " ")}</p>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const good = value === "approved";
  const bad = value === "rejected";
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${good ? "bg-success/15 text-success" : bad ? "bg-destructive/10 text-destructive" : "bg-gold/15 text-[color:var(--gold-foreground)]"}`}>
      {value.replace("_", " ")}
    </span>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
