export type Frequency = "daily" | "weekly" | "monthly";

export interface Member {
  id: string;
  name: string;
  avatar: string;
  payoutPosition: number;
  hasPaidThisCycle: boolean;
  hasReceivedPayout: boolean;
}

export interface Circle {
  id: string;
  name: string;
  description: string;
  amount: number;
  baseCurrency?: "GHS" | "GBP" | "USD" | "EUR";
  frequency: Frequency;
  inviteCode: string;
  currentCycle: number;
  totalCycles: number;
  nextPayoutDate: string;
  nextRecipient: string;
  members: Member[];
  category: "Family" | "Friends" | "Work" | "Church" | "Association";
}

export interface Transaction {
  id: string;
  circleName: string;
  type: "contribution" | "payout";
  amount: number;
  date: string;
  status: "completed" | "pending" | "failed";
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  type: "payout" | "reminder" | "join" | "system";
}

const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

const buildMembers = (names: string[]): Member[] =>
  names.map((n, i) => ({
    id: `m-${n}`,
    name: n,
    avatar: avatar(n),
    payoutPosition: i + 1,
    hasPaidThisCycle: i < 4,
    hasReceivedPayout: i < 2,
  }));

export const circles: Circle[] = [
  {
    id: "family-savers",
    name: "Family Savers",
    description: "Monthly susu with my siblings and cousins.",
    amount: 500,
    frequency: "monthly",
    inviteCode: "FAM-2X9K",
    currentCycle: 3,
    totalCycles: 8,
    nextPayoutDate: "Jun 28, 2026",
    nextRecipient: "Ama Boateng",
    category: "Family",
    members: buildMembers([
      "Kwame Mensah",
      "Akosua Owusu",
      "Ama Boateng",
      "Yaw Asante",
      "Esi Darko",
      "Kojo Appiah",
      "Adwoa Frimpong",
      "Kofi Nyarko",
    ]),
  },
  {
    id: "office-circle",
    name: "Office Circle",
    description: "Weekly contribution with my work team.",
    amount: 100,
    frequency: "weekly",
    inviteCode: "OFC-7P4M",
    currentCycle: 6,
    totalCycles: 12,
    nextPayoutDate: "Jun 8, 2026",
    nextRecipient: "Linda Tetteh",
    category: "Work",
    members: buildMembers([
      "Linda Tetteh",
      "Daniel Osei",
      "Priscilla Adu",
      "Michael Boahen",
      "Stella Quaye",
      "Joseph Anane",
      "Naa Lamiley",
      "Festus Larbi",
      "Mavis Okine",
      "Ben Sarpong",
      "Akua Pokuaa",
      "Eric Doku",
    ]),
  },
  {
    id: "church-fund",
    name: "Trinity Youth Fund",
    description: "Church youth association revolving fund.",
    amount: 250,
    frequency: "monthly",
    inviteCode: "TYF-9Q1L",
    currentCycle: 1,
    totalCycles: 10,
    nextPayoutDate: "Jul 1, 2026",
    nextRecipient: "Pastor Edem",
    category: "Church",
    members: buildMembers([
      "Pastor Edem",
      "Sister Abena",
      "Brother Kwesi",
      "Sister Naomi",
      "Brother Selorm",
      "Sister Dzifa",
      "Brother Mawuli",
      "Sister Akpene",
      "Brother Senanu",
      "Sister Elinam",
    ]),
  },
];

export const transactions: Transaction[] = [
  { id: "t1", circleName: "Office Circle", type: "contribution", amount: 100, date: "Jun 1, 2026", status: "completed" },
  { id: "t2", circleName: "Family Savers", type: "payout", amount: 4000, date: "May 28, 2026", status: "completed" },
  { id: "t3", circleName: "Trinity Youth Fund", type: "contribution", amount: 250, date: "May 26, 2026", status: "completed" },
  { id: "t4", circleName: "Office Circle", type: "contribution", amount: 100, date: "May 25, 2026", status: "completed" },
  { id: "t5", circleName: "Office Circle", type: "contribution", amount: 100, date: "May 18, 2026", status: "pending" },
  { id: "t6", circleName: "Family Savers", type: "contribution", amount: 500, date: "Apr 28, 2026", status: "completed" },
  { id: "t7", circleName: "Office Circle", type: "contribution", amount: 100, date: "Apr 20, 2026", status: "failed" },
];

export const notifications: Notification[] = [
  { id: "n1", title: "Payout received", body: "You received GHS 4,000 from Family Savers.", time: "2h ago", read: false, type: "payout" },
  { id: "n2", title: "Contribution due", body: "Your weekly contribution to Office Circle is due tomorrow.", time: "6h ago", read: false, type: "reminder" },
  { id: "n3", title: "New member joined", body: "Mavis Okine joined Office Circle.", time: "1d ago", read: true, type: "join" },
  { id: "n4", title: "Cycle completed", body: "Cycle 3 of Family Savers is now complete.", time: "3d ago", read: true, type: "system" },
  { id: "n5", title: "Welcome to SikaCircle", body: "Get started by creating or joining a circle.", time: "1w ago", read: true, type: "system" },
];

export const currentUser = {
  name: "Adjoa Mensah",
  email: "adjoa@sikacircle.app",
  phone: "+233 24 555 0142",
  avatar: avatar("Adjoa Mensah"),
  joined: "March 2026",
};

export const formatCurrency = (n: number, currency = "GHS") => {
  const locale = currency === "GBP" ? "en-GB" : currency === "EUR" ? "en-IE" : currency === "USD" ? "en-US" : "en-GH";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
};

export const formatGHS = (n: number) => formatCurrency(n, "GHS");

export const getCircle = (id: string) => circles.find((c) => c.id === id);

// ---------- Verification & Risk ----------

export type VerificationStatus = "verified" | "pending" | "unverified" | "rejected";
export type TrustTier = "high" | "medium" | "low" | "new";
export type MomoNetwork = "MTN" | "Telecel" | "AirtelTigo";

export interface VerificationState {
  phone: VerificationStatus;
  ghanaCard: VerificationStatus;
  selfie: VerificationStatus;
  momo: VerificationStatus;
  riskProfile: VerificationStatus;
  guarantor: VerificationStatus;
}

export const verification: VerificationState = {
  phone: "verified",
  ghanaCard: "pending",
  selfie: "unverified",
  momo: "unverified",
  riskProfile: "unverified",
  guarantor: "unverified",
};

export const isFullyVerified = (v: VerificationState) =>
  Object.values(v).every((s) => s === "verified");

export const verificationProgress = (v: VerificationState) => {
  const total = Object.keys(v).length;
  const done = Object.values(v).filter((s) => s === "verified").length;
  return { done, total, percent: Math.round((done / total) * 100) };
};

export interface TrustScore {
  score: number; // 0-1000
  tier: TrustTier;
  factors: {
    verificationCompleted: number;
    successfulCircles: number;
    onTimePayments: number;
    missedPayments: number;
    disputes: number;
    completedPayouts: number;
  };
  maxCircles: number;
  activeCircles: number;
  maxCircleValue: number;
}

export const trustScore: TrustScore = {
  score: 685,
  tier: "medium",
  factors: {
    verificationCompleted: 60,
    successfulCircles: 4,
    onTimePayments: 38,
    missedPayments: 2,
    disputes: 0,
    completedPayouts: 3,
  },
  maxCircles: 5,
  activeCircles: 3,
  maxCircleValue: 1500,
};

export const tierLabel = (t: TrustTier) =>
  t === "high" ? "High Trust" : t === "medium" ? "Trusted" : t === "low" ? "Risk Alert" : "New Member";

export const tierFromScore = (s: number): TrustTier =>
  s >= 800 ? "high" : s >= 600 ? "medium" : s >= 400 ? "low" : "new";

export interface MemberApproval {
  id: string;
  name: string;
  avatar: string;
  appliedAt: string;
  verification: VerificationState;
  trustScore: number;
  activeCircles: number;
}

export const pendingApprovals: MemberApproval[] = [
  {
    id: "ap1",
    name: "Kwame Asare",
    avatar: avatar("Kwame Asare"),
    appliedAt: "2h ago",
    trustScore: 820,
    activeCircles: 2,
    verification: { phone: "verified", ghanaCard: "verified", selfie: "verified", momo: "verified", riskProfile: "verified", guarantor: "verified" },
  },
  {
    id: "ap2",
    name: "Efua Owusu",
    avatar: avatar("Efua Owusu"),
    appliedAt: "5h ago",
    trustScore: 540,
    activeCircles: 4,
    verification: { phone: "verified", ghanaCard: "verified", selfie: "pending", momo: "verified", riskProfile: "verified", guarantor: "unverified" },
  },
  {
    id: "ap3",
    name: "Yaw Mensah",
    avatar: avatar("Yaw Mensah"),
    appliedAt: "1d ago",
    trustScore: 360,
    activeCircles: 5,
    verification: { phone: "verified", ghanaCard: "unverified", selfie: "unverified", momo: "unverified", riskProfile: "unverified", guarantor: "unverified" },
  },
];

export interface RiskAlert {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  body: string;
  time: string;
}

export const riskAlerts: RiskAlert[] = [
  { id: "r1", severity: "high", title: "Late contribution", body: "Your Office Circle weekly contribution is 2 days overdue. This will impact your trust score.", time: "Today" },
  { id: "r2", severity: "medium", title: "Trust score below threshold", body: "You cannot join circles above GHS 1,500 until your score reaches 750.", time: "Yesterday" },
  { id: "r3", severity: "low", title: "Active circles near limit", body: "You are in 3 of 5 allowed active circles.", time: "3d ago" },
];
