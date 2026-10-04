"use client";
import { BriefcaseBusiness, KanbanSquare, LayoutDashboard, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "profile", href: "/profile", icon: UserRound },
  { key: "jobs", href: "/jobs", icon: BriefcaseBusiness },
  { key: "tracker", href: "/tracker", icon: KanbanSquare },
] as const;

export function SidebarNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ key, href, icon: Icon }) => (
            <SidebarMenuItem key={key}>
              <SidebarMenuButton
                isActive={pathname === href || pathname.startsWith(`${href}/`)}
                tooltip={t(key)}
                render={<Link href={href} />}
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
