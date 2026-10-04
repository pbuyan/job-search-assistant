"use client";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const themes = [
  { value: "system", labelKey: "themeSystem", Icon: MonitorIcon },
  { value: "light", labelKey: "themeLight", Icon: SunIcon },
  { value: "dark", labelKey: "themeDark", Icon: MoonIcon },
] as const;

type Theme = (typeof themes)[number]["value"];

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

  return (
    <Select
      items={themes.map((th) => ({ value: th.value, label: t(th.labelKey) }))}
      value={current?.value ?? null}
      disabled={!mounted}
      onValueChange={(next) => {
        if (next) setTheme(next as Theme);
      }}
    >
      <SelectTrigger className="w-full" aria-label={t("theme")}>
        <SelectValue>
          {() =>
            current ? (
              <>
                <current.Icon aria-hidden />
                {t(current.labelKey)}
              </>
            ) : (
              t("theme")
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {themes.map(({ value, labelKey, Icon }) => (
          <SelectItem key={value} value={value}>
            <Icon aria-hidden />
            {t(labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
