import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { ProfileForm } from "@/components/profile/profile-form";
import { buttonVariants } from "@/components/ui/button";
import { getProfile } from "@/db/queries/profile";
import { RESUME_LANGUAGES, type ProfileSaveInput } from "@/features/profile/schemas";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";

const emptyProfile: ProfileSaveInput = {
  // Resume language is its own setting; a new profile starts at the default
  // resume language, not the UI locale.
  language: "en",
  data: { basics: { name: "" }, work: [], education: [], skills: [] },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "profile", path: "/profile" });
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });

  const t = await getTranslations("Profile");
  const stored = await getProfile(userId);
  const language = RESUME_LANGUAGES.find((l) => l === stored?.language) ?? "en";
  const initial: ProfileSaveInput = stored
    ? {
        language,
        data: { ...stored.data, education: stored.data.education ?? [] },
      }
    : emptyProfile;

  return (
    <>
      <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
      <p className="text-start text-muted-foreground">{t("description")}</p>
      {stored ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-start text-sm">{t("export.title")}</span>
          {/* File downloads from a route handler, so plain links. */}
          {(["pdf", "docx"] as const).map((format) => (
            <a
              key={format}
              href={`/api/profile/export?format=${format}`}
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Download aria-hidden />
              {t(`export.${format}`)}
            </a>
          ))}
        </div>
      ) : null}
      <ProfileForm initial={initial} />
    </>
  );
}
