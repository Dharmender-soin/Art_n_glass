import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import {
  Building2, Users, CalendarCheck, BarChart3, LayoutDashboard,
  LogOut, UserCircle, Shield, ClipboardList, ShieldCheck,
  GitBranch, PanelLeftClose, PanelLeftOpen, Map, Receipt,
  Handshake, Eye, Bell, Settings, TrendingUp,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

// ─── Label animation props helper ───────────────────
const labelMotion = {
  initial: { opacity: 0, x: -8, width: 0 },
  animate: { opacity: 1, x: 0, width: "auto", transition: { duration: 0.2, delay: 0.04 } },
  exit:    { opacity: 0, x: -8, width: 0,     transition: { duration: 0.13 } },
} as const;

const containerVariants = {
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
  hidden:  { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
};

const itemVariants = {
  visible: { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 340, damping: 26 } },
  hidden:  { opacity: 0, x: -12 },
};

// ─── Active Pill (layoutId for smooth transitions) ───
const ACTIVE_PILL_ID = "sidebar-active-pill";

const AppSidebar = () => {
  const { pathname } = useLocation();
  const { role, signOut } = useAuth();
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();

  const isExpanded = isMobile || state === "expanded";
  const isManagerOrAdmin = role === "admin" || role === "manager" || role === "md";
  const isTL = role === "tl";
  const isAccountant = role === "accountant";
  const isBackhand = role === "backhand_executive";
  const isSupportRole = isAccountant || isBackhand;
  const isAdminOnly = role === "admin";

  const links = isSupportRole
    ? [
        { to: "/daily-visits",  label: "Daily Visits",  icon: ClipboardList },
        { to: "/reports",       label: "Reports",        icon: BarChart3 },
        ...(isAccountant ? [{ to: "/conveyance", label: "Conveyance", icon: Receipt }] : []),
        { to: "/profile",       label: "Profile",        icon: UserCircle },
      ]
    : [
        { to: "/",              label: "Dashboard",      icon: LayoutDashboard },
        ...(isManagerOrAdmin ? [{ to: "/md-dashboard", label: "Command Center", icon: Eye }] : []),
        { to: "/notifications", label: "Notification Center", icon: Bell },
        { to: "/partners",      label: "Partners",       icon: Building2 },
        { to: "/clients",       label: "Clients",        icon: Users },
        { to: "/visits",        label: "Visits",         icon: CalendarCheck },
        ...(role === "executive" ? [{ to: "/my-pipeline", label: "My Pipeline", icon: TrendingUp }] : []),
        ...(isAdminOnly ? [{ to: "/notification-settings", label: "Notification Settings", icon: Settings }] : []),
        ...(isManagerOrAdmin ? [
          { to: "/reports",               label: "Reports",               icon: BarChart3 },
          { to: "/daily-visits",          label: "Daily Visits",          icon: ClipboardList },
          { to: "/verification",          label: "Verification",          icon: ShieldCheck },
          { to: "/hierarchy",             label: "Hierarchy",             icon: GitBranch },
          { to: "/live-map",              label: "Live Map",              icon: Map },
          { to: "/conveyance",            label: "Conveyance",            icon: Receipt },
          { to: "/partner-visits",        label: "Partner Visits",        icon: Handshake },
        ] : []),
        ...(isTL ? [
          { to: "/reports",      label: "Reports",      icon: BarChart3 },
          { to: "/daily-visits", label: "Daily Visits", icon: ClipboardList },
          { to: "/hierarchy",    label: "My Team",      icon: GitBranch },
        ] : []),
        ...(role === "admin" ? [{ to: "/admin", label: "User Management", icon: Shield }] : []),
        { to: "/profile",       label: "Profile",       icon: UserCircle },
      ];

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border overflow-hidden">

      {/* ── HEADER ── */}
      <SidebarHeader className="h-16 border-b border-sidebar-border overflow-hidden">
        <div className="flex items-center gap-3 px-3 h-full">

          {/* Logo — spins on mount, rotates on hover */}
          <motion.div
            initial={{ scale: 0, rotate: -180, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            whileHover={{ rotate: 20, scale: 1.12 }}
            whileTap={{ scale: 0.93 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 shrink-0 shadow-md cursor-pointer border border-white/10 backdrop-blur-sm"
          >
            <img src={logo} alt="Art-N-Glass" className="h-6 w-auto object-contain" />
          </motion.div>

          {/* Brand name + role — slide in when expanded */}
          <AnimatePresence mode="wait">
            {isExpanded && (
              <motion.div
                key="brand"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ type: "spring", stiffness: 360, damping: 28 }}
                className="flex flex-col overflow-hidden min-w-0"
              >
                <span className="text-sm font-bold tracking-tight truncate leading-tight">Art-N-Glass</span>
                <span className="text-[10px] text-white/60 capitalize truncate font-medium">
                  {role || "executive"}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SidebarHeader>

      {/* ── NAVIGATION ── */}
      <SidebarContent className="overflow-x-hidden">
        <motion.div
          className="px-2 py-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <SidebarMenu className="space-y-0.5">
            {links.map(({ to, label, icon: Icon }, index) => {
              const isActive = pathname === to;
              return (
                <motion.div key={to} variants={itemVariants} custom={index}>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={label}
                      onClick={() => isMobile && setOpenMobile(false)}
                      className="relative rounded-xl overflow-hidden group/item border border-transparent transition-colors duration-150 hover:border-white/8"
                    >
                      <Link to={to} className="flex items-center gap-3 px-3 py-2.5 w-full">

                        {/* Active background pill — shared layoutId for smooth morph */}
                        {isActive && (
                          <motion.div
                            layoutId={ACTIVE_PILL_ID}
                            className="absolute inset-0 bg-white/15 rounded-xl"
                            transition={{ type: "spring", stiffness: 380, damping: 32 }}
                          />
                        )}

                        {/* Hover glow (non-active) */}
                        {!isActive && (
                          <div className="absolute inset-0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-200 bg-white/8 rounded-xl" />
                        )}

                        {/* Active left indicator bar */}
                        <AnimatePresence>
                          {isActive && (
                            <motion.div
                              layoutId="sidebar-indicator"
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                              initial={{ scaleY: 0, opacity: 0 }}
                              animate={{ scaleY: 1, opacity: 1 }}
                              exit={{ scaleY: 0, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 400, damping: 28 }}
                            />
                          )}
                        </AnimatePresence>

                        {/* Icon */}
                        <motion.div
                          className="relative z-10 shrink-0"
                          whileHover={{ scale: 1.15, rotate: isActive ? 0 : 5 }}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                        >
                          <Icon
                            className={`h-4 w-4 transition-colors duration-150 ${
                              isActive ? "text-white" : "text-white/70 group-hover/item:text-white"
                            }`}
                          />
                        </motion.div>

                        {/* Label */}
                        <AnimatePresence mode="wait">
                          {isExpanded && (
                            <motion.span
                              key={`label-${to}`}
                              {...labelMotion}
                              className={`relative z-10 text-sm truncate overflow-hidden whitespace-nowrap ${
                                isActive ? "font-semibold text-white" : "font-medium text-white/75 group-hover/item:text-white"
                              }`}
                            >
                              {label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              );
            })}
          </SidebarMenu>
        </motion.div>
      </SidebarContent>

      {/* ── FOOTER ── */}
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu className="space-y-0.5">

          {/* Theme Toggle */}
          <SidebarMenuItem>
            <motion.div
              className="flex items-center justify-between px-3 py-1.5 rounded-xl"
              whileHover={{ backgroundColor: "rgba(255,255,255,0.08)" }}
              transition={{ duration: 0.15 }}
            >
              <AnimatePresence mode="wait">
                {isExpanded && (
                  <motion.span
                    key="theme-label"
                    {...labelMotion}
                    className="text-[11px] font-semibold uppercase tracking-wider text-white/60 overflow-hidden whitespace-nowrap"
                  >
                    Theme
                  </motion.span>
                )}
              </AnimatePresence>
              <ThemeSwitcher />
            </motion.div>
          </SidebarMenuItem>

          {/* Sign Out */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              tooltip="Sign Out"
              className="relative group/so rounded-xl overflow-hidden border border-transparent hover:border-red-500/20 transition-all duration-200"
            >
              <div className="absolute inset-0 opacity-0 group-hover/so:opacity-100 transition-opacity duration-200 bg-red-500/10 rounded-xl" />
              <motion.div
                className="relative z-10"
                whileHover={{ rotate: -10, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <LogOut className="h-4 w-4 text-white/70 group-hover/so:text-red-400 transition-colors" />
              </motion.div>
              <span className="relative z-10 text-white/70 group-hover/so:text-red-400 transition-colors">Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Collapse/Expand Toggle */}
          {!isMobile && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleSidebar}
                tooltip={isExpanded ? "Collapse" : "Expand"}
                className="relative group/tog rounded-xl overflow-hidden border border-transparent hover:border-white/10 transition-all duration-200"
              >
                <div className="absolute inset-0 opacity-0 group-hover/tog:opacity-100 transition-opacity duration-200 bg-white/6 rounded-xl" />
                <motion.div
                  className="relative z-10"
                  animate={{ rotate: isExpanded ? 0 : 180 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                >
                  <PanelLeftClose className="h-4 w-4 text-white/60 group-hover/tog:text-white transition-colors" />
                </motion.div>
                <AnimatePresence mode="wait">
                  {isExpanded && (
                    <motion.span
                      key="collapse-label"
                      {...labelMotion}
                      className="relative z-10 text-white/60 group-hover/tog:text-white overflow-hidden whitespace-nowrap transition-colors"
                    >
                      Collapse
                    </motion.span>
                  )}
                </AnimatePresence>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};

export default AppSidebar;
