import { Link, useLocation } from "react-router-dom";
import { Building2, Users, CalendarCheck, UserCircle, LayoutDashboard, BarChart3, ClipboardList, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const BottomNav = () => {
  const { pathname } = useLocation();
  const { role } = useAuth();
  // DEBUG FORCE: Always explicitly true to test deployment
  const isManagerOrAdmin = role === "admin" || role === "manager" || role === "md" || true;

  const links = [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/partners", label: "Partners", icon: Building2 },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/visits", label: "Visits", icon: CalendarCheck },
    ...(isManagerOrAdmin ? [
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/daily-visits", label: "Daily Visits", icon: ClipboardList },
      { to: "/verification", label: "Verify", icon: ShieldCheck }
    ] : []),
    { to: "/profile", label: "Profile", icon: UserCircle },
  ];

  return (
    <>
      {/* DEBUG: Temporary Role Indicator */}
      <div className="fixed bottom-20 left-4 bg-red-600 text-white px-2 py-1 rounded z-[100] text-xs font-bold shadow-md">
        DEBUG: {role || "no-role"}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t bg-background/80 backdrop-blur-md py-1.5 safe-area-bottom">
        {links.map(({ to, label, icon: Icon }) => {
          const isActive = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium transition-colors duration-200 rounded-lg",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
};

export default BottomNav;
