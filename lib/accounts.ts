import { z } from "zod";
import type { AccountKind, AccountStatus } from "@prisma/client";
import { isHttpUrl } from "@/lib/urls";

export const ACCOUNT_KINDS: readonly AccountKind[] = [
  "BANK", "CREDIT_CARD", "LOAN", "INVESTMENT", "RETIREMENT", "HEALTH_SAVINGS", "INSURANCE", "UTILITY", "SUBSCRIPTION", "OTHER",
];

export const KIND_LABELS: Record<AccountKind, string> = {
  BANK: "Bank",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan or mortgage",
  INVESTMENT: "Investment",
  RETIREMENT: "Retirement",
  HEALTH_SAVINGS: "HSA or FSA",
  INSURANCE: "Insurance",
  UTILITY: "Utility",
  SUBSCRIPTION: "Subscription",
  OTHER: "Other",
};

export const ACCOUNT_STATUSES: readonly AccountStatus[] = ["ACTIVE", "REVIEW", "CLOSED"];

export const STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  REVIEW: "To review or consolidate",
  CLOSED: "Closed",
};

export const MAX_FIELD = 120;
export const MAX_URL = 500;
export const MAX_NOTES = 5000;
export const MAX_LAST_FOUR = 4;

const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v : null);
const short = (label: string) =>
  z
    .string()
    .max(MAX_FIELD, `${label} can be at most ${MAX_FIELD} characters`)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));

/**
 * The fields of an account record. This directory never holds secrets or money: the account number is capped at its
 * last four characters (so a full number can't be saved by accident), and there is no field for a password or balance.
 */
export const accountRecordSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(MAX_FIELD, `The name can be at most ${MAX_FIELD} characters`),
  kind: z.enum(ACCOUNT_KINDS as [AccountKind, ...AccountKind[]], "Choose what kind of account it is"),
  status: z.enum(ACCOUNT_STATUSES as [AccountStatus, ...AccountStatus[]], "Choose a status"),
  institution: short("The institution"),
  lastFour: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || /^[A-Za-z0-9]{1,4}$/.test(v), "Enter only the last 4 letters or digits of the account number (never the whole number)"),
  ownerContactId: z.string().nullish().transform(blankToNull),
  website: z
    .string()
    .max(MAX_URL, `The website can be at most ${MAX_URL} characters`)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || isHttpUrl(v), "The website must start with http:// or https://"),
  phone: short("The phone number"),
  notes: z
    .string()
    .max(MAX_NOTES, `Notes can be at most ${MAX_NOTES.toLocaleString("en-US")} characters`)
    .nullish()
    .transform(blankToNull),
});

export type AccountRecordFields = z.input<typeof accountRecordSchema>;

/** "Fidelity · HSA ····1234": the institution and masked number, whichever are known. */
export function accountSummary(a: { institution: string | null; lastFour: string | null }): string {
  return [a.institution, a.lastFour ? `····${a.lastFour}` : null].filter(Boolean).join(" ");
}
