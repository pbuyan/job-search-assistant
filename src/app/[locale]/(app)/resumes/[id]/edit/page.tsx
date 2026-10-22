import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EditResume } from "@/components/resumes/edit-resume";
import { getProfile } from "@/db/queries/profile";
import { getResumeVersion } from "@/db/queries/resume-versions";
import { planFromResume, toDraft } from "@/features/tailoring/draft";
import { validateTailoringStructure } from "@/features/tailoring/validate-tailoring";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "resumes", path: `/resumes/${id}/edit` });
}

export default async function EditResumePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });
  if (!z.uuid().safeParse(id).success) notFound();

  const [version, profile, t] = await Promise.all([
    getResumeVersion(userId, id),
    getProfile(userId),
    getTranslations("Resumes.edit"),
  ]);
  if (!version) notFound();
  // Locked versions are only duplicated, from their own page.
  if (version.locked) return redirect({ href: `/resumes/${id}`, locale });

  // Stale: the version cites achievements the profile no longer has, so it
  // couldn't be saved again.
  const plan = profile ? planFromResume(version.data, profile.data) : null;
  const editable =
    profile &&
    plan &&
    validateTailoringStructure(plan, profile.data).length === 0
      ? { profile: profile.data, draft: toDraft(plan) }
      : null;

  return (
    <>
      <h1 className="text-start text-2xl font-semibold">
        {t("title", { name: version.name })}
      </h1>
      {editable ? (
        <EditResume
          id={id}
          profile={editable.profile}
          initialDraft={editable.draft}
        />
      ) : (
        <p className="max-w-3xl text-start text-sm">
          {t("stale")}{" "}
          <Link
            href={`/resumes/${id}`}
            className="underline underline-offset-4"
          >
            {t("cancel")}
          </Link>
        </p>
      )}
    </>
  );
}
