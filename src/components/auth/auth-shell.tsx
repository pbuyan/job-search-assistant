import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Link } from "@/i18n/navigation";

// Branded frame for the Clerk pages, so the page isn't blank while Clerk's
// widget loads.
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const [tc, ta] = await Promise.all([
    getTranslations("Common"),
    getTranslations("Auth"),
  ]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-end gap-1 px-4 py-3 md:px-8">
        <ThemeSwitcher />
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 flex-col items-center gap-6 px-4 pb-12">
        <div className="flex max-w-md flex-col items-center gap-1 text-center">
          <Link
            href="/"
            className="rounded-md text-2xl font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {tc("appName")}
          </Link>
          <p className="text-muted-foreground">{ta("tagline")}</p>
        </div>
        {/* Clerk's card is a fixed 25rem; keep it inside narrow screens. */}
        <div className="flex w-full max-w-full justify-center [&_.cl-rootBox]:max-w-full [&_.cl-cardBox]:max-w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
