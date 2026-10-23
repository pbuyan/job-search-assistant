import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import {
  MatchingRetry,
  PreferencesForm,
} from "@/components/profile/preferences-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMatchingState,
  getProfile,
  getSourceFileKey,
} from "@/db/queries/profile";
import { CURRENCIES } from "@/features/matching/schemas";
import { RESUME_LANGUAGES, type ProfileSaveInput } from "@/features/profile/schemas";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";

// Saving re-embeds the profile for job matching, which can wait out a short
// rate limit (see src/lib/ai/embeddings.ts).
export const maxDuration = 60;

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
  const [stored, matching, sourceFileKey] = await Promise.all([
    getProfile(userId),
    getMatchingState(userId),
    getSourceFileKey(userId),
  ]);
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
          {sourceFileKey ? (
            <a
              href="/api/profile/source-file"
              download
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <Download aria-hidden />
              {t("export.original")}
            </a>
          ) : null}
        </div>
      ) : null}
      <p className="text-start text-sm text-muted-foreground">
        {t("matching.privacy")}
      </p>
      {matching && !matching.embedded ? <MatchingRetry /> : null}
      <ProfileForm initial={initial} />
      <Card className="mt-6 max-w-3xl">
        <CardHeader>
          <CardTitle>{t("preferences.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {matching ? (
            <PreferencesForm
              initial={{
                targetTitles: matching.targetTitles,
                targetLocations: matching.targetLocations,
                remotePreference: matching.remotePreference,
                minSalary: matching.minSalary,
                salaryCurrency:
                  CURRENCIES.find((c) => c === matching.salaryCurrency) ?? "CAD",
              }}
            />
          ) : (
            <p className="text-start text-sm text-muted-foreground">
              {t("preferences.saveProfileFirst")}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
