import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldAlert, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { getProfileByUserId, upsertProfile } from "@/lib/db";

export function VerifyProfilePage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    getCurrentUser().then(async (user) => {
      if (!user) {
        if (isMounted) {
          setError("Please sign in before completing your profile.");
          setIsLoading(false);
        }
        return;
      }

      const { data } = await getProfileByUserId(user.id);
      if (!isMounted) return;
      setFullName(data?.full_name ?? "");
      setPhone(data?.phone ?? user.phone ?? "");
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async () => {
    setError("");
    setMessage("");

    if (fullName.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }

    if (phone.trim().length < 8) {
      setError("Enter a valid phone number.");
      return;
    }

    setIsSaving(true);
    const user = await getCurrentUser();
    if (!user) {
      setError("Please sign in before completing your profile.");
      setIsSaving(false);
      return;
    }

    const { error } = await upsertProfile({
      user_id: user.id,
      full_name: fullName.trim(),
      phone: phone.trim(),
      profile_completed: true,
      account_status: "active",
      role: "customer",
      updated_at: new Date().toISOString(),
    });
    setIsSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Profile saved. Taking you to phone verification.");
    setTimeout(() => navigate({ to: "/verify/phone" }), 600);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <PageHeader title="Profile completion" subtitle="Step 1 of 5" back="/verify" />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
          <UserRound className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Complete your profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">These details are stored on your profile and used for verification review.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading profile
          </div>
        ) : (
          <>
            <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Ama Mensah" />
            <Field label="Phone number" value={phone} onChange={setPhone} placeholder="0245550142" />
          </>
        )}

        {message && (
          <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-[11px] font-medium">{message}</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-medium">{error}</p>
          </div>
        )}

        <button disabled={isLoading || isSaving} onClick={handleSave} className="mt-auto rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:opacity-50">
          {isSaving ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving</span> : "Save profile"}
        </button>
        <button onClick={() => navigate({ to: "/verify/phone" })} className="rounded-2xl border border-border py-4 font-display text-base font-semibold text-primary">
          Continue to phone
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
