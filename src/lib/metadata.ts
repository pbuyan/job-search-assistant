import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

export type MetaPage =
  | "landing"
  | "signIn"
  | "signUp"
  | "dashboard"
  | "profile"
  | "jobs"
  | "newJob"
  | "tracker"
  | "resumes"
  | "tailor"
  | "application"
  | "boards";

const ogLocales: Record<Locale, string> = { en: "en_CA", fr: "fr_CA" };

// Same path in every locale, e.g. "/jobs" -> { en: "/en/jobs", fr: "/fr/jobs" }.
function languageAlternates(path: string) {
  return Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}${path === "/" ? "" : path}`]),
  );
}

// Localized title/description plus Open Graph and hreflang alternates. The
// title goes through the layout's "%s | {appName}" template unless `absolute`.
export async function pageMetadata({
  locale,
  page,
  path,
  absolute = false,
}: {
  locale: Locale;
  page: MetaPage;
  path: string;
  absolute?: boolean;
}): Promise<Metadata> {
  const [t, tc] = await Promise.all([
    getTranslations({ locale, namespace: "Meta" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);
  const title = t(`${page}.title`);
  const description = t(`${page}.description`);
  const languages = languageAlternates(path);
  return {
    title: absolute ? { absolute: title } : title,
    description,
    openGraph: {
      title: absolute ? title : `${title} | ${tc("appName")}`,
      description,
      locale: ogLocales[locale],
      alternateLocale: routing.locales
        .filter((l) => l !== locale)
        .map((l) => ogLocales[l]),
      siteName: tc("appName"),
      type: "website",
    },
    alternates: { canonical: languages[locale], languages },
  };
}
