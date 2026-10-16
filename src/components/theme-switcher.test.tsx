import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSwitcher } from "@/components/theme-switcher";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const setTheme = vi.hoisted(() => vi.fn());
const theme = vi.hoisted(() => ({ current: "system" }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: theme.current, setTheme }),
}));

function renderSwitcher(locale: "en" | "fr" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr}>
      <ThemeSwitcher />
    </NextIntlClientProvider>,
  );
}

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    setTheme.mockReset();
    theme.current = "system";
  });

  it("checks the stored theme, labelled in the user's language", async () => {
    const user = userEvent.setup();
    theme.current = "dark";
    renderSwitcher("fr");
    await user.click(screen.getByRole("button", { name: "Thème" }));
    expect(
      await screen.findByRole("menuitemradio", { name: "Sombre" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Clair" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("sets the chosen theme", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole("button", { name: "Theme" }));
    for (const label of ["System", "Light", "Dark"]) {
      expect(
        await screen.findByRole("menuitemradio", { name: label }),
      ).toBeInTheDocument();
    }
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("opens from the keyboard", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.tab();
    expect(screen.getByRole("button", { name: "Theme" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });
});
