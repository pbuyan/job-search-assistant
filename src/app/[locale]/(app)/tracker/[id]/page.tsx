import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  AddContactForm,
  AddEventForm,
  DetailsForm,
  RemoveButton,
  StatusSelect,
  StopTrackingButton,
} from "@/components/tracker/application-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApplication, listEvents } from "@/db/queries/applications";
import { listContacts } from "@/db/queries/contacts";
import { listResumeVersions } from "@/db/queries/resume-versions";
import { isoDay } from "@/features/dashboard/summary";
import { timestampToDay } from "@/features/tracker/schemas";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { languageName } from "@/lib/language-name";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "application", path: `/tracker/${id}` });
}

// Day-only values (applied date, timeline dates) are shown in UTC; see
// dayToTimestamp in src/features/tracker/schemas.ts.
const DAY = { dateStyle: "medium", timeZone: "UTC" } as const;

export default async function ApplicationPage({
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

  const [app, events, contacts, versions, t, tTracker, format] =
    await Promise.all([
      getApplication(userId, id),
      listEvents(userId, id),
      listContacts(userId, id),
      listResumeVersions(userId),
      getTranslations("Tracker.application"),
      getTranslations("Tracker"),
      getFormatter(),
    ]);
  if (!app) notFound();
  const title = app.jobTitle || tTracker("card.untitled");

  // Versions tailored for this job first, then the rest, newest first.
  const versionOptions = [...versions]
    .sort(
      (a, b) => Number(b.jobId === app.jobId) - Number(a.jobId === app.jobId),
    )
    .map((v) => ({
      id: v.id,
      label: `${v.name} · ${languageName(v.language, locale)}`,
    }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-start text-sm text-muted-foreground">
            {app.jobCompany || tTracker("card.noCompany")}
          </p>
          <h1 className="text-start text-2xl font-semibold">{title}</h1>
          <p className="text-start text-sm">
            <Link
              href={`/jobs/${app.jobId}`}
              className="underline underline-offset-4"
            >
              {t("viewJob")}
            </Link>
            {" · "}
            <Link href="/tracker" className="underline underline-offset-4">
              {t("backToTracker")}
            </Link>
          </p>
        </div>
        <StatusSelect applicationId={app.id} status={app.status} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("details")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {app.resumeVersionId && app.resumeVersionName ? (
            <p className="text-start text-sm">
              {t.rich("sentResume", {
                name: app.resumeVersionName,
                link: (chunks) => (
                  <Link
                    href={`/resumes/${app.resumeVersionId}`}
                    className="underline underline-offset-4"
                  >
                    {chunks}
                  </Link>
                ),
              })}
              {app.hasSentFile ? (
                <>
                  {" · "}
                  {/* Streams from a route handler, so a plain link. */}
                  <a
                    href={`/api/resumes/${app.resumeVersionId}/sent-file`}
                    download
                    className="underline underline-offset-4"
                  >
                    {t("sentFile")}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
          <DetailsForm
            applicationId={app.id}
            versions={versionOptions}
            initial={{
              appliedOn: app.appliedAt ? timestampToDay(app.appliedAt) : "",
              nextStep: app.nextStep ?? "",
              nextStepDue: app.nextStepDue ?? "",
              resumeVersionId: app.resumeVersionId ?? "",
              notes: app.notes ?? "",
              coverLetter: app.coverLetter ?? "",
            }}
          />
        </CardContent>
      </Card>

      <section
        aria-labelledby="timeline-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="timeline-heading" className="text-start text-lg font-semibold">
          {t("timeline")}
        </h2>
        <AddEventForm applicationId={app.id} today={isoDay(new Date())} />
        <ol className="flex flex-col gap-3 border-s-2 ps-4">
          {events.map((e) => {
            const date = format.dateTime(e.occurredAt, DAY);
            const label =
              e.type === "status_change"
                ? e.fromStatus
                  ? t("moved", {
                      status: tTracker(`status.${e.toStatus ?? "saved"}`),
                    })
                  : t("tracked", {
                      status: tTracker(`status.${e.toStatus ?? "saved"}`),
                    })
                : t(`eventTypes.${e.type}`);
            return (
              <li key={e.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-start text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground"> · {date}</span>
                  </p>
                  {e.title ? (
                    <p className="text-start text-sm wrap-break-word">
                      {e.title}
                    </p>
                  ) : null}
                  {e.body ? (
                    <p className="text-start text-sm wrap-break-word whitespace-pre-line text-muted-foreground">
                      {e.body}
                    </p>
                  ) : null}
                </div>
                {e.type !== "status_change" ? (
                  <RemoveButton
                    kind="event"
                    id={e.id}
                    label={t("removeEvent", { label, date })}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section
        aria-labelledby="contacts-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="contacts-heading" className="text-start text-lg font-semibold">
          {t("contacts")}
        </h2>
        {contacts.length === 0 ? (
          <p className="text-start text-sm text-muted-foreground">
            {t("noContacts")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0 flex-1 text-start text-sm">
                  <p className="font-medium wrap-break-word">
                    {c.name}
                    {c.role ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {c.role}
                      </span>
                    ) : null}
                  </p>
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="wrap-break-word underline underline-offset-4"
                    >
                      {c.email}
                    </a>
                  ) : null}
                  {c.linkedinUrl ? (
                    <p>
                      <a
                        href={c.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="wrap-break-word underline underline-offset-4"
                      >
                        {t("contactProfile")}
                      </a>
                    </p>
                  ) : null}
                  {c.notes ? (
                    <p className="wrap-break-word whitespace-pre-line text-muted-foreground">
                      {c.notes}
                    </p>
                  ) : null}
                </div>
                <RemoveButton
                  kind="contact"
                  id={c.id}
                  label={t("removeContact", { name: c.name })}
                />
              </li>
            ))}
          </ul>
        )}
        <AddContactForm applicationId={app.id} />
      </section>

      <section
        aria-labelledby="danger-heading"
        className="flex flex-col gap-2 border-t pt-4"
      >
        <h2 id="danger-heading" className="text-start text-lg font-semibold">
          {t("stopTrackingHeading")}
        </h2>
        <p className="text-start text-sm text-muted-foreground">
          {t("stopTrackingHint")}
        </p>
        <div>
          <StopTrackingButton applicationId={app.id} title={title} />
        </div>
      </section>
    </div>
  );
}
