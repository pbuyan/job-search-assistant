"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/profile/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addApplicationContact,
  addApplicationEvent,
  deleteApplicationContact,
  deleteApplicationEvent,
  moveApplication,
  saveApplicationDetails,
  stopTracking,
  type ApplicationError,
} from "@/features/tracker/actions";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/features/tracker/board";
import {
  USER_EVENT_TYPES,
  type UserEventType,
} from "@/features/tracker/schemas";
import { useRouter } from "@/i18n/navigation";

// Runs a Server Action, refreshes the page's server data on success, and
// keeps the error code for display.
function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ApplicationError | null>(null);
  const run = (
    action: () => Promise<
      { ok: true } | { ok: false; error: ApplicationError }
    >,
    onDone?: () => void,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error);
      onDone?.();
      router.refresh();
    });
  };
  return { pending, error, run };
}

function ErrorText({ error }: { error: ApplicationError | null }) {
  const t = useTranslations("Tracker.application.errors");
  return error ? (
    <p role="alert" className="text-start text-sm text-destructive">
      {t(error)}
    </p>
  ) : null;
}

export function StatusSelect({
  applicationId,
  status,
}: {
  applicationId: string;
  status: ApplicationStatus;
}) {
  const t = useTranslations("Tracker");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const items = APPLICATION_STATUSES.map((s) => ({
    value: s,
    label: t(`status.${s}`),
  }));

  function change(next: ApplicationStatus | null) {
    if (!next || next === status) return;
    setFailed(false);
    startTransition(async () => {
      // Same as dropping the card at the top of that column.
      const result = await moveApplication({
        applicationId,
        status: next,
        index: 0,
      });
      if (result.ok) router.refresh();
      else setFailed(true);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        items={items}
        value={status}
        onValueChange={change}
        disabled={pending}
      >
        <SelectTrigger
          className="w-full sm:w-56"
          aria-label={t("application.status")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {failed ? (
        <p role="alert" className="text-start text-sm text-destructive">
          {t("errors.moveFailed")}
        </p>
      ) : null}
    </div>
  );
}

type Details = {
  appliedOn: string;
  nextStep: string;
  nextStepDue: string;
  resumeVersionId: string;
  notes: string;
  coverLetter: string;
};

const NO_RESUME = "none";

export function DetailsForm({
  applicationId,
  initial,
  versions,
}: {
  applicationId: string;
  initial: Details;
  versions: { id: string; label: string }[];
}) {
  const t = useTranslations("Tracker.application");
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  const set = (key: keyof Details) => (value: string) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value }));
  };
  const resumeItems = [
    { value: NO_RESUME, label: t("noResume") },
    ...versions.map((v) => ({ value: v.id, label: v.label })),
  ];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    run(
      () => saveApplicationDetails({ id: applicationId, ...values }),
      () => setSaved(true),
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("appliedOn")}>
          <Input
            type="date"
            value={values.appliedOn}
            onChange={(e) => set("appliedOn")(e.target.value)}
          />
        </Field>
        <div>
          <Label className="mb-1.5">{t("resume")}</Label>
          <Select
            items={resumeItems}
            value={values.resumeVersionId || NO_RESUME}
            onValueChange={(v) =>
              set("resumeVersionId")(v && v !== NO_RESUME ? v : "")
            }
          >
            <SelectTrigger className="w-full" aria-label={t("resume")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {resumeItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-start text-xs text-muted-foreground">
            {t("resumeHint")}
          </p>
        </div>
        <Field label={t("nextStep")}>
          <Input
            value={values.nextStep}
            maxLength={200}
            onChange={(e) => set("nextStep")(e.target.value)}
          />
        </Field>
        <Field label={t("nextStepDue")}>
          <Input
            type="date"
            value={values.nextStepDue}
            onChange={(e) => set("nextStepDue")(e.target.value)}
          />
        </Field>
      </div>
      <Field label={t("notes")}>
        <Textarea
          value={values.notes}
          maxLength={10_000}
          onChange={(e) => set("notes")(e.target.value)}
        />
      </Field>
      <Field label={t("coverLetter")}>
        <Textarea
          className="min-h-40"
          value={values.coverLetter}
          maxLength={20_000}
          onChange={(e) => set("coverLetter")(e.target.value)}
        />
      </Field>
      <ErrorText error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        {saved ? (
          <p role="status" className="text-start text-sm text-muted-foreground">
            {t("saved")}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function AddEventForm({
  applicationId,
  today,
}: {
  applicationId: string;
  today: string;
}) {
  const t = useTranslations("Tracker.application");
  const empty = {
    type: "note" as UserEventType,
    occurredOn: today,
    title: "",
    body: "",
  };
  const [values, setValues] = useState(empty);
  const { pending, error, run } = useAction();
  const items = USER_EVENT_TYPES.map((v) => ({
    value: v,
    label: t(`eventTypes.${v}`),
  }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    run(
      () => addApplicationEvent({ applicationId, ...values }),
      () => setValues(empty),
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border p-4"
      noValidate
    >
      <p className="text-start text-sm font-medium">{t("addEvent")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          items={items}
          value={values.type}
          onValueChange={(v) => v && setValues((s) => ({ ...s, type: v }))}
        >
          <SelectTrigger className="w-full" aria-label={t("eventType")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label={t("eventDate")}
          value={values.occurredOn}
          onChange={(e) =>
            setValues((s) => ({ ...s, occurredOn: e.target.value }))
          }
        />
      </div>
      <Field label={t("eventTitle")}>
        <Input
          value={values.title}
          maxLength={200}
          onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
        />
      </Field>
      <Field label={t("eventBody")}>
        <Textarea
          value={values.body}
          maxLength={5_000}
          onChange={(e) => setValues((s) => ({ ...s, body: e.target.value }))}
        />
      </Field>
      <ErrorText error={error} />
      <div>
        <Button
          type="submit"
          variant="outline"
          disabled={pending || (!values.title.trim() && !values.body.trim())}
        >
          {t("addEventSubmit")}
        </Button>
      </div>
    </form>
  );
}

export function AddContactForm({ applicationId }: { applicationId: string }) {
  const t = useTranslations("Tracker.application");
  const empty = { name: "", role: "", email: "", linkedinUrl: "", notes: "" };
  const [values, setValues] = useState(empty);
  const { pending, error, run } = useAction();
  const set =
    (key: keyof typeof empty) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    run(
      () => addApplicationContact({ applicationId, ...values }),
      () => setValues(empty),
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border p-4"
      noValidate
    >
      <p className="text-start text-sm font-medium">{t("addContact")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("contactName")}>
          <Input value={values.name} maxLength={120} onChange={set("name")} />
        </Field>
        <Field label={t("contactRole")}>
          <Input value={values.role} maxLength={120} onChange={set("role")} />
        </Field>
        <Field label={t("contactEmail")}>
          <Input
            type="email"
            value={values.email}
            maxLength={254}
            onChange={set("email")}
          />
        </Field>
        <Field label={t("contactLinkedin")}>
          <Input
            type="url"
            value={values.linkedinUrl}
            maxLength={500}
            onChange={set("linkedinUrl")}
          />
        </Field>
      </div>
      <Field label={t("contactNotes")}>
        <Textarea
          value={values.notes}
          maxLength={2_000}
          onChange={set("notes")}
        />
      </Field>
      <ErrorText error={error} />
      <div>
        <Button
          type="submit"
          variant="outline"
          disabled={pending || !values.name.trim()}
        >
          {t("addContactSubmit")}
        </Button>
      </div>
    </form>
  );
}

// Small "Remove" for one timeline entry or contact.
export function RemoveButton({
  kind,
  id,
  label,
}: {
  kind: "event" | "contact";
  id: string;
  label: string;
}) {
  const t = useTranslations("Tracker.application");
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={label}
        disabled={pending}
        onClick={() =>
          run(() =>
            kind === "event"
              ? deleteApplicationEvent(id)
              : deleteApplicationContact(id),
          )
        }
      >
        {t("remove")}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

export function StopTrackingButton({
  applicationId,
  title,
}: {
  applicationId: string;
  title: string;
}) {
  const t = useTranslations("Tracker.application");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ApplicationError | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await stopTracking(applicationId);
      if (result.ok) router.push("/tracker");
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Dialog>
        <DialogTrigger render={<Button type="button" variant="outline" />}>
          {t("stopTracking")}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("stopTrackingTitle")}</DialogTitle>
            <DialogDescription>
              {t("stopTrackingBody", { title })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("cancel")}
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={confirm}
              disabled={pending}
            >
              {t("stopTrackingConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ErrorText error={error} />
    </div>
  );
}
