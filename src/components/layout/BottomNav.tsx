import { Link, useLocation } from "react-router-dom";
import {
  Building2, Users, CalendarCheck, UserCircle,
  LayoutDashboard, BarChart3, ClipboardList,
  ShieldCheck, GitBranch, Receipt, Handshake, TrendingUp, Eye,
  LayoutGrid
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────── */
interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

/* ─── Single Tab Button ──────────────────────────────────── */
const TabItem = ({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) => {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      className="relative flex flex-col items-center justify-center flex-1 min-w-0 py-1 gap-0.5 group select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Pill / active background */}
      <span
        className="absolute inset-x-1 inset-y-0.5 rounded-2xl transition-all duration-300 ease-out"
        style={{
          background: isActive
            ? "linear-gradient(135deg, rgba(194,24,51,0.22) 0%, rgba(166,25,46,0.14) 100%)"
            : "transparent",
          transform: isActive ? "scaleX(1) scaleY(1)" : "scaleX(0.7) scaleY(0.6)",
          opacity: isActive ? 1 : 0,
          borderBottom: isActive ? "2px solid #C21833" : "2px solid transparent",
        }}
      />

      {/* Icon */}
      <span
        className="relative z-10 transition-all duration-300 ease-out"
        style={{
          transform: isActive ? "scale(1.18) translateY(-1px)" : "scale(1) translateY(0px)",
          color: isActive ? "#F5F5F7" : "#6B7280",
        }}
      >
        <Icon
          className="h-[22px] w-[22px]"
          strokeWidth={isActive ? 2.5 : 1.8}
        />
      </span>

      {/* Label */}
      <span
        className="relative z-10 font-semibold tracking-wide transition-all duration-300 ease-out leading-none"
        style={{
          fontSize: "9px",
          color: isActive ? "#F5F5F7" : "#6B7280",
          opacity: isActive ? 1 : 0.75,
          transform: isActive ? "translateY(0px)" : "translateY(1px)",
          letterSpacing: isActive ? "0.04em" : "0.02em",
        }}
      >
        {item.label}
      </span>
    </Link>
  );
};

/* ─── Main Nav ───────────────────────────────────────────── */
const BottomNav = () => {
  const { pathname } = useLocation();
  const { role } = useAuth();

  const isMdOrAdmin = role === "admin" || role === "md";
  const isManager = role === "manager";
  const isManagerOrAdmin = isMdOrAdmin || isManager;
  const isTL = role === "tl";
  const isAccountant = role === "accountant";
  const isBackhand = role === "backhand_executive";
  const isSupportRole = isAccountant || isBackhand;

  let mainLinks: NavItem[] = [];
  let moreLinks: NavItem[] = [];

  if (isSupportRole) {
    // 3 or 4 links total: show all directly without "More" menu
    mainLinks = [
      { to: "/daily-visits", label: "Daily",    icon: ClipboardList },
      { to: "/reports",      label: "Reports",  icon: BarChart3 },
      ...(isAccountant
        ? [{ to: "/conveyance", label: "Conveyance", icon: Receipt }]
        : []),
      { to: "/profile", label: "Profile", icon: UserCircle },
    ];
  } else if (isMdOrAdmin) {
    mainLinks = [
      { to: "/md-dashboard",   label: "Command",    icon: Eye },
      { to: "/daily-visits",   label: "Daily",      icon: ClipboardList },
      { to: "/hierarchy",      label: "Hierarchy",  icon: GitBranch },
      { to: "/partner-visits", label: "P.Visits",   icon: Handshake },
      { to: "/conveyance",     label: "Conveyance", icon: Receipt },
      { to: "/profile",        label: "Profile",    icon: UserCircle },
    ];
    moreLinks = [
      { to: "/",               label: "Home",       icon: LayoutDashboard },
      { to: "/reports",        label: "Reports",    icon: BarChart3 },
      { to: "/visits",         label: "Visits",     icon: CalendarCheck },
      { to: "/partners",       label: "Partners",   icon: Building2 },
      { to: "/clients",        label: "Clients",    icon: Users },
      { to: "/verification",   label: "Verify",     icon: ShieldCheck },
    ];
  } else if (isManager) {
    mainLinks = [
      { to: "/",         label: "Home",     icon: LayoutDashboard },
      { to: "/partners", label: "Partners", icon: Building2 },
      { to: "/clients",  label: "Clients",  icon: Users },
      { to: "/visits",   label: "Visits",   icon: CalendarCheck },
      { to: "/profile",  label: "Profile",  icon: UserCircle },
    ];
    moreLinks = [
      { to: "/reports",        label: "Reports",   icon: BarChart3 },
      { to: "/daily-visits",   label: "Daily",     icon: ClipboardList },
      { to: "/verification",   label: "Verify",    icon: ShieldCheck },
      { to: "/hierarchy",      label: "Hierarchy", icon: GitBranch },
      { to: "/conveyance",     label: "Conveyance",icon: Receipt },
      { to: "/partner-visits", label: "P.Visits",  icon: Handshake },
    ];
  } else if (isTL) {
    mainLinks = [
      { to: "/",         label: "Home",     icon: LayoutDashboard },
      { to: "/partners", label: "Partners", icon: Building2 },
      { to: "/clients",  label: "Clients",  icon: Users },
      { to: "/visits",   label: "Visits",   icon: CalendarCheck },
      { to: "/profile",  label: "Profile",  icon: UserCircle },
    ];
    moreLinks = [
      { to: "/reports",      label: "Reports",  icon: BarChart3 },
      { to: "/daily-visits", label: "Daily",    icon: ClipboardList },
      { to: "/hierarchy",    label: "My Team",  icon: GitBranch },
    ];
  } else {
    // Executives / standard user: show 4 primary, group others in "More"
    mainLinks = [
      { to: "/",        label: "Home",     icon: LayoutDashboard },
      { to: "/visits",  label: "Visits",   icon: CalendarCheck },
      { to: "/my-pipeline", label: "Pipeline", icon: TrendingUp },
      { to: "/profile", label: "Profile", icon: UserCircle },
    ];
    moreLinks = [
      { to: "/partners", label: "Partners", icon: Building2 },
      { to: "/clients",  label: "Clients",  icon: Users },
    ];
  }

  // Helper to check if any of the "More" items is active
  const isMoreActive = moreLinks.some(item => pathname.startsWith(item.to));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(10, 11, 14, 0.97)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 -6px 32px rgba(0,0,0,0.45), 0 -1px 0 rgba(255,255,255,0.04)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        className="flex items-stretch w-full"
        style={{ minHeight: "58px", maxWidth: "100%", paddingLeft: "4px", paddingRight: "4px" }}
      >
        {/* Render main links */}
        {mainLinks.map((item) => {
          const isActive =
            item.to === "/"
              ? pathname === "/"
              : pathname.startsWith(item.to);
          return (
            <TabItem key={item.to} item={item} isActive={isActive} />
          );
        })}

        {/* If there are more links, show the "More" drawer item */}
        {moreLinks.length > 0 && (
          <Sheet>
            <SheetTrigger asChild>
              <button
                className="relative flex flex-col items-center justify-center flex-1 min-w-0 py-1 gap-0.5 group select-none cursor-pointer"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {/* Pill / active background for More button */}
                <span
                  className="absolute inset-x-1 inset-y-0.5 rounded-2xl transition-all duration-300 ease-out"
                  style={{
                    background: isMoreActive
                      ? "linear-gradient(135deg, rgba(194,24,51,0.22) 0%, rgba(166,25,46,0.14) 100%)"
                      : "transparent",
                    transform: isMoreActive ? "scaleX(1) scaleY(1)" : "scaleX(0.7) scaleY(0.6)",
                    opacity: isMoreActive ? 1 : 0,
                    borderBottom: isMoreActive ? "2px solid #C21833" : "2px solid transparent",
                  }}
                />

                {/* Icon */}
                <span
                  className="relative z-10 transition-all duration-300 ease-out"
                  style={{
                    transform: isMoreActive ? "scale(1.18) translateY(-1px)" : "scale(1) translateY(0px)",
                    color: isMoreActive ? "#F5F5F7" : "#6B7280",
                  }}
                >
                  <LayoutGrid
                    className="h-[22px] w-[22px]"
                    strokeWidth={isMoreActive ? 2.5 : 1.8}
                  />
                </span>

                {/* Label */}
                <span
                  className="relative z-10 font-semibold tracking-wide transition-all duration-300 ease-out leading-none"
                  style={{
                    fontSize: "9px",
                    color: isMoreActive ? "#F5F5F7" : "#6B7280",
                    opacity: isMoreActive ? 1 : 0.75,
                    transform: isMoreActive ? "translateY(0px)" : "translateY(1px)",
                    letterSpacing: isMoreActive ? "0.04em" : "0.02em",
                  }}
                >
                  More
                </span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="bg-popover border-t border-border/40 rounded-t-3xl max-h-[85vh] overflow-y-auto pb-8 z-[100]"
            >
              <SheetHeader className="mb-4">
                <SheetTitle className="text-sm font-bold text-center text-foreground flex items-center justify-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-primary" /> Additional Menu
                </SheetTitle>
              </SheetHeader>
              
              {/* Grid Layout of more items */}
              <div className="grid grid-cols-3 gap-3 p-1">
                {moreLinks.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.to);
                  return (
                    <SheetTrigger asChild key={item.to}>
                      <Link
                        to={item.to}
                        className={cn(
                          "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all gap-1.5 text-center cursor-pointer select-none",
                          isActive
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-muted/20 border-border/20 text-muted-foreground hover:bg-muted/40"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-xl border transition-all",
                          isActive 
                            ? "bg-primary text-primary-foreground border-primary" 
                            : "bg-background border-border/30 text-foreground"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className={cn(
                          "text-[10px] font-semibold tracking-wide truncate max-w-full",
                          isActive ? "text-primary" : "text-foreground/80"
                        )}>{item.label}</span>
                      </Link>
                    </SheetTrigger>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
};

export default BottomNav;
