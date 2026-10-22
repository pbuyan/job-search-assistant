// Zod schemas for the application page's forms, shared by the forms and the
// Server Actions (which re-validate everything). Kept free of server imports.
import { z } from "zod";

// A calendar day as YYYY-MM-DD that actually exists (no 2026-02-30).
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  });

// Empty or omitted form fields mean "not set".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) =>
      v === undefined || (typeof v === "string" && v.trim() === "") ? null : v,
    schema.nullable(),
  );

const text = (max: number) => z.string().trim().max(max);

export const applicationDetailsSchema = z.object({
  appliedOn: optional(isoDate),
  nextStep: optional(text(200)),
  nextStepDue: optional(isoDate),
  resumeVersionId: optional(z.uuid()),
  notes: optional(text(10_000)),
  coverLetter: optional(text(20_000)),
});
export type ApplicationDetails = z.infer<typeof applicationDetailsSchema>;

// status_change events are written by the board, never by hand.
export const USER_EVENT_TYPES = [
  "note",
  "interview",
  "email",
  "follow_up",
  "offer",
] as const;
export type UserEventType = (typeof USER_EVENT_TYPES)[number];

export const eventSchema = z.object({
  type: z.enum(USER_EVENT_TYPES),
  occurredOn: isoDate,
  title: optional(text(200)),
  body: optional(text(5_000)),
});
export type EventInput = z.infer<typeof eventSchema>;

export const contactSchema = z.object({
  name: text(120).min(1),
  role: optional(text(120)),
  email: optional(z.email().max(254)),
  linkedinUrl: optional(z.url({ protocol: /^https?$/ }).max(500)),
  notes: optional(text(2_000)),
});
export type ContactInput = z.infer<typeof contactSchema>;

// A calendar day stored in a timestamptz column (applied_at, occurred_at) is
// kept at UTC noon, so formatting it in any time zone within ±12h shows the
// same day. Render these with timeZone: "UTC".
export const dayToTimestamp = (day: string) => new Date(`${day}T12:00:00Z`);
export const timestampToDay = (date: Date) => date.toISOString().slice(0, 10);
