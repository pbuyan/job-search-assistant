"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themes = [
  { value: "system", labelKey: "themeSystem", Icon: MonitorIcon },
  { value: "light", labelKey: "themeLight", Icon: SunIcon },
  { value: "dark", labelKey: "themeDark", Icon: MoonIcon },
] as const;

const noopSubscribe = () => () => {};

export function ThemeSwitcher() {
  const t = useTranslations("Common");
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render no selection on the
  // server and first client pass so hydration matches.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const current = mounted ? themes.find((th) => th.value === theme) : undefined;
  const TriggerIcon = current?.Icon ?? MonitorIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!mounted}
        render={<Button variant="ghost" size="icon" aria-label={t("theme")} />}
      >
        <TriggerIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-36">
        <DropdownMenuRadioGroup
          value={current?.value ?? ""}
          onValueChange={(next: string) => setTheme(next)}
        >
          {themes.map(({ value, labelKey, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden />
              {t(labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
