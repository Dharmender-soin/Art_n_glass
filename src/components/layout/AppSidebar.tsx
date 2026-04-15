import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Building2,
  Users,
  CalendarCheck,
  BarChart3,
  LayoutDashboard,
  LogOut,
  UserCircle,
  Shield,
  ClipboardList,
  ShieldCheck,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  Map,
  Receipt,
  Handshake,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const AppSidebar = () => {
  const { pathname } = useLocation();
  const { role, signOut } = useAuth();
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const isManagerOrAdmin = role === "admin" || role === "manager" || role === "md";

  const links = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/partners", label: "Partners", icon: Building2 },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/visits", label: "Visits", icon: CalendarCheck },
    ...(isManagerOrAdmin
      ? [
        { to: "/reports", label: "Reports", icon: BarChart3 },
        { to: "/daily-visits", label: "Daily Visits", icon: ClipboardList },
        { to: "/verification", label: "Verification", icon: ShieldCheck },
        { to: "/hierarchy", label: "Hierarchy", icon: GitBranch },
        { to: "/live-map", label: "Live Map", icon: Map },
        { to: "/conveyance", label: "Conveyance", icon: Receipt },
        { to: "/partner-visits", label: "Partner Visits", icon: Handshake },
      ]
      : []),
    ...(role === "admin"
      ? [{ to: "/admin", label: "User Management", icon: Shield }]
      : []),
    { to: "/profile", label: "Profile", icon: UserCircle },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* — Header — */}
      <SidebarHeader className="h-16 border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-3 h-full overflow-hidden">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            whileHover={{ rotate: 360, scale: 1.1 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              duration: 0.8
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 shrink-0 cursor-pointer shadow-sm relative z-10"
          >
            <img src={logo} alt="Art-N-Glass" className="h-6 w-auto object-contain" />
          </motion.div>
          {state === "expanded" && (
            <div className="flex flex-col overflow-hidden animate-slide-in-right">
              <span className="text-sm font-bold tracking-tight truncate">Art-N-Glass</span>
              <span className="text-[11px] text-white/70 capitalize truncate">{role || "executive"}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* — Navigation — */}
      <SidebarContent>
        <SidebarMenu className="px-2 py-3 space-y-0.5">
          {links.map(({ to, label, icon: Icon }) => {
            const isActive = pathname === to;
            return (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={label}
                  onClick={() => isMobile && setOpenMobile(false)}
                  className={`
                    group/item relative rounded-lg transition-all duration-200
                    hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                    data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-primary
                    data-[active=true]:font-medium
                  `}
                >
                  <Link to={to}>
                    {/* Active Indicator Bar */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-white" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* — Footer — */}
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu className="space-y-0.5">
          {/* Theme Toggle */}
          <SidebarMenuItem>
            <div className="flex items-center justify-between px-2 py-1.5">
              {state === "expanded" && (
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/70">Theme</span>
              )}
              <ThemeSwitcher />
            </div>
          </SidebarMenuItem>

          {/* Sign Out */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              tooltip="Sign Out"
              className="rounded-lg hover:bg-white/15 hover:text-white transition-colors duration-200"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Toggle Button for Desktop */}
          {!isMobile && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleSidebar}
                tooltip={state === "expanded" ? "Collapse" : "Expand"}
                className="rounded-lg hover:bg-sidebar-accent transition-colors duration-200"
              >
                {state === "expanded" ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                <span>Collapse</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

export default AppSidebar;
