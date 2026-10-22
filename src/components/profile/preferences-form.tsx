"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/profile/field";
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
import {
  retryProfileMatching,
  savePreferences,
  type MatchingError,
} from "@/features/matching/actions";
import {
  CURRENCIES,
  REMOTE_TYPES,
  splitList,
  type Preferences,
} from "@/features/matching/schemas";
import { useRouter } from "@/i18n/navigation";

type Status = "idle" | "saved" | "savedUnmatched" | MatchingError;

// Search preferences. Lists are edited as comma-separated text and split on
// save, so typing "a, " never re-splits under the cursor.
export function PreferencesForm({ initial }: { initial: Preferences }) {
  const t = useTranslations("Profile.preferences");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>("idle");
  const [titles, setTitles] = useState(initial.targetTitles.join(", "));
  const [locations, setLocations] = useState(
    initial.targetLocations.join(", "),
  );
  const [remote, setRemote] = useState(initial.remotePreference);
  const [minSalary, setMinSalary] = useState(
    initial.minSalary?.toString() ?? "",
  );
  const [currency, setCurrency] = useState(initial.salaryCurrency);

  const remoteItems = REMOTE_TYPES.map((r) => ({
    value: r,
    label: t(`remote.${r}`),
  }));
  const currencyItems = CURRENCIES.map((c) => ({ value: c, label: c }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = minSalary.trim() ? Number(minSalary) : null;
    if (amount !== null && (!Number.isInteger(amount) || amount < 0)) {
      setStatus("invalid");
      return;
    }
    setStatus("idle");
    startTransition(async () => {
      const result = await savePreferences({
        targetTitles: splitList(titles),
        targetLocations: splitList(locations),
        remotePreference: remote,
        minSalary: amount,
        salaryCurrency: currency,
      });
      if (!result.ok) return setStatus(result.error);
      setStatus(result.matched ? "saved" : "savedUnmatched");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("titles")}>
          <Input
            value={titles}
            maxLength={1_100}
            placeholder={t("titlesPlaceholder")}
            onChange={(e) => setTitles(e.target.value)}
          />
        </Field>
        <Field label={t("locations")}>
          <Input
            value={locations}
            maxLength={1_100}
            placeholder={t("locationsPlaceholder")}
            onChange={(e) => setLocations(e.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label>{t("remoteLabel")}</Label>
          <Select
            items={remoteItems}
            value={remote}
            onValueChange={(v) => v && setRemote(v)}
          >
            <SelectTrigger className="w-full" aria-label={t("remoteLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {remoteItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Field label={t("minSalary")} className="min-w-0 flex-1">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={minSalary}
              onChange={(e) => setMinSalary(e.target.value)}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label>{t("currency")}</Label>
            <Select
              items={currencyItems}
              value={currency}
              onValueChange={(v) => v && setCurrency(v)}
            >
              <SelectTrigger className="w-24" aria-label={t("currency")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencyItems.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <p className="text-start text-xs text-muted-foreground">{t("hint")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className="text-start text-sm text-muted-foreground"
        >
          {status === "idle" ? null : t(`status.${status}`)}
        </p>
      </div>
    </form>
  );
}

// Shown when the profile has no up-to-date embedding (the last save couldn't
// reach the embedding service): matching jobs to the profile is unavailable.
export function MatchingRetry() {
  const t = useTranslations("Profile.matching");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<MatchingError | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      const result = await retryProfileMatching();
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-2 rounded-xl border border-dashed p-4">
      <p className="text-start text-sm">{t("unavailable")}</p>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={retry}
          disabled={pending}
        >
          {pending ? t("retrying") : t("retry")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
