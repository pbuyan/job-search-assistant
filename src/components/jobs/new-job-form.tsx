"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/profile/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createJob, type CreateJobError } from "@/features/jobs/actions";
import { useRouter } from "@/i18n/navigation";

type Mode = "url" | "text";

export function NewJobForm() {
  const t = useTranslations("Jobs.new");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<CreateJobError | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createJob(
        mode === "url" ? { url } : { url: url || undefined, text },
      );
      if (result.ok) {
        router.push(`/jobs/${result.jobId}`);
        return;
      }
      setError(result.error);
      // The page couldn't be read as a posting: keep the URL as a reference
      // and let the user paste the description instead.
      if (result.error === "needsPaste") setMode("text");
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex max-w-3xl flex-col gap-4"
      noValidate
    >
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="url">{t("tabUrl")}</TabsTrigger>
          <TabsTrigger value="text">{t("tabText")}</TabsTrigger>
        </TabsList>
        <TabsContent value="url" className="flex flex-col gap-2 pt-3">
          <Field label={t("urlLabel")}>
            <Input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={pending}
            />
          </Field>
          <p className="text-start text-sm text-muted-foreground">
            {t("urlHint")}
          </p>
        </TabsContent>
        <TabsContent value="text" className="flex flex-col gap-3 pt-3">
          <Field label={t("textLabel")}>
            <Textarea
              className="min-h-64"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label={t("sourceUrlLabel")}>
            <Input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={pending}
            />
          </Field>
        </TabsContent>
      </Tabs>

      <p className="text-start text-sm text-muted-foreground">{t("privacy")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || (mode === "url" ? !url.trim() : !text.trim())}
        >
          {pending ? t("submitting") : t("submit")}
        </Button>
        <p role="alert" className="text-start text-sm text-destructive">
          {error ? t(`errors.${error}`) : null}
        </p>
      </div>
    </form>
  );
}
