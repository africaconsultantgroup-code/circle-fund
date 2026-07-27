import { getCurrentUser } from "@/lib/auth";
import {
  countCircleMembers,
  countPendingCircleMembers,
  listArchivedCirclesForUser,
  listCirclesForUser,
  type Circle,
} from "@/lib/db";
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
  pendingMemberCount: number;
  maxMembers: number;
  currentCycle: number;
  totalCycles: number;
  nextRecipient: string;
  nextPayoutDate: string;
  inviteToken: string | null;
  membershipRole: string;
  membershipStatus: string;
  isCreator: boolean;
  status: Circle["status"];
  archivedAt: string | null;
  circleType: "rotational" | "goal";
};

type CircleMembershipRow = {
  role: string | null;
  status: string | null;
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
    pendingMemberCount: 0,
    maxMembers: 15,
    currentCycle: circle.currentCycle,
    totalCycles: circle.totalCycles,
    nextRecipient: circle.nextRecipient,
    nextPayoutDate: circle.nextPayoutDate,
    inviteToken: circle.inviteCode,
    membershipRole: "member",
    membershipStatus: "approved",
    isCreator: false,
    status: "active",
    archivedAt: null,
    circleType: "rotational",
  }));
}

export async function loadUserCircles(): Promise<{ data: UserCircle[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: mockUserCircles(), error: null };
  }

  return loadConfiguredUserCircles(listCirclesForUser);
}

export async function loadArchivedUserCircles(): Promise<{
  data: UserCircle[];
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: [], error: null };
  }

  return loadConfiguredUserCircles(listArchivedCirclesForUser);
}

async function loadConfiguredUserCircles(
  listCircles: typeof listCirclesForUser,
): Promise<{ data: UserCircle[]; error: string | null }> {
  const user = await getCurrentUser();
  if (!user) {
    return { data: [], error: "Please sign in to view your circles." };
  }

  const { data, error } = await listCircles(user.id);
  if (error) {
    return { data: [], error: error.message };
  }

  const rows = ((data ?? []) as CircleMembershipRow[])
    .map((row) => ({
      circle: Array.isArray(row.circles) ? row.circles[0] : row.circles,
      role: row.role ?? "member",
      status: row.status ?? "pending",
    }))
    .filter((row): row is { circle: Circle; role: string; status: string } => Boolean(row.circle));

  const mapped = await Promise.all(
    rows.map(async ({ circle, role, status }) => {
      const userCircle = toUserCircle(circle);
      const [approvedResult, pendingResult] = await Promise.all([
        countCircleMembers(circle.id),
        countPendingCircleMembers(circle.id),
      ]);
      return {
        ...userCircle,
        memberCount: approvedResult.count ?? userCircle.memberCount,
        pendingMemberCount: pendingResult.count ?? 0,
        membershipRole: role,
        membershipStatus: status,
        isCreator: role === "creator" || circle.owner_id === user.id,
      };
    }),
  );

  return { data: mapped, error: null };
}

export function toUserCircle(circle: Circle): UserCircle {
  const amount = Number(circle.contribution_amount ?? 0);
  const goal = Number(circle.goal_amount ?? amount);
  const maxMembers = Math.min(
    Math.max(circle.max_members ?? (amount > 0 ? Math.round(goal / amount) : 1), 1),
    15,
  );

  return {
    id: circle.id,
    name: circle.name,
    description: circle.description,
    category: extractCategory(circle.description),
    amount,
    baseCurrency: circle.base_currency ?? "GHS",
    frequency: circle.frequency ?? "monthly",
    memberCount: 0,
    pendingMemberCount: 0,
    maxMembers,
    currentCycle: 0,
    totalCycles: maxMembers,
    nextRecipient: "Pending",
    nextPayoutDate: circle.start_date
      ? new Date(circle.start_date).toLocaleDateString()
      : "Not set",
    inviteToken: circle.invite_code ?? circle.invite_token ?? null,
    membershipRole: "member",
    membershipStatus: "pending",
    isCreator: false,
    status: circle.status,
    archivedAt: circle.archived_at,
    circleType: circle.circle_type,
  };
}

function extractCategory(description: string | null) {
  const match = description?.match(/Category:\s*([A-Za-z]+)/);
  return match?.[1] ?? "Circle";
}
