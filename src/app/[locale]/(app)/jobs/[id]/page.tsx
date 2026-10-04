import { auth } from "@clerk/nextjs/server";
import { ExternalLink } from "lucide-react";
import { hasLocale } from "next-intl";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AnalyzeButton } from "@/components/jobs/analyze-button";
import { TrackJobButton } from "@/components/tracker/track-job-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApplicationForJob } from "@/db/queries/applications";
import { getJob } from "@/db/queries/jobs";
import { getLatestMatch } from "@/db/queries/matches";
import { getProfile } from "@/db/queries/profile";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { languageName } from "@/lib/language-name";
import { profileBullets } from "@/prompts/fit-analysis";

// The analysis runs as a Server Action from this page.
export const maxDuration = 120;

const kindOf = (requirementId: string) =>
  requirementId.startsWith("must:") ? "must" : "nice";

export default async function JobPage({
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

  const [job, match, profile, application, t, tTracker, format] =
    await Promise.all([
      getJob(userId, id),
      getLatestMatch(userId, id),
      getProfile(userId),
      getApplicationForJob(userId, id),
      getTranslations("Jobs.detail"),
      getTranslations("Tracker"),
      getFormatter(),
    ]);
  if (!job) notFound();

  // Evidence is shown as the cited bullet text from the *current* profile; a
  // bullet deleted since the analysis is flagged rather than hidden.
  const bullets = new Map(
    profile ? profileBullets(profile.data).map((b) => [b.id, b]) : [],
  );
  const gaps = match
    ? [...match.analysis.gaps].sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === "major" ? -1 : 1,
      )
    : [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-start text-2xl font-semibold">
          {job.title || t("untitled")}
        </h1>
        <p className="text-start text-muted-foreground">
          {[job.company, job.location].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {job.remote !== "unknown" ? (
            <Badge variant="secondary">{t(`remote.${job.remote}`)}</Badge>
          ) : null}
          {job.language ? (
            <Badge variant="outline">
              {t("postingLanguage", {
                language: languageName(job.language, locale),
              })}
            </Badge>
          ) : null}
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
            >
              {t("viewPosting")}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {application ? (
            <p className="text-start text-sm">
              {tTracker("track.tracked", {
                status: tTracker(`status.${application.status}`),
              })}{" "}
              <Link href="/tracker" className="underline underline-offset-4">
                {tTracker("track.open")}
              </Link>
            </p>
          ) : (
            <TrackJobButton jobId={job.id} />
          )}
        </div>
      </header>

      {match ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("fit")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-start">
                <span className="text-4xl font-semibold tabular-nums">
                  {match.score}
                </span>
                <span className="text-muted-foreground"> / 100</span>
              </p>
              <p className="text-start">{match.analysis.summary}</p>
              <p className="text-start text-sm text-muted-foreground">
                {t("scoreExplained")}
              </p>
              {match.analysisLanguage !== locale ? (
                <p className="text-start text-sm text-muted-foreground">
                  {t("otherLanguage", {
                    language: languageName(match.analysisLanguage, locale),
                  })}
                </p>
              ) : null}
              <p className="text-start text-xs text-muted-foreground">
                {t("analyzedAt", {
                  date: format.dateTime(match.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
              </p>
              <AnalyzeButton jobId={job.id} rerun />
            </CardContent>
          </Card>

          <section
            aria-labelledby="matched-heading"
            className="flex flex-col gap-3"
          >
            <h2
              id="matched-heading"
              className="text-start text-lg font-semibold"
            >
              {t("matched", { count: match.analysis.matched.length })}
            </h2>
            {match.analysis.matched.length === 0 ? (
              <p className="text-start text-sm text-muted-foreground">
                {t("noneMatched")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {match.analysis.matched.map((m) => (
                  <li key={m.requirementId} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-start font-medium">{m.requirement}</p>
                      <Badge variant="outline">
                        {t(`kind.${kindOf(m.requirementId)}`)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-start text-xs font-medium text-muted-foreground uppercase">
                      {t("evidence")}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1.5 border-s-2 ps-3">
                      {m.evidenceBulletIds.map((bulletId) => {
                        const bullet = bullets.get(bulletId);
                        return (
                          <li key={bulletId} className="text-start text-sm">
                            {bullet ? (
                              <>
                                {bullet.text}{" "}
                                <span className="text-muted-foreground">
                                  — {bullet.context}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground italic">
                                {t("sourceRemoved")}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="gaps-heading"
            className="flex flex-col gap-3"
          >
            <h2 id="gaps-heading" className="text-start text-lg font-semibold">
              {t("gaps", { count: gaps.length })}
            </h2>
            {gaps.length === 0 ? (
              <p className="text-start text-sm text-muted-foreground">
                {t("noGaps")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {gaps.map((g) => (
                  <li key={g.requirementId} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-start font-medium">{g.requirement}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant={
                            g.severity === "major" ? "destructive" : "secondary"
                          }
                        >
                          {t(`severity.${g.severity}`)}
                        </Badge>
                        <Badge variant="outline">
                          {t(`kind.${kindOf(g.requirementId)}`)}
                        </Badge>
                      </div>
                    </div>
                    {g.suggestion ? (
                      <p className="mt-2 text-start text-sm text-muted-foreground">
                        {g.suggestion}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {match.analysis.keywordsToEmphasize.length > 0 ? (
            <section
              aria-labelledby="keywords-heading"
              className="flex flex-col gap-2"
            >
              <h2
                id="keywords-heading"
                className="text-start text-lg font-semibold"
              >
                {t("keywords")}
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {match.analysis.keywordsToEmphasize.map((k) => (
                  <li key={k}>
                    <Badge variant="secondary">{k}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("fit")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-start text-sm text-muted-foreground">
              {t("notAnalyzed")}
            </p>
            <AnalyzeButton jobId={job.id} />
          </CardContent>
        </Card>
      )}

      {job.requirements ? (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-start font-medium">
            {t("requirementsTitle")}
          </summary>
          <p className="mt-2 text-start text-sm text-muted-foreground">
            {t("requirementsHint")}
          </p>
          {(["mustHave", "niceToHave"] as const).map((key) =>
            job.requirements![key].length > 0 ? (
              <div key={key} className="mt-3">
                <p className="text-start text-sm font-medium">
                  {t(`requirementGroups.${key}`)}
                </p>
                <ul className="mt-1 list-disc ps-5 text-start text-sm">
                  {job.requirements![key].map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </details>
      ) : null}
    </div>
  );
}
