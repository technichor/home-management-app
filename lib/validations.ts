import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "./messaging";
import { isDateString } from "./dates";

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

// The in-app add/edit form. Friendlier messages than the CSV schema, plus checks the CSV path
// doesn't make (email format, real dates). Blank optional fields become undefined.
const blankToUndefined = (v: string | undefined) => v || undefined;
const optionalText = z.string().trim().optional().transform(blankToUndefined);
const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform(blankToUndefined)
  .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email address");
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform(blankToUndefined)
  .refine(
    (v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))),
    "Enter a valid date"
  );

export const contactFormSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    nickname: optionalText,
    category: ContactCategoryEnum,
    householdId: optionalText,
    address: optionalText,
    phoneMobile: optionalText,
    phoneHome: optionalText,
    phoneWork: optionalText,
    emailPrimary: optionalEmail,
    emailSecondary: optionalEmail,
    tags: z.array(z.string().trim().min(1)).default([]),
    favorite: z.boolean().default(false),
    relationshipNotes: optionalText,
    linkedFamilyMember: optionalText,
    importantDate1: optionalDate,
    importantDate1Label: optionalText,
    importantDate2: optionalDate,
    importantDate2Label: optionalText,
    notes: optionalText,
  })
  .superRefine((data, ctx) => {
    if (data.category === "FAMILY_FRIEND" && !data.householdId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose the household this person belongs to",
        path: ["householdId"],
      });
    }
  });

export type ContactFormInput = z.input<typeof contactFormSchema>;

export const householdFormSchema = z.object({
  displayName: z.string().trim().min(1, "Household name is required").max(100, "Household names can be at most 100 characters"),
  mailingAddress: optionalText,
  tags: z.array(z.string().trim().min(1)).default([]),
  notes: optionalText,
});

export type HouseholdFormInput = z.input<typeof householdFormSchema>;

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

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const signupSchema = personNameSchema.extend({
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.confirmPassword === d.newPassword, {
    path: ["confirmPassword"],
    message: "The new passwords don't match",
  });

export const testEmailSchema = z.object({ to: emailSchema });

export const changeEmailSchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.confirmPassword !== d.newPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "The new passwords don't match" });
    }
    if (d.newPassword && d.newPassword === d.currentPassword) {
      ctx.addIssue({ code: "custom", path: ["newPassword"], message: "Choose a password different from your current one" });
    }
  });

export const userLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const newHouseholdSchema = z.object({
  displayName: z.string().trim().min(1, "Household name is required").max(100, "Household names can be at most 100 characters"),
  mailingAddress: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export const requestSyncSchema = z.object({
  contactId: z.string().min(1, "Choose a contact"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export const conversationNameSchema = z.object({
  name: z.string().trim().min(1, "Give the channel a name").max(100, "Names can be at most 100 characters"),
});

export const messageSchema = z.object({
  text: z.string().trim().min(1, "Write a message first").max(MAX_MESSAGE_LENGTH, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters`),
});

export const MAX_MEAL_DESCRIPTION = 20000;

/** A meal in the library: a name, and a long free-text description (a place to paste a whole recipe). */
export const mealSchema = z.object({
  name: z.string().trim().min(1, "Give the meal a name").max(120, "Names can be at most 120 characters"),
  description: z
    .string()
    .max(MAX_MEAL_DESCRIPTION, `The description can be at most ${MAX_MEAL_DESCRIPTION.toLocaleString("en-US")} characters`)
    .nullish()
    // Text is kept exactly as pasted (line breaks and indentation); only an empty or blank one becomes null.
    .transform((v) => (v && v.trim() ? v : null)),
});

const MEAL_SLOTS = ["BREAKFAST", "LUNCH", "DINNER"] as const;
const planDate = z.string().refine(isDateString, "Choose a valid date");
const planSlot = z.enum(MEAL_SLOTS, "Choose breakfast, lunch or dinner");

/** A meal on the plan: a calendar date and slot, and either a library meal or a one-off text, never both. */
export const planEntrySchema = z
  .object({
    date: planDate,
    slot: planSlot,
    mealId: z.string().min(1).nullish(),
    text: z.string().trim().max(120, "One-off entries can be at most 120 characters").nullish(),
  })
  .refine((v) => Boolean(v.mealId) !== Boolean(v.text), "Choose a meal or type a one-off, not both")
  .transform((v) => ({ date: v.date, slot: v.slot, mealId: v.mealId || null, text: v.mealId ? null : (v.text as string) }));

export const planPositionSchema = z.object({ date: planDate, slot: planSlot });

export const mealPlanSettingsSchema = z.object({
  weekStartsOn: z.enum(["SUNDAY", "MONDAY"]).optional(),
  showBreakfast: z.boolean().optional(),
  showLunch: z.boolean().optional(),
  showDinner: z.boolean().optional(),
});
