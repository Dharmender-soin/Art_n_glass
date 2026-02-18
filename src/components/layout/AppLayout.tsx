import { ReactNode, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import AppSidebar from "./AppSidebar";
import BottomNav from "./BottomNav";
import { useLocation } from "react-router-dom";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { cn } from "@/lib/utils";

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
          "relative z-50",
          isHovered && "[&_[data-sidebar=spacer]]:!w-[--sidebar-width-icon]"
        )}
      >
        <AppSidebar />
      </div>

      <SidebarInset>
        {/* — Top Bar — */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur-md px-4 md:px-6">
          {/* Mobile trigger */}
          {isMobile && <SidebarTrigger className="-ml-1" />}

          {/* Breadcrumb / Page Title */}
          {/* Breadcrumb / Page Title - Hidden on pages with rich headers */}
          {!["/verification"].includes(pathname) && (
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

          {/* Right side: mobile theme toggle */}
          <div className="ml-auto flex items-center gap-2">
            {isMobile && <ThemeSwitcher />}
          </div>
        </header>

        {/* — Main Content — */}
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 pb-20 md:pb-8 overflow-y-auto h-full">
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
