"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/profile/field";
import { ResumeEditor } from "@/components/resumes/resume-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ProfileData } from "@/db/schema";
import {
  proposeTailoring,
  saveResumeVersion,
  type ProposeTailoringError,
  type SaveResumeVersionError,
} from "@/features/tailoring/actions";
import {
  hasEmptyBullet,
  hasNoBullets,
  toDraft,
  toPlan,
  type Draft,
} from "@/features/tailoring/draft";
import { Link, useRouter } from "@/i18n/navigation";

type TailorError =
  ProposeTailoringError | SaveResumeVersionError | "emptyBullet" | "noBullets";

export function TailorReview({
  jobId,
  defaultName,
  profile,
}: {
  jobId: string;
  defaultName: string;
  profile: ProfileData;
}) {
  const t = useTranslations("Resumes.tailor");
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<TailorError | null>(null);
  const [generating, startGenerating] = useTransition();
  const [saving, startSaving] = useTransition();

  function generate() {
    setError(null);
    startGenerating(async () => {
      const result = await proposeTailoring(jobId);
      if (result.ok) setDraft(toDraft(result.plan));
      else setError(result.error);
    });
  }

  function save() {
    if (!draft) return;
    if (hasEmptyBullet(draft)) return setError("emptyBullet");
    if (hasNoBullets(draft)) return setError("noBullets");
    setError(null);
    startSaving(async () => {
      const result = await saveResumeVersion({
        jobId,
        name,
        plan: toPlan(draft, profile),
      });
      if (result.ok) router.push(`/resumes/${result.id}`);
      else setError(result.error);
    });
  }

  const errorMessage = error ? (
    <p role="alert" className="text-start text-sm text-destructive">
      {t(`errors.${error}`)}{" "}
      {error === "noProfile" ? (
        <Link href="/profile" className="underline underline-offset-4">
          {t("goToProfile")}
        </Link>
      ) : null}
    </p>
  ) : null;

  if (!draft) {
    return (
      <Card className="max-w-3xl">
        <CardContent className="flex flex-col gap-3">
          <p className="text-start text-sm text-muted-foreground">
            {t("privacy")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={generate} disabled={generating}>
              {generating ? t("generating") : t("generate")}
            </Button>
            {generating ? (
              <p
                role="status"
                className="text-start text-sm text-muted-foreground"
              >
                {t("generatingHint")}
              </p>
            ) : null}
          </div>
          {errorMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ResumeEditor
        profile={profile}
        draft={draft}
        onChange={(fn) => setDraft((d) => (d ? fn(d) : d))}
      />
      <div className="flex flex-col gap-3 border-t pt-4">
        <Field label={t("name")}>
          <Input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {errorMessage}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
          >
            {saving ? t("saving") : t("save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={generate}
            disabled={generating || saving}
          >
            {generating ? t("generating") : t("regenerate")}
          </Button>
          <Link
            href={`/jobs/${jobId}`}
            className="inline-flex items-center px-2 text-sm underline underline-offset-4"
          >
            {t("discard")}
          </Link>
        </div>
      </div>
    </div>
  );
}
