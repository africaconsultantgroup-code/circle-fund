import { getCurrentUser } from "@/lib/auth";
import { listCirclesForUser, type Circle } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { circles as mockCircles } from "@/lib/mock-data";
import type { CurrencyCode } from "@/lib/supabase-types";

export type UserCircle = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  amount: number;
  baseCurrency: CurrencyCode;
  frequency: string;
  memberCount: number;
  maxMembers: number;
  currentCycle: number;
  totalCycles: number;
  nextRecipient: string;
  nextPayoutDate: string;
  inviteToken: string | null;
};

type CircleMembershipRow = {
  circles: Circle | Circle[] | null;
};

export function mockUserCircles(): UserCircle[] {
  return mockCircles.map((circle) => ({
    id: circle.id,
    name: circle.name,
    description: null,
    category: circle.category,
    amount: circle.amount,
    baseCurrency: "GHS",
    frequency: circle.frequency,
    memberCount: circle.members.length,
    maxMembers: 15,
    currentCycle: circle.currentCycle,
    totalCycles: circle.totalCycles,
    nextRecipient: circle.nextRecipient,
    nextPayoutDate: circle.nextPayoutDate,
    inviteToken: circle.inviteCode,
  }));
}

export async function loadUserCircles(): Promise<{ data: UserCircle[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: mockUserCircles(), error: null };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { data: [], error: "Please sign in to view your circles." };
  }

  const { data, error } = await listCirclesForUser(user.id);
  if (error) {
    return { data: [], error: error.message };
  }

  const circles = ((data ?? []) as CircleMembershipRow[])
    .map((row) => Array.isArray(row.circles) ? row.circles[0] : row.circles)
    .filter((circle): circle is Circle => Boolean(circle));

  return { data: circles.map(toUserCircle), error: null };
}

export function toUserCircle(circle: Circle): UserCircle {
  const amount = Number(circle.contribution_amount ?? 0);
  const goal = Number(circle.goal_amount ?? amount);
  const maxMembers = Math.min(Math.max(circle.max_members ?? (amount > 0 ? Math.round(goal / amount) : 1), 1), 15);

  return {
    id: circle.id,
    name: circle.name,
    description: circle.description,
    category: extractCategory(circle.description),
    amount,
    baseCurrency: circle.base_currency ?? "GHS",
    frequency: circle.frequency ?? "monthly",
    memberCount: 1,
    maxMembers,
    currentCycle: 0,
    totalCycles: maxMembers,
    nextRecipient: "Pending",
    nextPayoutDate: circle.start_date ? new Date(circle.start_date).toLocaleDateString() : "Not set",
    inviteToken: circle.invite_code ?? circle.invite_token ?? null,
  };
}

function extractCategory(description: string | null) {
  const match = description?.match(/Category:\s*([A-Za-z]+)/);
  return match?.[1] ?? "Circle";
}
