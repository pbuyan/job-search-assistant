import { UserButton } from "@clerk/nextjs";
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

export async function AppSidebar() {
  const t = await getTranslations("Common");
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <span className="px-2 py-1 text-start font-semibold">{t("appName")}</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav />
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
