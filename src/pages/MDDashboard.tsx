import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO, differenceInDays, subDays } from "date-fns";
import {
  Building2, Users, TrendingUp, Award, AlertTriangle, CheckCircle2,
  Clock, ChevronRight, Phone, MapPin, BarChart2, Activity,
  Eye, Zap, Target, Shield, UserCheck, UserX, RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Types ─────────────────────────────────────────────────── */
interface ShowroomStat {
  id: string; name: string; city: string;
  execCount: number; managerCount: number;
  visitsThisWeek: number; wosCount: number; wonCount: number;
  lastActivity: string | null;
}

interface EmployeeStat {
  userId: string; fullName: string; showroomName: string; showroomId: string;
  role: string; visits7d: number; partnerVisits7d: number;
  wosCount: number; wonCount: number; lastVisitDate: string | null;
  status: "active" | "at_risk" | "inactive";
}

interface PartnerStat {
  id: string; name: string; company: string; mobile: string;
  lastVisitDate: string | null; lastVisitBy: string;
  wosCount: number; daysSinceVisit: number;
}

interface Alert {
  id: string; type: "danger" | "warning" | "success";
  message: string; sub: string;
}

/* ─── Helpers ────────────────────────────────────────────────── */
const employeeStatus = (lastDate: string | null): "active" | "at_risk" | "inactive" => {
  if (!lastDate) return "inactive";
  const days = differenceInDays(new Date(), parseISO(lastDate));
  if (days <= 2) return "active";
  if (days <= 7) return "at_risk";
  return "inactive";
};

const STATUS_CFG = {
  active:   { label: "Active",   dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <UserCheck className="h-3 w-3" /> },
  at_risk:  { label: "At Risk",  dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200",       icon: <Clock className="h-3 w-3" /> },
  inactive: { label: "Inactive", dot: "bg-red-500",     badge: "bg-red-50 text-red-600 border-red-200",             icon: <UserX className="h-3 w-3" /> },
};

const perf = (visits: number, wos: number) => {
  if (visits >= 5 && wos >= 3) return { label: "🟢 Active", cls: "text-emerald-600" };
  if (visits >= 2 || wos >= 1) return { label: "🟡 Slow",   cls: "text-amber-600"   };
  return                              { label: "🔴 Low",    cls: "text-red-500"     };
};

/* ─── KPI Card ───────────────────────────────────────────────── */
const KpiCard = ({ label, value, icon, grad, sub }: {
  label: string; value: number | string; icon: React.ReactNode; grad: string; sub?: string;
}) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 flex items-center gap-2.5 shadow-sm">
    <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white shadow-sm shrink-0`}>
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-xl font-extrabold text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate">{label}</div>
      {sub && <div className="text-[9px] text-slate-300 truncate">{sub}</div>}
    </div>
  </div>
);

/* ─── Showroom Card ──────────────────────────────────────────── */
const ShowroomCard = ({ s }: { s: ShowroomStat }) => {
  const p = perf(s.visitsThisWeek, s.wosCount);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm min-w-[220px]"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-bold text-[13px] text-slate-900 dark:text-white leading-tight">{s.name}</h3>
          {s.city && <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5"><MapPin className="h-2.5 w-2.5" />{s.city}</p>}
        </div>
        <span className={`text-[10px] font-bold ${p.cls}`}>{p.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        {[
          { label: "Executives", value: s.execCount,       color: "text-sky-600" },
          { label: "Visits/wk",  value: s.visitsThisWeek,  color: "text-indigo-600" },
          { label: "WOS Active", value: s.wosCount,        color: "text-amber-600" },
          { label: "Won",        value: s.wonCount,        color: "text-emerald-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1.5 text-center">
            <div className={`text-base font-extrabold ${color}`}>{value}</div>
            <div className="text-[9px] text-slate-400 font-medium">{label}</div>
          </div>
        ))}
      </div>
      {s.lastActivity && (
        <p className="text-[9px] text-slate-400 mt-2 text-right">
          Last active: {format(parseISO(s.lastActivity), "d MMM")}
        </p>
      )}
    </motion.div>
  );
};

/* ─── Employee Row ───────────────────────────────────────────── */
const EmployeeRow = ({ e, idx }: { e: EmployeeStat; idx: number }) => {
  const cfg = STATUS_CFG[e.status];
  const days = e.lastVisitDate
    ? differenceInDays(new Date(), parseISO(e.lastVisitDate))
    : null;
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.03 }}
      className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0"
    >
      {/* Avatar */}
      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
        {e.fullName.charAt(0).toUpperCase()}
      </div>
      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-[12px] text-slate-900 dark:text-white truncate">{e.fullName}</span>
          <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>
            {cfg.icon}{cfg.label}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{e.showroomName}</span>
          <span>·</span>
          <span>{days === null ? "Never visited" : days === 0 ? "Today" : `${days}d ago`}</span>
        </div>
      </div>
      {/* Stats */}
      <div className="flex gap-2 shrink-0">
        <div className="text-center">
          <div className="text-[13px] font-extrabold text-indigo-600">{e.visits7d}</div>
          <div className="text-[8px] text-slate-400">Visits</div>
        </div>
        <div className="text-center">
          <div className="text-[13px] font-extrabold text-amber-600">{e.wosCount}</div>
          <div className="text-[8px] text-slate-400">WOS</div>
        </div>
        <div className="text-center">
          <div className="text-[13px] font-extrabold text-emerald-600">{e.wonCount}</div>
          <div className="text-[8px] text-slate-400">Won</div>
        </div>
      </div>
    </motion.div>
  );
};

/* ─── Alert Banner ───────────────────────────────────────────── */
const AlertBanner = ({ alert }: { alert: Alert }) => {
  const cfg = {
    danger:  { bg: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/30",     icon: <AlertTriangle className="h-4 w-4 text-red-500" />,     dot: "bg-red-500" },
    warning: { bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/30", icon: <Clock className="h-4 w-4 text-amber-500" />,           dot: "bg-amber-500" },
    success: { bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700/30", icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, dot: "bg-emerald-500" },
  }[alert.type];
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${cfg.bg}`}>
      <div className="shrink-0">{cfg.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-tight">{alert.message}</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{alert.sub}</p>
      </div>
    </div>
  );
};

/* ─── Filter Chip ────────────────────────────────────────────── */
const FilterChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold border transition-all
      ${active ? "bg-red-600 text-white border-red-600" : "bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700"}`}
  >
    {label}
  </button>
);

/* ─── Section Header ─────────────────────────────────────────── */
const SectionHeader = ({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) => (
  <div className="flex items-center gap-2 mb-2.5">
    <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center text-white shrink-0">
      {icon}
    </div>
    <h2 className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100">{title}</h2>
    {count !== undefined && (
      <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 px-2 py-0.5 rounded-full ml-1">
        {count}
      </span>
    )}
  </div>
);

/* ─── Main Component ─────────────────────────────────────────── */
const MDDashboard = () => {
  const { role, showroomId } = useAuth();
  const isMdOrAdmin = role === "md" || role === "admin";
  const isManager = role === "manager";
  const [empFilter, setEmpFilter] = useState<"all" | "active" | "at_risk" | "inactive">("all");
  const [showroomFilter, setShowroomFilter] = useState<string>("all");
  const week7Ago = subDays(new Date(), 7).toISOString();
  const days30Ago = subDays(new Date(), 30).toISOString();

  /* ── Showrooms ── */
  const { data: showrooms = [] } = useQuery({
    queryKey: ["md-showrooms"],
    queryFn: async () => {
      const { data } = await supabase.from("showrooms").select("id, name, city");
      return data || [];
    },
  });

  /* ── User Roles (all employees) ── */
  const { data: userRoles = [] } = useQuery({
    queryKey: ["md-user-roles", showroomId, isMdOrAdmin],
    queryFn: async () => {
      let q = supabase.from("user_roles").select("user_id, role, showroom_id");
      if (isManager && showroomId) q = q.eq("showroom_id", showroomId);
      const { data } = await q.in("role", ["executive", "manager"]);
      return data || [];
    },
  });

  /* ── Profiles ── */
  const { data: profiles = [] } = useQuery({
    queryKey: ["md-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data || [];
    },
  });

  /* ── Visits (last 7 days) ── */
  const { data: recentVisits = [], isLoading } = useQuery({
    queryKey: ["md-visits-7d", showroomId, isMdOrAdmin],
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("id, created_by, visit_date, visit_with_type, partner_id, status, partners(name)")
        .gte("visit_date", format(subDays(new Date(), 7), "yyyy-MM-dd"))
        .order("visit_date", { ascending: false });
      return data || [];
    },
  });

  /* ── All visits (for last active date) ── */
  const { data: allVisits = [] } = useQuery({
    queryKey: ["md-all-visits-last"],
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("created_by, visit_date")
        .order("visit_date", { ascending: false });
      return data || [];
    },
  });

  /* ── WOS records ── */
  const { data: wosItems = [] } = useQuery({
    queryKey: ["md-wos-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_scope_items")
        .select("id, created_by, work_status");
      return data || [];
    },
  });

  /* ── Partners ── */
  const { data: partners = [] } = useQuery({
    queryKey: ["md-partners", showroomId, isMdOrAdmin],
    queryFn: async () => {
      let q = supabase.from("partners").select("id, name, company_name, mobile");
      if (isManager && showroomId) q = q.eq("showroom_id", showroomId);
      const { data } = await q;
      return data || [];
    },
  });

  /* ── Partner visits (last 30 days) ── */
  const { data: partnerVisits = [] } = useQuery({
    queryKey: ["md-partner-visits-30d"],
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("partner_id, visit_date, created_by")
        .eq("visit_with_type", "partner")
        .gte("visit_date", format(subDays(new Date(), 30), "yyyy-MM-dd"))
        .order("visit_date", { ascending: false });
      return data || [];
    },
  });

  /* ── Build showroom profile map ── */
  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach(p => { m[p.user_id] = p.full_name || "Unknown"; });
    return m;
  }, [profiles]);

  const showroomMap = useMemo(() => {
    const m: Record<string, string> = {};
    showrooms.forEach(s => { m[s.id] = s.name; });
    return m;
  }, [showrooms]);

  /* ── Last active date per user ── */
  const lastActiveMap = useMemo(() => {
    const m: Record<string, string> = {};
    allVisits.forEach(v => {
      if (!m[v.created_by]) m[v.created_by] = v.visit_date;
    });
    return m;
  }, [allVisits]);

  /* ── Employee stats ── */
  const employeeStats = useMemo((): EmployeeStat[] => {
    return userRoles.map(ur => {
      const visits7d = recentVisits.filter(v => v.created_by === ur.user_id).length;
      const partnerVisits7d = recentVisits.filter(v => v.created_by === ur.user_id && v.visit_with_type === "partner").length;
      const wos = wosItems.filter(w => w.created_by === ur.user_id);
      const won = wos.filter(w => w.work_status === "won").length;
      const lastDate = lastActiveMap[ur.user_id] || null;
      return {
        userId: ur.user_id,
        fullName: profileMap[ur.user_id] || "Unknown",
        showroomName: ur.showroom_id ? (showroomMap[ur.showroom_id] || "—") : "—",
        showroomId: ur.showroom_id || "",
        role: ur.role,
        visits7d,
        partnerVisits7d,
        wosCount: wos.length,
        wonCount: won,
        lastVisitDate: lastDate,
        status: employeeStatus(lastDate),
      };
    }).sort((a, b) => {
      const order = { inactive: 0, at_risk: 1, active: 2 };
      return order[a.status] - order[b.status];
    });
  }, [userRoles, recentVisits, wosItems, lastActiveMap, profileMap, showroomMap]);

  /* ── Showroom stats ── */
  const showroomStats = useMemo((): ShowroomStat[] => {
    return showrooms
      .filter(s => isMdOrAdmin || s.id === showroomId)
      .map(s => {
        const sRoles = userRoles.filter(ur => ur.showroom_id === s.id);
        const execIds = sRoles.filter(ur => ur.role === "executive").map(ur => ur.user_id);
        const mgrIds  = sRoles.filter(ur => ur.role === "manager").map(ur => ur.user_id);
        const allIds  = sRoles.map(ur => ur.user_id);
        const visitsThisWeek = recentVisits.filter(v => allIds.includes(v.created_by)).length;
        const wosAll = wosItems.filter(w => allIds.includes(w.created_by));
        const wonCount = wosAll.filter(w => w.work_status === "won").length;
        const lastDates = allIds.map(id => lastActiveMap[id]).filter(Boolean).sort().reverse();
        return {
          id: s.id, name: s.name, city: (s as any).city || "",
          execCount: execIds.length, managerCount: mgrIds.length,
          visitsThisWeek, wosCount: wosAll.length, wonCount,
          lastActivity: lastDates[0] || null,
        };
      });
  }, [showrooms, userRoles, recentVisits, wosItems, lastActiveMap, isMdOrAdmin, showroomId]);

  /* ── Partner stats ── */
  const partnerStats = useMemo((): PartnerStat[] => {
    return partners.map(p => {
      const pVisits = partnerVisits.filter(v => v.partner_id === p.id);
      const lastVisit = pVisits[0] || null;
      const wos = wosItems.length; // placeholder — would need partner-linked WOS
      const daysSince = lastVisit
        ? differenceInDays(new Date(), parseISO(lastVisit.visit_date))
        : 999;
      return {
        id: p.id, name: p.name,
        company: (p as any).company_name || "",
        mobile: (p as any).mobile || "",
        lastVisitDate: lastVisit?.visit_date || null,
        lastVisitBy: lastVisit ? (profileMap[lastVisit.created_by] || "Unknown") : "—",
        wosCount: pVisits.length,
        daysSinceVisit: daysSince,
      };
    }).sort((a, b) => b.daysSinceVisit - a.daysSinceVisit);
  }, [partners, partnerVisits, profileMap, wosItems]);

  /* ── Smart Alerts ── */
  const alerts = useMemo((): Alert[] => {
    const list: Alert[] = [];
    // Inactive employees
    const inactive = employeeStats.filter(e => e.status === "inactive");
    inactive.slice(0, 3).forEach(e => {
      const days = e.lastVisitDate ? differenceInDays(new Date(), parseISO(e.lastVisitDate)) : null;
      list.push({
        id: `inactive-${e.userId}`, type: "danger",
        message: `${e.fullName} — no visit in ${days ?? "many"} days`,
        sub: `${e.showroomName} · Last seen: ${e.lastVisitDate ? format(parseISO(e.lastVisitDate), "d MMM") : "Never"}`,
      });
    });
    // At risk
    const atRisk = employeeStats.filter(e => e.status === "at_risk");
    if (atRisk.length > 0) {
      list.push({
        id: "atrisk-summary", type: "warning",
        message: `${atRisk.length} employee${atRisk.length > 1 ? "s" : ""} at risk — low visit activity`,
        sub: atRisk.slice(0, 3).map(e => e.fullName).join(", "),
      });
    }
    // Unvisited partners
    const unvisited = partnerStats.filter(p => p.daysSinceVisit >= 30);
    if (unvisited.length > 0) {
      list.push({
        id: "unvisited-partners", type: "warning",
        message: `${unvisited.length} partner${unvisited.length > 1 ? "s" : ""} not visited in 30+ days`,
        sub: unvisited.slice(0, 3).map(p => p.name).join(", "),
      });
    }
    // Top performers
    const top = employeeStats.filter(e => e.status === "active" && e.visits7d >= 5).slice(0, 2);
    top.forEach(e => {
      list.push({
        id: `top-${e.userId}`, type: "success",
        message: `${e.fullName} — ${e.visits7d} visits this week 🏆`,
        sub: `${e.wosCount} WOS · ${e.wonCount} won · ${e.showroomName}`,
      });
    });
    return list;
  }, [employeeStats, partnerStats]);

  /* ── Summary KPIs ── */
  const totalVisits7d = recentVisits.length;
  const activeCount   = employeeStats.filter(e => e.status === "active").length;
  const inactiveCount = employeeStats.filter(e => e.status === "inactive").length;
  const totalWOS      = wosItems.length;
  const totalWon      = wosItems.filter(w => w.work_status === "won").length;

  /* ── Filter employees ── */
  const filteredEmployees = useMemo(() => {
    let list = empFilter === "all" ? employeeStats : employeeStats.filter(e => e.status === empFilter);
    if (showroomFilter !== "all") list = list.filter(e => e.showroomId === showroomFilter);
    return list;
  }, [employeeStats, empFilter, showroomFilter]);

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 space-y-3">
        <div className="h-10 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
        {[1,2,3].map(i => <div key={i} className="h-20 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">

      {/* ── Header ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-sm shrink-0">
            <Shield className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {isMdOrAdmin ? "All Showrooms" : "My Showroom"} · {role?.toUpperCase()}
            </div>
            <h1 className="text-[16px] font-extrabold text-slate-900 dark:text-white leading-tight">
              Command Center
            </h1>
          </div>
          <div className="ml-auto text-[9px] font-semibold text-slate-400 text-right leading-tight">
            Last 7 days<br />
            <span className="text-red-500">{format(new Date(), "d MMM yyyy")}</span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-4">

        {/* ── Smart Alerts ── */}
        {alerts.length > 0 && (
          <div>
            <SectionHeader icon={<Zap className="h-3 w-3" />} title="Smart Alerts" count={alerts.length} />
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <AlertBanner alert={a} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── KPI Strip ── */}
        <div>
          <SectionHeader icon={<BarChart2 className="h-3 w-3" />} title="Overview" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <KpiCard label="Showrooms" value={isMdOrAdmin ? showrooms.length : 1} icon={<Building2 className="h-4 w-4" />} grad="from-slate-600 to-slate-800" />
            <KpiCard label="Employees" value={employeeStats.length} icon={<Users className="h-4 w-4" />} grad="from-indigo-500 to-indigo-700" sub={`${activeCount} active`} />
            <KpiCard label="Visits (7d)" value={totalVisits7d} icon={<Activity className="h-4 w-4" />} grad="from-sky-500 to-blue-600" />
            <KpiCard label="WOS / Won" value={`${totalWOS}/${totalWon}`} icon={<Target className="h-4 w-4" />} grad="from-emerald-500 to-teal-600" />
          </div>
        </div>

        {/* ── Showroom Cards ── */}
        {showroomStats.length > 0 && (
          <div>
            <SectionHeader icon={<Building2 className="h-3 w-3" />} title="Showrooms" count={showroomStats.length} />
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {showroomStats.map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                  <ShowroomCard s={s} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── Employee Performance ── */}
        <div>
          <SectionHeader icon={<Users className="h-3 w-3" />} title="Employee Performance" count={filteredEmployees.length} />

          {/* Status filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2" style={{ scrollbarWidth: "none" }}>
            <FilterChip label="All" active={empFilter === "all"} onClick={() => setEmpFilter("all")} />
            <FilterChip label={`🔴 Inactive (${employeeStats.filter(e=>e.status==="inactive").length})`} active={empFilter === "inactive"} onClick={() => setEmpFilter("inactive")} />
            <FilterChip label={`🟡 At Risk (${employeeStats.filter(e=>e.status==="at_risk").length})`} active={empFilter === "at_risk"} onClick={() => setEmpFilter("at_risk")} />
            <FilterChip label={`🟢 Active (${employeeStats.filter(e=>e.status==="active").length})`} active={empFilter === "active"} onClick={() => setEmpFilter("active")} />
          </div>

          {/* Showroom filter — MD/Admin only */}
          {isMdOrAdmin && showrooms.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-2" style={{ scrollbarWidth: "none" }}>
              <FilterChip label="All Showrooms" active={showroomFilter === "all"} onClick={() => setShowroomFilter("all")} />
              {showrooms.map(s => (
                <FilterChip key={s.id} label={s.name} active={showroomFilter === s.id} onClick={() => setShowroomFilter(s.id)} />
              ))}
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            {filteredEmployees.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-bold text-slate-400">No employees match this filter</p>
                <button onClick={() => { setEmpFilter("all"); setShowroomFilter("all"); }} className="text-xs text-red-500 font-semibold mt-1 underline">Clear filters</button>
              </div>
            ) : (
              filteredEmployees.map((e, i) => <EmployeeRow key={e.userId} e={e} idx={i} />)
            )}
          </div>
        </div>

        {/* ── Partner Utilization ── */}
        <div>
          <SectionHeader icon={<TrendingUp className="h-3 w-3" />} title="Partner Utilization" count={partners.length} />
          <div className="space-y-2">
            {partnerStats.slice(0, 10).map((p, i) => {
              const isUnvisited = p.daysSinceVisit >= 30;
              const isOk = p.daysSinceVisit <= 7;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm px-3 py-2.5 flex items-center gap-2.5
                    ${isUnvisited ? "border-red-100 dark:border-red-900/30" : "border-slate-100 dark:border-slate-800"}`}
                >
                  <div className={`h-2 w-2 rounded-full shrink-0 ${isOk ? "bg-emerald-500" : isUnvisited ? "bg-red-500" : "bg-amber-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[12px] text-slate-900 dark:text-white truncate">{p.name}</p>
                    {p.company && <p className="text-[10px] text-slate-400 truncate">{p.company}</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {p.lastVisitDate
                        ? `Visited ${p.daysSinceVisit === 0 ? "today" : `${p.daysSinceVisit}d ago`} by ${p.lastVisitBy}`
                        : "Never visited"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                      ${isUnvisited ? "bg-red-50 text-red-600 border border-red-200" :
                        isOk ? "bg-emerald-50 text-emerald-600 border border-emerald-200" :
                               "bg-amber-50 text-amber-600 border border-amber-200"}`}>
                      {p.daysSinceVisit >= 999 ? "Never" : `${p.daysSinceVisit}d`}
                    </span>
                    <p className="text-[9px] text-slate-400 mt-0.5">{p.wosCount} visits</p>
                  </div>
                </motion.div>
              );
            })}
            {partnerStats.length === 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 py-8 text-center">
                <p className="text-sm text-slate-400">No partners found</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default MDDashboard;
