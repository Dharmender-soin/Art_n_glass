import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Building2, Users, CalendarCheck, UserCircle, Shield, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const BottomNav = () => {
  const { pathname } = useLocation();
  const { role } = useAuth();

  const links = [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/partners", label: "Partners", icon: Building2 },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/visits", label: "Visits", icon: CalendarCheck },
    ...(role === "admin"
      ? [{ to: "/admin", label: "Admin", icon: Shield }]
      : [{ to: "/profile", label: "Profile", icon: UserCircle }]),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t bg-card py-2 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
      {links.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className={cn(
            "flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors",
            pathname === to
              ? "text-primary font-semibold"
              : "text-muted-foreground"
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
};

export default BottomNav;
