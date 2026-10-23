// @vitest-environment node
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "./actions";

let userId: string | null = "user-1";
const deleteUser = vi.fn(async () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  clerkClient: async () => ({ users: { deleteUser } }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) =>
    key === "confirmWord" ? "DELETE" : key,
}));

const deleteUserData = vi.fn(async () => {});
vi.mock("@/db/queries/users", () => ({
  deleteUserData: (...a: unknown[]) => deleteUserData(...(a as [])),
}));

let storage = false;
const deleteByPrefix = vi.fn(async () => {});
vi.mock("@/lib/storage", () => ({
  storageEnabled: () => storage,
  storageKeys: { userPrefix: (id: string) => `users/${id}/` },
  deleteByPrefix: (...a: unknown[]) => deleteByPrefix(...(a as [])),
}));

const verifyWebhook = vi.fn();
vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: (...a: unknown[]) => verifyWebhook(...a),
}));

beforeEach(() => {
  userId = "user-1";
  storage = false;
  deleteUser.mockClear();
  deleteUserData.mockClear();
  deleteByPrefix.mockClear();
  verifyWebhook.mockReset();
});

describe("eraseUserData", () => {
  it("deletes the user's files before their rows, and keeps the rows if that fails", async () => {
    const { eraseUserData } = await import("./erase");
    storage = true;
    await eraseUserData("user-1");
    expect(deleteByPrefix).toHaveBeenCalledWith("users/user-1/");
    expect(deleteByPrefix.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUserData.mock.invocationCallOrder[0],
    );

    deleteUserData.mockClear();
    deleteByPrefix.mockRejectedValueOnce(new Error("blob down"));
    await expect(eraseUserData("user-1")).rejects.toThrow();
    expect(deleteUserData).not.toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  it("deletes the data, then the Clerk user, once the word is typed", async () => {
    expect(await deleteAccount({ confirm: " delete " })).toEqual({ ok: true });
    expect(deleteUserData).toHaveBeenCalledWith("user-1");
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(deleteUserData.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0],
    );
  });

  it("deletes nothing without the confirmation word or a session", async () => {
    expect(await deleteAccount({ confirm: "yes" })).toEqual({
      ok: false,
      error: "notConfirmed",
    });
    expect(await deleteAccount({})).toEqual({
      ok: false,
      error: "notConfirmed",
    });
    userId = null;
    expect(await deleteAccount({ confirm: "DELETE" })).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(deleteUserData).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports a failure without deleting the Clerk user when the data delete fails", async () => {
    deleteUserData.mockRejectedValueOnce(new Error("db down"));
    expect(await deleteAccount({ confirm: "DELETE" })).toEqual({
      ok: false,
      error: "failed",
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe("Clerk webhook", () => {
  const req = {} as NextRequest;

  it("deletes the user's data on user.deleted", async () => {
    const { POST } = await import("@/app/api/webhooks/clerk/route");
    verifyWebhook.mockResolvedValueOnce({
      type: "user.deleted",
      data: { id: "user-9" },
    });
    expect((await POST(req)).status).toBe(204);
    expect(deleteUserData).toHaveBeenCalledWith("user-9");
  });

  it("ignores other events and rejects bad signatures", async () => {
    const { POST } = await import("@/app/api/webhooks/clerk/route");
    verifyWebhook.mockResolvedValueOnce({
      type: "user.updated",
      data: { id: "user-9" },
    });
    expect((await POST(req)).status).toBe(204);
    verifyWebhook.mockRejectedValueOnce(new Error("bad signature"));
    expect((await POST(req)).status).toBe(400);
    expect(deleteUserData).not.toHaveBeenCalled();
  });

  it("asks Clerk to retry when the delete fails", async () => {
    const { POST } = await import("@/app/api/webhooks/clerk/route");
    verifyWebhook.mockResolvedValueOnce({
      type: "user.deleted",
      data: { id: "user-9" },
    });
    deleteUserData.mockRejectedValueOnce(new Error("db down"));
    expect((await POST(req)).status).toBe(500);
  });
});
