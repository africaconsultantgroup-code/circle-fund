import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { IdCard, Upload, Camera, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/verify/ghana-card")({
  component: GhanaCardVerify,
});

function GhanaCardVerify() {
  const navigate = useNavigate();
  const [front, setFront] = useState(false);
  const [back, setBack] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Ghana Card" subtitle="Step 2 of 5" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <IdCard className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Verify your Ghana Card</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enter your card number and upload clear photos of both sides.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Ghana Card number</label>
          <input defaultValue="GHA-723456789-4" className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 font-mono text-sm tracking-wider outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <UploadCard label="Front" done={front} onClick={() => setFront(true)} />
          <UploadCard label="Back" done={back} onClick={() => setBack(true)} />
        </div>

        <div className="rounded-2xl bg-secondary p-4">
          <p className="text-xs font-semibold text-primary">Tips for a good photo</p>
          <ul className="mt-2 space-y-1 text-[11px] text-primary/80">
            <li>• Place card on a flat, dark surface</li>
            <li>• Make sure all 4 corners are visible</li>
            <li>• Avoid glare on the holographic strip</li>
          </ul>
        </div>

        <button onClick={() => navigate({ to: "/verify/selfie" })} className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card">
          Submit for review
        </button>
      </div>
    </div>
  );
}

function UploadCard({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3 ${
        done ? "border-success bg-success/5" : "border-border bg-muted/40"
      }`}
    >
      {done ? <CheckCircle2 className="h-7 w-7 text-success" /> : <Upload className="h-7 w-7 text-muted-foreground" />}
      <p className="font-display text-sm font-semibold">{label}</p>
      <p className="text-[10px] text-muted-foreground">{done ? "Uploaded" : "Tap to upload"}</p>
    </button>
  );
}