import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { ImportPostingButton } from "@/components/jobs/import-posting-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importedJobIds } from "@/db/queries/jobs";
import { getMatchingState } from "@/db/queries/profile";
import { listBoard, parseBoardUrl } from "@/features/jobs/boards";
import { matchesPreferences } from "@/features/jobs/boards/filter";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";

// Importing a posting (board API, extraction, indexing) runs as a Server
// Action from this page.
export const maxDuration = 120;

// Long boards are cut here; the user can narrow with preferences.
const MAX_ROWS = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "boards", path: "/jobs/boards" });
}

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function BoardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });

  const query = await searchParams;
  const url = first(query.url)?.trim().slice(0, 2048) ?? "";
  const showAll = first(query.all) === "1";
  const [t, format, matching] = await Promise.all([
    getTranslations("Jobs.boards"),
    getFormatter(),
    getMatchingState(userId),
  ]);

  const ref = url ? parseBoardUrl(url) : null;
  const listing = ref ? await listBoard(ref) : null;
  const prefs = {
    targetTitles: matching?.targetTitles ?? [],
    targetLocations: matching?.targetLocations ?? [],
  };
  const hasPrefs =
    prefs.targetTitles.length > 0 || prefs.targetLocations.length > 0;
  const all = listing?.ok ? listing.postings : [];
  const shown = (
    showAll || !hasPrefs ? all : all.filter((p) => matchesPreferences(p, prefs))
  ).slice(0, MAX_ROWS);
  const imported =
    ref && shown.length > 0
      ? await importedJobIds(
          userId,
          ref.provider,
          shown.map((p) => p.externalId),
        )
      : new Map<string, string>();
  const toggleHref = `/jobs/boards?${new URLSearchParams({
    url,
    ...(showAll ? {} : { all: "1" }),
  })}`;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
      <p className="text-start text-muted-foreground">{t("description")}</p>
      {/* A plain GET form: the board URL is in the address bar, so a board
          can be bookmarked and the page works without JavaScript. */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
          <Label htmlFor="board-url">{t("urlLabel")}</Label>
          <Input
            id="board-url"
            name="url"
            type="url"
            inputMode="url"
            required
            defaultValue={url}
            placeholder="https://jobs.lever.co/company"
          />
        </div>
        <Button type="submit">{t("submit")}</Button>
      </form>
      <p className="text-start text-xs text-muted-foreground">{t("privacy")}</p>

      {url && !ref ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t("errors.unsupported")}
        </p>
      ) : null}
      {listing && !listing.ok ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${listing.error}`)}
        </p>
      ) : null}

      {ref && listing?.ok ? (
        <section
          aria-labelledby="board-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="board-heading" className="text-start text-lg font-semibold">
              {listing.company ?? ref.board}
            </h2>
            <Badge variant="outline">{t(`providers.${ref.provider}`)}</Badge>
          </div>
          <p className="text-start text-sm text-muted-foreground">
            {hasPrefs && !showAll
              ? t("countFiltered", { shown: shown.length, total: all.length })
              : t("count", { total: all.length })}{" "}
            {hasPrefs ? (
              <Link href={toggleHref} className="underline underline-offset-4">
                {showAll ? t("showMatching") : t("showAll")}
              </Link>
            ) : (
              <Link href="/profile" className="underline underline-offset-4">
                {t("setPreferences")}
              </Link>
            )}
          </p>
          {shown.length === 0 ? (
            <p className="text-start text-sm text-muted-foreground">
              {t("none")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {shown.map((p) => {
                const jobId = imported.get(p.externalId);
                return (
                  <li
                    key={p.externalId}
                    className="flex items-start justify-between gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1 text-start">
                      <p className="font-medium wrap-break-word">{p.title}</p>
                      <p className="text-sm wrap-break-word text-muted-foreground">
                        {[
                          p.location,
                          p.remote ? t(`remote.${p.remote}`) : null,
                          p.postedAt
                            ? t("posted", {
                                date: format.dateTime(p.postedAt, {
                                  dateStyle: "medium",
                                }),
                              })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {jobId ? (
                      <Link
                        href={`/jobs/${jobId}`}
                        className="text-sm underline underline-offset-4"
                      >
                        {t("imported")}
                      </Link>
                    ) : (
                      <ImportPostingButton url={p.url} title={p.title} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {all.length > MAX_ROWS && shown.length === MAX_ROWS ? (
            <p className="text-start text-xs text-muted-foreground">
              {t("truncated", { max: MAX_ROWS })}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
