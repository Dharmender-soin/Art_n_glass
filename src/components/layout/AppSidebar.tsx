import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Building2,
  Users,
  UserCircle,
  CalendarCheck,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

const AppSidebar = () => {
  const { pathname } = useLocation();
  const { role, signOut, user } = useAuth();
  const isManagerOrAdmin = role === "admin" || role === "manager";

  const links = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/partners", label: "Partners", icon: Building2 },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/visits", label: "Visits", icon: CalendarCheck },
    ...(isManagerOrAdmin
      ? [{ to: "/reports", label: "Reports", icon: BarChart3 }]
      : []),
    { to: "/profile", label: "Profile", icon: UserCircle },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar-background text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex h-16 items-center gap-3 px-6 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
          <Briefcase className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight">Sales CRM</h1>
          <p className="text-xs text-sidebar-foreground/60 capitalize">{role || "executive"}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === to
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
