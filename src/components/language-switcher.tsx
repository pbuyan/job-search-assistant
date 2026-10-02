"use client";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const names = { en: "English", fr: "Français" } as const; // each language in its own language

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Select
      items={routing.locales.map((l) => ({ value: l, label: names[l] }))}
      value={locale}
      onValueChange={(next) =>
        router.replace(pathname, { locale: next as Locale })
      }
    >
      <SelectTrigger className="w-36" aria-label={t("language")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>
            {names[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
