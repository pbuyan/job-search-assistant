"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ResumeEditor } from "@/components/resumes/resume-editor";
import { Button } from "@/components/ui/button";
import type { ProfileData } from "@/db/schema";
import {
  saveResumeEdits,
  type SaveResumeEditsError,
} from "@/features/tailoring/actions";
import {
  hasEmptyBullet,
  hasNoBullets,
  toPlan,
  type Draft,
} from "@/features/tailoring/draft";
import { Link, useRouter } from "@/i18n/navigation";

type EditError = SaveResumeEditsError | "emptyBullet" | "noBullets";

export function EditResume({
  id,
  profile,
  initialDraft,
}: {
  id: string;
  profile: ProfileData;
  initialDraft: Draft;
}) {
  const t = useTranslations("Resumes.edit");
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<EditError | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    if (hasEmptyBullet(draft)) return setError("emptyBullet");
    if (hasNoBullets(draft)) return setError("noBullets");
    setError(null);
    startSaving(async () => {
      const result = await saveResumeEdits({
        id,
        plan: toPlan(draft, profile),
      });
      if (result.ok) {
        router.push(`/resumes/${id}`);
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ResumeEditor profile={profile} draft={draft} onChange={setDraft} />
      <div className="flex flex-col gap-3 border-t pt-4">
        {error ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t(`errors.${error}`)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
          <Link
            href={`/resumes/${id}`}
            className="inline-flex items-center px-2 text-sm underline underline-offset-4"
          >
            {t("cancel")}
          </Link>
        </div>
      </div>
    </div>
  );
}
