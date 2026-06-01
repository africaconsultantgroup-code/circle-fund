import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Coins, Mail, Lock, User as UserIcon, Phone } from "lucide-react";
import { Field } from "./login";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
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

      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/home" });
        }}
      >
        <Field icon={<UserIcon className="h-4 w-4" />} label="Full name" placeholder="Adjoa Mensah" />
        <Field icon={<Mail className="h-4 w-4" />} label="Email" type="email" placeholder="you@email.com" />
        <Field icon={<Phone className="h-4 w-4" />} label="Phone" placeholder="+233 24 555 0142" />
        <Field icon={<Lock className="h-4 w-4" />} label="Password" type="password" placeholder="Create a password" />

        <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 rounded border-input accent-[color:var(--primary)]" />
          <span>
            I agree to SikaCircle's <span className="text-primary font-medium">Terms</span> and{" "}
            <span className="text-primary font-medium">Privacy Policy</span>.
          </span>
        </label>

        <button
          type="submit"
          className="mt-4 rounded-2xl bg-gradient-primary py-4 font-display text-base font-semibold text-primary-foreground shadow-card"
        >
          Create Account
        </button>
      </form>

      <p className="mt-auto pt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-primary">Sign in</Link>
      </p>
    </div>
  );
}