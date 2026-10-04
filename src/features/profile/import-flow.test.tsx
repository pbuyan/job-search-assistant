import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/components/profile/profile-form";
import messages from "../../../messages/en.json";
import type { ProfileSaveInput } from "./schemas";

const saveProfile = vi.hoisted(() => vi.fn());
vi.mock("@/features/profile/actions", () => ({ saveProfile }));

const saved: ProfileSaveInput = {
  language: "en",
  data: {
    basics: { name: "Ada Lovelace", email: "ada@example.com" },
    work: [
      {
        id: "work-id-0001",
        company: "Analytical Engines",
        position: "Programmer",
        startDate: "2020-01",
        bullets: [{ id: "bullet-id-0001", text: "Wrote the first program" }],
      },
    ],
    education: [],
    skills: [],
  },
};

// What the API route returns: French content, fresh ids.
const proposal = {
  ok: true,
  language: "fr",
  promptVersion: "parse-resume@1",
  data: {
    basics: { name: "Marie Tremblay", email: "marie@example.com" },
    work: [
      {
        id: "fresh-work-0001",
        company: "Boréale Inc.",
        position: "Développeuse senior",
        startDate: "2020-01",
        bullets: [
          { id: "fresh-bullet-0001", text: "Conçu une API de facturation" },
          { id: "fresh-bullet-0002", text: "Réduit le temps de déploiement" },
        ],
      },
    ],
    education: [],
    skills: [],
  },
};

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProfileForm initial={saved} />
    </NextIntlClientProvider>,
  );
}

async function importResume(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });
  await user.upload(screen.getByLabelText(/Resume file/), file);
  await user.click(screen.getByRole("button", { name: "Import" }));
}

describe("resume import review", () => {
  beforeEach(() => {
    saveProfile.mockReset();
    saveProfile.mockImplementation(async (input: ProfileSaveInput) => ({ ok: true, ...input }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(proposal)),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads the proposal into the form without saving anything", async () => {
    const user = userEvent.setup();
    renderForm();
    await importResume(user);

    expect(await screen.findByText("Review the imported resume")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Marie Tremblay");
    expect(screen.getByLabelText("Company")).toHaveValue("Boréale Inc.");
    expect(screen.getByLabelText("Achievement 2")).toHaveValue("Réduit le temps de déploiement");
    // Detected language is applied and shown as a consequence the user can see.
    expect(screen.getByText(/Detected language: French/)).toBeInTheDocument();
    expect(screen.getByText("Achievements: 1 → 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and save imported profile" })).toBeEnabled();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("discard restores exactly what was there before", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(screen.getByLabelText("Full name"));
    await user.type(screen.getByLabelText("Full name"), "Unsaved edit");
    await importResume(user);
    await screen.findByText("Review the imported resume");

    await user.click(screen.getByRole("button", { name: "Discard import" }));
    expect(screen.queryByText("Review the imported resume")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Unsaved edit");
    expect(screen.getByLabelText("Company")).toHaveValue("Analytical Engines");
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("saves the reviewed values, with the fresh ids, only after confirming", async () => {
    const user = userEvent.setup();
    renderForm();
    await importResume(user);
    await screen.findByText("Review the imported resume");

    // The user can still correct the proposal before confirming.
    await user.clear(screen.getByLabelText("Full name"));
    await user.type(screen.getByLabelText("Full name"), "Marie T.");
    await user.click(screen.getByRole("button", { name: "Confirm and save imported profile" }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as ProfileSaveInput;
    expect(sent.language).toBe("fr");
    expect(sent.data.basics.name).toBe("Marie T.");
    expect(sent.data.work[0].bullets.map((b) => b.id)).toEqual([
      "fresh-bullet-0001",
      "fresh-bullet-0002",
    ]);
    await waitFor(() =>
      expect(screen.queryByText("Review the imported resume")).not.toBeInTheDocument(),
    );
  });

  it("shows a translated error and leaves the form alone when parsing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, error: "noText" }, { status: 422 })),
    );
    const user = userEvent.setup();
    renderForm();
    await importResume(user);

    expect(await screen.findByText(/Scanned resumes are not supported/)).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.queryByText("Review the imported resume")).not.toBeInTheDocument();
  });
});
