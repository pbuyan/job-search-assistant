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

  it("shows the stored theme in the user's language", () => {
    theme.current = "dark";
    renderSwitcher("fr");
    expect(screen.getByRole("combobox", { name: "Thème" })).toHaveTextContent("Sombre");
  });

  it("sets the chosen theme", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole("combobox", { name: "Theme" }));
    for (const label of ["System", "Light", "Dark"]) {
      expect(await screen.findByRole("option", { name: label })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("option", { name: "Light" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });
});
