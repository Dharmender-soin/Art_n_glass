import { ReactNode, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import AppSidebar from "./AppSidebar";
import BottomNav from "./BottomNav";
import { useLocation } from "react-router-dom";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { cn } from "@/lib/utils";
import NotificationBell from "./NotificationBell";
import { GlobalSearch } from "./GlobalSearch";
import { QuickAddModal } from "./QuickAddModal";
import { LogOut } from "lucide-react";

import { useScheduledNotifications } from "@/hooks/useScheduledNotifications";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/partners": "Partners",
  "/clients": "Clients",
  "/visits": "Visits",
  "/reports": "Reports",
  "/profile": "Profile",
  "/admin": "User Management",
  "/daily-visits": "Daily Visits",
  "/verification": "Verification",
  "/hierarchy": "Hierarchy",
  "/my-pipeline": "My Pipeline",
  "/md-dashboard": "Command Center",
  "/live-map": "Live Map",
  "/conveyance": "Conveyance",
  "/partner-visits": "Partner Visits",
  "/notifications": "Notifications",
  "/notification-settings": "Notification Settings",
};

const AppLayoutContent = ({ children }: { children: ReactNode }) => {
  const { signOut } = useAuth();
  const { isMobile, state, setOpen } = useSidebar();
  const { pathname } = useLocation();
  const [isHovered, setIsHovered] = useState(false);

  // Activate automated background daily report scheduler
  useScheduledNotifications();

  const pageTitle = pageTitles[pathname] || "Art N Glass CRM";

  // Smart Sidebar Logic
  const handleMouseEnter = () => {
    if (!isMobile && state === "collapsed") {
      setIsHovered(true);
      setOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile && isHovered) {
      setOpen(false);
      setIsHovered(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background relative">
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "relative z-50 transition-all duration-300 ease-out will-change-[width]",
          isHovered && "[&_[data-sidebar=spacer]]:!w-[--sidebar-width-icon]"
        )}
      >
        <AppSidebar />
      </div>

      <SidebarInset className="flex flex-1 flex-col h-full min-w-0 overflow-hidden relative">
        {/* — Top Bar — */}
        <header className="flex h-14 items-center justify-between gap-2 border-b bg-background/95 backdrop-blur-md px-3 md:px-6 shrink-0 z-30">
          {/* Mobile trigger & Page Title */}
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && <SidebarTrigger className="-ml-1 text-slate-700 dark:text-slate-200" aria-label="Toggle Navigation Sidebar" />}
            {!isMobile && (
              <span className="text-xs text-muted-foreground font-medium hidden md:inline">
                Art N Glass
              </span>
            )}
            {!isMobile && (
              <span className="text-muted-foreground/40 hidden md:inline">/</span>
            )}
            <h1 className="text-sm font-bold tracking-tight truncate">{pageTitle}</h1>
          </div>

          {/* Global Search Bar */}
          {!isMobile && (
            <div className="mx-2 flex-1 max-w-md">
              <GlobalSearch />
            </div>
          )}

          {/* Right side: Quick Add + Notification Bell + Theme Switcher + Logout */}
          <div className="ml-auto flex items-center gap-2">
            <QuickAddModal />
            <NotificationBell />
            {isMobile && <ThemeSwitcher />}
            {isMobile && (
              <button
                onClick={signOut}
                title="Sign Out"
                className="h-9 px-2.5 flex items-center gap-1 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/25 transition-all text-xs font-bold shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Logout</span>
              </button>
            )}
          </div>
        </header>

        {/* — Main Content (Only this area scrolls!) — */}
        <main className={cn(
          "flex-1 min-w-0 overflow-x-hidden overflow-y-auto h-full w-full",
          pathname === "/" || pathname === "/my-pipeline" || pathname === "/md-dashboard" ? "p-0 pb-28 md:pb-0 gap-0" : "gap-6 p-4 md:p-6 lg:p-8 pb-28 md:pb-8"
        )}>
          {children}
        </main>
      </SidebarInset>

      {/* Fixed Bottom Navigation Bar for Mobile */}
      <div className="block md:hidden fixed bottom-0 left-0 right-0 z-[100]">
        <BottomNav />
      </div>
    </div>
  );
};

const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  );
};

export default AppLayout;
