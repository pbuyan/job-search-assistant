import { PageLoading } from "@/components/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function TrackerLoading() {
  return (
    <PageLoading>
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="flex gap-3 overflow-hidden pb-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-muted/50 p-2 sm:w-72"
          >
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
