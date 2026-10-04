import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";

// First path segment if it is a supported locale, else the default.
export function localeFromPathname(pathname: string): Locale {
  const segment = pathname.split("/")[1];
  return hasLocale(routing.locales, segment) ? segment : routing.defaultLocale;
}

export function signInPath(pathname: string, search = ""): string {
  const locale = localeFromPathname(pathname);
  const redirect = encodeURIComponent(pathname + search);
  return `/${locale}/sign-in?redirect_url=${redirect}`;
}
