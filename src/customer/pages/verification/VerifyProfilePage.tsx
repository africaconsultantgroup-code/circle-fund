import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldAlert, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { getProfileByUserId, upsertProfile } from "@/lib/db";
import { countryOptions, currencyOptions, countryForValue, normalizeInternationalPhoneNumber, validateInternationalPhoneNumber, type CountryCode } from "@/lib/diaspora";
import type { CurrencyCode } from "@/lib/supabase-types";

export function VerifyProfilePage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>("GH");
  const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>("GHS");
  const [expectedMonthlyContribution, setExpectedMonthlyContribution] = useState("");
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

      if (data?.profile_completed) {
        setMessage("Your profile is already complete.");
        setIsLoading(false);
        setTimeout(() => navigate({ to: "/home" }), 500);
        return;
      }

      setFullName(data?.full_name ?? "");
      setPhone(data?.phone ?? user.phone ?? "");
      const profileCountry = countryForValue(data?.country);
      setCountry(profileCountry.code);
      setPreferredCurrency(data?.preferred_currency ?? profileCountry.currency);
      setExpectedMonthlyContribution(data?.expected_monthly_contribution ? String(data.expected_monthly_contribution) : "");
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

    const countryOption = countryOptions.find((option) => option.code === country) ?? countryOptions[0];
    const normalizedPhone = normalizeInternationalPhoneNumber(phone, country);
    if (!validateInternationalPhoneNumber(normalizedPhone, country)) {
      setError("Enter a valid phone number for your selected country.");
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
      name: fullName.trim(),
      email: user.email,
      phone: normalizedPhone,
      country: countryOption.label,
      preferred_currency: preferredCurrency,
      expected_monthly_contribution: expectedMonthlyContribution ? Number(expectedMonthlyContribution) : null,
      profile_completed: true,
      account_status: "active",
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
            <Select
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
            <Field label="Phone number" value={phone} onChange={setPhone} placeholder={country === "GH" ? "0558196746" : "Include country code if needed"} />
            <Select
              label="Preferred currency"
              value={preferredCurrency}
              onChange={(value) => setPreferredCurrency(value as CurrencyCode)}
              options={currencyOptions.map((currency) => ({ value: currency, label: currency }))}
            />
            <Field label="Expected monthly contribution" value={expectedMonthlyContribution} onChange={setExpectedMonthlyContribution} placeholder="1000" type="number" />
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

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full appearance-none rounded-2xl border border-input bg-muted/40 px-4 py-3.5 text-sm outline-none">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
