import { PageLoading } from "@/components/page-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function ResumesLoading() {
  return (
    <PageLoading>
      <ul className="flex max-w-3xl flex-col divide-y rounded-xl border">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-24" />
          </li>
        ))}
      </ul>
    </PageLoading>
  );
}
