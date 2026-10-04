import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/components/profile/profile-form";
import messages from "../../../messages/en.json";
import { normalizeProfile } from "./normalize";
import { profileSaveSchema, type ProfileSaveInput } from "./schemas";

const saveProfile = vi.hoisted(() => vi.fn());
vi.mock("@/features/profile/actions", () => ({ saveProfile }));

const initial: ProfileSaveInput = {
  language: "fr",
  data: {
    basics: { name: "Ada Lovelace" },
    work: [
      {
        id: "work-id-0001",
        company: "Analytical Engines",
        position: "Programmer",
        startDate: "2020-01",
        bullets: [{ id: "bullet-id-0001", text: "Wrote the first program", skills: ["math"] }],
      },
    ],
    education: [],
    skills: [{ category: "Languages", items: ["Python"] }],
    certifications: [{ name: "Kept untouched" }],
  },
};

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProfileForm initial={initial} />
    </NextIntlClientProvider>,
  );
}

describe("normalizeProfile", () => {
  it("keeps valid ids and mints missing ones", () => {
    const out = normalizeProfile({
      ...initial.data,
      work: [
        {
          ...initial.data.work[0],
          id: "",
          bullets: [
            { id: "bullet-id-0001", text: " kept " },
            { id: "", text: "new" },
          ],
        },
      ],
    });
    expect(out.work[0].id).toMatch(/^[\w-]{8,64}$/);
    expect(out.work[0].bullets[0]).toMatchObject({ id: "bullet-id-0001", text: "kept" });
    expect(out.work[0].bullets[1].id).toMatch(/^[\w-]{8,64}$/);
    expect(out.work[0].bullets[1].id).not.toBe("bullet-id-0001");
  });
});

describe("profileSaveSchema", () => {
  it("requires name, job fields and bullet text", () => {
    const bad = structuredClone(initial);
    bad.data.basics.name = " ";
    bad.data.work[0].company = "";
    bad.data.work[0].bullets[0].text = "";
    const paths = profileSaveSchema.safeParse(bad).error?.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(
      expect.arrayContaining([
        "data.basics.name",
        "data.work.0.company",
        "data.work.0.bullets.0.text",
      ]),
    );
  });

  it("rejects duplicate bullet ids", () => {
    const dup = structuredClone(initial);
    dup.data.work[0].bullets.push({ id: "bullet-id-0001", text: "again" });
    const messages = profileSaveSchema.safeParse(dup).error?.issues.map((i) => i.message);
    expect(messages).toContain("duplicateId");
  });

  it("rejects an unknown resume language", () => {
    expect(profileSaveSchema.safeParse({ ...initial, language: "de" }).success).toBe(false);
  });
});

describe("ProfileForm", () => {
  beforeEach(() => {
    saveProfile.mockReset();
    saveProfile.mockImplementation(async (input: ProfileSaveInput) => ({ ok: true, ...input }));
  });

  it("keeps a bullet's id when its text is edited and gives new bullets their own", async () => {
    const user = userEvent.setup();
    renderForm();

    const first = screen.getByLabelText("Achievement 1");
    await user.clear(first);
    await user.type(first, "Edited text");
    await user.click(screen.getByRole("button", { name: "Add achievement" }));
    await user.type(screen.getByLabelText("Achievement 2"), "Brand new");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as ProfileSaveInput;
    const [edited, added] = sent.data.work[0].bullets;
    expect(edited).toMatchObject({ id: "bullet-id-0001", text: "Edited text", skills: ["math"] });
    expect(added.text).toBe("Brand new");
    expect(added.id).toMatch(/^[\w-]{8,64}$/);
    expect(added.id).not.toBe(edited.id);
    // Fields without inputs are carried through, not dropped.
    expect(sent.data.certifications).toEqual([{ name: "Kept untouched" }]);
    expect(sent.data.work[0].id).toBe("work-id-0001");
    expect(sent.language).toBe("fr");
  });

  it("shows translated validation errors and does not call the action", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.clear(screen.getByLabelText("Full name"));
    await user.type(screen.getByLabelText("Full name"), "x");
    await user.clear(screen.getByLabelText("Full name"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(saveProfile).not.toHaveBeenCalled();
  });
});
