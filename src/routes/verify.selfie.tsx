import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ScanFace, Camera, Loader2, ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";
import { submitFaceVerification } from "@/lib/db";

export const Route = createFileRoute("/verify/selfie")({
  component: SelfieVerify,
});

function SelfieVerify() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [captureReference, setCaptureReference] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleCapture = (file?: File) => {
    const reference = file ? `selfie_capture_${crypto.randomUUID()}_${file.lastModified}` : `selfie_capture_${crypto.randomUUID()}`;
    setCaptureReference(reference);
    setMessage("Selfie captured locally. Submit the reference to the secure backend for provider face matching.");
  };

  const handleSubmit = async () => {
    setError("");
    setIsSaving(true);
    const { data, error } = await submitFaceVerification(captureReference);
    setIsSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(resultMessage(data, "Face verification request submitted."));
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Face match" subtitle="Step 3 of 3" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <ScanFace className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Capture selfie reference</h2>
          <p className="mt-1 text-sm text-muted-foreground">The secure backend will handle provider face matching. Raw selfie storage is intentionally avoided here.</p>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-xs">
          <div className={`absolute inset-0 rounded-full border-4 border-dashed ${captureReference ? "border-success" : "border-primary/40"}`} />
          <div className="absolute inset-4 overflow-hidden rounded-full bg-gradient-card">
            <div className="flex h-full items-center justify-center text-primary-foreground/40">
              <ScanFace className="h-20 w-20" />
            </div>
          </div>
        </div>

        <p className="break-all text-center text-[11px] text-muted-foreground">
          {captureReference || "Capture a selfie reference before submitting."}
        </p>

        {message && <p className="rounded-2xl bg-secondary p-4 text-[11px] font-medium text-primary">{message}</p>}
        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{error}</p>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(event) => handleCapture(event.target.files?.[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-2xl border border-primary py-4 font-display text-base font-semibold text-primary"
          >
            <Camera className="h-5 w-5" /> {captureReference ? "Retake" : "Capture selfie"}
          </button>
          <button
            disabled={!captureReference || isSaving}
            onClick={handleSubmit}
            className="rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50"
          >
            {isSaving ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting</span> : "Submit to secure backend"}
          </button>
          <button onClick={() => navigate({ to: "/verify" })} className="rounded-2xl border border-border py-4 font-display text-base font-semibold text-primary">
            Back to verification
          </button>
        </div>
      </div>
    </div>
  );
}

function resultMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const response = data as { message?: string; status?: string; providerReference?: string };
  return [response.message ?? fallback, response.status ? `Status: ${response.status}` : "", response.providerReference ? `Reference: ${response.providerReference}` : ""].filter(Boolean).join(" ");
}
