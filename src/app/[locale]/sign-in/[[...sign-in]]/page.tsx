import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";
import { clerkAppearance } from "@/lib/clerk-appearance";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "signIn", path: "/sign-in" });
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <AuthShell>
      <SignIn
        appearance={clerkAppearance}
        path={`/${locale}/sign-in`}
        signUpUrl={`/${locale}/sign-up`}
        forceRedirectUrl={`/${locale}/auth/callback`}
      />
    </AuthShell>
  );
}
