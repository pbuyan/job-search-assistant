// Display name of an ISO 639-1 code in the given UI locale ("fr" in "en" →
// "French"). Falls back to the code for anything Intl doesn't know.
export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
