import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ScanFace, Camera, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/verify/selfie")({
  component: SelfieVerify,
});

function SelfieVerify() {
  const navigate = useNavigate();
  const [captured, setCaptured] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Selfie match" subtitle="Step 3 of 5" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <ScanFace className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Take a quick selfie</h2>
          <p className="mt-1 text-sm text-muted-foreground">We'll match your face to the photo on your Ghana Card. Look straight at the camera.</p>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-xs">
          <div className={`absolute inset-0 rounded-full border-4 border-dashed ${captured ? "border-success" : "border-primary/40"}`} />
          <div className="absolute inset-4 overflow-hidden rounded-full bg-gradient-card">
            <div className="flex h-full items-center justify-center text-primary-foreground/40">
              {captured ? <CheckCircle2 className="h-16 w-16 text-success" /> : <ScanFace className="h-20 w-20" />}
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          {captured ? "Face captured. Identity match successful." : "Center your face inside the circle"}
        </p>

        <div className="mt-auto flex flex-col gap-3">
          <button
            onClick={() => setCaptured(true)}
            className="flex items-center justify-center gap-2 rounded-2xl border border-primary py-4 font-display text-base font-semibold text-primary"
          >
            <Camera className="h-5 w-5" /> {captured ? "Retake" : "Capture selfie"}
          </button>
          <button
            disabled={!captured}
            onClick={() => navigate({ to: "/verify/momo" })}
            className="rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}