import { auth, currentUser } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import { NextResponse } from "next/server";
import { upsertUser } from "@/db/queries/users";
import { routing } from "@/i18n/routing";

// Post-sign-in landing: upsert the user (first sign-in stores the URL locale),
// then send them to their *saved* locale.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: urlLocale } = await params;
  const locale = hasLocale(routing.locales, urlLocale)
    ? urlLocale
    : routing.defaultLocale;

  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!userId || !user || !email) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, req.url));
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  const saved = await upsertUser({ id: userId, email, name, locale });
  const target = hasLocale(routing.locales, saved) ? saved : locale;
  return NextResponse.redirect(new URL(`/${target}/dashboard`, req.url));
}
