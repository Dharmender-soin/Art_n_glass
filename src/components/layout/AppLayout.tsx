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
};

const AppLayoutContent = ({ children }: { children: ReactNode }) => {
  const { isMobile, state, setOpen } = useSidebar();
  const { pathname } = useLocation();
  const [isHovered, setIsHovered] = useState(false);

  const pageTitle = pageTitles[pathname] || "Property OS";

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
        <header className="flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur-md px-4 md:px-6 shrink-0 z-30">
          {/* Mobile trigger */}
          {isMobile && <SidebarTrigger className="-ml-1" />}

          {/* Breadcrumb / Page Title */}
          <div className="flex items-center gap-2 shrink-0">
            {!isMobile && (
              <span className="text-xs text-muted-foreground font-medium hidden md:inline">
                Property OS
              </span>
            )}
            {!isMobile && (
              <span className="text-muted-foreground/40 hidden md:inline">/</span>
            )}
            <h1 className="text-sm font-bold tracking-tight">{pageTitle}</h1>
          </div>

          {/* Global Search Bar */}
          {!isMobile && (
            <div className="mx-2 flex-1 max-w-md">
              <GlobalSearch />
            </div>
          )}

          {/* Right side: Quick Add + Notification Bell + Theme Switcher */}
          <div className="ml-auto flex items-center gap-2">
            <QuickAddModal />
            <NotificationBell />
            {isMobile && <ThemeSwitcher />}
          </div>
        </header>

        {/* — Main Content (Only this area scrolls!) — */}
        <main className={cn(
          "flex-1 overflow-y-auto h-full w-full",
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
