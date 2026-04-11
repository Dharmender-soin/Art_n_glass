import { Link, useLocation } from "react-router-dom";
import { Building2, Users, CalendarCheck, UserCircle, LayoutDashboard, BarChart3, ClipboardList, ShieldCheck, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const BottomNav = () => {
  const { pathname } = useLocation();
  const { role } = useAuth();

  const isManagerOrAdmin = role === "admin" || role === "manager" || role === "md";

  const links = [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/partners", label: "Partners", icon: Building2 },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/visits", label: "Visits", icon: CalendarCheck },
    ...(isManagerOrAdmin ? [
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/daily-visits", label: "Daily", icon: ClipboardList },
      { to: "/verification", label: "Verify", icon: ShieldCheck },
      { to: "/hierarchy", label: "Hierarchy", icon: GitBranch },
    ] : []),
    { to: "/profile", label: "Profile", icon: UserCircle },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-[#0A0B0E]/95 backdrop-blur-2xl border-t border-white/5 py-2 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-8px_30px_rgba(0,0,0,0.4)]">
        {links.map(({ to, label, icon: Icon }) => {
          const isActive = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "group relative flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all duration-300",
                isActive ? "text-[#F5F5F7]" : "text-[#8E939D] hover:text-[#A1A5AE] hover:bg-white/5"
              )}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-t from-[#A6192E]/20 to-transparent rounded-xl border-b-2 border-[#C21833]" />
              )}
              <div className="relative flex flex-col items-center gap-1 z-10 pointer-events-none">
                <Icon className={cn("h-5 w-5 transition-transform duration-300", isActive && "scale-110 text-[#F5F5F7]")} strokeWidth={isActive ? 2.5 : 2} />
                <span className={cn("text-[9px] font-semibold tracking-wider transition-all duration-300", isActive ? "opacity-100" : "opacity-70")}>{label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </>
  );
};

export default BottomNav;
