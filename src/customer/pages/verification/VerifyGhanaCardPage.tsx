import { useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { IdCard, ShieldAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { submitGhanaCardVerification } from "@/lib/db";

export function VerifyGhanaCardPage() {
  const navigate = useNavigate();
  const [ghanaCardNumber, setGhanaCardNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setMessage("");

    if (ghanaCardNumber.trim().length < 8) {
      setError("Enter a valid Ghana Card number.");
      return;
    }

    setIsSaving(true);
    const { data, error } = await submitGhanaCardVerification(ghanaCardNumber);
    setIsSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (isFunctionError(data)) {
      setError(data.error);
      return;
    }

    setMessage(resultMessage(data, "Ghana Card submitted for review. Taking you to face verification."));
    setTimeout(() => navigate({ to: "/verify/selfie" }), 600);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Ghana Card" subtitle="Step 3 of 5" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <IdCard className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Verify your Ghana Card</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your card number is sent only to a secure Edge Function and stored as a hash.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Ghana Card number</label>
          <input
            value={ghanaCardNumber}
            onChange={(event) => setGhanaCardNumber(event.target.value)}
            placeholder="GHA-XXXXXXXXX-X"
            className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 font-mono text-sm tracking-wider outline-none"
          />
        </div>

        <div className="rounded-2xl bg-secondary p-4">
          <p className="text-xs font-semibold text-primary">Secure processing</p>
          <ul className="mt-2 space-y-1 text-[11px] text-primary/80">
            <li>- API credentials stay in Supabase Edge Function secrets.</li>
            <li>- The app stores only a hash, status, timestamp, and provider reference.</li>
            <li>- Raw Ghana Card images are not collected in this placeholder flow.</li>
          </ul>
        </div>

        {message && <p className="rounded-2xl bg-secondary p-4 text-[11px] font-medium text-primary">{message}</p>}
        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{error}</p>
          </div>
        )}

        <button disabled={isSaving} onClick={handleSubmit} className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50">
          {isSaving ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting</span> : "Submit to secure backend"}
        </button>
        <button onClick={() => navigate({ to: "/verify/selfie" })} className="rounded-2xl border border-border py-4 font-display text-base font-semibold text-primary">
          Continue to face match
        </button>
        <button onClick={() => navigate({ to: "/verify/status" })} className="rounded-2xl border border-border py-4 font-display text-base font-semibold text-muted-foreground">
          View status
        </button>
      </div>
    </div>
  );
}

function resultMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const response = data as { message?: string; status?: string; providerReference?: string };
  return [response.message ?? fallback, response.status ? `Status: ${response.status}` : "", response.providerReference ? `Reference: ${response.providerReference}` : ""].filter(Boolean).join(" ");
}

function isFunctionError(data: unknown): data is { ok: false; error: string } {
  return Boolean(data && typeof data === "object" && (data as { ok?: unknown }).ok === false && typeof (data as { error?: unknown }).error === "string");
}
