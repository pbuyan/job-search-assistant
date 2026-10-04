"use client";
import { nanoid } from "nanoid";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFieldArray, type Control, type UseFormRegister, type FieldErrors } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/profile/field";
import type { ProfileSaveInput } from "@/features/profile/schemas";

type Props = {
  jobIndex: number;
  control: Control<ProfileSaveInput>;
  register: UseFormRegister<ProfileSaveInput>;
  errors?: FieldErrors<ProfileSaveInput["data"]["work"][number]>["bullets"];
};

// The bullet's own `id` is the stable nanoid that tailored resumes cite as
// `sourceBulletId`, so field-array keys use `_key` instead of the default
// `id` — otherwise react-hook-form would shadow it.
export function BulletsField({ jobIndex, control, register, errors }: Props) {
  const t = useTranslations("Profile");
  const { fields, append, remove } = useFieldArray({
    control,
    name: `data.work.${jobIndex}.bullets`,
    keyName: "_key",
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-start text-sm font-medium">{t("bullets")}</p>
      {fields.map((field, i) => (
        <div key={field._key} className="flex items-start gap-2">
          <Field label={t("bulletN", { n: i + 1 })} error={errors?.[i]?.text} className="flex-1">
            <Textarea {...register(`data.work.${jobIndex}.bullets.${i}.text`)} />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-6"
            onClick={() => remove(i)}
            aria-label={t("removeBulletN", { n: i + 1 })}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => append({ id: nanoid(), text: "" })}
      >
        <Plus />
        {t("addBullet")}
      </Button>
    </div>
  );
}
