import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Phone, MessageSquare, Loader2, ShieldAlert } from "lucide-react";
import { requestPhoneOtp, verifyPhoneOtp } from "@/lib/db";
import { loadVerificationFlowSummary } from "@/lib/verification-flow";

export function VerifyPhonePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"enter" | "otp">("enter");
  const [phoneNumber, setPhoneNumber] = useState("0245550142");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpReference, setOtpReference] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleRequestOtp = async () => {
    setError("");
    setMessage("");

    if (phoneNumber.trim().length < 8) {
      setError("Enter a valid phone number.");
      return;
    }

    setIsSaving(true);
    const { data, error } = await requestPhoneOtp(phoneNumber);
    setIsSaving(false);

    if (error) {
      setError(await describeFunctionError(error));
      return;
    }

    const response = data as { providerReference?: string } | null;
    setOtpReference(response?.providerReference ?? null);
    setMessage(resultMessage(data, "Hubtel OTP sent. Enter the code to verify your phone."));
    setStep("otp");
  };

  const handleVerifyOtp = async () => {
    setError("");
    setMessage("");

    if (otp.join("").trim().length < 4) {
      setError("Enter the OTP you received.");
      return;
    }

    setIsSaving(true);
    const { data, error } = await verifyPhoneOtp(phoneNumber, otp.join(""), otpReference);
    setIsSaving(false);

    if (error) {
      setError(await describeFunctionError(error));
      return;
    }

    setMessage(resultMessage(data, "Phone verified. Taking you to the next verification step."));
    setTimeout(async () => {
      const summary = await loadVerificationFlowSummary();
      navigate({ to: summary.nextStep.to === "/verify/phone" ? "/verify/profile" : summary.nextStep.to });
    }, 600);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Phone verification" subtitle="Required before using SikaCircle" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        {step === "enter" ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">Enter your phone number</h2>
              <p className="mt-1 text-sm text-muted-foreground">SikaCircle sends your verification code through Hubtel.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3.5">
              <span className="rounded-lg bg-card px-2 py-1 text-sm font-semibold">GH +233</span>
              <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
            </div>
            <button disabled={isSaving} onClick={handleRequestOtp} className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50">
              {isSaving ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Sending</span> : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">Enter your Hubtel OTP</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use the 6-digit code sent to your phone.</p>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {otp.map((v, i) => (
                <input
                  key={i}
                  maxLength={1}
                  value={v}
                  onChange={(e) => {
                    const next = [...otp];
                    next[i] = e.target.value.slice(-1);
                    setOtp(next);
                  }}
                  className="h-14 rounded-2xl border border-input bg-muted/40 text-center font-display text-xl font-bold outline-none focus:border-primary"
                />
              ))}
            </div>
            <button disabled={isSaving} onClick={handleVerifyOtp} className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50">
              {isSaving ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting</span> : "Verify OTP"}
            </button>
            <button onClick={() => navigate({ to: "/verify/ghana-card" })} className="rounded-2xl border border-border py-4 font-display text-base font-semibold text-primary">
              Continue to Ghana Card
            </button>
            <button onClick={() => navigate({ to: "/verify/status" })} className="rounded-2xl border border-border py-4 font-display text-base font-semibold text-muted-foreground">
              View status
            </button>
          </>
        )}

        {message && <p className="rounded-2xl bg-secondary p-4 text-[11px] font-medium text-primary">{message}</p>}
        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function resultMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const response = data as { message?: string; status?: string; providerReference?: string };
  return [response.message ?? fallback, response.status ? `Status: ${response.status}` : "", response.providerReference ? `Reference: ${response.providerReference}` : ""].filter(Boolean).join(" ");
}

async function describeFunctionError(error: unknown) {
  const errorLike = error as { message?: string; context?: unknown };

  if (errorLike.context instanceof Response) {
    try {
      const body = await errorLike.context.clone().json() as { error?: unknown; message?: unknown; reason?: unknown; code?: unknown };
      if (typeof body.error === "string") return body.error;
      if (typeof body.message === "string") return body.message;
      if (typeof body.reason === "string") return body.reason;
      if (typeof body.code === "string") return body.code;
    } catch {
      return errorLike.message ?? "Phone verification failed.";
    }
  }

  return errorLike.message ?? "Phone verification failed.";
}
