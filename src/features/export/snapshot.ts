import {
  getResumeVersion,
  setExportedFileKey,
} from "@/db/queries/resume-versions";
import { putPrivate, storageEnabled, storageKeys } from "@/lib/storage";
import { documentFromResume } from "./document";
import { renderResumePdf } from "./pdf";
import { exportLabels } from "./respond";

// Keeps a PDF of a resume version as it was when attached to an application,
// i.e. what was sent. Attaching locks the version, so the first snapshot
// stays accurate; later attachments keep it. Never throws: the attachment
// itself already succeeded, and a missing snapshot only means no "sent file"
// download. Logs the error class only, never content.
export async function snapshotSentResume(
  userId: string,
  versionId: string,
): Promise<"stored" | "skipped" | "failed"> {
  if (!storageEnabled()) return "skipped";
  try {
    const version = await getResumeVersion(userId, versionId);
    if (!version || version.exportedFileKey) return "skipped";
    const labels = await exportLabels(version.language);
    const file = await renderResumePdf({
      doc: documentFromResume(version.data, version.language, labels),
      labels,
      lang: version.language,
      title: version.name,
    });
    const key = storageKeys.sentResume(userId, versionId);
    await putPrivate(key, file, "application/pdf");
    await setExportedFileKey(userId, versionId, key);
    return "stored";
  } catch (err) {
    console.error("snapshotSentResume failed", {
      name: err instanceof Error ? err.name : typeof err,
    });
    return "failed";
  }
}
