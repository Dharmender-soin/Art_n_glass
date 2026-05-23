import { Link, useLocation } from "react-router-dom";
import {
  Building2, Users, CalendarCheck, UserCircle,
  LayoutDashboard, BarChart3, ClipboardList,
  ShieldCheck, GitBranch, Receipt, Handshake, TrendingUp, Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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

  const isManagerOrAdmin = role === "admin" || role === "manager" || role === "md";
  const isAccountant = role === "accountant";

  const links: NavItem[] = isAccountant
    ? [
        { to: "/conveyance", label: "Conveyance", icon: Receipt },
        { to: "/profile",    label: "Profile",    icon: UserCircle },
      ]
    : [
        { to: "/",        label: "Home",     icon: LayoutDashboard },
        ...(isManagerOrAdmin
          ? [{ to: "/md-dashboard", label: "Command", icon: Eye }]
          : []),
        { to: "/partners", label: "Partners", icon: Building2 },
        { to: "/clients",  label: "Clients",  icon: Users },
        { to: "/visits",   label: "Visits",   icon: CalendarCheck },
        ...(isManagerOrAdmin
          ? [
              { to: "/reports",        label: "Reports",   icon: BarChart3 },
              { to: "/daily-visits",   label: "Daily",     icon: ClipboardList },
              { to: "/verification",   label: "Verify",    icon: ShieldCheck },
              { to: "/hierarchy",      label: "Hierarchy", icon: GitBranch },
              { to: "/conveyance",     label: "Conveyance",icon: Receipt },
              { to: "/partner-visits", label: "P.Visits",  icon: Handshake },
            ]
          : [
              { to: "/my-pipeline", label: "Pipeline", icon: TrendingUp },
            ]),
        { to: "/profile", label: "Profile", icon: UserCircle },
      ];

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
        {links.map((item) => {
          const isActive =
            item.to === "/"
              ? pathname === "/"
              : pathname.startsWith(item.to);
          return (
            <TabItem key={item.to} item={item} isActive={isActive} />
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
