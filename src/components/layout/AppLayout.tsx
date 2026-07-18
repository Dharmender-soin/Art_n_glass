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

  const pageTitle = pageTitles[pathname] || "Art-N-Glass";

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
    <>
      {/* 
        Sidebar Wrapper with Hover Logic 
        Rule: If hovered (isHovered=true), we FORCE the spacer to stay collapsed 
        so the main content doesn't jump. The sidebar itself (fixed) will expand naturally.
      */}
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

      <SidebarInset>
        {/* — Top Bar — hidden on home page as ExecutiveHome has its own sticky header */}
        {pathname !== "/" && (
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur-md px-4 md:px-6">
            {/* Mobile trigger */}
            {isMobile && <SidebarTrigger className="-ml-1" />}

            {/* Breadcrumb / Page Title - Hidden on pages with rich headers */}
            {!["/verification", "/hierarchy", "/my-pipeline", "/md-dashboard"].includes(pathname) && (
              <div className="flex items-center gap-2">
                {!isMobile && (
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    Art-N-Glass
                  </span>
                )}
                {!isMobile && (
                  <span className="text-muted-foreground/40 hidden md:inline">/</span>
                )}
                <h1 className="text-sm font-semibold tracking-tight">{pageTitle}</h1>
              </div>
            )}

            {/* Right side: notification bell + mobile theme toggle */}
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              {isMobile && <ThemeSwitcher />}
            </div>
          </header>
        )}

        {/* — Main Content — */}
        <div className={cn(
          "flex flex-1 flex-col overflow-y-auto h-full",
          pathname === "/" || pathname === "/my-pipeline" || pathname === "/md-dashboard" ? "p-0 pb-20 md:pb-0 gap-0" : "gap-6 p-4 md:p-6 lg:p-8 pb-20 md:pb-8"
        )}>
          {children}
        </div>
      </SidebarInset>

      {isMobile && <BottomNav />}
    </>
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
