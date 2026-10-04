"use client";
import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { nanoid } from "nanoid";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { BulletsField } from "@/components/profile/bullets-field";
import { Field } from "@/components/profile/field";
import { ImportReview } from "@/components/profile/import-review";
import {
  ResumeImport,
  type ParsedResume,
} from "@/components/profile/resume-import";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveProfile } from "@/features/profile/actions";
import { diffProfiles, type ProfileDiff } from "@/features/profile/diff";
import { normalizeProfile } from "@/features/profile/normalize";
import {
  profileSaveSchema,
  RESUME_LANGUAGES,
  type ProfileSaveInput,
  type ResumeLanguage,
} from "@/features/profile/schemas";

// An AI proposal waiting for the user: loaded into the form but not saved.
type Proposal = {
  previous: ProfileSaveInput;
  diff: ProfileDiff;
  detected: string;
  applied: boolean;
};

type Status = "idle" | "saved" | "unauthorized" | "invalid" | "failed";

export function ProfileForm({ initial }: { initial: ProfileSaveInput }) {
  const t = useTranslations("Profile");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>("idle");
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<ProfileSaveInput>({
    resolver: zodResolver(profileSaveSchema),
    defaultValues: initial,
  });

  const work = useFieldArray({ control, name: "data.work", keyName: "_key" });
  const education = useFieldArray({
    control,
    name: "data.education",
    keyName: "_key",
  });
  const skills = useFieldArray({
    control,
    name: "data.skills",
    keyName: "_key",
  });

  const onSubmit = handleSubmit((values) => {
    setStatus("idle");
    startTransition(async () => {
      const result = await saveProfile({
        language: values.language,
        data: normalizeProfile(values.data),
      });
      if (!result.ok) return setStatus(result.error);
      // Adopt what the server stored (it may have minted ids).
      reset({ language: result.language as ResumeLanguage, data: result.data });
      setProposal(null);
      setStatus("saved");
    });
  });

  const workErrors = errors.data?.work;

  // Load the proposal into the form as unsaved edits. keepDefaultValues keeps
  // the saved profile as the baseline, so the form is dirty and nothing is
  // written until the user confirms with Save.
  function onParsed(parsed: ParsedResume) {
    const previous = getValues();
    const supported = (RESUME_LANGUAGES as readonly string[]).includes(
      parsed.language,
    );
    const language = supported
      ? (parsed.language as ResumeLanguage)
      : previous.language;
    setProposal({
      previous,
      diff: diffProfiles(previous.data, parsed.data),
      detected: parsed.language,
      applied: supported,
    });
    setStatus("idle");
    reset({ language, data: parsed.data }, { keepDefaultValues: true });
  }

  function discardProposal() {
    if (!proposal) return;
    reset(proposal.previous, { keepDefaultValues: true });
    setProposal(null);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ResumeImport onParsed={onParsed} />
      {proposal ? (
        <ImportReview
          diff={proposal.diff}
          detected={proposal.detected}
          languageApplied={proposal.applied}
          previousLanguage={proposal.previous.language}
          onDiscard={discardProposal}
        />
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>{t("resumeLanguage")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Controller
              control={control}
              name="language"
              render={({ field }) => (
                <Select
                  items={RESUME_LANGUAGES.map((l) => ({
                    value: l,
                    label: t(`languages.${l}`),
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    className="w-full sm:w-64"
                    aria-label={t("resumeLanguage")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESUME_LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {t(`languages.${l}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-start text-sm text-muted-foreground">
              {t("resumeLanguageHint")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("basics")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={t("name")} error={errors.data?.basics?.name}>
              <Input autoComplete="name" {...register("data.basics.name")} />
            </Field>
            <Field label={t("headline")} error={errors.data?.basics?.label}>
              <Input {...register("data.basics.label")} />
            </Field>
            <Field label={t("email")} error={errors.data?.basics?.email}>
              <Input
                type="email"
                autoComplete="email"
                {...register("data.basics.email")}
              />
            </Field>
            <Field label={t("phone")} error={errors.data?.basics?.phone}>
              <Input
                type="tel"
                autoComplete="tel"
                {...register("data.basics.phone")}
              />
            </Field>
            <Field
              label={t("location")}
              error={errors.data?.basics?.location}
              className="sm:col-span-2"
            >
              <Input {...register("data.basics.location")} />
            </Field>
            <Field
              label={t("summary")}
              error={errors.data?.basics?.summary}
              className="sm:col-span-2"
            >
              <Textarea {...register("data.basics.summary")} />
            </Field>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-4" aria-labelledby="work-heading">
          <h2 id="work-heading" className="text-start text-lg font-semibold">
            {t("work")}
          </h2>
          {work.fields.map((field, i) => (
            <Card key={field._key}>
              <CardHeader>
                <CardTitle>{t("workN", { n: i + 1 })}</CardTitle>
                <CardAction>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => work.remove(i)}
                    aria-label={t("removeWorkN", { n: i + 1 })}
                  >
                    <Trash2 />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("company")} error={workErrors?.[i]?.company}>
                    <Input {...register(`data.work.${i}.company`)} />
                  </Field>
                  <Field
                    label={t("position")}
                    error={workErrors?.[i]?.position}
                  >
                    <Input {...register(`data.work.${i}.position`)} />
                  </Field>
                  <Field
                    label={t("startDate")}
                    error={workErrors?.[i]?.startDate}
                  >
                    <Input
                      placeholder={t("datePlaceholder")}
                      {...register(`data.work.${i}.startDate`)}
                    />
                  </Field>
                  <Field label={t("endDate")} error={workErrors?.[i]?.endDate}>
                    <Input
                      placeholder={t("datePlaceholder")}
                      {...register(`data.work.${i}.endDate`)}
                    />
                  </Field>
                  <Field
                    label={t("location")}
                    error={workErrors?.[i]?.location}
                    className="sm:col-span-2"
                  >
                    <Input {...register(`data.work.${i}.location`)} />
                  </Field>
                </div>
                <BulletsField
                  jobIndex={i}
                  control={control}
                  register={register}
                  errors={workErrors?.[i]?.bullets}
                />
              </CardContent>
            </Card>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              work.append({
                id: nanoid(),
                company: "",
                position: "",
                startDate: "",
                bullets: [],
              })
            }
          >
            <Plus />
            {t("addWork")}
          </Button>
        </section>

        <section
          className="flex flex-col gap-4"
          aria-labelledby="education-heading"
        >
          <h2
            id="education-heading"
            className="text-start text-lg font-semibold"
          >
            {t("education")}
          </h2>
          {education.fields.map((field, i) => (
            <Card key={field._key}>
              <CardHeader>
                <CardTitle>{t("educationN", { n: i + 1 })}</CardTitle>
                <CardAction>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => education.remove(i)}
                    aria-label={t("removeEducationN", { n: i + 1 })}
                  >
                    <Trash2 />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("institution")}
                  error={errors.data?.education?.[i]?.institution}
                  className="sm:col-span-2"
                >
                  <Input {...register(`data.education.${i}.institution`)} />
                </Field>
                <Field
                  label={t("studyType")}
                  error={errors.data?.education?.[i]?.studyType}
                >
                  <Input {...register(`data.education.${i}.studyType`)} />
                </Field>
                <Field
                  label={t("area")}
                  error={errors.data?.education?.[i]?.area}
                >
                  <Input {...register(`data.education.${i}.area`)} />
                </Field>
                <Field
                  label={t("startDate")}
                  error={errors.data?.education?.[i]?.startDate}
                >
                  <Input
                    placeholder={t("datePlaceholder")}
                    {...register(`data.education.${i}.startDate`)}
                  />
                </Field>
                <Field
                  label={t("endDate")}
                  error={errors.data?.education?.[i]?.endDate}
                >
                  <Input
                    placeholder={t("datePlaceholder")}
                    {...register(`data.education.${i}.endDate`)}
                  />
                </Field>
              </CardContent>
            </Card>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => education.append({ institution: "" })}
          >
            <Plus />
            {t("addEducation")}
          </Button>
        </section>

        <section
          className="flex flex-col gap-4"
          aria-labelledby="skills-heading"
        >
          <h2 id="skills-heading" className="text-start text-lg font-semibold">
            {t("skills")}
          </h2>
          {skills.fields.map((field, i) => (
            <Card key={field._key}>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <Field
                  label={t("skillCategory")}
                  error={errors.data?.skills?.[i]?.category}
                  className="w-full sm:flex-1"
                >
                  <Input {...register(`data.skills.${i}.category`)} />
                </Field>
                <Controller
                  control={control}
                  name={`data.skills.${i}.items`}
                  render={({ field: items }) => (
                    <SkillItems
                      label={t("skillItems")}
                      value={items.value}
                      onChange={items.onChange}
                    />
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="self-end sm:mt-6"
                  onClick={() => skills.remove(i)}
                  aria-label={t("removeSkillN", { n: i + 1 })}
                >
                  <Trash2 />
                </Button>
              </CardContent>
            </Card>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => skills.append({ category: "", items: [] })}
          >
            <Plus />
            {t("addSkill")}
          </Button>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || !isDirty}>
            {pending ? t("saving") : proposal ? t("confirmImport") : t("save")}
          </Button>
          <p
            role="status"
            aria-live="polite"
            className="text-start text-sm text-muted-foreground"
          >
            {status === "saved" ? t("saved") : null}
            {status !== "idle" && status !== "saved"
              ? t(`saveError.${status}`)
              : null}
          </p>
        </div>
      </form>
    </div>
  );
}

// Comma-separated editor for string[]. Keeps the raw text locally so typing
// "a, " doesn't get re-split under the cursor.
function SkillItems({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [raw, setRaw] = useState(value.join(", "));
  return (
    <Field label={label} className="w-full sm:flex-[2]">
      <Input
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
      />
    </Field>
  );
}
