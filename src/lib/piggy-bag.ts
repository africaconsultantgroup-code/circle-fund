import { addDays, addMonths, differenceInCalendarDays, isAfter, isBefore, parseISO } from "date-fns";
import { getCurrentUser } from "@/lib/auth";
import {
  createPersonalSusuDeposit,
  createPersonalSusuPlan,
  getPersonalSusuPlan,
  listPersonalSusuDeposits,
  listPersonalSusuPlans,
  type PersonalSusuDeposit,
  type PersonalSusuPlan,
  type PersonalSusuPlanInsert,
} from "@/lib/db";
import type { PersonalSusuDurationUnit, PersonalSusuFrequency } from "@/lib/supabase-types";

export type PiggyFrequency = PersonalSusuFrequency;
export type PiggyDurationUnit = PersonalSusuDurationUnit;

export type PiggyCalculationInput = {
  targetAmount: number;
  frequency: PiggyFrequency;
  startDate: string;
  endDate: string;
  currentSaved?: number;
};

export type PiggyCalculation = {
  totalTargetAmount: number;
  expectedContributionPerPeriod: number;
  numberOfPayments: number;
  progressPercentage: number;
  remainingBalance: number;
  nextPaymentDate: string | null;
  daysRemaining: number;
};

export type PiggyPlanWithMetrics = {
  plan: PersonalSusuPlan;
  deposits: PersonalSusuDeposit[];
  paidDeposits: PersonalSusuDeposit[];
  lockedBalance: number;
  availableBalance: number;
  metrics: PiggyCalculation;
  canWithdraw: boolean;
};

const periodDays: Record<PiggyFrequency, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export function calculatePiggyPlan(input: PiggyCalculationInput): PiggyCalculation {
  const targetAmount = Math.max(Number(input.targetAmount) || 0, 0);
  const currentSaved = Math.min(Math.max(Number(input.currentSaved) || 0, 0), targetAmount);
  const start = parseDate(input.startDate);
  const end = parseDate(input.endDate);
  const today = stripTime(new Date());
  const totalDays = Math.max(differenceInCalendarDays(end, start), 0);
  const daysRemaining = Math.max(differenceInCalendarDays(end, today), 0);
  const numberOfPayments = Math.max(Math.ceil(Math.max(totalDays, 1) / periodDays[input.frequency]), 1);
  const remainingBalance = Math.max(targetAmount - currentSaved, 0);
  const nextPaymentDate = findNextPaymentDate(start, end, input.frequency, today);

  return {
    totalTargetAmount: targetAmount,
    expectedContributionPerPeriod: roundMoney(targetAmount / numberOfPayments),
    numberOfPayments,
    progressPercentage: targetAmount > 0 ? Math.min(Math.round((currentSaved / targetAmount) * 100), 100) : 0,
    remainingBalance: roundMoney(remainingBalance),
    nextPaymentDate,
    daysRemaining,
  };
}

export function deriveEndDate(startDate: string, duration: number, durationUnit: PiggyDurationUnit) {
  const start = parseDate(startDate);
  const safeDuration = Math.max(Math.round(Number(duration) || 1), 1);
  const end = durationUnit === "weeks" ? addDays(start, safeDuration * 7) : addMonths(start, safeDuration);
  return toDateInputValue(end);
}

export async function loadPiggyPlans() {
  const user = await getCurrentUser();
  if (!user) return { data: [], error: "Please sign in to view your Piggy Bag plans." };

  const { data, error } = await listPersonalSusuPlans(user.id);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function loadPiggyPlan(planId: string): Promise<{ data: PiggyPlanWithMetrics | null; error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: "Please sign in to view this Piggy Bag plan." };

  const planResult = await getPersonalSusuPlan(planId, user.id);
  if (planResult.error || !planResult.data) {
    return { data: null, error: planResult.error?.message ?? "We could not find this Piggy Bag plan." };
  }

  const depositsResult = await listPersonalSusuDeposits(planResult.data.id, user.id);
  if (depositsResult.error) {
    return { data: null, error: depositsResult.error.message };
  }

  const deposits = depositsResult.data ?? [];
  return { data: buildPlanMetrics(planResult.data, deposits), error: null };
}

export async function createPiggyPlan(input: {
  name: string;
  targetAmount: number;
  frequency: PiggyFrequency;
  duration: number;
  durationUnit: PiggyDurationUnit;
  startDate: string;
  endDate: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: "Please sign in before creating a Piggy Bag plan." };

  const payload: PersonalSusuPlanInsert = {
    user_id: user.id,
    name: input.name.trim(),
    target_amount: input.targetAmount,
    frequency: input.frequency,
    duration: Math.max(Math.round(input.duration), 1),
    duration_unit: input.durationUnit,
    start_date: input.startDate,
    end_date: input.endDate,
    locked_until: input.endDate,
    status: "active",
  };

  const { data, error } = await createPersonalSusuPlan(payload);
  return { data, error: error?.message ?? null };
}

export async function recordPiggyDeposit(planId: string, amount: number) {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: "Please sign in before adding a Piggy Bag deposit." };

  const { data, error } = await createPersonalSusuDeposit({
    plan_id: planId,
    user_id: user.id,
    amount,
    payment_status: "paid",
    provider: "hubtel_collections_pending",
    transaction_reference: `PIGGY-${Date.now()}`,
  });

  return { data, error: error?.message ?? null };
}

export function buildPlanMetrics(plan: PersonalSusuPlan, deposits: PersonalSusuDeposit[]): PiggyPlanWithMetrics {
  const paidDeposits = deposits.filter((deposit) => deposit.payment_status === "paid");
  const saved = paidDeposits.reduce((total, deposit) => total + Number(deposit.amount), 0);
  const canWithdraw = !isBefore(stripTime(new Date()), parseDate(plan.locked_until));
  const lockedBalance = canWithdraw ? 0 : saved;

  return {
    plan,
    deposits,
    paidDeposits,
    lockedBalance,
    availableBalance: canWithdraw ? saved : 0,
    metrics: calculatePiggyPlan({
      targetAmount: Number(plan.target_amount),
      frequency: plan.frequency,
      startDate: plan.start_date,
      endDate: plan.end_date,
      currentSaved: saved,
    }),
    canWithdraw,
  };
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GH", { month: "short", day: "numeric", year: "numeric" }).format(parseDate(value));
}

export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function findNextPaymentDate(start: Date, end: Date, frequency: PiggyFrequency, today: Date) {
  if (isAfter(today, end)) return null;

  let cursor = start;
  while (isBefore(cursor, today)) {
    cursor = frequency === "monthly" ? addMonths(cursor, 1) : addDays(cursor, periodDays[frequency]);
  }

  return isAfter(cursor, end) ? null : toDateInputValue(cursor);
}

function parseDate(value: string) {
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? stripTime(new Date()) : stripTime(parsed);
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
