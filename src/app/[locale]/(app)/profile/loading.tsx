import { PageLoading } from "@/components/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <PageLoading>
      <Skeleton className="h-4 w-full max-w-xl" />
      <div className="flex max-w-3xl flex-col gap-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border p-4">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
