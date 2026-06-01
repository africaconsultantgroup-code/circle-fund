import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Phone, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/verify/phone")({
  component: PhoneVerify,
});

function PhoneVerify() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"enter" | "otp">("enter");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Phone verification" subtitle="Step 1 of 5" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        {step === "enter" ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">Enter your phone number</h2>
              <p className="mt-1 text-sm text-muted-foreground">We'll send a 6-digit code to confirm it's you.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3.5">
              <span className="rounded-lg bg-card px-2 py-1 text-sm font-semibold">🇬🇭 +233</span>
              <input defaultValue="24 555 0142" className="flex-1 bg-transparent text-sm outline-none" />
            </div>
            <button onClick={() => setStep("otp")} className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card">
              Send OTP
            </button>
          </>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">Enter the 6-digit code</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sent to +233 24 555 0142. <button className="font-medium text-primary">Resend</button></p>
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
            <button onClick={() => navigate({ to: "/verify/ghana-card" })} className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card">
              Verify & Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}