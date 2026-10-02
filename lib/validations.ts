import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "./messaging";

export const ContactCategoryEnum = z.enum([
  "FAMILY_FRIEND",
  "SERVICE_PROVIDER",
  "MEDICAL_SCHOOL",
  "HOUSEHOLD_ADMIN",
]);

export type ContactCategory = z.infer<typeof ContactCategoryEnum>;

// Used for both CSV import and in-app forms.
export const contactSchema = z
  .object({
    id: z.string().optional(),
    householdId: z.string().optional(),
    firstName: z.string().min(1, "first_name is required"),
    lastName: z.string().min(1, "last_name is required"),
    nickname: z.string().optional(),
    category: ContactCategoryEnum,
    address: z.string().optional(),
    phoneMobile: z.string().optional(),
    phoneHome: z.string().optional(),
    phoneWork: z.string().optional(),
    emailPrimary: z.string().optional(),
    emailSecondary: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
    favorite: z.boolean().optional().default(false),
    relationshipNotes: z.string().optional(),
    linkedFamilyMember: z.string().optional(),
    importantDate1: z.string().optional(),
    importantDate1Label: z.string().optional(),
    importantDate2: z.string().optional(),
    importantDate2Label: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.category === "FAMILY_FRIEND" && !data.householdId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "household_id is required for FAMILY_FRIEND contacts",
        path: ["householdId"],
      });
    }
  });

export type ContactInput = z.infer<typeof contactSchema>;

export const householdSchema = z.object({
  id: z.string().optional(),
  displayName: z.string().min(1, "display_name is required"),
  mailingAddress: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
});

export type HouseholdInput = z.infer<typeof householdSchema>;

// The person an account acts as (sender of its messages, head who answers sync invites).
export const personNameSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
});

export const createHouseholdSchema = personNameSchema.extend({
  displayName: z.string().min(1, "Display name is required"),
  urlSlug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(64)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug may only contain lowercase letters, numbers, and hyphens"
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const signupSchema = personNameSchema.extend({
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const userLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const requestSyncSchema = z.object({
  contactId: z.string().min(1, "Choose a contact"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export const conversationNameSchema = z.object({
  name: z.string().trim().min(1, "Give the conversation a name").max(100, "Names can be at most 100 characters"),
});

export const messageSchema = z.object({
  text: z.string().trim().min(1, "Write a message first").max(MAX_MESSAGE_LENGTH, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters`),
});
