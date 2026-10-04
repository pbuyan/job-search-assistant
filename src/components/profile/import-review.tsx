"use client";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { COUNTED_SECTIONS, type ProfileDiff } from "@/features/profile/diff";
import { languageName } from "@/lib/language-name";

type Props = {
  diff: ProfileDiff;
  /** ISO 639-1 code the model detected. */
  detected: string;
  /** The detected language is a supported resume language and was applied. */
  languageApplied: boolean;
  previousLanguage: string;
  onDiscard: () => void;
};

// Shown while an imported proposal is loaded in the form but unsaved. It says
// what accepting would change; the full values are in the form below.
export function ImportReview({
  diff,
  detected,
  languageApplied,
  previousLanguage,
  onDiscard,
}: Props) {
  const t = useTranslations("Profile.import.review");
  const tp = useTranslations("Profile");
  const format = useFormatter();
  const locale = useLocale();
  const detectedName = languageName(detected, locale);

  return (
    <section
      aria-labelledby="import-review-title"
      className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-muted/40 p-4"
    >
      <h2
        id="import-review-title"
        className="text-start text-base font-semibold"
      >
        {t("title")}
      </h2>
      <p role="status" className="text-start text-sm">
        {t("body")}
      </p>

      <p className="text-start text-sm">
        {languageApplied
          ? t("languageApplied", { language: detectedName })
          : t("languageUnsupported", {
              language: detectedName,
              current: languageName(previousLanguage, locale),
            })}
      </p>

      {diff.replacesExisting ? (
        <div className="text-start text-sm">
          <p className="font-medium">{t("replaces")}</p>
          <ul className="mt-1 list-disc ps-5">
            {diff.changedBasics.length > 0 ? (
              <li>
                {t("basicsChanged", {
                  fields: format.list(
                    diff.changedBasics.map((f) => tp(`basicsFields.${f}`)),
                    {
                      type: "conjunction",
                    },
                  ),
                })}
              </li>
            ) : null}
            {COUNTED_SECTIONS.filter(
              (s) => diff.counts[s].before !== diff.counts[s].after,
            ).map((s) => (
              <li key={s}>
                {t("countChanged", {
                  section: t(`sections.${s}`),
                  before: diff.counts[s].before,
                  after: diff.counts[s].after,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-start text-sm text-muted-foreground">
          {t("nothingReplaced")}
        </p>
      )}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={onDiscard}>
          {t("discard")}
        </Button>
      </div>
    </section>
  );
}
