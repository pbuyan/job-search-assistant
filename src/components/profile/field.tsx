"use client";
import { useId, type ReactElement, cloneElement } from "react";
import { useTranslations } from "next-intl";
import type { FieldError } from "react-hook-form";
import { Label } from "@/components/ui/label";

type Props = {
  label: string;
  error?: FieldError;
  className?: string;
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
};

// Label + control + translated error. Error messages from the Zod schema are
// keys under `Profile.errors`.
export function Field({ label, error, className, children }: Props) {
  const t = useTranslations("Profile.errors");
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">
        {label}
      </Label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      })}
      {error?.message ? (
        <p id={errorId} role="alert" className="mt-1 text-start text-sm text-destructive">
          {t(error.message as "required")}
        </p>
      ) : null}
    </div>
  );
}
