// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TailoredResume } from "@/db/schema";

let userId: string | null = "user-1";
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId }) }));

const data: TailoredResume = {
  basics: { name: "Hélène Côté" },
  work: [
    {
      sourceWorkId: "w1",
      company: "Acme",
      position: "Développeuse",
      startDate: "2019-03",
      bullets: [{ sourceBulletId: "b1", text: "A livré des choses." }],
    },
  ],
  skills: [],
};
const getResumeVersion = vi.fn(
  async (): Promise<{
    name: string;
    language: string;
    data: TailoredResume;
  } | null> => ({
    name: "Acme – Développeuse",
    language: "fr",
    data,
  }),
);
vi.mock("@/db/queries/resume-versions", () => ({
  getResumeVersion: (...args: unknown[]) => getResumeVersion(...(args as [])),
}));

const ID = "11111111-1111-4111-8111-111111111111";
const call = async (id: string, format: string | null) => {
  const { GET } = await import("@/app/api/resumes/[id]/export/route");
  const url = `http://localhost/api/resumes/${id}/export${format ? `?format=${format}` : ""}`;
  return GET(new Request(url), { params: Promise.resolve({ id }) });
};

describe("GET /api/resumes/:id/export", () => {
  beforeEach(() => {
    userId = "user-1";
    getResumeVersion.mockClear();
  });

  it("requires a signed-in user", async () => {
    userId = null;
    const res = await call(ID, "pdf");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(getResumeVersion).not.toHaveBeenCalled();
  });

  it("rejects a bad id or format", async () => {
    expect((await call("nope", "pdf")).status).toBe(400);
    expect((await call(ID, "exe")).status).toBe(400);
    expect((await call(ID, null)).status).toBe(400);
  });

  it("is a 404 when the version isn't the user's", async () => {
    getResumeVersion.mockResolvedValueOnce(null);
    expect((await call(ID, "docx")).status).toBe(404);
    expect(getResumeVersion).toHaveBeenCalledWith("user-1", ID);
  });

  it("returns an uncached attachment named after the version", async () => {
    const res = await call(ID, "pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-disposition")).toContain(
      'filename="Acme - Developpeuse.pdf"',
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  });
});
