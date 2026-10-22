"use client";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileData } from "@/db/schema";
import {
  masterEntries,
  type Draft,
  type MasterEntry,
} from "@/features/tailoring/draft";

// Controlled editor for a resume draft: every bullet shows its master
// original and can be reworded, reverted, removed or re-added. Positions and
// projects can be left out or brought back. Used by the tailoring review and
// by editing a saved version; each owns saving.
export function ResumeEditor({
  profile,
  draft,
  onChange,
}: {
  profile: ProfileData;
  draft: Draft;
  onChange: (fn: (d: Draft) => Draft) => void;
}) {
  const t = useTranslations("Resumes.editor");
  const entries = masterEntries(profile);
  const groups = (["work", "projects"] as const).map((group) => ({
    group,
    included: entries.filter(
      (e) => e.group === group && e.key in draft.entries,
    ),
    left: entries.filter((e) => e.group === group && !(e.key in draft.entries)),
  }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-start text-sm text-muted-foreground">{t("hint")}</p>

      {draft.summary !== undefined && profile.basics.summary ? (
        <section
          aria-labelledby="summary-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="summary-heading" className="text-start text-lg font-semibold">
            {t("summary")}
          </h2>
          <Textarea
            aria-label={t("summary")}
            value={draft.summary}
            onChange={(e) => {
              const summary = e.target.value;
              onChange((d) => ({ ...d, summary }));
            }}
          />
          <Original text={profile.basics.summary} />
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={draft.summary === profile.basics.summary}
              onClick={() =>
                onChange((d) => ({ ...d, summary: profile.basics.summary }))
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
            <h2
              id={`${group}-heading`}
              className="text-start text-lg font-semibold"
            >
              {t(`groups.${group}`)}
            </h2>
            {included.map((entry) => (
              <EntryEditor
                key={entry.key}
                entry={entry}
                bullets={draft.entries[entry.key]}
                onChange={(bullets) =>
                  onChange((d) => ({
                    ...d,
                    entries: { ...d.entries, [entry.key]: bullets },
                  }))
                }
                onExclude={() =>
                  onChange((d) => {
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
                          onChange((d) => ({
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
        <section
          aria-labelledby="skills-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="skills-heading" className="text-start text-lg font-semibold">
            {t("skills")}
          </h2>
          <ul className="flex flex-col gap-2">
            {draft.skills.map((s) => (
              <li
                key={s.category}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="text-start text-sm font-medium">
                  {s.category}:
                </span>
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
    </div>
  );
}

function Original({ text }: { text: string | undefined }) {
  const t = useTranslations("Resumes.editor");
  return (
    <p className="text-start text-xs text-muted-foreground">
      <span className="font-medium">{t("original")}</span>{" "}
      {text ?? <span className="italic">{t("sourceRemoved")}</span>}
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
  const t = useTranslations("Resumes.editor");
  const originals = new Map(entry.bullets.map((b) => [b.id, b.text]));
  const used = new Set(bullets.map((b) => b.sourceBulletId));
  const unused = entry.bullets.filter((b) => !used.has(b.id));
  const setText = (id: string, text: string) =>
    onChange(
      bullets.map((x) => (x.sourceBulletId === id ? { ...x, text } : x)),
    );

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
        {bullets.map((b, i) => {
          const original = originals.get(b.sourceBulletId);
          return (
            <li key={b.sourceBulletId} className="flex flex-col gap-1.5">
              <Textarea
                aria-label={t("bulletN", { n: i + 1, entry: entry.title })}
                value={b.text}
                onChange={(e) => setText(b.sourceBulletId, e.target.value)}
              />
              <Original text={original} />
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={original === undefined || b.text === original}
                  onClick={() =>
                    original !== undefined &&
                    setText(b.sourceBulletId, original)
                  }
                >
                  {t("useOriginal")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange(
                      bullets.filter(
                        (x) => x.sourceBulletId !== b.sourceBulletId,
                      ),
                    )
                  }
                >
                  {t("remove")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {unused.length > 0 ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-start text-sm font-medium">{t("notIncluded")}</p>
          <ul className="flex flex-col gap-2">
            {unused.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-start justify-between gap-2"
              >
                <span className="min-w-0 flex-1 text-start text-sm text-muted-foreground">
                  {b.text}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onChange([
                      ...bullets,
                      { sourceBulletId: b.id, text: b.text },
                    ])
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
