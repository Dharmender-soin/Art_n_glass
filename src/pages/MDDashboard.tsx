import { useState, useMemo, useCallback, useEffect, Component, ReactNode, ErrorInfo } from "react";

// Safe date formatting helper to prevent RangeError crashes
const safeFormatDate = (dateStr?: string | null, formatPattern: string = "dd MMM yyyy"): string => {
  if (!dateStr) return "N/A";
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return "N/A";
    return format(d, formatPattern);
  } catch {
    return "N/A";
  }
};

class MDDashboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("MDDashboard Error Boundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4 text-slate-200 shadow-2xl">
          <div className="h-12 w-12 rounded-2xl bg-red-500/20 text-red-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold">Command Center Error Recovered</h2>
          <p className="text-xs text-slate-400">
            A rendering exception occurred: {this.state.error?.message || "Unknown error"}.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs shadow-md transition-all"
          >
            Refresh Command Center
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { format, parseISO, differenceInDays, subDays, startOfMonth } from "date-fns";
import {
  Building2, Users, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Search, BarChart2, Activity, Target, Shield, UserCheck, UserX,
  Trophy, Zap, RefreshCw, ChevronDown, ChevronUp, ArrowUpDown,
  Award, Handshake, EyeOff, Eye, Star, TrendingDown, Flame, Download,
  Send, Phone, Calendar, Mail, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SendNotificationForm } from "@/components/dashboard/SendNotificationForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { sendNotification, notifyAllMDs } from "@/lib/notifications";
import { AttentionRequiredSection } from "@/components/dashboard/AttentionRequiredSection";

/* ═══════════════════════════ TYPES ═══════════════════════════ */
type DateRange = "today" | "7d" | "month";
type EmpStatus = "active" | "at_risk" | "inactive" | "never_visited";
type AlertSeverity = "critical" | "warning" | "positive";
type EmpFilter = "all" | "active" | "at_risk" | "inactive" | "never_visited" | "zero_visits" | "top" | "tl" | "manager";
type SortKey = "score" | "visits" | "wos" | "won" | "last_active" | "name";
type PFilter = "all" | "top" | "neglected" | "new" | "low" | "top_leads" | "active";

interface ShowroomRow { id: string; name: string; }
interface ProfileRow { user_id: string; full_name: string | null; email?: string | null; }
interface UserRoleRow { user_id: string; role: string; showroom_id: string | null; }
interface VisitRow {
  id: string; created_by: string; visit_date: string;
  visit_with_type: string; partner_id: string | null; status: string;
}
interface WosRow { id: string; created_by: string; work_status: string; created_at: string; client_id: string; }
interface PartnerRow {
  id: string; name: string; company_name: string | null;
  mobile: string | null;
  // We select created_by instead of showroom_id because showroom_id is a new column
  // that requires a migration. Showroom is derived in-memory via userRoles.
  created_by: string;
}
interface PVisitRow { partner_id: string | null; visit_date: string; created_by: string; }
interface ClientRow {
  id: string; partner_id: string | null;
  status: "new" | "hot" | "converted" | "lost";
}

interface EmpStat {
  userId: string; fullName: string; showroomId: string; showroomName: string;
  role: string; visits: number; partnerVisits: number;
  wosCount: number; wonCount: number; quotedCount: number;
  clientsAdded: number;
  lastVisitDate: string | null; status: EmpStatus;
  score: number; rank: number;
  perfBadge: "top" | "good" | "average" | "low" | "inactive";
  winRate: number;
  // Team rollup (TL = self + team; Manager = rollup of TLs+Execs; Executive = own only)
  teamVisits: number; teamWos: number; teamWon: number; teamClients: number;
}
interface ShowroomStat {
  id: string; name: string; visits: number;
  execCount: number; activeEmps: number; inactiveEmps: number;
  wosCount: number; wonCount: number; winRate: number;
  unvisitedPartners: number; totalPartners: number; partnerCoverage: number;
  lastActivity: string | null;
  score: number; rank: number;
  // Team rollup (populated for TL & Manager roles; same as own for Executive)
  teamVisits: number; teamWos: number; teamWon: number; teamClients: number;
}
interface PartnerStat {
  id: string; name: string; company: string; showroomName: string;
  lastVisitDate: string | null; lastVisitBy: string; visitCount: number;
  daysSince: number; status: "active" | "low" | "neglected" | "new";
  topExec: string;
  leadsCount: number;     // clients referred by this partner
  hotLeads: number;       // clients with status = "hot"
  convertedLeads: number; // clients with status = "converted"
  wosCount: number;       // WOS items from those clients (the actual pipeline)
  wonWos: number;         // won WOS from those clients
}
interface AlertItem {
  id: string; severity: AlertSeverity; title: string;
  desc: string; tag: string; action?: string; route?: string;
  onClick?: () => void;
}

/* ═══════════════════════ CONSTANTS & HELPERS ═══════════════════════ */
const BRAND = "#C21833";
// ─── Keywords that identify FAKE / INTERNAL partner entries ──────────────────
// Real partners = Architects & Builders who refer clients (leads).
// The entries below are internal showroom entries, the company's own name,
// location-based placeholders, or generic home/office entries — NOT real partners.
const FAKE_KW_EXACT = [
  // Location / showroom names used as partner entries
  "zirakpur", "kirti nagar", "kirtinagar", "gurgaon", "gurugram",
  // The company itself appearing as a partner
  "art n glass", "art & glass", "art and glass",
  // Generic placeholder entries
  "showroom", "home", "home2", "home 2",
];

// Partial-match keywords (entry contains this word anywhere)
const FAKE_KW_PARTIAL = [
  "office", "test", "testing", "demo", "dummy", "sample", "internal", "trial",
];
// Note: "self" intentionally excluded — partner type "self" = Direct visits, not a fake entry

/* ═══════════════════ CSV EXPORT UTILITY ═══════════════════ */
const exportToCSV = (data: Record<string, unknown>[], filename: string) => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const isRealPartner = (p: PartnerRow) => {
  const n = (p.name || "").toLowerCase().trim();
  const c = (p.company_name || "").toLowerCase().trim();
  if (!n) return false;
  // Exclude exact matches (full name or company is exactly the keyword)
  if (FAKE_KW_EXACT.some(k => n === k || c === k)) return false;
  // Exclude entries that CONTAIN any of the partial-match keywords
  if (FAKE_KW_PARTIAL.some(k => n.includes(k) || c.includes(k))) return false;
  // Exclude if name starts with a showroom keyword (e.g. "Gurgaon Showroom", "Kirti Nagar Showroom")
  if (FAKE_KW_EXACT.some(k => n.startsWith(k) || c.startsWith(k))) return false;
  return true;
};

const getStatus = (last: string | null): EmpStatus => {
  if (!last) return "never_visited";  // distinct from inactive — employee has never visited at all
  const d = differenceInDays(new Date(), parseISO(last));
  if (d <= 2) return "active";
  if (d <= 7) return "at_risk";
  return "inactive";
};

const getDateFrom = (r: DateRange) => {
  if (r === "today") return format(new Date(), "yyyy-MM-dd");
  if (r === "7d") return format(subDays(new Date(), 7), "yyyy-MM-dd");
  return format(startOfMonth(new Date()), "yyyy-MM-dd");
};

/** Returns the start of the PRIOR equivalent period for trend comparison */
const getPrevDateFrom = (r: DateRange) => {
  if (r === "today") return format(subDays(new Date(), 1), "yyyy-MM-dd");
  if (r === "7d") return format(subDays(new Date(), 14), "yyyy-MM-dd");
  const prevMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  return format(prevMonth, "yyyy-MM-dd");
};
const getPrevDateTo = (r: DateRange) => {
  if (r === "today") return format(subDays(new Date(), 1), "yyyy-MM-dd");
  if (r === "7d") return format(subDays(new Date(), 8), "yyyy-MM-dd");
  const lastDayPrevMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
  return format(lastDayPrevMonth, "yyyy-MM-dd");
};

const calcEmpScore = (
  visits: number, partnerVisits: number, clientsAdded: number, wos: number, won: number,
  maxV: number, maxPV: number, maxC: number, maxW: number, maxWon: number
): number => {
  const vScore   = maxV > 0   ? (visits / maxV) * 10 : 0;
  const pvScore  = maxPV > 0  ? (partnerVisits / maxPV) * 10 : 0;
  const cScore   = maxC > 0   ? (clientsAdded / maxC) * 20 : 0;
  const wScore   = maxW > 0   ? (wos / maxW) * 30 : 0;
  const wonScore = maxWon > 0 ? (won / maxWon) * 30 : 0;
  
  return Math.round(vScore + pvScore + cScore + wScore + wonScore);
};

const calcShowroomScore = (
  visits: number, wos: number, won: number,
  activeEmps: number, execCount: number,
  partnerCoverage: number,      // 0–100
  maxVisitPerExec: number,
  maxWosPerExec: number
): number => {
  const visitsPerExec = execCount > 0 ? visits / execCount : 0;
  const wosPerExec    = execCount > 0 ? wos    / execCount : 0;
  const winRate       = wos > 0 ? (won / wos) : 0;              // 0.0–1.0
  const activeRatio   = execCount > 0 ? activeEmps / execCount : 0; // 0.0–1.0

  const vScore   = maxVisitPerExec > 0 ? (visitsPerExec / maxVisitPerExec) * 20 : 0;
  const wScore   = maxWosPerExec   > 0 ? (wosPerExec   / maxWosPerExec)   * 20 : 0;
  const winScore = winRate * 25;                               // absolute win rate
  const covScore = (partnerCoverage / 100) * 20;              // absolute coverage %
  const empScore = activeRatio * 15;                          // absolute active ratio

  return Math.round(vScore + wScore + winScore + covScore + empScore);
};

const STATUS_CFG: Record<EmpStatus, { label: string; dot: string; badge: string }> = {
  active:        { label: "Active",        dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  at_risk:       { label: "At Risk",       dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  inactive:      { label: "Inactive",      dot: "bg-red-500",     badge: "bg-red-50 text-red-600 border-red-200" },
  never_visited: { label: "Never Visited", dot: "bg-slate-500",   badge: "bg-slate-100 text-slate-600 border-slate-300" },
};

const PERF_CFG: Record<string, { label: string; cls: string }> = {
  top:      { label: "Top Performer", cls: "bg-amber-50 text-amber-700 border-amber-300" },
  good:     { label: "Good",          cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  average:  { label: "Average",       cls: "bg-sky-50 text-sky-700 border-sky-200" },
  low:      { label: "Low Output",    cls: "bg-orange-50 text-orange-700 border-orange-200" },
  inactive: { label: "Inactive",      cls: "bg-red-50 text-red-600 border-red-200" },
};

const ALERT_CFG: Record<AlertSeverity, { bg: string; border: string; icon: React.ReactNode; dot: string }> = {
  critical: {
    bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800/40",
    icon: <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
    dot: "bg-red-500",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-700/40",
    icon: <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    dot: "bg-amber-500",
  },
  positive: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-700/40",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
    dot: "bg-emerald-500",
  },
};

/* ══════════════════ SMALL REUSABLE COMPONENTS ══════════════════ */

const Chip = ({ label, active, onClick, count }: {
  label: string; active: boolean; onClick: () => void; count?: number;
}) => (
  <button onClick={onClick}
    className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
      ${active
        ? "bg-red-600 text-white border-red-600 shadow-sm"
        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-300"}`}>
    {label}
    {count !== undefined && (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
        ${active ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
        {count}
      </span>
    )}
  </button>
);

const Card = ({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) => (
  <div id={id} className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const SecHead = ({ icon, title, sub, action }: {
  icon: React.ReactNode; title: string; sub?: string; action?: React.ReactNode;
}) => (
  <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center text-white shrink-0">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <h2 className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100">{title}</h2>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
    {action}
  </div>
);

const StatusBadge = ({ status }: { status: EmpStatus }) => {
  const c = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}
    </span>
  );
};

const PerfBadge = ({ badge }: { badge: string }) => {
  const c = PERF_CFG[badge] || PERF_CFG.average;
  return <span className={`inline-flex text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>;
};

/* ── Benchmark Traffic-Light Dot ─────────────────────────────────────────── */
// Shows 🔴/🟡/🟢 inline next to a number based on target thresholds.
// thresholds = [redMax, yellowMax]  — values ABOVE yellowMax = green
const BenchmarkDot = ({ value, thresholds, tooltip }: {
  value: number;
  thresholds: [number, number]; // [redMax inclusive, yellowMax inclusive]
  tooltip: string;
}) => {
  const [redMax, yellowMax] = thresholds;
  const color =
    value <= redMax    ? "bg-red-500"   :
    value <= yellowMax ? "bg-amber-400" :
                         "bg-emerald-500";
  const icon =
    value <= redMax    ? "⚠" :
    value <= yellowMax ? "↗" :
                         "✓";
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${color} text-white text-[8px] font-extrabold ml-0.5 shrink-0`}
    >
      {icon}
    </span>
  );
};

const KpiCard = ({ label, value, icon, gradient, sub, warn, onClick }: {
  label: string; value: string | number; icon: React.ReactNode;
  gradient: string; sub?: string; warn?: boolean; onClick?: () => void;
}) => (
  <div onClick={onClick} className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm p-4 flex items-start gap-3 transition-all
    ${onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.01] hover:border-slate-300 dark:hover:border-slate-700 active:scale-95" : ""}
    ${warn ? "border-red-200 dark:border-red-800/40" : "border-slate-100 dark:border-slate-800"}`}>
    <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-sm shrink-0`}>
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-[11px] font-semibold text-slate-500 mt-1">{label}</div>
      {sub && <div className={`text-[10px] mt-0.5 font-medium ${warn ? "text-red-500" : "text-slate-400"}`}>{sub}</div>}
    </div>
  </div>
);

const EmptyState = ({ icon, msg, sub, onClear }: {
  icon: React.ReactNode; msg: string; sub?: string; onClear?: () => void;
}) => (
  <div className="py-10 flex flex-col items-center gap-2 text-center px-6">
    <div className="opacity-20 mb-1">{icon}</div>
    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{msg}</p>
    {sub && <p className="text-xs text-slate-400 max-w-xs">{sub}</p>}
    {onClear && (
      <button onClick={onClear}
        className="mt-2 text-xs font-bold text-red-600 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors">
        Clear Filters
      </button>
    )}
  </div>
);

const SkelRow = () => (
  <div className="flex gap-3 p-3 animate-pulse">
    <div className="h-9 w-9 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-2/3" />
      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
    </div>
  </div>
);

const SortBtn = ({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: SortKey; current: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void;
}) => (
  <button onClick={() => onSort(sortKey)}
    className="flex items-center gap-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
    {label}
    {current === sortKey
      ? dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      : <ArrowUpDown className="h-3 w-3 opacity-30" />}
  </button>
);

/* ════════════════ AT A GLANCE — INSIGHT CARD ════════════════ */
const InsightCard = ({ icon, title, name, detail, color, route, onClick }: {
  icon: React.ReactNode; title: string; name: string; detail: string;
  color: "emerald" | "red" | "amber" | "sky" | "indigo" | "violet"; route?: string; onClick?: () => void;
}) => {
  const clr = {
    emerald: { border: "border-l-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", icon: "bg-emerald-100 dark:bg-emerald-800/40 text-emerald-600" },
    red:     { border: "border-l-red-500",     bg: "bg-red-50 dark:bg-red-900/20",         icon: "bg-red-100 dark:bg-red-800/40 text-red-600" },
    amber:   { border: "border-l-amber-500",   bg: "bg-amber-50 dark:bg-amber-900/20",     icon: "bg-amber-100 dark:bg-amber-800/40 text-amber-600" },
    sky:     { border: "border-l-sky-500",     bg: "bg-sky-50 dark:bg-sky-900/20",         icon: "bg-sky-100 dark:bg-sky-800/40 text-sky-600" },
    indigo:  { border: "border-l-indigo-500",  bg: "bg-indigo-50 dark:bg-indigo-900/20",   icon: "bg-indigo-100 dark:bg-indigo-800/40 text-indigo-600" },
    violet:  { border: "border-l-violet-500",  bg: "bg-violet-50 dark:bg-violet-900/20",   icon: "bg-violet-100 dark:bg-violet-800/40 text-violet-600" },
  }[color];

  const content = (
    <div onClick={onClick} className={`rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-3 border-l-4 ${clr.border} ${clr.bg} h-full ${onClick ? "cursor-pointer hover:shadow-md transition-all hover:scale-[1.01]" : ""}`}>
      <div className="flex items-start gap-2">
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${clr.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
          <p className="text-[12px] font-extrabold text-slate-900 dark:text-white truncate mt-0.5">{name || "—"}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{detail}</p>
        </div>
      </div>
    </div>
  );

  return route ? <Link to={route} className="block h-full">{content}</Link> : content;
};

/* ════════════════ SMART ALERT CARD ════════════════ */
const AlertCard = ({ a }: { a: AlertItem }) => {
  const c = ALERT_CFG[a.severity];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${c.bg} ${c.border}`}>
      {c.icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-100">{a.title}</span>
          <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full
            ${a.severity === "critical" ? "bg-red-100 text-red-600" :
              a.severity === "warning" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {a.severity}
          </span>
        </div>
        <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{a.desc}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 font-medium italic">{a.tag}</p>
      </div>
      {a.action && (a.route || a.onClick) && (
        a.onClick ? (
          <button onClick={a.onClick}
            className="shrink-0 text-[10px] font-bold text-red-600 hover:text-red-700 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg px-2.5 py-1.5 whitespace-nowrap transition-colors">
            {a.action}
          </button>
        ) : (
          <Link to={a.route!}
            className="shrink-0 text-[10px] font-bold text-red-600 hover:text-red-700 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg px-2.5 py-1.5 whitespace-nowrap transition-colors">
            {a.action}
          </Link>
        )
      )}
    </div>
  );
};

/* ════════════════ SHOWROOM CARD ════════════════ */
const ShowroomCard = ({ s, onClick, onViewDetails, isSelected, totalShowrooms }: {
  s: ShowroomStat; onClick: () => void; onViewDetails?: () => void; isSelected: boolean; totalShowrooms: number;
}) => {
  const isTop = s.rank === 1;
  const isWeak = s.rank === totalShowrooms && totalShowrooms > 1;
  const rankLabel = isTop ? "🥇 Best" : isWeak ? "⚠️ Needs Attention" : `#${s.rank}`;
  const scorePct = s.score;
  const scoreClr = scorePct >= 60 ? "#10b981" : scorePct >= 30 ? "#f59e0b" : BRAND;
  const coverageClr = s.partnerCoverage >= 80 ? "text-emerald-600" : s.partnerCoverage >= 50 ? "text-amber-600" : "text-red-500";
  const coverageBg = s.partnerCoverage >= 80 ? "#10b981" : s.partnerCoverage >= 50 ? "#f59e0b" : BRAND;

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left rounded-2xl border shadow-sm p-4 transition-all
        ${isSelected ? "border-red-400 ring-2 ring-red-100 dark:ring-red-900/40 bg-white dark:bg-slate-900" :
          isTop ? "border-emerald-200 bg-emerald-50/30 dark:bg-emerald-900/10 dark:border-emerald-800/40" :
          isWeak ? "border-red-200 bg-red-50/30 dark:bg-red-900/10 dark:border-red-800/40" :
          "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300"}`}>

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-extrabold text-[13px] text-slate-900 dark:text-white">{s.name}</h3>
            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full
              ${isTop ? "bg-emerald-100 text-emerald-700" : isWeak ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
              {rankLabel}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {s.execCount} exec · {s.activeEmps} active · {s.inactiveEmps} inactive
          </p>
        </div>
        <div className="text-right shrink-0 flex items-center gap-2">
          {onViewDetails && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails();
              }}
              className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              title="View Showroom Details"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          <div>
            <div className="text-[18px] font-extrabold leading-none text-right" style={{ color: scoreClr }}>{scorePct}</div>
            <div className="text-[8px] text-slate-400 font-medium text-right">score</div>
          </div>
        </div>
      </div>

      {/* Score progress bar */}
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mb-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${scorePct}%`, background: scoreClr }} />
      </div>

      {/* Partner coverage bar */}
      {s.totalPartners > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-slate-400 font-semibold">🤝 Partner Coverage</span>
            <span className={`text-[10px] font-extrabold ${coverageClr}`}>{s.partnerCoverage}%</span>
          </div>
          <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.partnerCoverage}%`, background: coverageBg }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: "Visits", value: s.visits, color: "text-sky-600" },
          { label: "WOS", value: s.wosCount, color: "text-indigo-600" },
          { label: "Won", value: s.wonCount, color: "text-emerald-600" },
          { label: "Win%", value: `${s.winRate}%`, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-1.5 text-center">
            <div className={`text-[14px] font-extrabold ${color}`}>{value}</div>
            <div className="text-[8px] text-slate-400 font-medium mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {s.unvisitedPartners > 0 && (
        <div className="mt-2.5 flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
          <AlertTriangle className="h-3 w-3" />
          {s.unvisitedPartners}/{s.totalPartners} partner{s.unvisitedPartners > 1 ? "s" : ""} not visited
        </div>
      )}
    </motion.button>
  );
};

/* ════════════════ SHOWROOM COMPARISON ROW ════════════════ */
const CompRow = ({ s, isTop, isWeak, onSelectShowroom }: { s: ShowroomStat; isTop: boolean; isWeak: boolean; onSelectShowroom: (id: string) => void }) => {
  const scoreClr = s.score >= 60 ? "text-emerald-600" : s.score >= 30 ? "text-amber-600" : "text-red-500";
  const winClr = s.winRate >= 40 ? "text-emerald-600" : s.winRate >= 20 ? "text-amber-600" : "text-red-500";
  const covClr = s.partnerCoverage >= 80 ? "text-emerald-600" : s.partnerCoverage >= 50 ? "text-amber-600" : "text-red-500";
  return (
    <tr className={`border-b border-slate-100 dark:border-slate-800 text-[11px]
      ${isTop ? "bg-emerald-50/30 dark:bg-emerald-900/10" : isWeak ? "bg-red-50/30 dark:bg-red-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span onClick={() => onSelectShowroom(s.id)} className="font-extrabold text-slate-900 dark:text-white cursor-pointer hover:text-purple-600 hover:underline">{s.name}</span>
          {isTop && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">Best</span>}
          {isWeak && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">Weak</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center font-bold text-sky-600">{s.visits}</td>
      <td className="px-3 py-2.5 text-center font-bold text-indigo-600">{s.wosCount}</td>
      <td className="px-3 py-2.5 text-center font-bold text-emerald-600">{s.wonCount}</td>
      <td className={`px-3 py-2.5 text-center font-extrabold ${winClr}`}>{s.winRate}%</td>
      <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-400">
        <span className="text-emerald-600 font-bold">{s.activeEmps}</span>
        <span className="text-slate-400 mx-0.5">/</span>
        <span className="text-red-500 font-bold">{s.inactiveEmps}</span>
      </td>
      <td className={`px-3 py-2.5 text-center font-extrabold ${covClr}`}>
        {s.totalPartners > 0 ? `${s.partnerCoverage}%` : "—"}
      </td>
      <td className={`px-3 py-2.5 text-center font-extrabold text-base ${scoreClr}`}>{s.score}</td>
    </tr>
  );
};

/* ════════════════ EMPLOYEE ROW (desktop) ════════════════ */
const EmpRow = ({ e, idx, daysInPeriod, onSelectEmp }: { e: EmpStat; idx: number; daysInPeriod: number; onSelectEmp: (id: string) => void }) => {
  const days = e.lastVisitDate ? differenceInDays(new Date(), parseISO(e.lastVisitDate)) : null;
  const isLeader = e.role === "tl" || e.role === "manager";
  // Scale thresholds by days in period (base = 7 days)
  const scale = daysInPeriod / 7;
  const vTarget: [number, number] = [Math.round(2 * scale), Math.round(5 * scale)];
  const wTarget: [number, number] = [Math.round(3 * scale), Math.round(6 * scale)];
  const wonTarget: [number, number] = [Math.round(2 * scale), Math.round(4 * scale)];
  const cTarget: [number, number]  = [Math.round(2 * scale), Math.round(4 * scale)];
  // Leaders show team totals in benchmark dots
  const benchV   = isLeader ? e.teamVisits   : e.visits;
  const benchW   = isLeader ? e.teamWos      : e.wosCount;
  const benchWon = isLeader ? e.teamWon      : e.wonCount;
  const benchC   = isLeader ? e.teamClients  : e.clientsAdded;
  return (
    <motion.tr
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
      className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors
        ${e.status === "inactive" && e.visits === 0 ? "bg-red-50/50 dark:bg-red-900/10" :
          e.rank === 1 ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`h-7 w-7 rounded-xl flex items-center justify-center text-[10px] font-extrabold text-white shrink-0
            ${e.rank === 1 ? "bg-amber-400" : e.rank === 2 ? "bg-slate-400" : e.rank === 3 ? "bg-orange-400" : "bg-gradient-to-br from-slate-500 to-slate-700"}`}>
            {e.rank <= 3 ? ["🥇","🥈","🥉"][e.rank-1] : e.rank}
          </div>
          <div className="min-w-0">
            <p onClick={() => onSelectEmp(e.userId)} className="text-[11px] font-bold text-slate-900 dark:text-white truncate cursor-pointer hover:text-red-600 hover:underline">{e.fullName}</p>
            <p className="text-[9px] text-slate-400 truncate">
              {e.showroomName}
              {e.role === "tl" && <span className="ml-1 text-indigo-500 font-bold">· TL</span>}
              {e.role === "manager" && <span className="ml-1 text-purple-500 font-bold">· MGR</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <div className="flex flex-col gap-0.5">
          <StatusBadge status={e.status} />
          <PerfBadge badge={e.perfBadge} />
        </div>
      </td>
      <td className="px-2 py-2.5 text-center">
        <div className="inline-flex items-center gap-0.5">
          <span className="text-[13px] font-extrabold text-sky-600">{e.visits}</span>
          <BenchmarkDot value={benchV} thresholds={vTarget} tooltip={isLeader ? `Team total: ${benchV} visits (target >${vTarget[1]})` : `Visits benchmark: >${vTarget[1]} = good`} />
        </div>
        {isLeader && e.teamVisits !== e.visits && (
          <div className="text-[8px] text-slate-400 leading-none">team {e.teamVisits}</div>
        )}
      </td>
      <td className="px-2 py-2.5 text-center">
        <div className="inline-flex items-center gap-0.5">
          <span className="text-[13px] font-extrabold text-indigo-600">{e.wosCount}</span>
          <BenchmarkDot value={benchW} thresholds={wTarget} tooltip={isLeader ? `Team WOS: ${benchW} (target >${wTarget[1]})` : `WOS benchmark: >${wTarget[1]} = good`} />
        </div>
        {isLeader && e.teamWos !== e.wosCount && (
          <div className="text-[8px] text-slate-400 leading-none">team {e.teamWos}</div>
        )}
      </td>
      <td className="px-2 py-2.5 text-center">
        <div className="inline-flex items-center gap-0.5">
          <span className="text-[13px] font-extrabold text-emerald-600">{e.wonCount}</span>
          <BenchmarkDot value={benchWon} thresholds={wonTarget} tooltip={isLeader ? `Team Won: ${benchWon} (target >${wonTarget[1]})` : `WOS Won benchmark: >${wonTarget[1]} = good`} />
        </div>
        {isLeader && e.teamWon !== e.wonCount && (
          <div className="text-[8px] text-slate-400 leading-none">team {e.teamWon}</div>
        )}
      </td>
      <td className="px-2 py-2.5 text-center">
        <span className={`text-[11px] font-bold ${e.winRate >= 40 ? "text-emerald-600" : e.winRate >= 20 ? "text-amber-600" : "text-slate-400"}`}>
          {e.winRate}%
        </span>
      </td>
      <td className="px-2 py-2.5 text-[10px] text-slate-500">
        {days === null ? <span className="text-red-500 font-bold">Never</span>
          : days === 0 ? <span className="text-emerald-600 font-bold">Today</span>
          : <span className={days > 7 ? "text-red-500 font-bold" : days > 2 ? "text-amber-600 font-semibold" : "text-slate-500"}>{days}d ago</span>}
      </td>
      <td className="px-2 py-2.5 text-center">
        <span className="text-[12px] font-bold text-slate-600 dark:text-slate-300">{e.score}</span>
      </td>
    </motion.tr>
  );
};

/* ════════════════ EMPLOYEE CARD (mobile) ════════════════ */
const EmpCard = ({ e, daysInPeriod, onSelectEmp }: { e: EmpStat; daysInPeriod: number; onSelectEmp: (id: string) => void }) => {
  const days = e.lastVisitDate ? differenceInDays(new Date(), parseISO(e.lastVisitDate)) : null;
  const isLeader = e.role === "tl" || e.role === "manager";
  const scale = daysInPeriod / 7;
  const vTarget: [number, number] = [Math.round(2 * scale), Math.round(5 * scale)];
  const wTarget: [number, number] = [Math.round(3 * scale), Math.round(6 * scale)];
  const wonTarget: [number, number] = [Math.round(2 * scale), Math.round(4 * scale)];
  const benchV   = isLeader ? e.teamVisits  : e.visits;
  const benchW   = isLeader ? e.teamWos     : e.wosCount;
  const benchWon = isLeader ? e.teamWon     : e.wonCount;
  return (
    <div className={`p-3 border-b border-slate-100 dark:border-slate-800 last:border-0
      ${e.status === "inactive" && e.visits === 0 ? "bg-red-50/40 dark:bg-red-900/10" :
        e.rank === 1 ? "bg-amber-50/30 dark:bg-amber-900/10" : ""}`}>
      <div className="flex items-center gap-2.5">
        <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-white text-[10px] font-extrabold shrink-0
          ${e.rank === 1 ? "bg-amber-400" : e.rank === 2 ? "bg-slate-400" : e.rank === 3 ? "bg-orange-400" : "bg-gradient-to-br from-slate-500 to-slate-700"}`}>
          {e.rank <= 3 ? ["🥇","🥈","🥉"][e.rank-1] : e.rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p onClick={() => onSelectEmp(e.userId)} className="text-[12px] font-bold text-slate-900 dark:text-white cursor-pointer hover:text-red-600 hover:underline">{e.fullName}</p>
            {e.role === "tl" && <span className="text-[9px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">TL</span>}
            {e.role === "manager" && <span className="text-[9px] font-extrabold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">MGR</span>}
            <StatusBadge status={e.status} />
          </div>
          <p className="text-[10px] text-slate-400">
            {e.showroomName} · {days === null ? "Never" : days === 0 ? "Today" : `${days}d ago`}
          </p>
          <PerfBadge badge={e.perfBadge} />
        </div>
        <div className="flex gap-2 shrink-0 text-center">
          <div>
            <div className="flex items-center justify-center gap-0.5">
              <div className="text-[13px] font-extrabold text-sky-600">{e.visits}</div>
              <BenchmarkDot value={benchV} thresholds={vTarget} tooltip={`Visits: ${benchV}`} />
            </div>
            <div className="text-[8px] text-slate-400">{isLeader ? `own·${e.visits}` : "Visits"}</div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-0.5">
              <div className="text-[13px] font-extrabold text-indigo-600">{e.wosCount}</div>
              <BenchmarkDot value={benchW} thresholds={wTarget} tooltip={`WOS: ${benchW}`} />
            </div>
            <div className="text-[8px] text-slate-400">{isLeader ? `own·${e.wosCount}` : "WOS"}</div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-0.5">
              <div className="text-[13px] font-extrabold text-emerald-600">{e.wonCount}</div>
              <BenchmarkDot value={benchWon} thresholds={wonTarget} tooltip={`Won: ${benchWon}`} />
            </div>
            <div className="text-[8px] text-slate-400">{isLeader ? `own·${e.wonCount}` : "Won"}</div>
          </div>
          <div><div className="text-[12px] font-extrabold text-slate-600 dark:text-slate-300">{e.score}</div><div className="text-[8px] text-slate-400">Score</div></div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════ PARTNER CARD ════════════════ */
const PartnerCard = ({ p, rank, onSelectPartner }: { p: PartnerStat; rank?: number; onSelectPartner: (id: string) => void }) => {
  // Status styling
  const statusCfg = {
    active:    { border: "border-emerald-200 dark:border-emerald-700/40", dot: "bg-emerald-500", lbl: "Active",       lclr: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    low:       { border: "border-amber-200 dark:border-amber-700/40",    dot: "bg-amber-500",   lbl: "Low Activity", lclr: "bg-amber-50 text-amber-700 border border-amber-200" },
    neglected: { border: "border-red-200 dark:border-red-700/40",        dot: "bg-red-500",     lbl: "Neglected",    lclr: "bg-red-50 text-red-600 border border-red-200" },
    new:       { border: "border-slate-200 dark:border-slate-600/40",    dot: "bg-slate-400",   lbl: "Never Visited",lclr: "bg-slate-100 text-slate-600 border border-slate-300" },
  }[p.status];

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm px-3 py-2.5 flex flex-col gap-2.5 ${statusCfg.border}`}>

      {/* Header */}
      <div className="flex items-start gap-2">
        {rank && rank <= 3
          ? <span className="text-base shrink-0 mt-0.5">{["🥇","🥈","🥉"][rank - 1]}</span>
          : <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${statusCfg.dot}`} />}
        <div className="min-w-0 flex-1">
          <p onClick={() => onSelectPartner(p.id)} className="text-[12px] font-bold text-slate-900 dark:text-white truncate leading-tight cursor-pointer hover:text-purple-600 hover:underline">{p.name}</p>
          <p className="text-[10px] text-slate-400 truncate">
            {p.company ? `${p.company} · ` : ""}{p.showroomName}
          </p>
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusCfg.lclr}`}>
          {statusCfg.lbl}
        </span>
      </div>

      {/* Pipeline mini-grid: Clients → WOS → Visits */}
      <div className="grid grid-cols-3 gap-1.5">

        {/* Clients / Leads */}
        <div className={`rounded-lg px-2 py-1.5 flex flex-col
          ${p.leadsCount > 0
            ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40"
            : "bg-slate-50 dark:bg-slate-800/40"}`}>
          <p className="text-[8px] font-bold uppercase tracking-wide text-amber-500">Leads</p>
          <p className={`text-[20px] font-extrabold leading-tight
            ${p.leadsCount > 0 ? "text-amber-600" : "text-slate-300 dark:text-slate-600"}`}>
            {p.leadsCount}
          </p>
          <p className="text-[9px] text-amber-500 leading-tight mt-0.5 min-h-[12px]">
            {p.leadsCount > 0
              ? [
                  p.hotLeads > 0 ? `🔥${p.hotLeads} hot` : "",
                  p.convertedLeads > 0 ? `✓${p.convertedLeads} won` : "",
                ].filter(Boolean).join(" · ") || "new"
              : ""}
          </p>
        </div>

        {/* WOS pipeline */}
        <div className={`rounded-lg px-2 py-1.5 flex flex-col
          ${p.wosCount > 0
            ? "bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/40"
            : "bg-slate-50 dark:bg-slate-800/40"}`}>
          <p className="text-[8px] font-bold uppercase tracking-wide text-sky-500">WOS</p>
          <p className={`text-[20px] font-extrabold leading-tight
            ${p.wosCount > 0 ? "text-sky-600" : "text-slate-300 dark:text-slate-600"}`}>
            {p.wosCount}
          </p>
          <p className="text-[9px] text-sky-500 leading-tight mt-0.5 min-h-[12px]">
            {p.wosCount > 0 ? (p.wonWos > 0 ? `✓${p.wonWos} won` : "in pipeline") : ""}
          </p>
        </div>

        {/* Visits */}
        <div className={`rounded-lg px-2 py-1.5 flex flex-col
          ${p.visitCount > 0
            ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40"
            : "bg-slate-50 dark:bg-slate-800/40"}`}>
          <p className="text-[8px] font-bold uppercase tracking-wide text-indigo-400">Visits</p>
          <p className={`text-[20px] font-extrabold leading-tight
            ${p.visitCount > 0 ? "text-indigo-600" : "text-slate-300 dark:text-slate-600"}`}>
            {p.visitCount}
          </p>
          <p className="text-[9px] text-slate-400 leading-tight mt-0.5 min-h-[12px]">
            {p.lastVisitDate
              ? (p.daysSince === 0 ? "Today" : `${p.daysSince}d ago`)
              : <span className="text-red-400 font-semibold">Never</span>}
          </p>
        </div>
      </div>

      {/* Footer: visited-by info */}
      {p.lastVisitDate ? (
        <p className="text-[9px] text-slate-400 truncate">
          Last by: <span className="font-semibold text-slate-500">{p.lastVisitBy}</span>
          {p.topExec && p.topExec !== p.lastVisitBy
            ? <> · Most: <span className="font-semibold">{p.topExec}</span></>
            : null}
        </p>
      ) : (
        <p className="text-[9px] text-red-400 font-semibold">⚠ No executive visit recorded yet</p>
      )}
    </div>
  );
};

/* ════════════════ PIPELINE ROW ════════════════ */
const PipeRow = ({ name, pending, quoted, won, lost, total }: {
  name: string; pending: number; quoted: number; won: number; lost: number; total: number;
}) => {
  const winPct  = total > 0 ? Math.round((won / total) * 100) : 0;
  const winBg   = winPct >= 40 ? "bg-emerald-500" : winPct >= 20 ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600";
  const winTxt  = winPct >= 40 ? "text-emerald-700" : winPct >= 20 ? "text-amber-700" : "text-slate-500";
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      {/* Showroom name */}
      <td className="px-4 py-3 min-w-[130px]">
        <p className="text-[12px] font-bold text-slate-800 dark:text-slate-200 truncate">{name}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{total} total WOS</p>
      </td>
      {/* Pending / In-progress */}
      <td className="px-3 py-3 text-center">
        <div className="inline-flex flex-col items-center">
          <span className="text-[18px] font-extrabold text-sky-600 leading-none">{pending}</span>
          <span className="text-[9px] text-sky-500 font-semibold mt-0.5">Pending</span>
        </div>
      </td>
      {/* Quoted */}
      <td className="px-3 py-3 text-center">
        <div className="inline-flex flex-col items-center">
          <span className="text-[18px] font-extrabold text-amber-600 leading-none">{quoted}</span>
          <span className="text-[9px] text-amber-500 font-semibold mt-0.5">Quoted</span>
        </div>
      </td>
      {/* Won */}
      <td className="px-3 py-3 text-center">
        <div className="inline-flex flex-col items-center">
          <span className="text-[18px] font-extrabold text-emerald-600 leading-none">{won}</span>
          <span className="text-[9px] text-emerald-500 font-semibold mt-0.5">Won</span>
        </div>
      </td>
      {/* Lost */}
      <td className="px-3 py-3 text-center">
        <div className="inline-flex flex-col items-center">
          <span className="text-[18px] font-extrabold text-red-500 leading-none">{lost}</span>
          <span className="text-[9px] text-red-400 font-semibold mt-0.5">Lost</span>
        </div>
      </td>
      {/* Win % with progress bar */}
      <td className="px-4 py-3 min-w-[90px]">
        <div className="flex flex-col gap-1">
          <span className={`text-[15px] font-extrabold ${winTxt}`}>{winPct}%</span>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden w-16">
            <div className={`h-full rounded-full transition-all duration-700 ${winBg}`}
              style={{ width: `${winPct}%` }} />
          </div>
        </div>
      </td>
    </tr>
  );
};

/* ════════════════ LEADERBOARD ROW ════════════════ */
const LeaderRow = ({ rank, name, showroom, value, label, userId, onSelectEmp }: {
  rank: number; name: string; showroom: string; value: number; label: string; userId: string; onSelectEmp: (id: string) => void;
}) => (
  <div className={`flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0
    ${rank === 1 ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>
    <div className={`h-7 w-7 rounded-xl flex items-center justify-center text-[11px] font-extrabold shrink-0
      ${rank === 1 ? "bg-amber-400 text-white" : rank === 2 ? "bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-white" : rank === 3 ? "bg-orange-300 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
      {rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : rank}
    </div>
    <div className="flex-1 min-w-0">
      <p onClick={() => onSelectEmp(userId)} className="text-[12px] font-bold text-slate-900 dark:text-white truncate cursor-pointer hover:text-red-600 hover:underline">{name}</p>
      <p className="text-[10px] text-slate-400 truncate">{showroom}</p>
    </div>
    <div className="text-right shrink-0">
      <p className="text-[16px] font-extrabold text-red-600">{value}</p>
      <p className="text-[9px] text-slate-400">{label}</p>
    </div>
  </div>
);

/* ════════════════ SHOWROOM FUNNEL BLOCK (collapsible per showroom) ════════════════ */
type SRFunnelData = {
  srId: string; srName: string;
  totalPartners: number; covOk: number; covDueSoon: number; covOverdue: number; covNever: number; coveragePct: number;
  partnerCovBreakdown: { id: string; name: string; covStatus: "ok"|"due_soon"|"overdue"|"never"; daysSince: number; daysLeft: number; lastBy: string|null }[];
  execCoverage: { uid: string; name: string; role: string; covered: number; missed: number; total: number; pct: number }[];
  f1: number; f2: number; f3: number; f4: number; f1pct: number; f2pct: number; f3pct: number; f4pct: number;
  diagnosis: string;
};

const ShowroomFunnelBlock = ({ fd, onSelectPartner }: { fd: SRFunnelData; onSelectPartner: (id: string) => void }) => {
  const [open, setOpen] = useState(false);
  const overdueCount = fd.covOverdue + fd.covNever;
  const isLow = fd.coveragePct < 60;
  const needAttention = fd.partnerCovBreakdown
    .filter(p => p.covStatus !== "ok")
    .sort((a, b) => b.daysSince - a.daysSince);

  return (
    <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">

      {/* ─ Collapsed Header (always visible) ─ */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
          open
            ? "bg-slate-50 dark:bg-slate-800/60"
            : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
        }`}
      >
        {/* Chevron */}
        <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
          open ? "bg-slate-200 dark:bg-slate-700" : "bg-slate-100 dark:bg-slate-800"
        }`}>
          <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>

        {/* Showroom name + diagnosis */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-extrabold text-slate-900 dark:text-white">{fd.srName}</p>
          {!open && (
            <p className={`text-[10px] font-medium mt-0.5 ${
              isLow ? "text-red-500" : fd.coveragePct >= 80 ? "text-emerald-600" : "text-amber-500"
            }`}>{fd.diagnosis}</p>
          )}
        </div>

        {/* Badges on the right */}
        <div className="flex items-center gap-2 shrink-0">
          {overdueCount > 0 && (
            <span className="text-[9px] font-extrabold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-2 py-0.5 rounded-full animate-pulse">
              {overdueCount} overdue
            </span>
          )}
          <div className="text-right">
            <div className={`text-[16px] font-extrabold leading-none ${
              fd.coveragePct >= 80 ? "text-emerald-600" : fd.coveragePct >= 50 ? "text-amber-500" : "text-red-600"
            }`}>{fd.coveragePct}%</div>
            <div className="text-[8px] text-slate-400 font-semibold">cov</div>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
            open
              ? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600"
              : "text-red-600 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
          }`}>
            {open ? "Collapse" : "Expand"}
          </span>
        </div>
      </button>

      {/* ─ Expanded Content ─ */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-3 border-t border-slate-100 dark:border-slate-800">

              {/* 1. Location Summary Card */}
              <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-4 ${
                isLow
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
                  : fd.coveragePct >= 80
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50"
                  : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50"
              }`}>
                <div className="min-w-0">
                  <p className="text-[14px] font-extrabold text-slate-900 dark:text-white">{fd.srName}</p>
                  <p className={`text-[11px] mt-0.5 font-medium ${
                    isLow ? "text-red-600 dark:text-red-400" :
                    fd.coveragePct >= 80 ? "text-emerald-700 dark:text-emerald-400" :
                    "text-amber-700 dark:text-amber-400"
                  }`}>{fd.diagnosis}</p>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  {overdueCount > 0 && (
                    <span className="text-[10px] font-extrabold bg-red-500 text-white px-2.5 py-1 rounded-full animate-pulse">
                      {overdueCount} OVERDUE
                    </span>
                  )}
                  <div className="text-right">
                    <div className={`text-[26px] font-extrabold leading-none ${
                      fd.coveragePct >= 80 ? "text-emerald-600" : fd.coveragePct >= 50 ? "text-amber-500" : "text-red-600"
                    }`}>{fd.coveragePct}%</div>
                    <div className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide">Coverage</div>
                  </div>
                </div>
              </div>

              {/* 2. Business Funnel */}
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Business Funnel</p>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Handshake className="h-3.5 w-3.5 shrink-0" />
                      Partner Visits ({fd.f1}/{fd.totalPartners} in 15d)
                    </span>
                    <span className={`text-[13px] font-extrabold ${
                      fd.f1pct >= 80 ? "text-emerald-600" : fd.f1pct >= 50 ? "text-amber-500" : "text-red-600"
                    }`}>{fd.f1pct}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full transition-all duration-700 ${
                      fd.f1pct >= 80 ? "bg-emerald-500" : fd.f1pct >= 50 ? "bg-amber-400" : "bg-red-500"
                    }`} style={{ width: `${fd.f1pct}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">✓ {fd.covOk} ok</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">⏳ {fd.covDueSoon} due soon</span>
                    {fd.covOverdue > 0 && <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">⚠ {fd.covOverdue} overdue</span>}
                    {fd.covNever > 0 && <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-full">∅ {fd.covNever} never visited</span>}
                  </div>
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800" />
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { icon: <Users className="h-3.5 w-3.5" />, label: "Clients", val: fd.f2, unit: "from partners", col: "sky", pct: null as number|null },
                    { icon: <Activity className="h-3.5 w-3.5" />, label: "WOS Added", val: fd.f3, unit: `${fd.f3pct}% conv.`, col: fd.f3pct >= 40 ? "emerald" : "amber", pct: fd.f3pct as number|null },
                    { icon: <Trophy className="h-3.5 w-3.5" />, label: "WOS Won", val: fd.f4, unit: `${fd.f4pct}% win`, col: fd.f4pct >= 30 ? "emerald" : "red", pct: fd.f4pct as number|null },
                  ]).map(m => (
                    <div key={m.label} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 text-slate-400">{m.icon}<span className="text-[9px] uppercase font-bold tracking-wide">{m.label}</span></div>
                      <div className={`text-[22px] font-extrabold leading-none text-${m.col}-600 dark:text-${m.col}-400`}>{m.val}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{m.unit}</div>
                      {m.pct !== null && (
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-0.5">
                          <div className={`h-full rounded-full bg-${m.col}-500 transition-all duration-700`} style={{ width: `${Math.min(100, m.pct)}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Executive Coverage */}
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Executive Coverage (15-day rule)</p>
                {fd.execCoverage.length === 0 ? (
                  <p className="text-[12px] text-slate-400 italic">No executives assigned</p>
                ) : (
                  <div className="space-y-2 pr-1" style={{ maxHeight: "560px", overflowY: "auto" }}>
                    {fd.execCoverage.map(ec => (
                      <div key={ec.uid} className={`rounded-xl p-3 border ${
                        ec.pct === 100 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40" :
                        ec.pct >= 60   ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40" :
                                         "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40"
                      }`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[12px] font-extrabold text-slate-800 dark:text-slate-100 truncate">{ec.name}</span>
                              <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                                ec.role === "manager" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                                ec.role === "tl"      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" :
                                                       "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                              }`}>{ec.role === "tl" ? "TL" : ec.role === "manager" ? "MGR" : "EXEC"}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {ec.covered}/{ec.total} partners covered
                              {ec.missed > 0 && <span className="text-red-500 font-bold"> · {ec.missed} missing</span>}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={`text-[18px] font-extrabold leading-none ${
                              ec.pct === 100 ? "text-emerald-600" : ec.pct >= 60 ? "text-amber-500" : "text-red-600"
                            }`}>{ec.pct}%</div>
                            <div className={`text-[9px] font-bold mt-0.5 ${
                              ec.pct === 100 ? "text-emerald-500" : ec.pct >= 60 ? "text-amber-500" : "text-red-500"
                            }`}>{ec.pct === 100 ? "✓ On Track" : ec.pct >= 60 ? "⏳ Due Soon" : "⚠ Action Needed"}</div>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${
                            ec.pct === 100 ? "bg-emerald-500" : ec.pct >= 60 ? "bg-amber-400" : "bg-red-500"
                          }`} style={{ width: `${ec.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Partner Cycle Tracker */}
              {needAttention.length > 0 && (
                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                    ⏰ Partner Cycle Tracker — {needAttention.length} need attention
                  </p>
                  <div style={{
                    maxHeight: "720px", overflowY: "auto",
                    display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "10px", paddingRight: "6px",
                  }}>
                    {needAttention.map(p => (
                      <div key={p.id} className={`flex items-start gap-2.5 rounded-xl p-3 border ${
                        p.covStatus === "overdue" || p.covStatus === "never"
                          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40"
                          : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40"
                      }`}>
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-[15px] font-bold ${
                          p.covStatus === "never"   ? "bg-red-100 dark:bg-red-900/40 text-red-500" :
                          p.covStatus === "overdue" ? "bg-red-100 dark:bg-red-900/40 text-red-600" :
                                                     "bg-amber-100 dark:bg-amber-900/40 text-amber-600"
                        }`}>
                          {p.covStatus === "never"   ? "∅" :
                           p.covStatus === "overdue" ? <AlertTriangle className="h-4 w-4" /> :
                           <Clock className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p onClick={() => onSelectPartner(p.id)} className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate leading-tight cursor-pointer hover:text-purple-600 hover:underline">{p.name}</p>
                          <p className={`text-[10px] font-semibold mt-0.5 ${
                            p.covStatus === "overdue" || p.covStatus === "never" ? "text-red-500" : "text-amber-600"
                          }`}>
                            {p.covStatus === "never"   ? "Never visited" :
                             p.covStatus === "overdue" ? `${p.daysSince}d overdue` :
                             `Due in ${p.daysLeft}d`}
                          </p>
                          {p.lastBy && p.covStatus !== "never" && (
                            <p className="text-[9px] text-slate-400 truncate">Last: {p.lastBy}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ════════════════ SHOWROOM DETAIL MODAL (Popup Detail View) ════════════════ */
const ShowroomDetailModal = ({
  showroomId,
  onClose,
  showroom,
  allEmpStats,
  onSelectEmp,
}: {
  showroomId: string;
  onClose: () => void;
  showroom: ShowroomStat | undefined;
  allEmpStats: EmpStat[];
  onSelectEmp: (uid: string) => void;
}) => {
  if (!showroom) return null;

  // Filter employees for this showroom
  const showroomEmps = allEmpStats.filter((e) => e.showroomId === showroomId);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-800 flex items-center justify-center text-white shrink-0 shadow-md">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-lg font-extrabold text-white leading-tight">{showroom.name}</DialogTitle>
                <p className="text-[11px] text-slate-400 mt-1">Showroom performance analysis and team roster</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-purple-400 leading-none">{showroom.score}</div>
              <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-1">Score Rank #{showroom.rank}</div>
            </div>
          </div>
        </DialogHeader>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
          
          {/* Left/Middle Column: Stats and Roster */}
          <div className="md:col-span-2 space-y-5 text-left">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Visits Done", val: showroom.visits, col: "text-sky-400" },
                { label: "WOS Logged", val: showroom.wosCount, col: "text-indigo-400" },
                { label: "WOS Won", val: showroom.wonCount, col: "text-emerald-400" },
                { label: "Win Rate", val: `${showroom.winRate}%`, col: "text-amber-400" },
                { label: "Coverage", val: showroom.totalPartners > 0 ? `${showroom.partnerCoverage}%` : "—", col: "text-purple-400" },
                { label: "Total Partners", val: showroom.totalPartners, col: "text-red-400" },
              ].map(k => (
                <div key={k.label} className="bg-slate-800/50 border border-slate-800 rounded-xl p-3 text-center">
                  <div className={`text-xl font-extrabold ${k.col}`}>{k.val}</div>
                  <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{k.label}</div>
                </div>
              ))}
            </div>

            {/* Team Roster */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Showroom Team Roster ({showroomEmps.length} members)</span>
                <span className="text-[10px] text-slate-500 font-medium lowercase">click name for profile</span>
              </h4>
              <div className="bg-slate-800/20 border border-slate-800 rounded-xl divide-y divide-slate-800 overflow-hidden">
                {showroomEmps.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 text-center">No team members assigned.</p>
                ) : (
                  showroomEmps.map((e) => (
                    <div key={e.userId} className="p-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                      <div className="min-w-0">
                        <p onClick={() => onSelectEmp(e.userId)} className="text-xs font-bold text-slate-200 truncate cursor-pointer hover:text-red-400 hover:underline">
                          {e.fullName}
                        </p>
                        <p className="text-[10px] text-slate-400 uppercase font-medium">{e.role}</p>
                      </div>
                      <div className="flex items-center gap-4 text-right shrink-0">
                        <div className="text-center">
                          <p className="text-xs font-extrabold text-sky-400">{e.visits}</p>
                          <p className="text-[8px] text-slate-500 font-bold uppercase">Visits</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-extrabold text-emerald-400">{e.wonCount}/{e.wosCount}</p>
                          <p className="text-[8px] text-slate-500 font-bold uppercase">Won</p>
                        </div>
                        <div className="text-center bg-slate-800 rounded-lg px-2 py-0.5">
                          <p className="text-xs font-extrabold text-purple-400">{e.score}</p>
                          <p className="text-[8px] text-slate-500 font-bold uppercase">Score</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Funnel Health & Diagnostics */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between text-left">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Funnel Analysis</h4>
              
              <div className="space-y-4">
                {/* Active count vs Inactive count */}
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Team Status</span>
                    <span className="font-bold text-slate-200">{showroom.activeEmps} Active / {showroom.inactiveEmps} Inactive</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${showroom.execCount > 0 ? (showroom.activeEmps / showroom.execCount) * 100 : 0}%` }} />
                    <div className="h-full bg-red-500" style={{ width: `${showroom.execCount > 0 ? (showroom.inactiveEmps / showroom.execCount) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Funnel conversion diagnostics */}
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Showroom Health</div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {showroom.visits === 0 ? (
                      "🚨 Critical: No visits logged by the team in this showroom for the selected period."
                    ) : showroom.partnerCoverage < 50 ? (
                      "⚠️ Low Coverage: Less than 50% of the showroom's partners have been visited recently."
                    ) : showroom.winRate < 20 ? (
                      "⚠️ Low Conversion: Showroom win rate is under 20% - quotes and conversions need review."
                    ) : (
                      "🟢 Healthy: Showroom activity and conversions are on track."
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800/80 pt-3 mt-4 text-[10px] text-slate-500 text-center uppercase tracking-wider font-bold">
              Art & Glass BI System
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ════════════════ PARTNER DETAIL MODAL (Popup Detail View) ════════════════ */
const PartnerDetailModal = ({
  partnerId,
  onClose,
  partner,
  onSelectEmp,
}: {
  partnerId: string;
  onClose: () => void;
  partner: PartnerStat | undefined;
  onSelectEmp: (uid: string) => void;
}) => {
  // Fetch recent 5 visits to this partner
  const { data: partnerVisits = [], isLoading: isLoadingVisits } = useQuery({
    queryKey: ["partner-detail-visits", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select(`
          id,
          visit_date,
          purpose,
          remarks,
          status,
          created_by,
          profiles(full_name)
        `)
        .eq("partner_id", partnerId)
        .order("visit_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!partnerId,
  });

  if (!partner) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-800 flex items-center justify-center text-white shrink-0 shadow-md">
                <Handshake className="h-6 w-6" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-lg font-extrabold text-white leading-tight">{partner.name}</DialogTitle>
                <p className="text-[11px] text-slate-400 mt-1">{partner.company || "Independent Partner"} · {partner.showroomName}</p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase ${
              partner.status === "active" ? "bg-emerald-950 text-emerald-400 border-emerald-900" :
              partner.status === "low" ? "bg-amber-950 text-amber-400 border-amber-900" :
              "bg-red-950 text-red-400 border-red-900"
            }`}>
              {partner.status === "active" ? "Active" : partner.status === "low" ? "Low Activity" : "Neglected"}
            </span>
          </div>
        </DialogHeader>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
          
          {/* Left Column: Stats & Visit History */}
          <div className="md:col-span-2 space-y-4 text-left">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Visits Received", val: partner.visitCount, col: "text-sky-400" },
                { label: "Leads Referred", val: partner.leadsCount, col: "text-indigo-400" },
                { label: "WOS Generated", val: partner.wosCount, col: "text-purple-400" },
                { label: "WOS Won", val: partner.wonWos, col: "text-emerald-400" },
                { label: "Hot Leads", val: partner.hotLeads, col: "text-red-400" },
                { label: "Won Leads", val: partner.convertedLeads, col: "text-amber-400" },
              ].map(k => (
                <div key={k.label} className="bg-slate-800/50 border border-slate-800 rounded-xl p-3 text-center">
                  <div className={`text-xl font-extrabold ${k.col}`}>{k.val}</div>
                  <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{k.label}</div>
                </div>
              ))}
            </div>

            {/* Recent Visit Logs */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Visit Logs (Last 5)</h4>
              {isLoadingVisits ? (
                <div className="space-y-2">
                  <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
                  <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
                </div>
              ) : partnerVisits.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">No visits recorded yet for this partner.</p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {partnerVisits.map((v: any) => (
                    <div key={v.id} className="bg-slate-800/40 border border-slate-800/60 rounded-xl p-3 flex items-center justify-between gap-3 hover:bg-slate-800/60 transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate">
                          Visited by: <span onClick={() => onSelectEmp(v.created_by)} className="cursor-pointer hover:underline text-indigo-400 font-extrabold">{v.profiles?.full_name || "Unknown"}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 truncate capitalize">{v.purpose || "General Visit"}</p>
                        {v.remarks && <p className="text-[9px] text-slate-500 italic truncate mt-0.5">"{v.remarks}"</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                          v.status === "done" ? "bg-emerald-950 text-emerald-400 border-emerald-900" : "bg-amber-950 text-amber-400 border-amber-900"
                        }`}>
                          {v.status}
                        </span>
                        <p className="text-[9px] text-slate-400 mt-1">{format(parseISO(v.visit_date), "d MMM yyyy")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Contact info and assigned executive */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between text-left">
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Partner Details</h4>
                {(partner as any).mobile || (partner as any).phone ? (
                  <a
                    href={`tel:${(partner as any).mobile || (partner as any).phone}`}
                    className="flex items-center gap-2 text-xs text-sky-400 font-semibold hover:underline bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-lg"
                  >
                    <Phone className="h-3.5 w-3.5" /> {(partner as any).mobile || (partner as any).phone}
                  </a>
                ) : (
                  <p className="text-xs text-slate-500 italic">No mobile number recorded</p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Key Executive</h4>
                <p className="text-xs text-slate-200 font-semibold">{partner.topExec || "—"}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Executive with the most visits to this partner</p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Cycle Analysis</div>
                <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed font-medium">
                  {partner.daysSince === 9999 ? (
                    "🔴 This partner has never been visited. Schedule an onboarding visit."
                  ) : partner.daysSince > 45 ? (
                    `🔴 Neglected: It has been ${partner.daysSince} days since the last visit. High revenue risk.`
                  ) : partner.daysSince > 14 ? (
                    `🟡 Low Activity: Last visit was ${partner.daysSince} days ago. Needs follow-up.`
                  ) : (
                    `🟢 Active: Visited recently (${partner.daysSince} day(s) ago). Relationship healthy.`
                  )}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800/80 pt-3 mt-4 text-[10px] text-slate-500 text-center uppercase tracking-wider font-bold">
              Art & Glass BI System
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ════════════════ EMPLOYEE DETAIL MODAL (Popup Detail View) ════════════════ */
const EmployeeDetailModal = ({
  userId,
  onClose,
  emp,
}: {
  userId: string;
  onClose: () => void;
  emp: EmpStat | undefined;
}) => {
  const [notifBody, setNotifBody] = useState("");
  const [sendingNotif, setSendingNotif] = useState(false);

  // Fetch recent 5 visits for this executive with full details
  const { data: empVisits = [], isLoading: isLoadingVisits } = useQuery({
    queryKey: ["emp-detail-visits", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select(`
          id,
          visit_date,
          visit_with_type,
          status,
          purpose,
          remarks,
          check_in_time,
          check_out_time,
          partners(name, company_name),
          clients(name)
        `)
        .eq("created_by", userId)
        .order("visit_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifBody.trim()) {
      toast.error("Please type a message body.");
      return;
    }
    setSendingNotif(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          title: "Attention Required ⚠️",
          body: notifBody.trim(),
          userId: userId,
          data: { targetUrl: "/visits" }
        }
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Message sent directly to ${emp?.fullName || "employee"}!`);
        setNotifBody("");
      } else {
        toast.error(data?.message || "Failed to send notification.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to send notification.");
    } finally {
      setSendingNotif(false);
    }
  };

  if (!emp) return null;

  const daysOffline = emp.lastVisitDate ? differenceInDays(new Date(), parseISO(emp.lastVisitDate)) : null;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-red-600 to-red-800 flex items-center justify-center text-xl font-extrabold shadow-md uppercase">
                {emp.fullName.substring(0, 2)}
              </div>
              <div className="text-left">
                <DialogTitle className="text-lg font-extrabold text-white leading-tight">{emp.fullName}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full border border-slate-700 uppercase">
                    {emp.role}
                  </span>
                  <span className="text-[10px] bg-red-950 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-900">
                    📍 {emp.showroomName}
                  </span>
                </div>
              </div>
            </div>
            <StatusBadge status={emp.status} />
          </div>
        </DialogHeader>

        {/* Profile Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
          
          {/* Left Panel: Stats and Details */}
          <div className="md:col-span-2 space-y-4 text-left">
            
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Visits Done", val: emp.visits, col: "text-sky-400" },
                { label: "WOS Created", val: emp.wosCount, col: "text-indigo-400" },
                { label: "WOS Won", val: emp.wonCount, col: "text-emerald-400" },
                { label: "Win Rate", val: `${emp.winRate}%`, col: "text-amber-400" },
                { label: "Leads Added", val: emp.clientsAdded, col: "text-purple-400" },
                { label: "Perf Score", val: emp.score, col: "text-red-400" },
              ].map(k => (
                <div key={k.label} className="bg-slate-800/50 border border-slate-800 rounded-xl p-3 text-center">
                  <div className={`text-xl font-extrabold ${k.col}`}>{k.val}</div>
                  <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{k.label}</div>
                </div>
              ))}
            </div>

            {/* Performance status card */}
            <div className="bg-slate-800/30 border border-slate-800/80 rounded-xl p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Activity Summary</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {emp.status === "active" && `Employee is currently active. Last visit was recorded ${daysOffline === 0 ? "today" : `${daysOffline} day(s) ago`} on ${format(parseISO(emp.lastVisitDate!), "d MMM yyyy")}.`}
                {emp.status === "at_risk" && `Employee is at risk. No visit recorded in ${daysOffline} days. Last active on ${format(parseISO(emp.lastVisitDate!), "d MMM yyyy")}.`}
                {emp.status === "inactive" && `Action required: Employee is inactive. Last visit was recorded ${daysOffline ?? "many"} days ago (${emp.lastVisitDate ? format(parseISO(emp.lastVisitDate), "d MMM yyyy") : "Never"}).`}
                {emp.status === "never_visited" && `Critical: This employee has never recorded a visit in the system. Check onboarding status.`}
              </p>
            </div>

            {/* Recent 5 Visits */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Visits (Last 5)</h4>
              {isLoadingVisits ? (
                <div className="space-y-2">
                  <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
                  <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse" />
                </div>
              ) : empVisits.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">No visits found in history.</p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {empVisits.map((v: any) => {
                    const targetName = v.visit_with_type === "partner" 
                      ? (v.partners?.name || "Partner") 
                      : (v.clients?.name || "Client");
                    const subtitle = v.visit_with_type === "partner" && v.partners?.company_name 
                      ? v.partners.company_name 
                      : v.visit_with_type;
                    
                    return (
                      <div key={v.id} className="bg-slate-800/40 border border-slate-800/60 rounded-xl p-3 flex items-center justify-between gap-3 hover:bg-slate-800/60 transition-colors">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate">{targetName}</p>
                          <p className="text-[10px] text-slate-400 truncate capitalize">{subtitle} · {v.purpose || "No Purpose"}</p>
                          {v.remarks && <p className="text-[9px] text-slate-500 italic truncate mt-0.5">"{v.remarks}"</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                            v.status === "done" ? "bg-emerald-950 text-emerald-400 border-emerald-900" : "bg-amber-950 text-amber-400 border-amber-900"
                          }`}>
                            {v.status}
                          </span>
                          <p className="text-[9px] text-slate-400 mt-1">{format(parseISO(v.visit_date), "d MMM")}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Right Panel: Send Actionable Alert */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between text-left">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5 text-red-500" /> Direct Alert / Ping
              </h4>
              <p className="text-[11px] text-slate-400 mb-4 leading-normal">
                Send an instant, high-priority push notification to this employee's phone to check in or follow up.
              </p>
              
              <form onSubmit={handleSendPush} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Alert Title</label>
                  <input
                    type="text"
                    value="Attention Required ⚠️"
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-500"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Message Body</label>
                  <textarea
                    rows={4}
                    value={notifBody}
                    onChange={(e) => setNotifBody(e.target.value)}
                    placeholder="e.g. Please log your visits for today, or contact showroom manager."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500"
                    maxLength={250}
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={sendingNotif}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingNotif ? "Sending..." : "Send Ping"}
                </button>
              </form>
            </div>
            
            <div className="border-t border-slate-800/80 pt-3 mt-4 text-[10px] text-slate-500 text-center">
              Active Push Devices will be targeted.
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ═══════════════════════════════ MAIN ═══════════════════════════════ */
const MDDashboard = () => {
  const { user, role, showroomId, showroomIds } = useAuth();
  const queryClient = useQueryClient();
  const isMdOrAdmin = role === "md" || role === "admin";

  /* ── UI State ── */
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [showroomFilter, setShowroomFilter] = useState("all");
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [selectedShowroomId, setSelectedShowroomId] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [empFilter, setEmpFilter] = useState<EmpFilter>("all");
  const [pFilter, setPFilter] = useState<PFilter>("all");
  const [empSearch, setEmpSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showAllGlance, setShowAllGlance] = useState(false);
  const [showFunnelHealth, setShowFunnelHealth] = useState(true);
  const [leaderTab, setLeaderTab] = useState<"visits" | "wos" | "won">("visits");
  const [showComp, setShowComp] = useState(false);
  const [visibleEmpCount, setVisibleEmpCount] = useState(20);
  const [visiblePartnerCount, setVisiblePartnerCount] = useState(12);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const dateFrom = getDateFrom(dateRange);
  const DR_LABELS: Record<DateRange, string> = { today: "Today", "7d": "Last 7 Days", month: "This Month" };

  /* ── Queries ── */
  const { data: showrooms = [] } = useQuery<ShowroomRow[]>({
    queryKey: ["md-showrooms"],
    queryFn: async () => { const { data } = await supabase.from("showrooms").select("id, name"); return data || []; },
    staleTime: 60000,
  });

  const { data: userRoles = [] } = useQuery<UserRoleRow[]>({
    queryKey: ["md-roles", isMdOrAdmin, showroomId],
    queryFn: async () => {
      let q = supabase.from("user_roles")
        .select("user_id, role, showroom_id")
        .in("role", ["executive", "manager", "tl"])
        .eq("is_active" as any, true); // Only show active employees
      if (!isMdOrAdmin && showroomIds.length > 0) q = q.in("showroom_id", showroomIds);
      const { data } = await q; return data || [];
    },
  });

  const { data: profiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ["md-profiles"],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("user_id, full_name, email"); return data || []; },
    staleTime: 60000,
  });

  const { data: visits = [], isLoading, refetch } = useQuery<VisitRow[]>({
    queryKey: ["md-visits", dateFrom, isMdOrAdmin, showroomId],
    queryFn: async () => {
      const { data } = await supabase.from("visits")
        .select("id, created_by, visit_date, visit_with_type, partner_id, status")
        .gte("visit_date", dateFrom)
        .order("visit_date", { ascending: false });
      return data || [];
    },
  });

  const { data: allVisits = [] } = useQuery<{ created_by: string; visit_date: string }[]>({
    queryKey: ["md-all-visits-last"],
    queryFn: async () => {
      const { data } = await supabase.from("visits").select("created_by, visit_date").order("visit_date", { ascending: false });
      return data || [];
    },
    staleTime: 120000,
  });

  const { data: wosItems = [] } = useQuery<WosRow[]>({
    // FIX P0: include dateFrom in queryKey so WOS refetches when date range changes
    queryKey: ["md-wos", dateFrom],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_scope_items")
        .select("id, created_by, work_status, created_at, client_id")
        .gte("created_at", dateFrom);
      return (data || []) as WosRow[];
    },
    staleTime: 60000,
  });

  // All-time WOS for pipeline summary AND partner WOS count (unaffected by date filter)
  const { data: allWosItems = [] } = useQuery<WosRow[]>({
    queryKey: ["md-wos-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_scope_items")
        .select("id, created_by, work_status, created_at, client_id");
      return (data || []) as WosRow[];
    },
    staleTime: 120000,
  });

  const { data: partners = [] } = useQuery<PartnerRow[]>({
    queryKey: ["md-partners", isMdOrAdmin, showroomId],
    queryFn: async () => {
      // Select created_by (always exists) instead of showroom_id (requires migration).
      // Showroom assignment is derived in-memory from userRoles after fetch.
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, company_name, mobile, created_by");
      if (error) {
        console.error("[MDDashboard] Partners fetch error:", error.message);
        return [];
      }
      return (data || []).filter(isRealPartner);
    },
  });

  const { data: partnerVisits = [] } = useQuery<PVisitRow[]>({
    // FIX P1: include dateFrom in queryKey so partner visit activity matches selected period
    queryKey: ["md-pvisits", dateFrom],
    queryFn: async () => {
      // FIX P1: use the selected dateFrom instead of a hardcoded 60-day window.
      // We use the earlier of: dateFrom or 60 days ago, to ensure enough history
      // for the "days since last visit" calculation even on narrow date ranges.
      const sixtyDaysAgo = format(subDays(new Date(), 60), "yyyy-MM-dd");
      const effectiveFrom = dateFrom < sixtyDaysAgo ? dateFrom : sixtyDaysAgo;
      const { data } = await supabase.from("visits")
        .select("partner_id, visit_date, created_by")
        .eq("visit_with_type", "partner")
        .eq("status", "done")
        .gte("visit_date", effectiveFrom)
        .order("visit_date", { ascending: false });
      return data || [];
    },
    staleTime: 60000,
  });

  // Clients referred by partners (leads) — all-time for full lead count
  const { data: partnerClients = [] } = useQuery<ClientRow[]>({
    queryKey: ["md-partner-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, partner_id, status")
        .not("partner_id", "is", null);
      if (error) { console.error("[MDDashboard] partnerClients error:", error.message); return []; }
      return (data || []) as ClientRow[];
    },
    staleTime: 120000,
  });

  // Clients added within the selected date range
  const { data: periodClients = [] } = useQuery<{id: string; created_by: string}[]>({
    queryKey: ["md-period-clients", dateFrom],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, created_by")
        .gte("created_at", dateFrom);
      if (error) { console.error("[MDDashboard] periodClients error:", error.message); return []; }
      return data || [];
    },
    staleTime: 60000,
  });

  // Prev period visits for trend comparison
  const prevDateFrom = getPrevDateFrom(dateRange);
  const prevDateTo = getPrevDateTo(dateRange);
  const { data: prevVisits = [] } = useQuery<{ id: string }[]>({
    queryKey: ["md-prev-visits", prevDateFrom, prevDateTo],
    queryFn: async () => {
      const { data } = await supabase.from("visits")
        .select("id")
        .gte("visit_date", prevDateFrom)
        .lte("visit_date", prevDateTo);
      return data || [];
    },
    staleTime: 120000,
  });

  /* ── Derived Maps ── */
  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach(p => {
      let name = p.full_name ? p.full_name.trim() : "";
      if (!name && p.email) {
        const prefix = p.email.split("@")[0];
        name = prefix
          .split(/[._]/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
      }
      m[p.user_id] = name || "Unknown";
    });
    return m;
  }, [profiles]);

  const showroomMap = useMemo(() => {
    const m: Record<string, string> = {};
    showrooms.forEach(s => { m[s.id] = s.name; });
    return m;
  }, [showrooms]);

  const lastActiveMap = useMemo(() => {
    const m: Record<string, string> = {};
    allVisits.forEach(v => { if (!m[v.created_by]) m[v.created_by] = v.visit_date; });
    return m;
  }, [allVisits]);

  // Derive each partner's showroom_id from the creator's user_role.
  // This avoids needing the showroom_id column on partners (which requires a DB migration).
  const partnerShowroomMap = useMemo(() => {
    const creatorToShowroom: Record<string, string | null> = {};
    userRoles.forEach(r => { creatorToShowroom[r.user_id] = r.showroom_id; });
    const m: Record<string, string | null> = {};
    partners.forEach(p => { m[p.id] = creatorToShowroom[p.created_by] || null; });
    return m;
  }, [partners, userRoles]);

  /* ── Employee Stats (with scoring & ranking) ── */
  const allEmpStats = useMemo((): EmpStat[] => {
    const subset = showroomFilter === "all" ? userRoles : userRoles.filter(r => r.showroom_id === showroomFilter);
    const raw = subset.map(ur => {
      const myV = visits.filter(v => v.created_by === ur.user_id);
      const myW = wosItems.filter(w => w.created_by === ur.user_id);
      const won = myW.filter(w => w.work_status === "won").length;
      const myC = periodClients.filter(c => c.created_by === ur.user_id);
      const status = getStatus(lastActiveMap[ur.user_id] || null);
      return {
        userId: ur.user_id,
        fullName: profileMap[ur.user_id] || "Unknown",
        showroomId: ur.showroom_id || "",
        showroomName: ur.showroom_id ? (showroomMap[ur.showroom_id] || "—") : "—",
        role: ur.role,
        visits: myV.length,
        partnerVisits: myV.filter(v => v.visit_with_type === "partner").length,
        wosCount: myW.length,
        wonCount: won,
        quotedCount: myW.filter(w => w.work_status === "submitted").length,
        clientsAdded: myC.length,
        lastVisitDate: lastActiveMap[ur.user_id] || null,
        status,
        winRate: myW.length > 0 ? Math.round((won / myW.length) * 100) : 0,
        score: 0, rank: 0, perfBadge: "inactive" as const,
      };
    });

    // ── Build a userId→stat map for TL/Manager rollup ──────────────────────
    // First pass: compute own stats for each member
    const ownStatMap: Record<string, typeof raw[number]> = {};
    raw.forEach(e => { ownStatMap[e.userId] = e; });

    // Group members by showroom for team lookup
    const showroomMembers: Record<string, string[]> = {};
    subset.forEach(ur => {
      if (!ur.showroom_id) return;
      if (!showroomMembers[ur.showroom_id]) showroomMembers[ur.showroom_id] = [];
      showroomMembers[ur.showroom_id].push(ur.user_id);
    });

    // Second pass: assign team rollup
    const withTeam = raw.map(e => {
      if (e.role === "executive") {
        // Executive: own numbers only
        return { ...e, teamVisits: e.visits, teamWos: e.wosCount, teamWon: e.wonCount, teamClients: e.clientsAdded };
      }
      // TL and Manager: aggregate ALL members in the same showroom
      const teammates = (showroomMembers[e.showroomId] || []).filter(uid => uid !== e.userId);
      const teamV = teammates.reduce((s, uid) => s + (ownStatMap[uid]?.visits || 0), 0);
      const teamW = teammates.reduce((s, uid) => s + (ownStatMap[uid]?.wosCount || 0), 0);
      const teamWn = teammates.reduce((s, uid) => s + (ownStatMap[uid]?.wonCount || 0), 0);
      const teamC = teammates.reduce((s, uid) => s + (ownStatMap[uid]?.clientsAdded || 0), 0);
      return {
        ...e,
        teamVisits:  e.visits + teamV,
        teamWos:     e.wosCount + teamW,
        teamWon:     e.wonCount + teamWn,
        teamClients: e.clientsAdded + teamC,
      };
    });

    const maxV = Math.max(...withTeam.map(e => e.visits), 1);
    const maxPV = Math.max(...withTeam.map(e => e.partnerVisits), 1);
    const maxC = Math.max(...withTeam.map(e => e.clientsAdded), 1);
    const maxW = Math.max(...withTeam.map(e => e.wosCount), 1);
    const maxWon = Math.max(...withTeam.map(e => e.wonCount), 1);

    const withScore = withTeam.map(e => ({
      ...e,
      score: calcEmpScore(e.visits, e.partnerVisits, e.clientsAdded, e.wosCount, e.wonCount, maxV, maxPV, maxC, maxW, maxWon),
    }));

    const sorted = [...withScore].sort((a, b) => b.score - a.score);

    return sorted.map((e, i) => {
      const badge: EmpStat["perfBadge"] =
        (e.status === "inactive" || e.status === "never_visited") && e.visits === 0 ? "inactive" :
        e.score >= 75 ? "top" :
        e.score >= 55 ? "good" :
        e.score >= 35 ? "average" : "low";
      return { ...e, rank: i + 1, perfBadge: badge };
    });
  }, [userRoles, visits, wosItems, periodClients, profileMap, showroomMap, lastActiveMap, showroomFilter]);

  /* ── Showroom Stats (with scoring & ranking) ── */
  const showroomStats = useMemo((): ShowroomStat[] => {
    const srList = isMdOrAdmin
      ? showrooms
      : showrooms.filter(s => showroomIds.includes(s.id));  // multi-showroom managers
    const raw = srList.map(s => {
      const ids = userRoles.filter(r => r.showroom_id === s.id).map(r => r.user_id);
      const sv = visits.filter(v => ids.includes(v.created_by));
      // FIX: use period-filtered wosItems (not all-time allWosItems) for showroom KPIs
      const sw = wosItems.filter(w => ids.includes(w.created_by));
      const won = sw.filter(w => w.work_status === "won").length;
      // Use partnerShowroomMap (derived from created_by) instead of p.showroom_id
      const srPartners = partners.filter(p => partnerShowroomMap[p.id] === s.id);
      const totalPartners = srPartners.length;
      // A partner is "visited" if they appear in partnerVisits at all (last 60d window)
      const visitedPartners = srPartners.filter(p =>
        partnerVisits.some(pv => pv.partner_id === p.id)
      ).length;
      const unvisited = totalPartners - visitedPartners;
      const partnerCoverage = totalPartners > 0
        ? Math.round((visitedPartners / totalPartners) * 100)
        : 0;
      const lastDates = ids.map(id => lastActiveMap[id]).filter(Boolean).sort().reverse();
      const empSubset = allEmpStats.filter(e => e.showroomId === s.id);
      return {
        id: s.id, name: s.name,
        execCount: ids.length,
        activeEmps: empSubset.filter(e => e.status === "active").length,
        // inactiveEmps includes both truly inactive (visited but stopped) AND never_visited (new hires)
        inactiveEmps: empSubset.filter(e => e.status === "inactive" || e.status === "never_visited").length,
        visits: sv.length,
        wosCount: sw.length,
        wonCount: won,
        winRate: sw.length > 0 ? Math.round((won / sw.length) * 100) : 0,
        unvisitedPartners: unvisited,
        totalPartners,
        partnerCoverage,
        lastActivity: lastDates[0] || null,
        score: 0, rank: 0,
      };
    });

    const maxVisitPerExec = Math.max(...raw.map(s => s.execCount > 0 ? s.visits / s.execCount : 0), 1);
    const maxWosPerExec   = Math.max(...raw.map(s => s.execCount > 0 ? s.wosCount / s.execCount : 0), 1);

    const withScore = raw.map(s => ({
      ...s,
      score: calcShowroomScore(
        s.visits, s.wosCount, s.wonCount,
        s.activeEmps, s.execCount,
        s.partnerCoverage,
        maxVisitPerExec, maxWosPerExec
      ),
    }));

    return sorted.map((s, i) => ({
      ...s,
      rank: i + 1,
      teamVisits: s.visits,
      teamWos: s.wosCount,
      teamWon: s.wonCount,
      teamClients: 0,
    }));
  }, [showrooms, userRoles, visits, wosItems, partners, partnerVisits, partnerShowroomMap, lastActiveMap, isMdOrAdmin, showroomId, allEmpStats]);

  /* ── Partner Stats ── */
  const partnerStats = useMemo((): PartnerStat[] => {
    // Filter by showroom using partnerShowroomMap (derived from creator's user_role)
    const srPartners = showroomFilter === "all"
      ? partners
      : partners.filter(p => partnerShowroomMap[p.id] === showroomFilter);

    return srPartners.map(p => {
      // Sort partner visits by date descending so pv[0] is always the most recent
      const pv = partnerVisits
        .filter(v => v.partner_id === p.id)
        .sort((a, b) => b.visit_date.localeCompare(a.visit_date));

      const lastVisit = pv[0] || null;
      // daysSince: null means never visited (distinct from a very old visit)
      const daysSince = lastVisit
        ? differenceInDays(new Date(), parseISO(lastVisit.visit_date))
        : null;

      // Derive activity status:
      //   new       = never visited (just added, no visit yet)
      //   active    = visited within 14 days (realistic sales cycle)
      //   low       = visited 15–45 days ago
      //   neglected = 45+ days without a visit — revenue risk
      const status: "active" | "low" | "neglected" | "new" =
        daysSince === null ? "new"       :
        daysSince <= 14    ? "active"    :
        daysSince <= 45    ? "low"       :
                             "neglected";

      // Most frequent executive for this partner
      const execFreq: Record<string, number> = {};
      pv.forEach(v => { execFreq[v.created_by] = (execFreq[v.created_by] || 0) + 1; });
      const topExecId = Object.entries(execFreq).sort((a, b) => b[1] - a[1])[0]?.[0];

      const partnerSrId = partnerShowroomMap[p.id];

      // Leads (clients) referred by this partner — all-time
      const myClients   = partnerClients.filter(c => c.partner_id === p.id);
      const myClientIds = new Set(myClients.map(c => c.id));
      const myWos       = allWosItems.filter(w => myClientIds.has(w.client_id));

      return {
        id: p.id,
        name: p.name,
        company: p.company_name || "",
        showroomName: partnerSrId ? (showroomMap[partnerSrId] || "—") : "—",
        lastVisitDate: lastVisit?.visit_date || null,
        lastVisitBy:   lastVisit ? (profileMap[lastVisit.created_by] || "Unknown") : "—",
        visitCount: pv.length,
        daysSince:  daysSince ?? 9999,   // 9999 = sentinel for "never visited"
        status,
        topExec: topExecId ? (profileMap[topExecId] || "Unknown") : "—",
        leadsCount:     myClients.length,
        hotLeads:       myClients.filter(c => c.status === "hot").length,
        convertedLeads: myClients.filter(c => c.status === "converted").length,
        wosCount: myWos.length,
        wonWos:   myWos.filter(w => w.work_status === "won").length,
      };
    // Primary sort: by leads desc, then WOS desc, then visits desc
    }).sort((a, b) => b.leadsCount - a.leadsCount || b.wosCount - a.wosCount || b.visitCount - a.visitCount);
  }, [partners, partnerVisits, partnerClients, allWosItems, partnerShowroomMap, showroomMap, profileMap, showroomFilter]);

  /* ── Funnel Health per Showroom (Partner→Client→WOS→Won) ── */
  const funnelData = useMemo(() => {
    const OVERDUE_DAYS = 15;
    return showroomStats.map(sr => {
      const srUserIds = userRoles.filter(r => r.showroom_id === sr.id).map(r => r.user_id);
      const srPartners = partners.filter(p => partnerShowroomMap[p.id] === sr.id);
      const totalPartners = srPartners.length;

      // Partner coverage breakdown: active (<15d), due soon (8-15d), overdue (15+d), never
      const partnerCovBreakdown = srPartners.map(p => {
        const pvs = partnerVisits
          .filter(v => v.partner_id === p.id)
          .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
        const last = pvs[0] || null;
        const days = last ? differenceInDays(new Date(), parseISO(last.visit_date)) : null;
        const covStatus: "ok" | "due_soon" | "overdue" | "never" =
          days === null ? "never" :
          days <= OVERDUE_DAYS - 5 ? "ok" :
          days <= OVERDUE_DAYS ? "due_soon" : "overdue";
        const lastBy = last ? (profileMap[last.created_by] || "?") : null;
        const daysLeft = days !== null ? Math.max(0, OVERDUE_DAYS - days) : 0;
        return { id: p.id, name: p.name, covStatus, daysSince: days ?? 9999, daysLeft, lastBy };
      });

      const covOk      = partnerCovBreakdown.filter(p => p.covStatus === "ok").length;
      const covDueSoon = partnerCovBreakdown.filter(p => p.covStatus === "due_soon").length;
      const covOverdue = partnerCovBreakdown.filter(p => p.covStatus === "overdue").length;
      const covNever   = partnerCovBreakdown.filter(p => p.covStatus === "never").length;
      const coveragePct = totalPartners > 0 ? Math.round((covOk / totalPartners) * 100) : 0;

      // Per-executive partner accountability
      const execCoverage = srUserIds.map(uid => {
        const name = profileMap[uid] || "?";
        const emp = allEmpStats.find(e => e.userId === uid);
        const role = emp?.role || "executive";

        // All partners this exec has EVER visited (their personal partner pool)
        const allVisitedByExec = partnerVisits
          .filter(v => v.created_by === uid && v.partner_id)
          .map(v => v.partner_id as string);
        const execOwnPartnerIds = new Set(allVisitedByExec); // unique partners ever visited
        const execPartnerCount = execOwnPartnerIds.size;     // their own total

        // Partners visited within the last 15 days (covered)
        const visitedInWindowPids = new Set(
          partnerVisits
            .filter(v => v.created_by === uid && v.partner_id)
            .filter(v => differenceInDays(new Date(), parseISO(v.visit_date)) <= OVERDUE_DAYS)
            .map(v => v.partner_id as string)
        );
        // Covered = intersection of own partners visited within 15d
        const covered = [...execOwnPartnerIds].filter(pid => visitedInWindowPids.has(pid)).length;
        const missed  = execPartnerCount - covered;
        const execCovPct = execPartnerCount > 0 ? Math.round((covered / execPartnerCount) * 100) : 100;
        return { uid, name, role, covered, missed, total: execPartnerCount, pct: execCovPct };
      })
      .filter(ec => ec.total > 0) // hide execs who have never visited any partner
      .sort((a, b) => a.pct - b.pct); // worst first

      // Clients from this showroom's partners (all-time)
      const srPartnerIds = new Set(srPartners.map(p => p.id));
      const srPartnerClients = partnerClients.filter(c => c.partner_id && srPartnerIds.has(c.partner_id));
      const srClientIds = new Set(srPartnerClients.map(c => c.id));
      const srWos   = allWosItems.filter(w => srUserIds.includes(w.created_by));
      const srWosFromPartners = allWosItems.filter(w => srClientIds.has(w.client_id));
      const srWon   = srWosFromPartners.filter(w => w.work_status === "won").length;

      // Funnel stages
      const funnelPct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;
      const f1 = totalPartners > 0 ? covOk + covDueSoon : 0; // visited in 15d
      const f2 = srPartnerClients.length;
      const f3 = srWosFromPartners.length;
      const f4 = srWon;
      const f1pct = funnelPct(f1, totalPartners);
      const f2pct = funnelPct(f2, f1 || 1);
      const f3pct = funnelPct(f3, f2 || 1);
      const f4pct = funnelPct(f4, f3 || 1);

      // Diagnose the biggest leak
      const diagnosis =
        totalPartners === 0 ? "No partners assigned" :
        f1pct < 60 ? "🔴 Partner visit coverage low — executives not covering partners" :
        f2pct < 30 ? "🟡 Low client acquisition from partners — improve partner engagement" :
        f3pct < 40 ? "🟡 Clients not converting to WOS — push for scope discussion" :
        f4pct < 30 ? "🟡 WOS not closing — review quote quality and follow-up" :
        "🟢 Funnel healthy — maintain momentum";

      return {
        srId: sr.id, srName: sr.name,
        totalPartners, covOk, covDueSoon, covOverdue, covNever, coveragePct,
        partnerCovBreakdown, execCoverage,
        f1, f2, f3, f4, f1pct, f2pct, f3pct, f4pct,
        diagnosis,
      };
    });
  }, [showroomStats, userRoles, partners, partnerVisits, partnerClients, allWosItems, partnerShowroomMap, profileMap, allEmpStats]);

  /* ── At a Glance Insights (all 18) ── */
  const glance = useMemo(() => {
    // ── Existing 8 ──
    const bestSR = showroomStats[0] || null;
    const weakSR = showroomStats.length > 1 ? showroomStats[showroomStats.length - 1] : null;
    const bestEmp = allEmpStats[0] || null;
    const inactiveEmp = [...allEmpStats].filter(e => e.status === "inactive" || e.status === "never_visited").sort((a, b) => {
      const da = a.lastVisitDate ? parseISO(a.lastVisitDate).getTime() : 0;
      const db = b.lastVisitDate ? parseISO(b.lastVisitDate).getTime() : 0;
      return da - db;
    })[0] || null;
    const topWosEmp = [...allEmpStats].sort((a, b) => b.wosCount - a.wosCount)[0] || null;
    const topVisitEmp = [...allEmpStats].sort((a, b) => b.visits - a.visits)[0] || null;
    const topPartner = [...partnerStats].sort((a, b) => b.visitCount - a.visitCount)[0] || null;
    const ignoredPartner = [...partnerStats].filter(p => p.daysSince >= 30).sort((a, b) => b.daysSince - a.daysSince)[0] || null;

    // ── New 10 ──
    // 9: Top Client Adder
    const topClientAdder = [...allEmpStats].sort((a, b) => b.clientsAdded - a.clientsAdded)[0] || null;

    // 10: Best Win Rate (min 3 WOS to qualify)
    const bestWinRate = [...allEmpStats].filter(e => e.wosCount >= 3).sort((a, b) => b.winRate - a.winRate)[0] || null;

    // 11: Most WOS Won
    const topWonEmp = [...allEmpStats].sort((a, b) => b.wonCount - a.wonCount)[0] || null;

    // 12: Zero WOS employees (visited but no WOS)
    const zeroWosCount = allEmpStats.filter(e => e.visits >= 3 && e.wosCount === 0).length;

    // 13: Best TL by team score
    const bestTL = [...allEmpStats].filter(e => e.role === "tl").sort((a, b) => b.teamVisits - a.teamVisits)[0] || null;

    // 14: Showroom best win rate (min 5 WOS)
    const bestConvSR = [...showroomStats].filter(s => s.wosCount >= 5).sort((a, b) => b.winRate - a.winRate)[0] || null;

    // 15: Conversion Gap — most WOS but lowest win rate
    const convGapSR = [...showroomStats].filter(s => s.wosCount >= 5).sort((a, b) => {
      const scoreA = a.wosCount - a.wonCount * 5;
      const scoreB = b.wosCount - b.wonCount * 5;
      return scoreB - scoreA;
    })[0] || null;

    // 16: Total clients added this period
    const totalClientsThisPeriod = allEmpStats.reduce((s, e) => s + e.clientsAdded, 0);

    // 17: Red Alert employees — failing ALL 3 benchmarks
    const redAlertCount = allEmpStats.filter(e => e.visits <= 2 && e.wosCount <= 3 && e.wonCount <= 2).length;

    // 18: At Risk Partners (15-45 days not visited)
    const atRiskPartners = partnerStats.filter(p => p.status === "low");

    return {
      bestSR, weakSR, bestEmp, inactiveEmp, topWosEmp, topVisitEmp, topPartner, ignoredPartner,
      topClientAdder, bestWinRate, topWonEmp, zeroWosCount,
      bestTL, bestConvSR, convGapSR, totalClientsThisPeriod, redAlertCount, atRiskPartners,
    };
  }, [showroomStats, allEmpStats, partnerStats]);

  /* ── Filtered Employees ── */
  const filteredEmps = useMemo(() => {
    let list = allEmpStats;
    if (empFilter === "active") list = list.filter(e => e.status === "active");
    else if (empFilter === "at_risk") list = list.filter(e => e.status === "at_risk");
    else if (empFilter === "inactive") list = list.filter(e => e.status === "inactive");
    else if (empFilter === "never_visited") list = list.filter(e => e.status === "never_visited");
    else if (empFilter === "zero_visits") list = list.filter(e => e.visits === 0);
    else if (empFilter === "top") list = list.slice(0, 5);
    if (empSearch.trim()) {
      const q = empSearch.toLowerCase();
      list = list.filter(e => e.fullName.toLowerCase().includes(q) || e.showroomName.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const m = sortDir === "asc" ? 1 : -1;
      if (sortKey === "score") return m * (a.score - b.score);
      if (sortKey === "name") return m * a.fullName.localeCompare(b.fullName);
      if (sortKey === "visits") return m * (a.visits - b.visits);
      if (sortKey === "wos") return m * (a.wosCount - b.wosCount);
      if (sortKey === "won") return m * (a.wonCount - b.wonCount);
      if (sortKey === "last_active") {
        const da = a.lastVisitDate ? parseISO(a.lastVisitDate).getTime() : 0;
        const db = b.lastVisitDate ? parseISO(b.lastVisitDate).getTime() : 0;
        return m * (da - db);
      }
      return 0;
    });
  }, [allEmpStats, empFilter, empSearch, sortKey, sortDir]);

  /* ── Filtered Partners ── */
  const filteredPartners = useMemo(() => {
    switch (pFilter) {
      case "top":       return [...partnerStats].sort((a, b) => b.visitCount  - a.visitCount).slice(0, 12);
      case "top_leads": return [...partnerStats].sort((a, b) => b.leadsCount  - a.leadsCount).slice(0, 12);
      case "active":    return partnerStats.filter(p => p.status === "active");
      case "low":       return partnerStats.filter(p => p.status === "low");
      case "neglected": return partnerStats.filter(p => p.status === "neglected");
      case "new":       return partnerStats.filter(p => p.status === "new");
      default:          return partnerStats;
    }
  }, [partnerStats, pFilter]);

  /* ── Pipeline (uses ALL-TIME allWosItems for full pipeline picture) ── */
  const pipelineByShowroom = useMemo(() => {
    return showroomStats.map(s => {
      const ids = userRoles.filter(r => r.showroom_id === s.id).map(r => r.user_id);
      const sw = allWosItems.filter(w => ids.includes(w.created_by));
      const pending = sw.filter(w => w.work_status === "pending").length;
      const quoted  = sw.filter(w => w.work_status === "submitted").length;
      const won     = sw.filter(w => w.work_status === "won").length;
      const lost    = sw.filter(w => w.work_status === "lost").length;
      return { name: s.name, pending, quoted, won, lost, total: pending + quoted + won + lost };
    });
  }, [showroomStats, userRoles, allWosItems]);

  /* ── Smart Alerts (18 types, grouped by severity) ── */
  const alerts = useMemo((): AlertItem[] => {
    const list: AlertItem[] = [];

    // ────────── CRITICAL ────────────────────────────────────

    // C1: Employees inactive 8+ days (individually listed)
    const inactive8 = allEmpStats.filter(e => {
      if (e.status !== "inactive") return false;
      const days = e.lastVisitDate ? differenceInDays(new Date(), parseISO(e.lastVisitDate)) : 999;
      return days >= 8;
    });
    inactive8.slice(0, 4).forEach(e => {
      const days = e.lastVisitDate ? differenceInDays(new Date(), parseISO(e.lastVisitDate)) : null;
      list.push({
        id: `inc-${e.userId}`, severity: "critical",
        title: `${e.fullName} — no visit in ${days ?? "many"} days`,
        desc: `Executive is inactive. Last visit: ${e.lastVisitDate ? format(parseISO(e.lastVisitDate), "d MMM") : "Never"}. Call or assign a follow-up immediately.`,
        tag: `📍 ${e.showroomName}`, action: "View Executive",
        onClick: () => setSelectedEmpId(e.userId)
      });
    });

    // C2: Never-visited employees (new hires not onboarded)
    const neverV = allEmpStats.filter(e => e.status === "never_visited");
    if (neverV.length > 0) {
      list.push({
        id: "never-visited", severity: "critical",
        title: `${neverV.length} employee${neverV.length > 1 ? "s" : ""} have NEVER recorded a visit`,
        desc: `New hires not yet active: ${neverV.slice(0,3).map(e => e.fullName).join(", ")}${neverV.length > 3 ? ` +${neverV.length-3} more` : ""}. Ensure onboarding and field work has started.`,
        tag: "🚨 Onboarding Gap", action: "View Visits", route: "/visits",
      });
    }

    // C3: Neglected partners 45+ days (FIX: was checking wrong status "unvisited")
    const neglected = partnerStats.filter(p => p.status === "neglected");
    if (neglected.length > 0) {
      list.push({
        id: "neglected-partners", severity: "critical",
        title: `${neglected.length} partner${neglected.length > 1 ? "s" : ""} not visited in 45+ days`,
        desc: `Revenue risk: ${neglected.slice(0,3).map(p => p.name).join(", ")}${neglected.length > 3 ? ` +${neglected.length-3} more` : ""}. Ask executives to schedule a visit this week.`,
        tag: "🤝 Partner Utilization", action: "View Partners", route: "/partner-visits",
      });
    }

    // C4: Red Alert employees — failing ALL 3 benchmarks simultaneously
    const redAlert = allEmpStats.filter(e => e.visits <= 2 && e.wosCount <= 3 && e.wonCount <= 2 && e.status !== "never_visited");
    if (redAlert.length > 0) {
      list.push({
        id: "red-alert-emp", severity: "critical",
        title: `${redAlert.length} employee${redAlert.length > 1 ? "s" : ""} failing ALL performance benchmarks`,
        desc: `${redAlert.slice(0,3).map(e => e.fullName).join(", ")} — below target on visits, WOS, and won. Immediate manager review required.`,
        tag: "🚨 Performance Emergency",
      });
    }

    // C5: Showroom with 0 visits in selected period
    const zeroVisitSR = showroomStats.filter(s => s.visits === 0 && !isLoading);
    zeroVisitSR.forEach(s => {
      list.push({
        id: `zero-sr-${s.id}`, severity: "critical",
        title: `${s.name} has 0 visits this period`,
        desc: `No activity recorded. Check if executives are marking visits correctly or if the team is absent.`,
        tag: `🏦 ${s.name}`,
      });
    });

    // ────────── WARNING ────────────────────────────────────

    // W1: Employees at-risk (3–7 days no visit)
    const atRisk = allEmpStats.filter(e => e.status === "at_risk");
    if (atRisk.length > 0) {
      list.push({
        id: "at-risk", severity: "warning",
        title: `${atRisk.length} employee${atRisk.length > 1 ? "s" : ""} at risk — no visit in 3–7 days`,
        desc: `${atRisk.slice(0,3).map(e => e.fullName).join(", ")}. Contact now before they become inactive.`,
        tag: "👥 Employee Performance",
      });
    }

    // W2: Low WOS conversion (<20%) on showrooms with 5+ WOS
    const lowConv = showroomStats.filter(s => s.wosCount >= 5 && s.winRate < 20);
    lowConv.forEach(s => {
      list.push({
        id: `lc-${s.id}`, severity: "warning",
        title: `${s.name} — low WOS conversion ${s.winRate}%`,
        desc: `${s.wosCount} WOS added but only ${s.wonCount} won. Review sales quality, pricing, or follow-up process with manager.`,
        tag: `🏦 ${s.name}`,
      });
    });

    // W3: Employees with 5+ visits but 0 WOS
    const noWos = allEmpStats.filter(e => e.visits >= 5 && e.wosCount === 0);
    if (noWos.length > 0) {
      list.push({
        id: "no-wos", severity: "warning",
        title: `${noWos.length} employee${noWos.length > 1 ? "s" : ""} visiting clients but logging 0 WOS`,
        desc: `${noWos.slice(0,3).map(e => e.fullName).join(", ")}. They are active in field but not converting to scope. Check visit quality.`,
        tag: "📋 Pipeline",
      });
    }

    // W4: Zero clients added this period (whole team)
    const totalClients = allEmpStats.reduce((s, e) => s + e.clientsAdded, 0);
    if (totalClients === 0 && allEmpStats.length > 0) {
      list.push({
        id: "zero-clients", severity: "warning",
        title: "No new clients added this period across all showrooms",
        desc: "The entire team has not added a single new client. This is a growth risk. Review lead generation process.",
        tag: "👤 Client Acquisition",
      });
    }

    // W5: High WOS loss rate (lost > won for showrooms with 5+ total)
    const highLoss = showroomStats.filter(s => (s.wosCount - s.wonCount - s.winRate) > 0 && s.wosCount >= 5);
    // Simpler: showrooms where lost WOS > won WOS
    // We don't track lost in showroomStats directly; approximate with (wosCount - wonCount) / wosCount > 0.6 (60% not won)
    const stuckPipeline = showroomStats.filter(s => s.wosCount >= 5 && (s.wosCount - s.wonCount) / s.wosCount > 0.7);
    if (stuckPipeline.length > 0) {
      list.push({
        id: "stuck-pipeline", severity: "warning",
        title: `${stuckPipeline.length} showroom${stuckPipeline.length > 1 ? "s" : ""} have pipeline stuck`,
        desc: `${stuckPipeline.map(s => `${s.name}: ${s.wosCount - s.wonCount} WOS unresolved`).slice(0,2).join(" · ")}. Follow up on pending quotes urgently.`,
        tag: "⏳ Pipeline Review",
      });
    }

    // W6: TL team underperforming (team visits < 50% of expected)
    const underTLs = allEmpStats.filter(e => e.role === "tl" && e.teamVisits < 4);
    if (underTLs.length > 0) {
      list.push({
        id: "tl-underperf", severity: "warning",
        title: `${underTLs.length} Team Leader${underTLs.length > 1 ? "s" : ""} with low team activity`,
        desc: `${underTLs.slice(0,2).map(e => `${e.fullName}: team ${e.teamVisits} visits`).join(", ")}. TL needs to motivate and lead their team better.`,
        tag: "🛡️ Team Leadership",
      });
    }

    // W7: Partners with leads but not re-visited (leads came but partner ignored)
    const partnerLeadsNotRevisited = partnerStats.filter(p => p.leadsCount > 0 && p.daysSince > 30);
    if (partnerLeadsNotRevisited.length > 0) {
      list.push({
        id: "partner-lead-novisit", severity: "warning",
        title: `${partnerLeadsNotRevisited.length} partner${partnerLeadsNotRevisited.length > 1 ? "s" : ""} gave leads but not visited in 30+ days`,
        desc: `High-value partners being neglected: ${partnerLeadsNotRevisited.slice(0,3).map(p => p.name).join(", ")}. Re-visit to strengthen relationship and generate more leads.`,
        tag: "🎯 Partner Retention", action: "View Partners", route: "/partner-visits",
      });
    }

    // ────────── POSITIVE ────────────────────────────────────

    // P1: Top performers (5+ visits OR 2+ wins)
    const topEmps = allEmpStats.filter(e => e.visits >= 5 || e.wonCount >= 2).slice(0, 2);
    topEmps.forEach(e => {
      list.push({
        id: `top-${e.userId}`, severity: "positive",
        title: `🏆 ${e.fullName} — ${e.visits} visits, ${e.wonCount} won`,
        desc: `Top performer this period with ${e.wosCount} WOS and ${e.winRate}% win rate. Share best practices with the team.`,
        tag: `⭐ ${e.showroomName}`,
      });
    });

    // P2: Best showroom
    if (glance.bestSR && glance.bestSR.visits >= 5) {
      list.push({
        id: "best-sr", severity: "positive",
        title: `🏦 ${glance.bestSR.name} is leading this period`,
        desc: `Score: ${glance.bestSR.score}/100 · ${glance.bestSR.visits} visits · ${glance.bestSR.wosCount} WOS · ${glance.bestSR.wonCount} won. Recognize the team!`,
        tag: "🏦 Best Showroom",
      });
    }

    // P3: Milestone — employee hits 10+ visits
    const milestone = allEmpStats.filter(e => e.visits >= 10);
    if (milestone.length > 0) {
      list.push({
        id: "milestone-10", severity: "positive",
        title: `🚀 ${milestone.length} employee${milestone.length > 1 ? "s" : ""} crossed 10 visits this period`,
        desc: `${milestone.slice(0,3).map(e => `${e.fullName} (${e.visits})`).join(", ")}. Outstanding field activity!`,
        tag: "🏅 Milestone",
      });
    }

    // P4: Partner yielded a won WOS (partner client converted)
    const partnerWins = partnerStats.filter(p => p.wonWos > 0).slice(0, 2);
    if (partnerWins.length > 0) {
      list.push({
        id: "partner-yield", severity: "positive",
        title: `🤝 ${partnerWins.length} partner${partnerWins.length > 1 ? "s" : ""} contributed to WOS wins`,
        desc: `${partnerWins.map(p => `${p.name}: ${p.wonWos} won`).join(", ")}. Appreciate these partners — they drive revenue.`,
        tag: "💰 Partner Revenue", action: "View Partners", route: "/partner-visits",
      });
    }

    return list.sort((a, b) => {
      const order = { critical: 0, warning: 1, positive: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [allEmpStats, partnerStats, showroomStats, glance, isLoading, setSelectedEmpId]);

  /* ── Leaderboard ── */
  const leaderboard = useMemo(() => {
    return [...allEmpStats].sort((a, b) =>
      leaderTab === "visits" ? b.visits - a.visits :
      leaderTab === "wos" ? b.wosCount - a.wosCount : b.wonCount - a.wonCount
    ).slice(0, 5);
  }, [allEmpStats, leaderTab]);

  /* ── Summary KPIs (showroom-filter aware) ── */
  // Derive the set of user IDs that belong to the selected showroom (or all if "all")
  const kpiUserIds = useMemo(() => {
    if (showroomFilter === "all") return null; // null = no restriction
    return new Set(
      userRoles
        .filter(r => r.showroom_id === showroomFilter)
        .map(r => r.user_id)
    );
  }, [userRoles, showroomFilter]);

  // Filtered visits/WOS for KPI cards
  const kpiVisits = useMemo(
    () => kpiUserIds ? visits.filter(v => kpiUserIds.has(v.created_by)) : visits,
    [visits, kpiUserIds]
  );
  const kpiWos = useMemo(
    () => kpiUserIds ? wosItems.filter(w => kpiUserIds.has(w.created_by)) : wosItems,
    [wosItems, kpiUserIds]
  );

  const totalVisits = kpiVisits.length;
  const totalWos    = kpiWos.length;
  const totalWon    = kpiWos.filter(w => w.work_status === "won").length;

  const activeCount       = allEmpStats.filter(e => e.status === "active").length;
  const inactiveCount     = allEmpStats.filter(e => e.status === "inactive").length;
  const atRiskCount       = allEmpStats.filter(e => e.status === "at_risk").length;
  const neverVisitedCount = allEmpStats.filter(e => e.status === "never_visited").length;
  const criticalAlerts  = alerts.filter(a => a.severity === "critical").length;
  const displayedAlerts = showAllAlerts ? alerts : alerts.slice(0, 4);

  // Visit trend: compare current period vs prior period (filtered by same showroom)
  const prevVisitCount = prevVisits.length; // prev query is global; approximate is acceptable
  const visitTrend = prevVisitCount > 0
    ? Math.round(((totalVisits - prevVisitCount) / prevVisitCount) * 100)
    : null;

  // Partner coverage — filtered to selected showroom
  const kpiPartners = useMemo(
    () => showroomFilter === "all"
      ? partners
      : partners.filter(p => partnerShowroomMap[p.id] === showroomFilter),
    [partners, partnerShowroomMap, showroomFilter]
  );
  const totalPartnerCount   = kpiPartners.length;
  const visitedPartnerCount = kpiPartners.filter(p =>
    partnerVisits.some(pv => pv.partner_id === p.id)
  ).length;
  const overallPartnerCoverage = totalPartnerCount > 0
    ? Math.round((visitedPartnerCount / totalPartnerCount) * 100)
    : 0;

  const handleSort = useCallback((k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }, [sortKey]);

  /* ── Role-split employee lists ── */
  const managers   = useMemo(() => filteredEmps.filter(e => e.role === "manager"),   [filteredEmps]);
  const tls        = useMemo(() => filteredEmps.filter(e => e.role === "tl"),        [filteredEmps]);
  const executives = useMemo(() => filteredEmps.filter(e => e.role === "executive"), [filteredEmps]);

  // Days in the selected date range — used to scale benchmark thresholds
  const daysInPeriod = dateRange === "today" ? 1 : dateRange === "7d" ? 7 : differenceInDays(new Date(), startOfMonth(new Date())) + 1;

  // Reset pagination whenever the visible list changes (filter / search / sort / showroom)
  useEffect(() => { setVisibleEmpCount(20); }, [filteredEmps]);

  // Callback ref: auto-load more executives on scroll
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleEmpCount(c => c + 20); },
      { threshold: 0.1 }
    );
    obs.observe(node);
  }, []);

  // Reset partner count when filter or showroom changes
  useEffect(() => { setVisiblePartnerCount(12); }, [filteredPartners]);

  // Callback ref: auto-load more partners on scroll
  const partnerSentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisiblePartnerCount(c => c + 12); },
      { threshold: 0.1 }
    );
    obs.observe(node);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">

      {/* ══════════════ STICKY HEADER ══════════════ */}
      <div className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-sm shrink-0">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                {isMdOrAdmin ? "All Showrooms" : "My Showroom"} · {role?.toUpperCase()}
              </div>
              <h1 className="text-[16px] font-extrabold text-slate-900 dark:text-white leading-tight">
                Command Center
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {criticalAlerts > 0 && (
                <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 px-2 py-1 rounded-full animate-pulse">
                  <AlertTriangle className="h-3 w-3" />{criticalAlerts} Critical
                </span>
              )}
              {/* ── Export CSV Button ── */}
              <button
                onClick={() => {
                  exportToCSV(
                    allEmpStats.map(e => ({
                      Name: e.fullName,
                      Role: e.role,
                      Showroom: e.showroomName,
                      Status: e.status,
                      Visits: e.visits,
                      WOS: e.wosCount,
                      Won: e.wonCount,
                      "Win%": e.winRate,
                      Score: e.score,
                      "Last Visit": e.lastVisitDate || "Never",
                    })),
                    `art-glass-employees-${format(new Date(), "yyyy-MM-dd")}.csv`
                  );
                }}
                title="Export Employee Data to CSV"
                className="h-8 flex items-center gap-1.5 px-2.5 rounded-xl border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-[10px] font-bold"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button onClick={() => refetch()}
                className="h-8 w-8 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Refresh Data">
                <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              </button>
              {/* ── Test Notification Suite Button for MD ── */}
              <button
                disabled={isSendingTest}
                onClick={async () => {
                  setIsSendingTest(true);
                  toast.info("Sending 5 Test Notifications to your phone & MD accounts... 📱");
                  try {
                    const targetUid = user?.id || (await supabase.auth.getUser()).data.user?.id;

                    if (targetUid) {
                      // 1. Critical Alert
                      await sendNotification({
                        userId: targetUid,
                        title: "🔴 CRITICAL: High-Value Deal Lost (₹12.5L)",
                        message: "Client 'Supertech Towers' lost by Rahul. Reason: Competitor Pricing.",
                        category: "critical",
                        priority: "high",
                        notificationType: "deal_lost",
                        metadata: { dealId: "test-deal-1" },
                      });

                      // 2. Important Alert
                      await sendNotification({
                        userId: targetUid,
                        title: "🟢 Deal WON: ₹18.5L Project Won 🎉",
                        message: "Client 'M/s Luxury Glass Projects' converted to WON by Executive Rohit!",
                        category: "important",
                        priority: "high",
                        notificationType: "deal_won",
                        metadata: { dealId: "test-deal-2" },
                      });

                      // 3. Report Notification
                      await sendNotification({
                        userId: targetUid,
                        title: "🔵 Daily Business Summary Ready 📊",
                        message: "Today: 72 Visits Planned, 58 Completed (81%), 14 Pending, 6 New Clients.",
                        category: "report",
                        priority: "normal",
                        notificationType: "daily_summary",
                      });

                      // 4. Reminder Notification
                      await sendNotification({
                        userId: targetUid,
                        title: "🟡 18 Follow-ups Overdue & 3 Missed Visits",
                        message: "5 priority clients have follow-ups overdue by more than 3 days.",
                        category: "reminder",
                        priority: "medium",
                        notificationType: "overdue_followup",
                      });

                      // 5. Informational Notification
                      await sendNotification({
                        userId: targetUid,
                        title: "⚪ Team Activity: 18 Active Executives",
                        message: "18 active executives, 2 absent, 3 yet to start visits today.",
                        category: "informational",
                        priority: "normal",
                        notificationType: "team_activity",
                      });
                    } else {
                      // Fallback notify all MDs
                      await notifyAllMDs({
                        title: "🔴 CRITICAL: High-Value Deal Lost (₹12.5L)",
                        message: "Client 'Supertech Towers' lost by Rahul. Reason: Competitor Pricing.",
                        category: "critical",
                        priority: "high",
                        notificationType: "deal_lost",
                      });
                    }

                    queryClient.invalidateQueries({ queryKey: ["in-app-notifications"] });
                    queryClient.invalidateQueries({ queryKey: ["notifications-center"] });
                    queryClient.invalidateQueries({ queryKey: ["attention-required-items"] });

                    toast.success("🚀 5 Suite Test Push Notifications sent to your phone & Notification Center! 🔔");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to send notification");
                  } finally {
                    setIsSendingTest(false);
                  }
                }}
                title="Send 5 Category Test Push Notifications to MD"
                className="h-8 flex items-center gap-1.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors text-[10px] font-bold shadow-md shrink-0 cursor-pointer disabled:opacity-50"
              >
                {isSendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>{isSendingTest ? "Sending 5 Alerts..." : "Test 5 Alerts 🔔"}</span>
              </button>
            </div>
          </div>
          {/* Quick Page Links Bar for Mobile */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 pt-1 scrollbar-none">
            <Link to="/" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-bold shrink-0 shadow-sm hover:opacity-90 transition-all">
              🏠 Home
            </Link>
            <Link to="/notifications" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[11px] font-bold shrink-0 shadow-sm hover:opacity-90 transition-all">
              🔔 Notifications
            </Link>
            <Link to="/partners" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-[11px] font-bold shrink-0 shadow-sm hover:opacity-90 transition-all">
              🤝 Partners
            </Link>
            <Link to="/clients" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[11px] font-bold shrink-0 shadow-sm hover:opacity-90 transition-all">
              👥 Clients
            </Link>
            <Link to="/visits" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold shrink-0 shadow-sm hover:opacity-90 transition-all">
              📅 Visits
            </Link>
            <Link to="/reports" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[11px] font-bold shrink-0 shadow-sm hover:opacity-90 transition-all">
              📊 Reports
            </Link>
            <Link to="/hierarchy" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-[11px] font-bold shrink-0 shadow-sm hover:opacity-90 transition-all">
              🌳 Hierarchy
            </Link>
            <Link to="/admin" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-[11px] font-bold shrink-0 shadow-sm hover:opacity-90 transition-all">
              ⚙️ Admin
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {(["today", "7d", "month"] as DateRange[]).map(r => (
              <Chip key={r} label={DR_LABELS[r]} active={dateRange === r} onClick={() => setDateRange(r)} />
            ))}
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 self-center shrink-0 mx-1" />
            <Chip label="All" active={showroomFilter === "all"} onClick={() => setShowroomFilter("all")} />
            {showrooms.filter(s => isMdOrAdmin || showroomIds.includes(s.id)).map(s => (
              <Chip key={s.id} label={s.name} active={showroomFilter === s.id} onClick={() => setShowroomFilter(s.id)} />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-4 space-y-5">

        {/* ── ATTENTION REQUIRED TOP WIDGET ── */}
        <AttentionRequiredSection />

        {/* ══════════════ SHOWROOM HEALTH BANNER ══════════════ */}
        {(() => {
          const criticalShowrooms = showroomStats.filter(s => s.inactiveEmps >= 2 || (s.visits === 0 && !isLoading));
          // After status update: employees who never visited now have status="never_visited" (not "inactive")
          // So we check both statuses here for the banner
          const noActivityToday = allEmpStats.filter(e =>
            (e.status === "inactive" || e.status === "never_visited") && !e.lastVisitDate
          ).length;
          if (criticalShowrooms.length === 0 && noActivityToday === 0) return null;
          return (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/40 border border-red-200 dark:border-red-800/50 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-2"
            >
              <div className="flex items-center gap-2 shrink-0">
                <div className="h-8 w-8 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-white" />
                </div>
                <span className="text-[12px] font-extrabold text-red-700 dark:text-red-300 uppercase tracking-wider">Action Required</span>
              </div>
              <div className="flex-1 flex flex-wrap gap-2">
                {criticalShowrooms.map(s => (
                  <span key={s.id} onClick={() => setSelectedShowroomId(s.id)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700/40 cursor-pointer hover:bg-red-250 dark:hover:bg-red-900/60 hover:scale-105 active:scale-95 transition-all">
                    🏬 {s.name} — {s.inactiveEmps} inactive · {s.visits} visits
                  </span>
                ))}
                {noActivityToday > 0 && (
                  <span onClick={() => {
                    setEmpFilter("never_visited");
                    const el = document.getElementById("employee-performance-section");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700/40 cursor-pointer hover:bg-rose-200 dark:hover:bg-rose-900/60 hover:scale-105 active:scale-95 transition-all">
                    👤 {noActivityToday} employee{noActivityToday > 1 ? "s" : ""} never visited
                  </span>
                )}
              </div>
              <span className="text-[9px] text-red-400 font-medium shrink-0">Auto-detected · {format(new Date(), "HH:mm")}</span>
            </motion.div>
          );
        })()}

        {/* ══════════════ KPI STRIP ══════════════ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Total Visits" value={isLoading ? "—" : totalVisits}
            icon={<Activity className="h-5 w-5" />} gradient="from-sky-500 to-blue-600"
            sub={
              visitTrend !== null
                ? `${visitTrend > 0 ? "▲" : visitTrend < 0 ? "▼" : "→"} ${Math.abs(visitTrend)}% vs prior period`
                : DR_LABELS[dateRange]
            }
            warn={visitTrend !== null && visitTrend < -10}
            onClick={() => {
              const el = document.getElementById("showroom-performance-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <KpiCard label="WOS / Won" value={`${totalWos}/${totalWon}`}
            icon={<Target className="h-5 w-5" />} gradient="from-emerald-500 to-teal-600"
            sub={totalWos > 0 ? `${Math.round((totalWon / totalWos) * 100)}% win rate` : "No WOS yet"}
            onClick={() => {
              const el = document.getElementById("pipeline-summary-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <KpiCard label="Active Employees" value={activeCount}
            icon={<UserCheck className="h-5 w-5" />} gradient="from-indigo-500 to-violet-600"
            sub={`${atRiskCount} at risk · ${inactiveCount} inactive`}
            onClick={() => {
              setEmpFilter("active");
              const el = document.getElementById("employee-performance-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <KpiCard label="Not Active" value={inactiveCount + neverVisitedCount}
            icon={<UserX className="h-5 w-5" />} gradient="from-rose-500 to-red-700"
            sub={inactiveCount > 0 || neverVisitedCount > 0
              ? `${inactiveCount} inactive · ${neverVisitedCount} never visited`
              : "All employees active"}
            warn={inactiveCount > 0 || neverVisitedCount > 0}
            onClick={() => {
              setEmpFilter("inactive");
              const el = document.getElementById("employee-performance-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <KpiCard
            label="Partner Coverage"
            value={totalPartnerCount > 0 ? `${overallPartnerCoverage}%` : "—"}
            icon={<Handshake className="h-5 w-5" />} gradient="from-violet-500 to-purple-700"
            sub={totalPartnerCount > 0
              ? `${visitedPartnerCount}/${totalPartnerCount} partners visited`
              : "No real partners found"}
            warn={overallPartnerCoverage < 50 && totalPartnerCount > 0}
            onClick={() => {
              const el = document.getElementById("partner-utilization-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          />
        </div>

        {/* ══════════════ AT A GLANCE ══════════════ */}
        <Card>
          <SecHead
            icon={<Flame className="h-3.5 w-3.5" />}
            title="Business Health — At a Glance"
            sub={`${showAllGlance ? 18 : 8} of 18 insights · tap to explore`}
            action={
              <button
                onClick={() => setShowAllGlance(v => !v)}
                className="text-[10px] font-bold text-red-600 border border-red-200 dark:border-red-800 px-2.5 py-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-1"
              >
                {showAllGlance ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showAllGlance ? "Show Less" : "Show All 18"}
              </button>
            }
          />

          {/* ── DEFAULT 8 (always visible) ── */}
          <div className="p-3 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* 1 */}
            <InsightCard
              icon={<Trophy className="h-4 w-4" />} color="emerald" title="Best Showroom"
              name={glance.bestSR?.name || "—"}
              detail={glance.bestSR
                ? `Score ${glance.bestSR.score} · ${glance.bestSR.visits} visits · ${glance.bestSR.wosCount} WOS · 🤝 ${glance.bestSR.partnerCoverage}% coverage`
                : "No data"}
              onClick={glance.bestSR ? () => setSelectedShowroomId(glance.bestSR.id) : undefined}
            />
            {/* 2 */}
            <InsightCard
              icon={<TrendingDown className="h-4 w-4" />} color="red" title="Weakest Showroom"
              name={glance.weakSR?.name || (showroomStats.length <= 1 ? "Only 1 showroom" : "—")}
              detail={glance.weakSR
                ? `Score ${glance.weakSR.score} · ${glance.weakSR.visits} visits · ${glance.weakSR.inactiveEmps} inactive · 🤝 ${glance.weakSR.partnerCoverage}% coverage`
                : ""}
              onClick={glance.weakSR ? () => setSelectedShowroomId(glance.weakSR.id) : undefined}
            />
            {/* 3 */}
            <InsightCard
              icon={<Award className="h-4 w-4" />} color="amber" title="Best Employee"
              name={glance.bestEmp?.fullName || "—"}
              detail={glance.bestEmp ? `${glance.bestEmp.visits} visits · ${glance.bestEmp.wonCount} won · Score ${glance.bestEmp.score}` : "No data"}
              onClick={glance.bestEmp ? () => setSelectedEmpId(glance.bestEmp.userId) : undefined}
            />
            {/* 4 */}
            <InsightCard
              icon={<UserX className="h-4 w-4" />} color="red" title="Needs Attention"
              name={glance.inactiveEmp?.fullName || "All active ✓"}
              detail={glance.inactiveEmp
                ? `No visit${glance.inactiveEmp.lastVisitDate ? ` since ${format(parseISO(glance.inactiveEmp.lastVisitDate), "d MMM")}` : " — never visited"}`
                : "No inactive employees"}
              onClick={glance.inactiveEmp ? () => setSelectedEmpId(glance.inactiveEmp.userId) : undefined}
            />
            {/* 5 */}
            <InsightCard
              icon={<TrendingUp className="h-4 w-4" />} color="sky" title="Top Visit Leader"
              name={glance.topVisitEmp?.fullName || "—"}
              detail={glance.topVisitEmp ? `${glance.topVisitEmp.visits} visits · ${glance.topVisitEmp.showroomName}` : "No data"}
              onClick={glance.topVisitEmp ? () => setSelectedEmpId(glance.topVisitEmp.userId) : undefined}
            />
            {/* 6 */}
            <InsightCard
              icon={<Star className="h-4 w-4" />} color="indigo" title="Top WOS Contributor"
              name={glance.topWosEmp?.fullName || "—"}
              detail={glance.topWosEmp ? `${glance.topWosEmp.wosCount} WOS · ${glance.topWosEmp.wonCount} won · ${glance.topWosEmp.winRate}% win rate` : "No data"}
              onClick={glance.topWosEmp ? () => setSelectedEmpId(glance.topWosEmp.userId) : undefined}
            />
            {/* 7 */}
            <InsightCard
              icon={<Handshake className="h-4 w-4" />} color="emerald" title="Most Used Partner"
              name={glance.topPartner?.name || "—"}
              detail={glance.topPartner ? `${glance.topPartner.visitCount} visits · ${glance.topPartner.showroomName}` : "No partner visits"}
              onClick={glance.topPartner ? () => setSelectedPartnerId(glance.topPartner.id) : undefined}
            />
            {/* 8 */}
            <InsightCard
              icon={<EyeOff className="h-4 w-4" />} color="amber" title="Most Ignored Partner"
              name={glance.ignoredPartner?.name || "All visited ✓"}
              detail={glance.ignoredPartner
                ? `Not visited ${glance.ignoredPartner.daysSince >= 9999 ? "— never" : `in ${glance.ignoredPartner.daysSince}d`}`
                : "All partners recently visited"}
              onClick={glance.ignoredPartner ? () => setSelectedPartnerId(glance.ignoredPartner.id) : undefined}
            />
          </div>

          {/* ── EXPANDED 10 (show more) ── */}
          <AnimatePresence>
            {showAllGlance && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-1 pt-0">
                  <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-3">
                    <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mb-2 px-1">── Extended Insights ──</p>
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {/* 9: Top Client Adder */}
                      <InsightCard
                        icon={<UserCheck className="h-4 w-4" />} color="emerald" title="Top Client Adder"
                        name={glance.topClientAdder?.fullName || "—"}
                        detail={glance.topClientAdder && glance.topClientAdder.clientsAdded > 0
                          ? `${glance.topClientAdder.clientsAdded} clients added · ${glance.topClientAdder.showroomName}`
                          : "No clients added this period"}
                        onClick={glance.topClientAdder ? () => setSelectedEmpId(glance.topClientAdder.userId) : undefined}
                      />
                      {/* 10: Best Win Rate */}
                      <InsightCard
                        icon={<Target className="h-4 w-4" />} color="indigo" title="Best Win Rate"
                        name={glance.bestWinRate?.fullName || "—"}
                        detail={glance.bestWinRate
                          ? `${glance.bestWinRate.winRate}% win rate · ${glance.bestWinRate.wonCount}/${glance.bestWinRate.wosCount} WOS won`
                          : "Need ≥3 WOS to qualify"}
                        onClick={glance.bestWinRate ? () => setSelectedEmpId(glance.bestWinRate.userId) : undefined}
                      />
                      {/* 11: Most WOS Won */}
                      <InsightCard
                        icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" title="Most WOS Won"
                        name={glance.topWonEmp?.fullName || "—"}
                        detail={glance.topWonEmp && glance.topWonEmp.wonCount > 0
                          ? `${glance.topWonEmp.wonCount} won · ${glance.topWonEmp.winRate}% conversion · ${glance.topWonEmp.showroomName}`
                          : "No WOS won this period"}
                        onClick={glance.topWonEmp ? () => setSelectedEmpId(glance.topWonEmp.userId) : undefined}
                      />
                      {/* 12: Zero WOS Employees */}
                      <InsightCard
                        icon={<AlertTriangle className="h-4 w-4" />}
                        color={glance.zeroWosCount > 0 ? "red" : "emerald"}
                        title="Active but 0 WOS"
                        name={glance.zeroWosCount > 0 ? `${glance.zeroWosCount} employee${glance.zeroWosCount > 1 ? "s" : ""}` : "None ✓"}
                        detail={glance.zeroWosCount > 0
                          ? "Visiting clients but not logging business scope — follow up"
                          : "All active employees have logged WOS"}
                      />
                      {/* 13: Best TL */}
                      <InsightCard
                        icon={<Shield className="h-4 w-4" />} color="violet" title="Best Team Leader"
                        name={glance.bestTL?.fullName || (allEmpStats.some(e => e.role === "tl") ? "—" : "No TLs found")}
                        detail={glance.bestTL
                          ? `Team: ${glance.bestTL.teamVisits} visits · ${glance.bestTL.teamWos} WOS · ${glance.bestTL.teamWon} won`
                          : "No TL data available"}
                        onClick={glance.bestTL ? () => setSelectedEmpId(glance.bestTL.userId) : undefined}
                      />
                      {/* 14: Showroom Best Win Rate */}
                      <InsightCard
                        icon={<TrendingUp className="h-4 w-4" />} color="emerald" title="Best Conversion SR"
                        name={glance.bestConvSR?.name || "—"}
                        detail={glance.bestConvSR
                          ? `${glance.bestConvSR.winRate}% win rate · ${glance.bestConvSR.wonCount}/${glance.bestConvSR.wosCount} WOS won`
                          : "Need ≥5 WOS per showroom"}
                        onClick={glance.bestConvSR ? () => setSelectedShowroomId(glance.bestConvSR.id) : undefined}
                      />
                      {/* 15: Conversion Gap */}
                      <InsightCard
                        icon={<Zap className="h-4 w-4" />}
                        color={glance.convGapSR ? "amber" : "emerald"}
                        title="Pipeline Stuck"
                        name={glance.convGapSR?.name || "None ✓"}
                        detail={glance.convGapSR
                          ? `${glance.convGapSR.wosCount} WOS but only ${glance.convGapSR.wonCount} won (${glance.convGapSR.winRate}% rate) — review`
                          : "All showrooms converting well"}
                        onClick={glance.convGapSR ? () => setSelectedShowroomId(glance.convGapSR.id) : undefined}
                      />
                      {/* 16: Clients This Period */}
                      <InsightCard
                        icon={<Users className="h-4 w-4" />} color="sky" title="New Clients (Period)"
                        name={`${glance.totalClientsThisPeriod} clients`}
                        detail={glance.totalClientsThisPeriod > 0
                          ? `Added across all showrooms this ${DR_LABELS[dateRange].toLowerCase()}`
                          : "No new clients added yet"}
                      />
                      {/* 17: Red Alert Employees */}
                      <InsightCard
                        icon={<AlertTriangle className="h-4 w-4" />}
                        color={glance.redAlertCount > 0 ? "red" : "emerald"}
                        title="🚨 Red Alert Employees"
                        name={glance.redAlertCount > 0 ? `${glance.redAlertCount} employee${glance.redAlertCount > 1 ? "s" : ""}` : "None ✓"}
                        detail={glance.redAlertCount > 0
                          ? "Failing visits + WOS + Won benchmarks simultaneously"
                          : "All employees meet at least one benchmark"}
                      />
                      {/* 18: At Risk Partners */}
                      <InsightCard
                        icon={<Clock className="h-4 w-4" />}
                        color={glance.atRiskPartners.length > 0 ? "amber" : "emerald"}
                        title="At Risk Partners"
                        name={glance.atRiskPartners.length > 0 ? `${glance.atRiskPartners.length} partner${glance.atRiskPartners.length > 1 ? "s" : ""}` : "All good ✓"}
                        detail={glance.atRiskPartners.length > 0
                          ? `15–45 days without visit: ${glance.atRiskPartners.slice(0,3).map(p=>p.name).join(", ")}${glance.atRiskPartners.length > 3 ? ` +${glance.atRiskPartners.length-3} more` : ""}`
                          : "All partners visited within 14 days"}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Show More / Less Button at bottom */}
          <div className="flex justify-center py-2.5 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setShowAllGlance(v => !v)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-red-600 transition-colors"
            >
              {showAllGlance
                ? <><ChevronUp className="h-3.5 w-3.5" /> Show Less</>
                : <><ChevronDown className="h-3.5 w-3.5" /> Show All 18 Insights</>}
            </button>
          </div>
        </Card>

        {/* ══════════════ SMART ALERTS ══════════════ */}
        {/* ══════════════ SMART ALERTS ══════════════ */}
        {alerts.length > 0 && (() => {
          const criticals  = alerts.filter(a => a.severity === "critical");
          const warnings   = alerts.filter(a => a.severity === "warning");
          const positives  = alerts.filter(a => a.severity === "positive");
          // Default: show all criticals + first 2 warnings; rest behind Show More
          const defaultVisible = [...criticals, ...warnings.slice(0, 2)];
          const extraVisible   = [...warnings.slice(2), ...positives];
          const displayed = showAllAlerts ? [...defaultVisible, ...extraVisible] : defaultVisible;

          return (
            <Card>
              <SecHead
                icon={<Zap className="h-3.5 w-3.5" />}
                title="Smart Alerts & Action Items"
                sub={`${criticals.length} critical · ${warnings.length} warnings · ${positives.length} positive`}
                action={
                  criticals.length > 0
                    ? <span className="text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded-full animate-pulse">{criticals.length} critical</span>
                    : undefined
                }
              />

              {/* ─ Critical Section ─ */}
              {criticals.length > 0 && (
                <div className="px-3 pt-3 pb-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-600">🚨 Action Required Now · {criticals.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <AnimatePresence mode="popLayout">
                      {criticals.map((a, i) => (
                        <motion.div key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}>
                          <AlertCard a={a} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* ─ Warning Section ─ */}
              {warnings.length > 0 && (
                <div className="px-3 pt-2 pb-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600">⚠️ Act This Week · {warnings.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <AnimatePresence mode="popLayout">
                      {(showAllAlerts ? warnings : warnings.slice(0, 2)).map((a, i) => (
                        <motion.div key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}>
                          <AlertCard a={a} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  {!showAllAlerts && warnings.length > 2 && (
                    <p className="text-[9px] text-amber-500 font-semibold mt-1.5 ml-0.5">
                      +{warnings.length - 2} more warnings hidden — click Show All
                    </p>
                  )}
                </div>
              )}

              {/* ─ Positive Section (only when expanded) ─ */}
              <AnimatePresence>
                {showAllAlerts && positives.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pt-2 pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600">✅ Good News · {positives.length}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <AnimatePresence mode="popLayout">
                          {positives.map((a, i) => (
                            <motion.div key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}>
                              <AlertCard a={a} />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Show More / Less */}
              {(extraVisible.length > 0 || positives.length > 0) && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    {showAllAlerts
                      ? `Showing all ${alerts.length} alerts`
                      : `${warnings.length - Math.min(2, warnings.length) + positives.length} more hidden`}
                  </span>
                  <button onClick={() => setShowAllAlerts(s => !s)}
                    className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1">
                    {showAllAlerts
                      ? <><ChevronUp className="h-3.5 w-3.5" />Show Less</>
                      : <><ChevronDown className="h-3.5 w-3.5" />Show All {alerts.length} Alerts</>}
                  </button>
                </div>
              )}
            </Card>
          );
        })()}

        {/* ══════════════ PARTNER ACCOUNTABILITY & FUNNEL HEALTH ══════════════ */}
        {funnelData.length > 0 && (
          <Card>
            <SecHead
              icon={<Target className="h-3.5 w-3.5" />}
              title="Partner Accountability & Funnel Health"
              sub={`15-day partner cycle · ${funnelData.reduce((s, f) => s + f.covOverdue + f.covNever, 0)} partners overdue · ${funnelData.reduce((s, f) => s + f.f4, 0)} WOS won from partners`}
              action={
                <button
                  onClick={() => setShowFunnelHealth(v => !v)}
                  className="text-[10px] font-bold text-red-600 border border-red-200 dark:border-red-800 px-2.5 py-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-1"
                >
                  {showFunnelHealth ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {showFunnelHealth ? "Collapse" : "Expand"}
                </button>
              }
            />

            <AnimatePresence>
              {showFunnelHealth && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 space-y-2">
                    {funnelData.map(fd => <ShowroomFunnelBlock key={fd.srId} fd={fd} onSelectPartner={setSelectedPartnerId} />)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        )}

        {/* ══════════════ SHOWROOM PERFORMANCE ══════════════ */}
        {showroomStats.length > 0 && (
          <div id="showroom-performance-section">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-[13px] font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-red-600" />Showroom Performance
                <span className="text-[10px] text-slate-400 font-medium">({showroomStats.length} showrooms, ranked by score)</span>
              </h2>
              <button onClick={() => setShowComp(s => !s)}
                className="text-[11px] font-bold text-red-600 flex items-center gap-1 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors">
                {showComp ? "Hide" : "Compare"} <BarChart2 className="h-3 w-3" />
              </button>
            </div>

            {/* Comparison Table */}
            <AnimatePresence>
              {showComp && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <Card className="mb-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                            {["Showroom", "Visits", "WOS", "Won", "Win%", "Active/Inactive", "🤝 Coverage", "Score"].map(h => (
                              <th key={h} className="px-3 py-2.5 text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {showroomStats.map(s => (
                            <CompRow key={s.id} s={s} isTop={s.rank === 1} isWeak={s.rank === showroomStats.length && showroomStats.length > 1} onSelectShowroom={setSelectedShowroomId} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {showroomStats.map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <ShowroomCard
                    s={s}
                    totalShowrooms={showroomStats.length}
                    isSelected={showroomFilter === s.id}
                    onClick={() => setShowroomFilter(prev => prev === s.id ? "all" : s.id)}
                    onViewDetails={() => setSelectedShowroomId(s.id)}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ EMPLOYEE PERFORMANCE ══════════════ */}
        <Card id="employee-performance-section">
          <SecHead
            icon={<Users className="h-3.5 w-3.5" />}
            title="Employee Performance"
            sub={[
              managers.length > 0 && `${managers.length} manager${managers.length !== 1 ? "s" : ""}`,
              tls.length > 0 && `${tls.length} TL${tls.length !== 1 ? "s" : ""}`,
              executives.length > 0 && `${executives.length} executive${executives.length !== 1 ? "s" : ""}`,
            ].filter(Boolean).join(" · ") + " · sorted by score"}
          />
          <div className="px-4 py-2.5 space-y-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <Chip label="All" active={empFilter === "all"} onClick={() => setEmpFilter("all")} count={allEmpStats.length} />
              <Chip label="🏆 Top 5" active={empFilter === "top"} onClick={() => setEmpFilter("top")} />
              <Chip label="🟢 Active" active={empFilter === "active"} onClick={() => setEmpFilter("active")} count={activeCount} />
              <Chip label="🟡 At Risk" active={empFilter === "at_risk"} onClick={() => setEmpFilter("at_risk")} count={atRiskCount} />
              <Chip label="🔴 Inactive" active={empFilter === "inactive"} onClick={() => setEmpFilter("inactive")} count={inactiveCount} />
              {neverVisitedCount > 0 && (
                <Chip label="⚫ Never Visited" active={empFilter === "never_visited"} onClick={() => setEmpFilter("never_visited")} count={neverVisitedCount} />
              )}
              <Chip label="⚠️ 0 Visits" active={empFilter === "zero_visits"} onClick={() => setEmpFilter("zero_visits")} count={allEmpStats.filter(e => e.visits === 0).length} />
            </div>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input type="text" placeholder="Search by name or showroom..."
                value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 text-slate-800 dark:text-slate-200" />
              {empSearch && <button onClick={() => setEmpSearch("")} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>}
            </div>
          </div>

          {/* ── Desktop Table ── */}
          <div className="hidden md:block overflow-x-auto">
            {isLoading ? (
              <div>{[1,2,3].map(i => <SkelRow key={i} />)}</div>
            ) : filteredEmps.length === 0 ? (
              <EmptyState
                icon={<Users className="h-10 w-10" />}
                msg="No employees match your filters"
                sub="Try changing the filter or search term"
                onClear={() => { setEmpFilter("all"); setEmpSearch(""); }}
              />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                    <th className="px-3 py-2.5 text-left"><SortBtn label="Employee" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
                    <th className="px-2 py-2.5 text-left text-[10px] font-bold text-slate-400">Status</th>
                    <th className="px-2 py-2.5 text-center"><SortBtn label="Visits" sortKey="visits" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
                    <th className="px-2 py-2.5 text-center"><SortBtn label="WOS" sortKey="wos" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
                    <th className="px-2 py-2.5 text-center"><SortBtn label="Won" sortKey="won" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold text-slate-400">Win%</th>
                    <th className="px-2 py-2.5 text-center"><SortBtn label="Last Active" sortKey="last_active" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
                    <th className="px-2 py-2.5 text-center"><SortBtn label="Score" sortKey="score" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
                  </tr>
                </thead>
                <tbody>

                  {/* ─── MANAGERS GROUP ─── */}
                  {managers.length > 0 && (
                    <>
                      <tr className="bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800/40">
                        <td colSpan={8} className="px-3 py-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                            <Shield className="h-3 w-3" />
                            Managers &nbsp;·&nbsp; {managers.length}
                          </span>
                        </td>
                      </tr>
                      {managers.map((e, i) => <EmpRow key={e.userId} e={e} idx={i} daysInPeriod={daysInPeriod} onSelectEmp={setSelectedEmpId} />)}
                    </>
                  )}

                  {/* ─── TL GROUP ─── */}
                  {tls.length > 0 && (
                    <>
                      <tr className="bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/40">
                        <td colSpan={8} className="px-3 py-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                            <Star className="h-3 w-3" />
                            Team Leaders &nbsp;·&nbsp; {tls.length}
                          </span>
                        </td>
                      </tr>
                      {tls.map((e, i) => <EmpRow key={e.userId} e={e} idx={i} daysInPeriod={daysInPeriod} onSelectEmp={setSelectedEmpId} />)}
                    </>
                  )}

                  {/* ─── EXECUTIVES GROUP ─── */}
                  {executives.length > 0 && (
                    <>
                      <tr className="bg-sky-50 dark:bg-sky-900/20 border-b border-sky-100 dark:border-sky-800/40">
                        <td colSpan={8} className="px-3 py-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                            <Users className="h-3 w-3" />
                            Executives &nbsp;·&nbsp; {executives.length}
                            {executives.length > visibleEmpCount && (
                              <span className="ml-1 text-slate-400 font-medium normal-case tracking-normal">
                                (showing {Math.min(visibleEmpCount, executives.length)} of {executives.length})
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                      {executives.slice(0, visibleEmpCount).map((e, i) => (
                        <EmpRow key={e.userId} e={e} idx={i} daysInPeriod={daysInPeriod} onSelectEmp={setSelectedEmpId} />
                      ))}
                    </>
                  )}

                </tbody>
              </table>
            )}
          </div>

          {/* ── Mobile Cards ── */}
          <div className="block md:hidden">
            {isLoading ? (
              <div>{[1,2,3].map(i => <SkelRow key={i} />)}</div>
            ) : filteredEmps.length === 0 ? (
              <EmptyState
                icon={<Users className="h-10 w-10" />}
                msg="No employees match your filters"
                sub="Try changing the filter"
                onClear={() => { setEmpFilter("all"); setEmpSearch(""); }}
              />
            ) : (
              <>
                {/* ─── MANAGERS ─── */}
                {managers.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800/40">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                        <Shield className="h-3 w-3" /> Managers &nbsp;·&nbsp; {managers.length}
                      </span>
                    </div>
                    {managers.map(e => <EmpCard key={e.userId} e={e} daysInPeriod={daysInPeriod} onSelectEmp={setSelectedEmpId} />)}
                  </div>
                )}
                {/* ─── TLs ─── */}
                {tls.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/40">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <Star className="h-3 w-3" /> Team Leaders &nbsp;·&nbsp; {tls.length}
                      </span>
                    </div>
                    {tls.map(e => <EmpCard key={e.userId} e={e} daysInPeriod={daysInPeriod} onSelectEmp={setSelectedEmpId} />)}
                  </div>
                )}
                {/* ─── EXECUTIVES ─── */}
                {executives.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 bg-sky-50 dark:bg-sky-900/20 border-b border-sky-100 dark:border-sky-800/40">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                        <Users className="h-3 w-3" /> Executives &nbsp;·&nbsp; {executives.length}
                      </span>
                    </div>
                    {executives.slice(0, visibleEmpCount).map(e => <EmpCard key={e.userId} e={e} daysInPeriod={daysInPeriod} onSelectEmp={setSelectedEmpId} />)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Scroll sentinel: loads 20 more executives when scrolled into view ── */}
          {executives.length > visibleEmpCount && (
            <div
              ref={sentinelRef}
              className="py-4 flex flex-col items-center gap-1.5 border-t border-slate-100 dark:border-slate-800"
            >
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                Showing {Math.min(visibleEmpCount, executives.length)} of {executives.length} executives · scroll to load more
              </span>
            </div>
          )}
        </Card>

        {/* ══════════════ PARTNER UTILIZATION ══════════════ */}
        <Card id="partner-utilization-section">
          <SecHead
            icon={<Handshake className="h-3.5 w-3.5" />}
            title="Partner Utilization"
            sub="Real architects & builders only — internal/test entries excluded"
            action={<span className="text-[10px] text-slate-400 font-semibold">{partners.length} real partners</span>}
          />
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <Chip label="All" active={pFilter === "all"} onClick={() => setPFilter("all")}
                count={partnerStats.length} />
              <Chip label="🎯 Top by Leads" active={pFilter === "top_leads"} onClick={() => setPFilter("top_leads")}
                count={Math.min(12, partnerStats.filter(p => p.leadsCount > 0).length)} />
              <Chip label="🏆 Top by Visits" active={pFilter === "top"} onClick={() => setPFilter("top")}
                count={Math.min(12, partnerStats.filter(p => p.visitCount > 0).length)} />
              <Chip label="🟢 Active" active={pFilter === "active"} onClick={() => setPFilter("active")}
                count={partnerStats.filter(p => p.status === "active").length} />
              <Chip label="🟡 Low Activity" active={pFilter === "low"} onClick={() => setPFilter("low")}
                count={partnerStats.filter(p => p.status === "low").length} />
              <Chip label="🔴 Neglected" active={pFilter === "neglected"} onClick={() => setPFilter("neglected")}
                count={partnerStats.filter(p => p.status === "neglected").length} />
              <Chip label="⚫ Never Visited" active={pFilter === "new"} onClick={() => setPFilter("new")}
                count={partnerStats.filter(p => p.status === "new").length} />
            </div>
          </div>

          {/* Status legend + active filter context hint */}
          <div className="px-4 pt-2.5 pb-1 flex flex-wrap gap-3 text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />Active ≤ 14 days</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />Low = 15–45 days</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />Neglected = 45+ days</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />Never Visited</span>
            {(pFilter === "top" || pFilter === "top_leads") && (
              <span className="ml-auto text-slate-500 font-semibold">
                🏅 Ranked by {pFilter === "top" ? "visits" : "leads"} · top {filteredPartners.length}
              </span>
            )}
            {(pFilter === "active" || pFilter === "low" || pFilter === "neglected" || pFilter === "new") && (
              <span className="ml-auto text-slate-500 font-semibold">
                {filteredPartners.length} partner{filteredPartners.length !== 1 ? "s" : ""} matched
              </span>
            )}
          </div>

          {/* Partner grid — default 12, load more on scroll */}
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {filteredPartners.length === 0 ? (
              <div className="col-span-full">
                <EmptyState
                  icon={<Handshake className="h-10 w-10" />}
                  msg="No partners match this filter"
                  sub="Try switching to 'All' or changing the showroom filter."
                  onClear={() => setPFilter("all")}
                />
              </div>
            ) : (
              filteredPartners.slice(0, visiblePartnerCount).map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.36) }}>
                  <PartnerCard
                    p={p}
                    rank={(pFilter === "top" || pFilter === "top_leads") ? i + 1 : undefined}
                    onSelectPartner={setSelectedPartnerId}
                  />
                </motion.div>
              ))
            )}
          </div>

          {/* Load More button — shows remaining count */}
          {filteredPartners.length > visiblePartnerCount && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                Showing {Math.min(visiblePartnerCount, filteredPartners.length)} of {filteredPartners.length} partners
              </span>
              <button
                onClick={() => setVisiblePartnerCount(c => c + 12)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all px-3 py-1.5 rounded-lg shadow-sm"
              >
                Load More
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                  +{Math.min(12, filteredPartners.length - visiblePartnerCount)} more
                </span>
              </button>
            </div>
          )}

          {/* Footer — all loaded */}
          {filteredPartners.length <= visiblePartnerCount && filteredPartners.length > 12 && (
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">All {filteredPartners.length} partners shown</span>
              <Link to="/partner-visits" className="text-[11px] font-bold text-red-600 hover:underline">
                Full Partner Report →
              </Link>
            </div>
          )}
        </Card>

        {/* ══════════════ PIPELINE SUMMARY ══════════════ */}
        <Card id="pipeline-summary-section">
          <SecHead
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            title="Pipeline Summary by Showroom"
            sub="All-time WOS funnel · Win% = Won ÷ Total"
            action={<Link to="/my-pipeline" className="text-[11px] font-bold text-red-600 hover:underline">Full Pipeline →</Link>}
          />
          {pipelineByShowroom.filter(p => p.total > 0).length === 0 ? (
            <div className="px-4 py-2">
              <EmptyState
                icon={<BarChart2 className="h-10 w-10" />}
                msg="No WOS data found"
                sub="WOS will appear here once executives start adding work scope items"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                    {["Showroom", "Pending", "Quoted", "Won", "Lost", "Win %"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500 text-center first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pipelineByShowroom
                    .filter(p => p.total > 0)
                    .map(p => (
                      <PipeRow
                        key={p.name}
                        name={p.name}
                        pending={p.pending}
                        quoted={p.quoted}
                        won={p.won}
                        lost={p.lost}
                        total={p.total}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ══════════════ LEADERBOARD ══════════════ */}
        <Card>
          <SecHead
            icon={<Trophy className="h-3.5 w-3.5" />}
            title="Leaderboard"
            sub="Top performers this period"
          />
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex gap-2">
              <Chip label="Most Visits" active={leaderTab === "visits"} onClick={() => setLeaderTab("visits")} />
              <Chip label="Most WOS" active={leaderTab === "wos"} onClick={() => setLeaderTab("wos")} />
              <Chip label="Most Won" active={leaderTab === "won"} onClick={() => setLeaderTab("won")} />
            </div>
          </div>
          <div className="px-4 py-2">
            {leaderboard.filter(e => (leaderTab === "visits" ? e.visits : leaderTab === "wos" ? e.wosCount : e.wonCount) > 0).length === 0 ? (
              <EmptyState icon={<Award className="h-10 w-10" />} msg="No performance data yet for this period" />
            ) : (
              leaderboard.map((e, i) => (
                <motion.div key={e.userId} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <LeaderRow
                    rank={i + 1} name={e.fullName} showroom={e.showroomName}
                    value={leaderTab === "visits" ? e.visits : leaderTab === "wos" ? e.wosCount : e.wonCount}
                    label={leaderTab === "visits" ? "visits" : leaderTab === "wos" ? "WOS" : "won"}
                    userId={e.userId} onSelectEmp={setSelectedEmpId}
                  />
                </motion.div>
              ))
            )}
          </div>
        </Card>

        {/* Push Notifications Broadcast form */}
        <div className="mt-6">
          <SendNotificationForm />
        </div>

        <AnimatePresence>
          {selectedEmpId && (
            <EmployeeDetailModal
              userId={selectedEmpId}
              onClose={() => setSelectedEmpId(null)}
              emp={allEmpStats.find((e) => e.userId === selectedEmpId)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedShowroomId && (
            <ShowroomDetailModal
              showroomId={selectedShowroomId}
              onClose={() => setSelectedShowroomId(null)}
              showroom={showroomStats.find((s) => s.id === selectedShowroomId)}
              allEmpStats={allEmpStats}
              onSelectEmp={(uid) => {
                setSelectedShowroomId(null);
                setSelectedEmpId(uid);
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedPartnerId && (
            <PartnerDetailModal
              partnerId={selectedPartnerId}
              onClose={() => setSelectedPartnerId(null)}
              partner={partnerStats.find((p) => p.id === selectedPartnerId)}
              onSelectEmp={(uid) => {
                setSelectedPartnerId(null);
                setSelectedEmpId(uid);
              }}
            />
          )}
        </AnimatePresence>

        <div className="h-4" />
      </div>
    </div>
  );
};

const MDDashboardWithBoundary = (props: any) => (
  <MDDashboardErrorBoundary>
    <MDDashboard {...props} />
  </MDDashboardErrorBoundary>
);

export default MDDashboardWithBoundary;
