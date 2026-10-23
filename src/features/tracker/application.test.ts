// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applicationDetailsSchema,
  contactSchema,
  dayToTimestamp,
  eventSchema,
  isoDate,
  timestampToDay,
} from "./schemas";

let userId: string | null = "user-1";
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId }) }));

const updateApplication = vi.fn(
  async (): Promise<"ok" | "notFound" | "invalidResume"> => "ok",
);
const addEvent = vi.fn(async () => true);
const deleteEvent = vi.fn(async () => true);
const deleteApplication = vi.fn(async () => true);
vi.mock("@/db/queries/applications", () => ({
  updateApplication: (...a: unknown[]) => updateApplication(...(a as [])),
  addEvent: (...a: unknown[]) => addEvent(...(a as [])),
  deleteEvent: (...a: unknown[]) => deleteEvent(...(a as [])),
  deleteApplication: (...a: unknown[]) => deleteApplication(...(a as [])),
  moveApplication: vi.fn(),
  trackJob: vi.fn(),
}));
const addContact = vi.fn(async () => true);
vi.mock("@/db/queries/contacts", () => ({
  addContact: (...a: unknown[]) => addContact(...(a as [])),
  deleteContact: vi.fn(async () => false),
}));

const snapshotSentResume = vi.fn(async () => "stored" as const);
vi.mock("@/features/export/snapshot", () => ({
  snapshotSentResume: (...a: unknown[]) => snapshotSentResume(...(a as [])),
}));

const ID = "11111111-1111-4111-8111-111111111111";

describe("schemas", () => {
  it("accepts only real calendar days", () => {
    expect(isoDate.safeParse("2026-02-28").success).toBe(true);
    expect(isoDate.safeParse("2026-02-30").success).toBe(false);
    expect(isoDate.safeParse("2026-2-3").success).toBe(false);
  });

  it("turns empty fields into null and trims text", () => {
    expect(
      applicationDetailsSchema.parse({
        appliedOn: "",
        nextStep: "  Phone screen ",
        nextStepDue: "2026-11-05",
        resumeVersionId: "",
        notes: " ",
        coverLetter: "",
      }),
    ).toEqual({
      appliedOn: null,
      nextStep: "Phone screen",
      nextStepDue: "2026-11-05",
      resumeVersionId: null,
      notes: null,
      coverLetter: null,
    });
  });

  it("rejects hand-made status changes and bad contact links", () => {
    expect(
      eventSchema.safeParse({ type: "status_change", occurredOn: "2026-11-01" })
        .success,
    ).toBe(false);
    expect(
      contactSchema.safeParse({
        name: "Sam",
        linkedinUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      contactSchema.safeParse({ name: "Sam", email: "not-an-email" }).success,
    ).toBe(false);
    expect(contactSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(
      contactSchema.parse({
        name: "Sam",
        linkedinUrl: "https://www.linkedin.com/in/sam",
      }),
    ).toMatchObject({ name: "Sam", email: null });
  });

  it("stores a day at UTC noon and reads it back unchanged", () => {
    expect(dayToTimestamp("2026-11-05").toISOString()).toBe(
      "2026-11-05T12:00:00.000Z",
    );
    expect(timestampToDay(dayToTimestamp("2026-11-05"))).toBe("2026-11-05");
  });
});

describe("application actions", () => {
  beforeEach(() => {
    userId = "user-1";
    updateApplication.mockClear();
    addEvent.mockClear();
  });

  it("requires a signed-in user and valid input before touching the database", async () => {
    const { saveApplicationDetails, addApplicationEvent } =
      await import("./actions");
    userId = null;
    expect(await saveApplicationDetails({ id: ID })).toEqual({
      ok: false,
      error: "unauthorized",
    });
    userId = "user-1";
    expect(
      await addApplicationEvent({
        applicationId: ID,
        type: "note",
        occurredOn: "2026-13-01",
      }),
    ).toEqual({ ok: false, error: "invalid" });
    expect(updateApplication).not.toHaveBeenCalled();
    expect(addEvent).not.toHaveBeenCalled();
  });

  it("passes the user and parsed values through, and maps query outcomes", async () => {
    const { saveApplicationDetails, deleteApplicationContact } =
      await import("./actions");
    const details = {
      appliedOn: "2026-10-20",
      nextStep: "",
      nextStepDue: "",
      resumeVersionId: ID,
      notes: "",
      coverLetter: "",
    };
    expect(await saveApplicationDetails({ id: ID, ...details })).toEqual({
      ok: true,
    });
    expect(updateApplication).toHaveBeenCalledWith("user-1", ID, {
      appliedOn: "2026-10-20",
      nextStep: null,
      nextStepDue: null,
      resumeVersionId: ID,
      notes: null,
      coverLetter: null,
    });
    // The attached version is now what was sent: keep its PDF.
    expect(snapshotSentResume).toHaveBeenCalledWith("user-1", ID);

    snapshotSentResume.mockClear();
    updateApplication.mockResolvedValueOnce("invalidResume");
    expect(await saveApplicationDetails({ id: ID, ...details })).toEqual({
      ok: false,
      error: "invalidResume",
    });
    expect(snapshotSentResume).not.toHaveBeenCalled();
    // A row that isn't the user's looks the same as a missing one.
    expect(await deleteApplicationContact(ID)).toEqual({
      ok: false,
      error: "notFound",
    });
  });

  it("records the model and prompt version only for a letter from an AI draft", async () => {
    const { saveApplicationDetails } = await import("./actions");
    const details = { id: ID, coverLetter: "Dear team" };
    await saveApplicationDetails({ ...details, coverLetterFromDraft: true });
    expect(updateApplication).toHaveBeenLastCalledWith(
      "user-1",
      ID,
      expect.objectContaining({ coverLetter: "Dear team" }),
      { model: "claude-opus-5-5", promptVersion: "cover-letter@1" },
    );
    await saveApplicationDetails(details);
    expect(updateApplication.mock.lastCall).toHaveLength(3);
  });

  it("reports a database failure as a code", async () => {
    const { stopTracking } = await import("./actions");
    deleteApplication.mockRejectedValueOnce(new Error("connection reset"));
    expect(await stopTracking(ID)).toEqual({ ok: false, error: "failed" });
  });
});
