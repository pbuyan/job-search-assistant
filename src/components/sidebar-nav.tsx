"use client";
import {
  BriefcaseBusiness,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "profile", href: "/profile", icon: UserRound },
  { key: "jobs", href: "/jobs", icon: BriefcaseBusiness },
  { key: "resumes", href: "/resumes", icon: FileText },
  { key: "tracker", href: "/tracker", icon: KanbanSquare },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

// `overdue`: open applications whose next step is past due, shown on Tracker.
export function SidebarNav({ overdue = 0 }: { overdue?: number }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  // On mobile the sidebar is a modal sheet; close it once a destination is chosen.
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ key, href, icon: Icon }) => (
            <SidebarMenuItem key={key}>
              <SidebarMenuButton
                isActive={pathname === href || pathname.startsWith(`${href}/`)}
                tooltip={t(key)}
                render={
                  <Link href={href} onClick={() => setOpenMobile(false)} />
                }
              >
                <Icon />
                <span>{t(key)}</span>
                {key === "tracker" && overdue > 0 ? (
                  <span className="sr-only">
                    {t("overdueCount", { count: overdue })}
                  </span>
                ) : null}
              </SidebarMenuButton>
              {key === "tracker" && overdue > 0 ? (
                <SidebarMenuBadge
                  aria-hidden
                  className="end-1 right-auto bg-destructive/10 text-destructive"
                >
                  {overdue}
                </SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
