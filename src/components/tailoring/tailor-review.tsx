"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/profile/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileData } from "@/db/schema";
import {
  proposeTailoring,
  saveResumeVersion,
  type ProposeTailoringError,
  type SaveResumeVersionError,
} from "@/features/tailoring/actions";
import {
  hasEmptyBullet,
  masterEntries,
  toDraft,
  toPlan,
  type Draft,
  type MasterEntry,
} from "@/features/tailoring/draft";
import { Link, useRouter } from "@/i18n/navigation";

type TailorError =
  | ProposeTailoringError
  | SaveResumeVersionError
  | "emptyBullet"
  | "noBullets";

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
  const entries = masterEntries(profile);

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
    if (hasEmptyBullet(draft)) {
      setError("emptyBullet");
      return;
    }
    if (Object.values(draft.entries).every((bullets) => bullets.length === 0)) {
      setError("noBullets");
      return;
    }
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

  const update = (fn: (d: Draft) => Draft) =>
    setDraft((d) => (d ? fn(d) : d));

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
              <p role="status" className="text-start text-sm text-muted-foreground">
                {t("generatingHint")}
              </p>
            ) : null}
          </div>
          {errorMessage}
        </CardContent>
      </Card>
    );
  }

  const groups = (["work", "projects"] as const).map((group) => ({
    group,
    included: entries.filter((e) => e.group === group && e.key in draft.entries),
    left: entries.filter((e) => e.group === group && !(e.key in draft.entries)),
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-start text-sm text-muted-foreground">{t("reviewHint")}</p>

      {draft.summary !== undefined && profile.basics.summary ? (
        <section aria-labelledby="summary-heading" className="flex flex-col gap-2">
          <h2 id="summary-heading" className="text-start text-lg font-semibold">
            {t("summary")}
          </h2>
          <Textarea
            aria-label={t("summary")}
            value={draft.summary}
            onChange={(e) => update((d) => ({ ...d, summary: e.target.value }))}
          />
          <Original text={profile.basics.summary} />
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                update((d) => ({ ...d, summary: profile.basics.summary }))
              }
            >
              {t("useOriginal")}
            </Button>
          </div>
        </section>
      ) : null}

      {groups.map(({ group, included, left }) =>
        included.length > 0 || left.length > 0 ? (
          <section
            key={group}
            aria-labelledby={`${group}-heading`}
            className="flex flex-col gap-4"
          >
            <h2 id={`${group}-heading`} className="text-start text-lg font-semibold">
              {t(`groups.${group}`)}
            </h2>
            {included.map((entry) => (
              <EntryEditor
                key={entry.key}
                entry={entry}
                bullets={draft.entries[entry.key]}
                onChange={(bullets) =>
                  update((d) => ({
                    ...d,
                    entries: { ...d.entries, [entry.key]: bullets },
                  }))
                }
                onExclude={() =>
                  update((d) => {
                    const rest = { ...d.entries };
                    delete rest[entry.key];
                    return { ...d, entries: rest };
                  })
                }
              />
            ))}
            {left.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4">
                <p className="text-start text-sm font-medium">{t("leftOut")}</p>
                <ul className="flex flex-col gap-2">
                  {left.map((entry) => (
                    <li
                      key={entry.key}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-start text-sm">
                        {entry.title}
                        {entry.company ? ` · ${entry.company}` : ""}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update((d) => ({
                            ...d,
                            entries: { ...d.entries, [entry.key]: [] },
                          }))
                        }
                      >
                        {t("include")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null,
      )}

      {draft.skills.length > 0 ? (
        <section aria-labelledby="skills-heading" className="flex flex-col gap-2">
          <h2 id="skills-heading" className="text-start text-lg font-semibold">
            {t("skills")}
          </h2>
          <ul className="flex flex-col gap-2">
            {draft.skills.map((s) => (
              <li key={s.category} className="flex flex-wrap items-center gap-1.5">
                <span className="text-start text-sm font-medium">{s.category}:</span>
                {s.items.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 border-t pt-4">
        <Field label={t("name")}>
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        {errorMessage}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={saving || !name.trim()}>
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

function Original({ text }: { text: string }) {
  const t = useTranslations("Resumes.tailor");
  return (
    <p className="text-start text-xs text-muted-foreground">
      <span className="font-medium">{t("original")}</span> {text}
    </p>
  );
}

function EntryEditor({
  entry,
  bullets,
  onChange,
  onExclude,
}: {
  entry: MasterEntry;
  bullets: Draft["entries"][string];
  onChange: (bullets: Draft["entries"][string]) => void;
  onExclude: () => void;
}) {
  const t = useTranslations("Resumes.tailor");
  const originals = new Map(entry.bullets.map((b) => [b.id, b.text]));
  const used = new Set(bullets.map((b) => b.sourceBulletId));
  const unused = entry.bullets.filter((b) => !used.has(b.id));

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-start font-medium">{entry.title}</p>
          {entry.company || entry.startDate ? (
            <p className="text-start text-sm text-muted-foreground">
              {[
                entry.company,
                entry.startDate
                  ? `${entry.startDate} – ${entry.endDate ?? t("present")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onExclude}>
          {t("exclude")}
        </Button>
      </div>

      <ul className="flex flex-col gap-4">
        {bullets.map((b, i) => (
          <li key={b.sourceBulletId} className="flex flex-col gap-1.5">
            <Textarea
              aria-label={t("bulletN", { n: i + 1, entry: entry.title })}
              value={b.text}
              onChange={(e) =>
                onChange(
                  bullets.map((x) =>
                    x.sourceBulletId === b.sourceBulletId
                      ? { ...x, text: e.target.value }
                      : x,
                  ),
                )
              }
            />
            <Original text={originals.get(b.sourceBulletId) ?? ""} />
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={b.text === originals.get(b.sourceBulletId)}
                onClick={() =>
                  onChange(
                    bullets.map((x) =>
                      x.sourceBulletId === b.sourceBulletId
                        ? { ...x, text: originals.get(b.sourceBulletId) ?? x.text }
                        : x,
                    ),
                  )
                }
              >
                {t("useOriginal")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange(bullets.filter((x) => x.sourceBulletId !== b.sourceBulletId))
                }
              >
                {t("remove")}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {unused.length > 0 ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-start text-sm font-medium">{t("notIncluded")}</p>
          <ul className="flex flex-col gap-2">
            {unused.map((b) => (
              <li key={b.id} className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 flex-1 text-start text-sm text-muted-foreground">
                  {b.text}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onChange([...bullets, { sourceBulletId: b.id, text: b.text }])
                  }
                >
                  {t("add")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
