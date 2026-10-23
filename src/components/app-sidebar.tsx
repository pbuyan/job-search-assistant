import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { countOverdueSteps } from "@/db/queries/applications";
import { isoDay } from "@/features/dashboard/summary";

export async function AppSidebar() {
  const { userId } = await auth();
  const [t, overdue] = await Promise.all([
    getTranslations("Common"),
    userId ? countOverdueSteps(userId, isoDay(new Date())) : 0,
  ]);
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <span className="px-2 py-1 text-start font-semibold">
          {t("appName")}
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav overdue={overdue} />
      </SidebarContent>
      <SidebarFooter className="flex-row items-center justify-between gap-2 px-3">
        <UserButton />
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
