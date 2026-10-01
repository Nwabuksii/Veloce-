import type { Prisma } from "@prisma/client";

// A guide for the admin's scribe-application queue: how likely is this
// applicant to be a real student worth approving? Never decides anything on
// its own — an admin still approves or rejects (singly or in a batch).

// Only this domain counts as a school address. To also accept staff emails
// later, add their domain here.
export const SCHOOL_EMAIL_DOMAINS = ["student.babcock.edu.ng"];

export const STRONG_FROM = 70;
export const REVIEW_FROM = 40;
const NON_SCHOOL_CAP = 30;
const ACTIVITY_CAP = 30;
const NEW_ACCOUNT_DAYS = 7;

export type ScoreLabel = "strong" | "review" | "weak";
export interface ScoreLine {
  label: string;
  points: number;
}
export interface ApplicantScore {
  score: number;
  label: ScoreLabel;
  lines: ScoreLine[];
}

export interface ScoreInput {
  email: string;
  emailVerifiedAt: Date | string | null;
  fullName: string;
  avatarUrl: string | null;
  createdAt: Date | string;
  purchases: number; // not refunded
  feedback: number; // reviews + feedback messages
  follows: number;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Letters, accents, spaces, hyphens, apostrophes and full stops are fine
// (Ade-Bello, O'Brien, "John A. Smith"). Digits, symbols and emoji are not.
const SPECIAL_CHARS = /[^\p{L}\p{M}\s'’.-]/u;

function emailNameMatch(email: string, fullName: string): number {
  const local = fold(email.split("@")[0] ?? "").replace(/[^a-z]/g, "");
  const parts = fold(fullName).split(/[^a-z]+/).filter(Boolean);
  if (parts.some((p) => p.length >= 3 && local.includes(p))) return 15;
  const initials = parts.map((p) => p[0]).join("");
  if (initials.length >= 2 && local.includes(initials)) return 7;
  return 0;
}

export function labelFor(score: number): ScoreLabel {
  if (score >= STRONG_FROM) return "strong";
  if (score >= REVIEW_FROM) return "review";
  return "weak";
}

export function scoreApplicant(input: ScoreInput, now: Date = new Date()): ApplicantScore {
  const lines: ScoreLine[] = [];
  const add = (label: string, points: number) => lines.push({ label, points });

  const domain = input.email.split("@")[1]?.toLowerCase() ?? "";
  const isSchool = SCHOOL_EMAIL_DOMAINS.includes(domain);
  if (isSchool && input.emailVerifiedAt) add("School email ✓", 40);
  else if (isSchool) add("School email, not verified", 10);
  else add("Not a school email", 0);

  const match = emailNameMatch(input.email, input.fullName);
  if (match === 15) add("Email matches name", 15);
  else if (match === 7) add("Email matches initials only", 7);

  if (SPECIAL_CHARS.test(input.fullName.trim())) add("Special characters in name", -10);
  else add("Clean name", 10);

  if (input.avatarUrl) add("Profile image", 5);

  const ageMs = now.getTime() - new Date(input.createdAt).getTime();
  const activity: ScoreLine[] = [];
  if (input.purchases > 0) activity.push({ label: "Has bought a note", points: 12 });
  if (input.feedback > 0) activity.push({ label: "Left a review or feedback", points: 8 });
  if (input.follows > 0) activity.push({ label: "Follows a scribe", points: 5 });
  if (ageMs > NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000) activity.push({ label: "Account older than 7 days", points: 5 });
  const activityTotal = activity.reduce((s, l) => s + l.points, 0);
  lines.push(...activity);
  if (activityTotal > ACTIVITY_CAP) add("Activity limit", ACTIVITY_CAP - activityTotal);

  if (input.purchases === 0 && input.feedback === 0) add("No purchases or feedback", -10);

  let total = lines.reduce((s, l) => s + l.points, 0);
  if (!isSchool && total > NON_SCHOOL_CAP) {
    add("Cap for non-school email", NON_SCHOOL_CAP - total);
    total = NON_SCHOOL_CAP;
  }
  if (total < 0) {
    add("Lowest possible score", -total);
    total = 0;
  }
  return { score: total, label: labelFor(total), lines };
}

// What to load from the database for each applicant so they can be scored.
export const applicantUserSelect = {
  id: true,
  fullName: true,
  email: true,
  level: true,
  emailVerifiedAt: true,
  avatarUrl: true,
  createdAt: true,
  department: { select: { name: true } },
  _count: {
    select: {
      purchases: { where: { refundedAt: null } },
      reviews: true,
      feedback: true,
      following: true,
    },
  },
} satisfies Prisma.UserSelect;

export type ApplicantUser = Prisma.UserGetPayload<{ select: typeof applicantUserSelect }>;

export function scoreApplicantUser(u: ApplicantUser): ApplicantScore {
  return scoreApplicant({
    email: u.email,
    emailVerifiedAt: u.emailVerifiedAt,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
    purchases: u._count.purchases,
    feedback: u._count.reviews + u._count.feedback,
    follows: u._count.following,
  });
}
