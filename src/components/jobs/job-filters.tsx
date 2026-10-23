"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOB_SORTS, type JobListParams } from "@/features/matching/schemas";
import { usePathname, useRouter } from "@/i18n/navigation";

const ANY = "any";

// Sort and filters live in the URL, so a filtered list can be bookmarked and
// the server does the filtering.
export function JobFilters({
  params,
  hasMinSalary,
}: {
  params: JobListParams;
  hasMinSalary: boolean;
}) {
  const t = useTranslations("Jobs.filters");
  const tRemote = useTranslations("Jobs.detail.remote");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [location, setLocation] = useState(params.location ?? "");

  function set(key: string, value: string | undefined) {
    const next = new URLSearchParams(search.toString());
    if (value && value !== ANY) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname),
    );
  }

  const selects = [
    {
      key: "sort",
      label: t("sort"),
      value: params.sort,
      items: JOB_SORTS.map((s) => ({ value: s, label: t(`sorts.${s}`) })),
    },
    {
      key: "remote",
      label: t("remote"),
      value: params.remote ?? ANY,
      items: [
        { value: ANY, label: t("any") },
        ...(["remote", "hybrid", "onsite"] as const).map((r) => ({
          value: r,
          label: tRemote(r),
        })),
      ],
    },
    {
      key: "analyzed",
      label: t("analyzed"),
      value: params.analyzed ?? ANY,
      items: [
        { value: ANY, label: t("any") },
        { value: "yes", label: t("analyzedYes") },
        { value: "no", label: t("analyzedNo") },
      ],
    },
    {
      key: "posting",
      label: t("posting"),
      value: params.posting ?? ANY,
      items: [
        { value: ANY, label: t("any") },
        { value: "open", label: t("postingOpen") },
        { value: "closed", label: t("postingClosed") },
      ],
    },
    ...(hasMinSalary
      ? [
          {
            key: "salary",
            label: t("salary"),
            value: params.salary ?? ANY,
            items: [
              { value: ANY, label: t("any") },
              { value: "min", label: t("salaryMin") },
            ],
          },
        ]
      : []),
  ];
  const filtered = Boolean(
    params.remote ||
    params.location ||
    params.analyzed ||
    params.salary ||
    params.posting,
  );

  return (
    <div
      className="flex max-w-3xl flex-wrap items-end gap-3"
      aria-busy={pending}
    >
      {selects.map((s) => (
        <div key={s.key} className="flex min-w-0 flex-col gap-1.5">
          <span className="text-start text-xs font-medium text-muted-foreground">
            {s.label}
          </span>
          <Select
            items={s.items}
            value={s.value}
            onValueChange={(v) => set(s.key, v ?? undefined)}
          >
            <SelectTrigger className="w-full min-w-36" aria-label={s.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {s.items.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <form
        className="flex min-w-0 flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          set("location", location.trim());
        }}
      >
        <Label htmlFor="job-location" className="text-xs text-muted-foreground">
          {t("location")}
        </Label>
        <Input
          id="job-location"
          type="search"
          value={location}
          maxLength={100}
          placeholder={t("locationPlaceholder")}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={() => {
            if (location.trim() !== (params.location ?? ""))
              set("location", location.trim());
          }}
          className="w-44"
        />
      </form>
      {filtered ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setLocation("");
            startTransition(() =>
              router.replace(
                params.sort !== "newest"
                  ? `${pathname}?sort=${params.sort}`
                  : pathname,
              ),
            );
          }}
        >
          {t("clear")}
        </Button>
      ) : null}
    </div>
  );
}
