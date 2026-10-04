import { auth } from "@clerk/nextjs/server";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { KanbanBoard } from "@/components/tracker/kanban-board";
import { getBoard } from "@/db/queries/applications";
import { APPLICATION_STATUSES } from "@/features/tracker/board";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default async function TrackerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { userId } = await auth();
  if (!userId) return redirect({ href: "/sign-in", locale });

  const [t, board] = await Promise.all([
    getTranslations("Tracker"),
    getBoard(userId),
  ]);
  const total = APPLICATION_STATUSES.reduce((n, s) => n + board[s].length, 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-start text-2xl font-semibold">{t("title")}</h1>
        <p className="text-start text-sm text-muted-foreground">
          {total === 0 ? (
            <>
              {t("empty")}{" "}
              <Link href="/jobs" className="underline underline-offset-4">
                {t("goToJobs")}
              </Link>
            </>
          ) : (
            t("hint")
          )}
        </p>
      </div>
      <KanbanBoard initial={board} />
    </div>
  );
}
