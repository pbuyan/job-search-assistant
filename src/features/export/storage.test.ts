// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { TailoredResume } from "@/db/schema";

// ---- @vercel/blob ----
const put = vi.fn(async () => ({}));
const del = vi.fn(async () => {});
const list = vi.fn();
const get = vi.fn();
vi.mock("@vercel/blob", () => ({
  put: (...a: unknown[]) => put(...(a as [])),
  del: (...a: unknown[]) => del(...(a as [])),
  list: (...a: unknown[]) => list(...a),
  get: (...a: unknown[]) => get(...a),
}));

let userId: string | null = "user-1";
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId }) }));

const data: TailoredResume = {
  basics: { name: "Ada" },
  work: [
    {
      sourceWorkId: "w1",
      company: "Acme",
      position: "Engineer",
      startDate: "2019-03",
      bullets: [{ sourceBulletId: "b1", text: "Shipped things." }],
    },
  ],
  skills: [],
};
type Version = {
  name: string;
  language: string;
  data: TailoredResume;
  exportedFileKey: string | null;
};
const getResumeVersion = vi.fn(async (): Promise<Version | null> => ({
  name: "Acme – Engineer",
  language: "en",
  data,
  exportedFileKey: null,
}));
const setExportedFileKey = vi.fn(async () => true);
vi.mock("@/db/queries/resume-versions", () => ({
  getResumeVersion: (...a: unknown[]) => getResumeVersion(...(a as [])),
  setExportedFileKey: (...a: unknown[]) => setExportedFileKey(...(a as [])),
}));

const getSourceFileKey = vi.fn(async (): Promise<string | null> => null);
const setSourceFileKey = vi.fn(async () => true);
vi.mock("@/db/queries/profile", () => ({
  getSourceFileKey: (...a: unknown[]) => getSourceFileKey(...(a as [])),
  setSourceFileKey: (...a: unknown[]) => setSourceFileKey(...(a as [])),
}));

const VERSION = "11111111-1111-4111-8111-111111111111";
const streamOf = (text: string) =>
  new Response(text).body as ReadableStream<Uint8Array>;

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  userId = "user-1";
  for (const fn of [
    put,
    del,
    list,
    get,
    getResumeVersion,
    setExportedFileKey,
    getSourceFileKey,
    setSourceFileKey,
  ])
    fn.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("storage", () => {
  it("keeps files private, under the user's folder, without file names", async () => {
    const { putPrivate, storageKeys } = await import("@/lib/storage");
    expect(storageKeys.profileSource("user-1", "pdf")).toBe(
      "users/user-1/profile/source.pdf",
    );
    expect(storageKeys.sentResume("user-1", VERSION)).toBe(
      `users/user-1/resumes/${VERSION}/sent.pdf`,
    );
    await putPrivate(
      "users/user-1/x.pdf",
      new Uint8Array([1]),
      "application/pdf",
    );
    expect(put).toHaveBeenCalledWith(
      "users/user-1/x.pdf",
      expect.any(Buffer),
      expect.objectContaining({ access: "private", addRandomSuffix: false }),
    );
  });

  it("deletes every page of blobs under a prefix", async () => {
    const { deleteByPrefix } = await import("@/lib/storage");
    list
      .mockResolvedValueOnce({
        blobs: [{ url: "u1" }, { url: "u2" }],
        hasMore: true,
        cursor: "c",
      })
      .mockResolvedValueOnce({ blobs: [{ url: "u3" }], hasMore: false });
    await deleteByPrefix("users/user-1/");
    expect(list).toHaveBeenNthCalledWith(1, {
      prefix: "users/user-1/",
      cursor: undefined,
    });
    expect(list).toHaveBeenNthCalledWith(2, {
      prefix: "users/user-1/",
      cursor: "c",
    });
    expect(del).toHaveBeenCalledWith(["u1", "u2"]);
    expect(del).toHaveBeenCalledWith(["u3"]);
  });
});

describe("snapshotSentResume", () => {
  // The PDF renderer's first import is slow under a parallel suite.
  beforeAll(async () => {
    await import("./snapshot");
  }, 30_000);

  it("stores the PDF once and records its key", async () => {
    const { snapshotSentResume } = await import("./snapshot");
    expect(await snapshotSentResume("user-1", VERSION)).toBe("stored");
    const key = `users/user-1/resumes/${VERSION}/sent.pdf`;
    expect(put).toHaveBeenCalledWith(
      key,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(setExportedFileKey).toHaveBeenCalledWith("user-1", VERSION, key);
  });

  it("keeps an existing snapshot, and is off without storage", async () => {
    const { snapshotSentResume } = await import("./snapshot");
    getResumeVersion.mockResolvedValueOnce({
      name: "x",
      language: "en",
      data,
      exportedFileKey: "users/user-1/resumes/old/sent.pdf",
    });
    expect(await snapshotSentResume("user-1", VERSION)).toBe("skipped");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(await snapshotSentResume("user-1", VERSION)).toBe("skipped");
    expect(put).not.toHaveBeenCalled();
  });

  it("never throws when storage fails", async () => {
    const { snapshotSentResume } = await import("./snapshot");
    vi.spyOn(console, "error").mockImplementation(() => {});
    put.mockRejectedValueOnce(new Error("down"));
    expect(await snapshotSentResume("user-1", VERSION)).toBe("failed");
    expect(setExportedFileKey).not.toHaveBeenCalled();
  });
});

describe("file routes", () => {
  const upload = (bytes: string) => {
    const body = new FormData();
    body.set("file", new File([bytes], "Ada Lovelace resume.pdf"));
    return new Request("http://localhost/api/profile/source-file", {
      method: "POST",
      body,
    });
  };

  it("keeps an uploaded PDF under its sniffed type, not its name", async () => {
    const { POST } = await import("@/app/api/profile/source-file/route");
    const res = await POST(upload("%PDF-1.7 content"));
    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledWith(
      "users/user-1/profile/source.pdf",
      expect.any(Buffer),
      expect.objectContaining({
        access: "private",
        contentType: "application/pdf",
      }),
    );
    expect(setSourceFileKey).toHaveBeenCalledWith(
      "user-1",
      "users/user-1/profile/source.pdf",
    );
  });

  it("replaces a kept file of the other type, and refuses unknown types", async () => {
    const { POST } = await import("@/app/api/profile/source-file/route");
    getSourceFileKey.mockResolvedValueOnce("users/user-1/profile/source.docx");
    expect((await POST(upload("%PDF-1.7"))).status).toBe(200);
    expect(del).toHaveBeenCalledWith("users/user-1/profile/source.docx");
    expect((await POST(upload("plain text"))).status).toBe(415);
  });

  it("removes the file again when there is no profile to attach it to", async () => {
    const { POST } = await import("@/app/api/profile/source-file/route");
    setSourceFileKey.mockResolvedValueOnce(false);
    expect((await POST(upload("%PDF-1.7"))).status).toBe(404);
    expect(del).toHaveBeenCalledWith("users/user-1/profile/source.pdf");
  });

  it("needs a session and storage", async () => {
    const { POST, GET } = await import("@/app/api/profile/source-file/route");
    userId = null;
    expect((await POST(upload("%PDF-1.7"))).status).toBe(401);
    expect((await GET()).status).toBe(401);
    userId = "user-1";
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect((await POST(upload("%PDF-1.7"))).status).toBe(503);
    expect(put).not.toHaveBeenCalled();
  });

  it("streams the kept file only to its owner", async () => {
    const { GET } = await import("@/app/api/profile/source-file/route");
    expect((await GET()).status).toBe(404);
    getSourceFileKey.mockResolvedValueOnce("users/user-1/profile/source.docx");
    get.mockResolvedValueOnce({
      stream: streamOf("doc"),
      blob: { contentType: "x" },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="resume.docx"',
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).toBe("doc");
    expect(get).toHaveBeenCalledWith(
      "users/user-1/profile/source.docx",
      expect.objectContaining({ access: "private" }),
    );
  });

  it("streams a sent resume only for the user's own version", async () => {
    const { GET } = await import("@/app/api/resumes/[id]/sent-file/route");
    const call = (id: string) =>
      GET(new Request("http://localhost/"), {
        params: Promise.resolve({ id }),
      });

    getResumeVersion.mockResolvedValueOnce(null);
    expect((await call(VERSION)).status).toBe(404);
    expect(getResumeVersion).toHaveBeenCalledWith("user-1", VERSION);
    expect(get).not.toHaveBeenCalled();
    expect((await call("nope")).status).toBe(400);

    getResumeVersion.mockResolvedValueOnce({
      name: "Acme – Engineer",
      language: "en",
      data,
      exportedFileKey: `users/user-1/resumes/${VERSION}/sent.pdf`,
    });
    get.mockResolvedValueOnce({
      stream: streamOf("pdf"),
      blob: { contentType: "application/pdf" },
    });
    const res = await call(VERSION);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(await res.text()).toBe("pdf");
  });
});
