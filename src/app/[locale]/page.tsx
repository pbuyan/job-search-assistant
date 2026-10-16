import type { Metadata } from "next";
import { Show } from "@clerk/nextjs";
import {
  ClipboardPaste,
  FileUp,
  Gauge,
  KanbanSquare,
  ShieldCheck,
} from "lucide-react";
import { cn } from "cn";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/metadata";

const steps = [
  { key: "import", Icon: FileUp },
  { key: "paste", Icon: ClipboardPaste },
  { key: "score", Icon: Gauge },
  { key: "track", Icon: KanbanSquare },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return pageMetadata({ locale, page: "landing", path: "/", absolute: true });
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t, tl, tc] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Landing"),
    getTranslations("Common"),
  ]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-3 md:px-8">
        <span className="text-start font-semibold">{tc("appName")}</span>
        <ThemeSwitcher />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 py-12 md:px-8 md:py-20">
        <section className="flex max-w-2xl flex-col gap-4">
          <h1 className="text-start text-3xl font-semibold text-balance md:text-5xl">
            {t("title")}
          </h1>
          <p className="text-start text-lg text-muted-foreground">
            {t("subtitle")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Show when="signed-out">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                {tc("signUp")}
              </Link>
              <Link
                href="/sign-in"
                // cn() drops the base border-transparent that would
                // otherwise hide the outline border.
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                {tc("signIn")}
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
                {t("goToDashboard")}
              </Link>
            </Show>
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="flex flex-col gap-6">
          <h2 id="how-it-works" className="text-start text-2xl font-semibold">
            {tl("howItWorks.title")}
          </h2>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ key, Icon }, i) => (
              <li key={key} className="flex">
                <Card className="w-full">
                  <CardHeader className="gap-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Icon aria-hidden className="size-5" />
                      <span className="text-sm">{i + 1}</span>
                    </div>
                    <CardTitle className="text-start">
                      {tl(`steps.${key}.title`)}
                    </CardTitle>
                    <CardDescription className="text-start">
                      {tl(`steps.${key}.body`)}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="privacy">
          <Card className="bg-muted/50">
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <ShieldCheck aria-hidden className="size-6 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <h2 id="privacy" className="text-start font-semibold">
                  {tl("privacy.title")}
                </h2>
                <p className="text-start text-sm text-muted-foreground">
                  {tl("privacy.body")}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 md:px-8">
          <p className="text-start text-sm text-muted-foreground">
            {tl("footer.copyright", {
              // A string, so ICU doesn't group it as "2,026".
              year: String(new Date().getFullYear()),
              appName: tc("appName"),
            })}
          </p>
          <LanguageSwitcher />
        </div>
      </footer>
    </div>
  );
}
