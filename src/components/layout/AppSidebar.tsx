import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Building2,
  Users,
  CalendarCheck,
  BarChart3,
  LayoutDashboard,
  LogOut,
  UserCircle,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const AppSidebar = () => {
  const { pathname } = useLocation();
  const { role, signOut } = useAuth();
  const isManagerOrAdmin = role === "admin" || role === "manager";

  const links = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/partners", label: "Partners", icon: Building2 },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/visits", label: "Visits", icon: CalendarCheck },
    ...(isManagerOrAdmin
      ? [{ to: "/reports", label: "Reports", icon: BarChart3 }]
      : []),
    ...(role === "admin"
      ? [{ to: "/admin", label: "User Management", icon: Shield }]
      : []),
    { to: "/profile", label: "Profile", icon: UserCircle },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar-background text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
        <img src={logo} alt="Art-N-Glass" className="h-10 w-auto" />
        <div>
          <h1 className="text-sm font-bold tracking-tight">Art-N-Glass</h1>
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
