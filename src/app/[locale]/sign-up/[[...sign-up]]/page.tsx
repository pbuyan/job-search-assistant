import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
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
  return pageMetadata({ locale, page: "signUp", path: "/sign-up" });
}

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <AuthShell>
      <SignUp
        appearance={clerkAppearance}
        path={`/${locale}/sign-up`}
        signInUrl={`/${locale}/sign-in`}
        forceRedirectUrl={`/${locale}/auth/callback`}
      />
    </AuthShell>
  );
}
