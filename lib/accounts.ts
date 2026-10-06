import { z } from "zod";
import type { AccountKind, AccountRecord, AccountStatus } from "@prisma/client";
import { calendarName } from "@/lib/contactDates";
import { optionalHttpUrl, optionalId, optionalNotes, optionalText, trimToNull } from "@/lib/formFields";

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

/**
 * The fields of an account record. This directory never holds secrets or money: the account number is capped at its
 * last four characters (so a full number can't be saved by accident), and there is no field for a password or balance.
 */
export const accountRecordSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(MAX_FIELD, `The name can be at most ${MAX_FIELD} characters`),
  kind: z.enum(ACCOUNT_KINDS as [AccountKind, ...AccountKind[]], "Choose what kind of account it is"),
  status: z.enum(ACCOUNT_STATUSES as [AccountStatus, ...AccountStatus[]], "Choose a status"),
  institution: optionalText("The institution", MAX_FIELD),
  lastFour: z
    .string()
    .nullish()
    .transform(trimToNull)
    .refine((v) => v === null || /^[A-Za-z0-9]{1,4}$/.test(v), "Enter only the last 4 letters or digits of the account number (never the whole number)"),
  ownerContactId: optionalId(),
  website: optionalHttpUrl("The website", MAX_URL),
  phone: optionalText("The phone number", MAX_FIELD),
  notes: optionalNotes(MAX_NOTES),
});

export type AccountRecordFields = z.input<typeof accountRecordSchema>;

/** "Fidelity · HSA ····1234": the institution and masked number, whichever are known. */
export function accountSummary(a: { institution: string | null; lastFour: string | null }): string {
  return [a.institution, a.lastFour ? `····${a.lastFour}` : null].filter(Boolean).join(" ");
}

/** Include this when loading a record, so toAccountView can name its owner. */
export const OWNER_NAME = { owner: { select: { firstName: true, nickname: true } } } as const;

/** A stored record (loaded with OWNER_NAME) as the pages hand it to the browser, with the owner's short name. */
export function toAccountView(record: AccountRecord & { owner: { firstName: string; nickname: string | null } | null }) {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    status: record.status,
    institution: record.institution,
    lastFour: record.lastFour,
    ownerContactId: record.ownerContactId,
    /** Kept even after the owner is removed from the household. */
    ownerName: record.owner ? calendarName(record.owner) : null,
    website: record.website,
    phone: record.phone,
    notes: record.notes,
  };
}

export type AccountView = ReturnType<typeof toAccountView>;
