import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

// Wraps a route's skeleton: announces loading once, hides the placeholders
// from assistive tech, and draws the page heading bar.
export async function PageLoading({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Common");
  return (
    <div role="status" className="flex min-w-0 flex-col gap-4">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="flex min-w-0 flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        {children}
      </div>
    </div>
  );
}
