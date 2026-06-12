import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Phone, MessageSquare, Loader2, ShieldAlert } from "lucide-react";
import { requestPhoneOtp, verifyPhoneOtp } from "@/lib/db";
import { ghanaCardStepStatus, faceStepStatus, loadVerificationFlowSummary, type VerificationFlowSummary } from "@/lib/verification-flow";

export function VerifyPhonePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"enter" | "otp">("enter");
  const [phoneNumber, setPhoneNumber] = useState("0245550142");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpReference, setOtpReference] = useState<string | null>(null);
  const [phoneDebug, setPhoneDebug] = useState<{ rawPhoneNumber: string; normalizedPhoneNumber: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [flowSummary, setFlowSummary] = useState<VerificationFlowSummary | null>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const otpCode = otp.join("");
  const otpComplete = otpCode.length === 6;

  useEffect(() => {
    let isMounted = true;

    loadVerificationFlowSummary().then((summary) => {
      if (!isMounted) return;

      setFlowSummary(summary);
      if (summary.verification?.phone_verified && summary.verification.otp_status === "verified") {
        const nextStep = summary.nextStep.to === "/verify/phone" ? "/verify/ghana-card" : summary.nextStep.to;
        if (nextStep !== "/verify/phone") {
          navigate({ to: nextStep });
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleRequestOtp = async () => {
    setError("");
    setMessage("");
    setPhoneDebug(null);

    if (phoneNumber.trim().length < 8) {
      setError("Enter a valid phone number.");
      return;
    }

    setIsSaving(true);
    const { data, error } = await requestPhoneOtp(phoneNumber);
    setIsSaving(false);

    if (error) {
      const details = await describeFunctionError(error);
      setError(details.message);
      if (details.normalizedPhoneNumber || details.rawPhoneNumber) {
        setPhoneDebug({
          rawPhoneNumber: details.rawPhoneNumber ?? phoneNumber,
          normalizedPhoneNumber: details.normalizedPhoneNumber ?? "",
        });
      }
      return;
    }

    const response = data as { providerReference?: string; rawPhoneNumber?: string; normalizedPhoneNumber?: string } | null;
    setOtpReference(response?.providerReference ?? null);
    setPhoneDebug({
      rawPhoneNumber: response?.rawPhoneNumber ?? phoneNumber,
      normalizedPhoneNumber: response?.normalizedPhoneNumber ?? "",
    });
    setMessage(resultMessage(data, "Hubtel OTP sent. Enter the code to verify your phone."));
    setStep("otp");
    setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
  };

  const handleVerifyOtp = async () => {
    setError("");
    setMessage("");

    if (!otpComplete) {
      setError("Enter the 6-digit OTP you received.");
      return;
    }

    setIsSaving(true);
    const { data, error } = await verifyPhoneOtp(phoneNumber, otpCode, otpReference);
    setIsSaving(false);

    if (error) {
      setError((await describeFunctionError(error)).message);
      return;
    }

    setMessage(resultMessage(data, "Phone verified. Taking you to the next verification step."));
    const summary = await loadVerificationFlowSummary();
    setFlowSummary(summary);
    setTimeout(async () => {
      navigate({ to: "/verify/ghana-card" });
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
                  ref={(element) => {
                    otpInputRefs.current[i] = element;
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={v}
                  onChange={(event) => handleOtpChange(i, event.target.value)}
                  onKeyDown={(event) => handleOtpKeyDown(i, event)}
                  onPaste={(event) => handleOtpPaste(i, event)}
                  className="h-14 rounded-2xl border border-input bg-muted/40 text-center font-display text-xl font-bold outline-none focus:border-primary"
                />
              ))}
            </div>
            <button disabled={isSaving || !otpComplete} onClick={handleVerifyOtp} className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50">
              {isSaving ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting</span> : "Verify OTP"}
            </button>
            <button onClick={() => navigate({ to: "/verify/status" })} className="rounded-2xl border border-border py-4 font-display text-base font-semibold text-muted-foreground">
              View status
            </button>
          </>
        )}

        {message && <p className="rounded-2xl bg-secondary p-4 text-[11px] font-medium text-primary">{message}</p>}
        {phoneDebug && (
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground">OTP debug</p>
            <p className="mt-1">Raw phone entered: <span className="font-mono text-foreground">{phoneDebug.rawPhoneNumber}</span></p>
            <p>Normalized phone sent to Hubtel: <span className="font-mono text-foreground">{phoneDebug.normalizedPhoneNumber}</span></p>
          </div>
        )}
        {flowSummary && <VerificationDebug summary={flowSummary} />}
        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{error}</p>
          </div>
        )}
      </div>
    </div>
  );

  function handleOtpChange(index: number, value: string) {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setOtp((current) => {
        const next = [...current];
        next[index] = "";
        return next;
      });
      return;
    }

    setOtp((current) => {
      const next = [...current];
      digits.slice(0, 6 - index).split("").forEach((digit, offset) => {
        next[index + offset] = digit;
      });
      return next;
    });

    const nextIndex = Math.min(index + digits.length, 5);
    otpInputRefs.current[nextIndex]?.focus();
  }

  function handleOtpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      event.preventDefault();
      setOtp((current) => {
        const next = [...current];
        next[index - 1] = "";
        return next;
      });
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    const startIndex = digits.length === 6 ? 0 : index;

    setOtp((current) => {
      const next = [...current];
      digits.slice(0, 6 - startIndex).split("").forEach((digit, offset) => {
        next[startIndex + offset] = digit;
      });
      return next;
    });

    otpInputRefs.current[Math.min(startIndex + digits.length, 5)]?.focus();
  }
}

function VerificationDebug({ summary }: { summary: VerificationFlowSummary }) {
  const verification = summary.verification;

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 text-[11px] text-muted-foreground">
      <p className="font-semibold text-foreground">Verification debug</p>
      <p className="mt-1">phone_verified: <span className="font-mono text-foreground">{String(Boolean(verification?.phone_verified))}</span></p>
      <p>otp_status: <span className="font-mono text-foreground">{verification?.otp_status ?? "not_started"}</span></p>
      <p>ghana_card_status: <span className="font-mono text-foreground">{ghanaCardStepStatus(verification ?? null)}</span></p>
      <p>selfie_status: <span className="font-mono text-foreground">{faceStepStatus(verification ?? null)}</span></p>
      <p>next_required_step: <span className="font-mono text-foreground">{summary.nextStep.to}</span></p>
    </div>
  );
}

function resultMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const response = data as { message?: string; status?: string; providerReference?: string };
  return [response.message ?? fallback, response.status ? `Status: ${response.status}` : "", response.providerReference ? `Reference: ${response.providerReference}` : ""].filter(Boolean).join(" ");
}

async function describeFunctionError(error: unknown): Promise<{ message: string; rawPhoneNumber?: string; normalizedPhoneNumber?: string }> {
  const errorLike = error as { message?: string; context?: unknown };

  if (errorLike.context instanceof Response) {
    try {
      const body = await errorLike.context.clone().json() as {
        error?: unknown;
        message?: unknown;
        reason?: unknown;
        code?: unknown;
        rawPhoneNumber?: unknown;
        normalizedPhoneNumber?: unknown;
      };
      const message = [body.error, body.message, body.reason, body.code].find((value) => typeof value === "string");
      return {
        message: typeof message === "string" ? message : errorLike.message ?? "Phone verification failed.",
        rawPhoneNumber: typeof body.rawPhoneNumber === "string" ? body.rawPhoneNumber : undefined,
        normalizedPhoneNumber: typeof body.normalizedPhoneNumber === "string" ? body.normalizedPhoneNumber : undefined,
      };
    } catch {
      return { message: errorLike.message ?? "Phone verification failed." };
    }
  }

  return { message: errorLike.message ?? "Phone verification failed." };
}
