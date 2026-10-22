"use client";
import {
  BriefcaseBusiness,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
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
] as const;

export function SidebarNav() {
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
                render={<Link href={href} onClick={() => setOpenMobile(false)} />}
              >
                <Icon />
                <span>{t(key)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
