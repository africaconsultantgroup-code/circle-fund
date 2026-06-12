import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Coins, Mail, Lock, User as UserIcon, Phone } from "lucide-react";
import { Field } from "./login";
import { signUpWithEmail } from "@/lib/auth";
import { upsertProfile } from "@/lib/db";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const result = await signUpWithEmail(email, password);
    if (result.error) {
      setLoading(false);
      setError(result.error.message || "Unable to create an account.");
      return;
    }

    if (!result.data.hasSession) {
      setLoading(false);
      setError("Account created, but automatic sign-in is not available yet. Please ask support to disable Supabase email confirmation for Hubtel phone OTP signup.");
      return;
    }

    if (result.data.user) {
      await upsertProfile({
        user_id: result.data.user.id,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        profile_completed: Boolean(fullName.trim() && phone.trim()),
        account_status: "active",
        role: "customer",
        updated_at: new Date().toISOString(),
      });
    }

    setLoading(false);
    setMessage("Account created. Taking you to phone verification.");
    navigate({ to: "/verify/phone" });
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background px-6 pt-10 pb-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-primary shadow-card">
          <Coins className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-display text-base font-semibold">SikaCircle</span>
      </div>

      <h1 className="font-display text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">Start a circle or join one in less than a minute.</p>

      <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field
          icon={<UserIcon className="h-4 w-4" />}
          label="Full name"
          placeholder="Adjoa Mensah"
          name="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
        <Field
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          type="email"
          placeholder="you@email.com"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          icon={<Phone className="h-4 w-4" />}
          label="Phone"
          placeholder="+233 24 555 0142"
          name="phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <Field
          icon={<Lock className="h-4 w-4" />}
          label="Password"
          type="password"
          placeholder="Create a password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 rounded border-input accent-[color:var(--primary)]" />
          <span>
            I agree to SikaCircle's <span className="text-primary font-medium">Terms</span> and{' '}
            <span className="text-primary font-medium">Privacy Policy</span>.
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && (
          <div className="rounded-2xl border border-primary/20 bg-secondary p-4 text-sm text-primary">
            <p className="font-semibold">{message}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-auto pt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-primary">Sign in</Link>
      </p>
    </div>
  );
}
