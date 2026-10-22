import { cn } from "@/lib/utils";
import { CircleCheck, Circle, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

export type OnboardingProgress = {
  profile: boolean;
  job: boolean;
  application: boolean;
};

const steps = [
  { key: "profile", href: "/profile" },
  { key: "job", href: "/jobs/new" },
  { key: "application", href: "/tracker" },
] as const;

export async function OnboardingChecklist({
  progress,
}: {
  progress: OnboardingProgress;
}) {
  const t = await getTranslations("Dashboard.onboarding");
  const done = steps.filter((s) => progress[s.key]).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-start">
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription className="text-start">
          {t("intro")}{" "}
          {t("progress", { done: String(done), total: String(steps.length) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col divide-y rounded-lg border">
          {steps.map(({ key, href }) => {
            const complete = progress[key];
            const Icon = complete ? CircleCheck : Circle;
            return (
              <li key={key}>
                <Link
                  href={href}
                  className="flex items-center gap-3 p-3 text-start outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-5 shrink-0",
                      complete ? "text-foreground" : "text-muted-foreground",
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "font-medium",
                        complete && "text-muted-foreground line-through",
                      )}
                    >
                      {t(`${key}.title`)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t(`${key}.body`)}
                    </span>
                  </span>
                  <span className="sr-only">
                    {complete ? t("done") : t("notDone")}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                  />
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
