import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Coins, Mail, Lock, User as UserIcon, Phone, Globe2, Banknote } from "lucide-react";
import { Field } from "./login";
import { signUpWithEmail } from "@/lib/auth";
import { upsertProfile } from "@/lib/db";
import { countryOptions, currencyOptions, normalizeInternationalPhoneNumber, validateInternationalPhoneNumber, type CountryCode } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>("GH");
  const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>("GHS");
  const [expectedMonthlyContribution, setExpectedMonthlyContribution] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const countryOption = countryOptions.find((option) => option.code === country) ?? countryOptions[0];
    const normalizedPhone = normalizeInternationalPhoneNumber(phone, country);
    if (!validateInternationalPhoneNumber(normalizedPhone, country)) {
      setLoading(false);
      setError("Enter a valid phone number for your selected country.");
      return;
    }

    const profileCompleted = Boolean(fullName.trim() && normalizedPhone && countryOption.label);
    const expectedContribution = expectedMonthlyContribution ? Number(expectedMonthlyContribution) : null;
    const result = await signUpWithEmail(email, password, {
      full_name: fullName.trim() || null,
      phone: normalizedPhone,
      country: countryOption.label,
      preferred_currency: preferredCurrency,
      expected_monthly_contribution: expectedContribution,
    });
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
      const profileResult = await upsertProfile({
        user_id: result.data.user.id,
        full_name: fullName.trim() || null,
        name: fullName.trim() || null,
        email,
        phone: normalizedPhone,
        country: countryOption.label,
        preferred_currency: preferredCurrency,
        expected_monthly_contribution: expectedContribution,
        profile_completed: profileCompleted,
        account_status: "active",
        role: "customer",
        updated_at: new Date().toISOString(),
      });

      if (profileResult.error) {
        setLoading(false);
        setError(profileResult.error.message || "Account created, but we could not save your profile details.");
        return;
      }
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
          placeholder={country === "GH" ? "0558196746" : `${countryOptionPlaceholder(country)} phone number`}
          name="phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            icon={<Globe2 className="h-4 w-4" />}
            label="Country"
            value={country}
            onChange={(value) => {
              const nextCountry = value as CountryCode;
              const nextOption = countryOptions.find((option) => option.code === nextCountry) ?? countryOptions[0];
              setCountry(nextCountry);
              setPreferredCurrency(nextOption.currency);
            }}
            options={countryOptions.map((option) => ({ value: option.code, label: option.label }))}
          />
          <SelectField
            icon={<Banknote className="h-4 w-4" />}
            label="Currency"
            value={preferredCurrency}
            onChange={(value) => setPreferredCurrency(value as CurrencyCode)}
            options={currencyOptions.map((currency) => ({ value: currency, label: currency }))}
          />
        </div>
        <Field
          icon={<Coins className="h-4 w-4" />}
          label="Expected monthly contribution"
          type="number"
          placeholder="1000"
          name="expectedMonthlyContribution"
          value={expectedMonthlyContribution}
          onChange={(event) => setExpectedMonthlyContribution(event.target.value)}
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

function SelectField({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm">
        <span className="text-muted-foreground">{icon}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 appearance-none bg-transparent outline-none">
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </span>
    </label>
  );
}

function countryOptionPlaceholder(country: CountryCode) {
  if (country === "GB") return "+44";
  if (country === "US" || country === "CA") return "+1";
  return "+";
}
