import type { CurrencyCode } from "@/lib/supabase-types";

export type CountryCode = "GH" | "GB" | "US" | "CA" | "OTHER";

export type CountryOption = {
  code: CountryCode;
  label: string;
  dialCode: string;
  currency: CurrencyCode;
};

export const countryOptions: CountryOption[] = [
  { code: "GH", label: "Ghana", dialCode: "+233", currency: "GHS" },
  { code: "GB", label: "United Kingdom", dialCode: "+44", currency: "GBP" },
  { code: "US", label: "United States", dialCode: "+1", currency: "USD" },
  { code: "CA", label: "Canada", dialCode: "+1", currency: "USD" },
  { code: "OTHER", label: "Other country", dialCode: "+", currency: "USD" },
];

export const currencyOptions: CurrencyCode[] = ["GHS", "GBP", "USD", "EUR"];

export function countryForValue(value: string | null | undefined): CountryOption {
  const normalized = (value ?? "").trim().toLowerCase();
  return countryOptions.find((option) =>
    option.code.toLowerCase() === normalized || option.label.toLowerCase() === normalized
  ) ?? countryOptions[0];
}

export function currencyForCountry(country: string | null | undefined): CurrencyCode {
  return countryForValue(country).currency;
}

export function normalizeInternationalPhoneNumber(phoneNumber: string, countryCode: CountryCode = "GH") {
  const raw = phoneNumber.trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";
  if (raw.trim().startsWith("+")) return digits;

  if (countryCode === "GH") {
    if (digits.startsWith("0")) return `233${digits.slice(1)}`;
    if (digits.startsWith("233")) return digits;
    if (digits.length === 9) return `233${digits}`;
  }

  if (countryCode === "GB") {
    if (digits.startsWith("0")) return `44${digits.slice(1)}`;
    if (digits.startsWith("44")) return digits;
  }

  if (countryCode === "US" || countryCode === "CA") {
    if (digits.startsWith("1")) return digits;
    if (digits.length === 10) return `1${digits}`;
  }

  return digits;
}

export function validateInternationalPhoneNumber(phoneNumber: string, countryCode: CountryCode = "GH") {
  if (countryCode === "GH") return /^233\d{9}$/.test(phoneNumber);
  if (countryCode === "GB") return /^44\d{9,10}$/.test(phoneNumber);
  if (countryCode === "US" || countryCode === "CA") return /^1\d{10}$/.test(phoneNumber);
  return /^\d{8,15}$/.test(phoneNumber);
}

export function formatCurrency(amount: number, currency: CurrencyCode = "GHS", maximumFractionDigits = 0) {
  const locale = currency === "GBP" ? "en-GB" : currency === "EUR" ? "en-IE" : currency === "USD" ? "en-US" : "en-GH";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits,
  }).format(Number.isFinite(amount) ? amount : 0);
}
