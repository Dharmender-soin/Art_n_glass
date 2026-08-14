import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExecutiveHome } from "@/components/dashboard/ExecutiveHome";
import NotificationBell from "@/components/layout/NotificationBell";
import { LiveTracking } from "@/components/dashboard/LiveTracking";
import { ChampionBanner, HallOfFame } from "@/components/dashboard/ChampionBanner";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2, Users, CalendarCheck, Briefcase, Activity, TrendingUp, TrendingDown, ArrowUpRight,
  Trophy, Star, UserCheck, ShoppingCart, CheckCircle2, Clock, XCircle, BarChart3,
  UserPlus, GitCompare, Award, Target, Sparkles, Crown, MapPin
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis
} from "recharts";
import { format, subDays, startOfMonth, startOfWeek, differenceInDays } from "date-fns";

// ─── Types ────────────────────────────────────────
interface ShowroomMetrics {
  showroomId: string;
  showroomName: string;
  showroomCity: string;
  totalVisits: number;
  completedVisits: number;
  plannedVisits: number;
  cancelledVisits: number;
  completionRate: number;
  totalClients: number;
  totalPartners: number;
  newClientsThisMonth: number;
  newPartnersThisMonth: number;
  totalOrders: number;
  ordersWon: number;
  ordersLost: number;
  ordersPending: number;
  totalOrderValue: number;
  wonOrderValue: number;
  executiveCount: number;
}

interface ExecutivePerf {
  userId: string;
  name: string;
  showroomName: string;
  totalVisits: number;
  completedVisits: number;
  completionRate: number;
  clientsAdded: number;
  partnersAdded: number;
  ordersWon: number;
  orderValue: number;
}

// ─── Animation Variants ──────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Clickable Score Card (Premium Design) ───────────
interface DrawerItem {
  id: string;
  primary: string;
  secondary?: string;
  badge?: string;
  badgeColor?: string;
  amount?: string;
}

const ClickableStatCard = ({ label, value, icon: Icon, gradient, sub, onClick, accent, change }: {
  label: string; value: string | number; icon: any; gradient: string;
  sub?: string; onClick: () => void; accent: string; change?: number;
}) => (
  <motion.button
    variants={itemVariants}
    whileHover={{ y: -2, scale: 1.005 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="w-full text-left focus:outline-none"
  >
    <div
      className="relative overflow-hidden border border-white/[0.06] bg-[#12141A] transition-all duration-250 group"
      style={{
        height: '124px',
        padding: '18px',
        borderRadius: '14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ borderRadius: '14px', background: `radial-gradient(ellipse at top left, ${accent}14 0%, transparent 65%)` }}
      />
      {/* Background watermark icon */}
      <div className={`absolute -right-2 -bottom-2 opacity-[0.05] ${gradient} bg-clip-text pointer-events-none`}>
        <Icon className="h-16 w-16" />
      </div>

      {/* TOP ROW — icon + arrow */}
      <div className="relative z-10 flex items-start justify-between">
        {/* Icon badge */}
        <div className={`w-8 h-8 rounded-lg ${gradient} flex items-center justify-center shadow-md shrink-0`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        {/* Arrow click indicator */}
        <div className="h-6 w-6 rounded-full bg-white/[0.06] flex items-center justify-center group-hover:bg-white/[0.12] transition-colors shrink-0">
          <ArrowUpRight className="h-3 w-3 text-[#8E939D] group-hover:text-white transition-colors" />
        </div>
      </div>

      {/* BOTTOM ROW — value + label + sub + badge */}
      <div className="relative z-10 min-w-0">
        <p
          className="text-[#F5F5F7] font-mono font-bold leading-none tabular-nums truncate"
          style={{ fontSize: '30px', fontWeight: 700 }}
        >{value}</p>
        <p
          className="text-[#A1A5AE] uppercase truncate mt-1"
          style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em' }}
        >{label}</p>
        {/* Sub + comparison on same line */}
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          {sub && (
            <span className="text-[#8E939D] truncate" style={{ fontSize: '11px', opacity: 0.8 }}>{sub}</span>
          )}
          {change !== undefined && (
            <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full shrink-0 font-bold ${
              change > 0 ? 'bg-emerald-500/15 text-emerald-400' :
              change < 0 ? 'bg-red-500/15 text-red-400' :
              'bg-white/8 text-[#8E939D]'
            }`} style={{ fontSize: '10px' }}>
              {change > 0 ? <TrendingUp className="h-2 w-2" /> : change < 0 ? <TrendingDown className="h-2 w-2" /> : null}
              {change > 0 ? `+${change}%` : change < 0 ? `${change}%` : '—'}
            </span>
          )}
        </div>
      </div>
    </div>
  </motion.button>
);

// ─── Detail Drawer (Bottom Sheet) ────────────────────
const DetailDrawer = ({ open, onClose, title, items, emptyMsg }: {
  open: boolean; onClose: () => void; title: string;
  items: DrawerItem[]; emptyMsg?: string;
}) => (
  <AnimatePresence>
    {open && (
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm"
        />
        {/* Sheet */}
        <motion.div
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-[#12141A] rounded-t-3xl border-t border-white/10 shadow-2xl max-h-[80vh] flex flex-col"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 shrink-0">
            <h3 className="text-base font-extrabold text-[#F5F5F7]">{title}</h3>
            <button onClick={onClose} className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <XCircle className="h-4 w-4 text-[#A1A5AE]" />
            </button>
          </div>
          {/* List */}
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2 pb-8">
            {items.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-[#8E939D]">{emptyMsg || "Koi data nahi mila."}</p>
              </div>
            ) : (
              items.map((item, i) => (
                <motion.div
                  key={item.id + i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 bg-[#1A1D24] rounded-xl px-4 py-3 border border-white/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-[#F5F5F7] truncate leading-tight">{item.primary}</p>
                    {item.secondary && <p className="text-[11px] text-[#8E939D] mt-0.5 truncate">{item.secondary}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.amount && <span className="text-[11px] font-bold text-emerald-400">{item.amount}</span>}
                    {item.badge && (
                      <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${item.badgeColor || "bg-white/10 text-white"}`}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

// ─── Ranking Badge ─────────────────────────────────
const RankBadge = ({ rank }: { rank: number }) => {
  if (rank === 1) return <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 text-white text-xs font-bold shadow-md"><Crown className="h-3.5 w-3.5" /></div>;
  if (rank === 2) return <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-gray-300 to-slate-400 text-white text-xs font-bold shadow-sm">2</div>;
  if (rank === 3) return <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-amber-600 to-orange-700 text-white text-xs font-bold shadow-sm">3</div>;
  return <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-semibold">{rank}</div>;
};

// ═══════════════════════════════════════════════════
// ─── Analytics Dashboard Component ────────────────
// ═══════════════════════════════════════════════════
const AnalyticsDashboard = () => {
  const { user, role, showroomId: myShowroomId, showroomIds } = useAuth();

  // ── Drawer State ─────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerItems, setDrawerItems] = useState<DrawerItem[]>([]);

  const openDrawer = (title: string, items: DrawerItem[]) => {
    setDrawerTitle(title);
    setDrawerItems(items);
    setDrawerOpen(true);
  };

  const isMd = role === "md";
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isTL = role === "tl";
  const isExec = role === "executive";
  const canSeeAll = isMd || isAdmin;
  const canSeeShowroom = isManager || isTL || isExec || canSeeAll; // Executive can now see team leaderboard

  const [selectedShowroom, setSelectedShowroom] = useState<string>("all");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // ── Filter State ─────────────────────────────────
  type DateFilter = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';
  const [dateFilter, setDateFilter] = useState<DateFilter>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedExecutive, setSelectedExecutive] = useState('all');
  const dateRange = useMemo(() => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    switch (dateFilter) {
      case 'today':      return { from: todayStr, to: todayStr };
      case 'yesterday':  return { from: yesterday, to: yesterday };
      case 'this_week':  return { from: weekStart, to: todayStr };
      case 'this_month': return { from: monthStart, to: todayStr };
      case 'custom':     return customFrom && customTo ? { from: customFrom, to: customTo } : null;
      default:           return null; // 'all' - no date filter
    }
  }, [dateFilter, customFrom, customTo, monthStart, todayStr]);

  // ── Previous Period (for % comparison) ───────────
  const prevDateRange = useMemo(() => {
    if (!dateRange) return null;
    const from = new Date(dateRange.from);
    const to   = new Date(dateRange.to);
    const days = differenceInDays(to, from) + 1;
    const prevTo   = format(subDays(from, 1), 'yyyy-MM-dd');
    const prevFrom = format(subDays(from, days), 'yyyy-MM-dd');
    return { from: prevFrom, to: prevTo };
  }, [dateRange]);

  // ── Fetch Showrooms ──────────────────────────────
  const { data: showrooms = [] } = useQuery({
    queryKey: ["dashboard-showrooms"],
    enabled: canSeeAll || (isManager && showroomIds && showroomIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // ── Fetch User Roles (executives per showroom) ───
  const { data: allUserRoles = [] } = useQuery({
    queryKey: ["dashboard-user-roles", showroomIds],
    enabled: canSeeShowroom,
    queryFn: async () => {
      let q = supabase.from("user_roles").select("user_id, role, showroom_id");
      if (isManager && showroomIds && showroomIds.length > 0) {
        q = q.in("showroom_id", showroomIds);
      } else if (isManager && myShowroomId) {
        q = q.eq("showroom_id", myShowroomId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // ── Fetch Profiles (names) ───────────────────────
  const execUserIds = useMemo(
    () => [...new Set(allUserRoles.map(r => r.user_id))],
    [allUserRoles]
  );

  const { data: profiles = [] } = useQuery({
    queryKey: ["dashboard-profiles", execUserIds],
    enabled: execUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").in("user_id", execUserIds);
      if (error) throw error;
      return data;
    },
  });

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map(p => [p.user_id, p.full_name])),
    [profiles]
  );

  // ── Build the user IDs we should filter by ─────
  const targetUserIds = useMemo(() => {
    if (isExec && user) return [user.id];
    if (isManager) {
      const activeShowrooms = selectedShowroom === "all"
        ? (showroomIds && showroomIds.length > 0 ? showroomIds : (myShowroomId ? [myShowroomId] : []))
        : [selectedShowroom];
      return allUserRoles.filter(r => r.showroom_id && activeShowrooms.includes(r.showroom_id)).map(r => r.user_id);
    }
    // Admin / MD – if a specific showroom is selected, filter to it
    if (canSeeAll && selectedShowroom !== "all") {
      return allUserRoles.filter(r => r.showroom_id === selectedShowroom).map(r => r.user_id);
    }
    return []; // empty = no filter (fetch all)
  }, [isExec, isManager, canSeeAll, user, myShowroomId, showroomIds, selectedShowroom, allUserRoles]);

  // ── Fetch Visits ─────────────────────────────────
  const { data: visits = [], isLoading: visitsLoading } = useQuery({
    queryKey: ["dashboard-visits-all", targetUserIds, dateRange, prevDateRange],
    queryFn: async () => {
      let q = supabase.from("visits").select("id, status, visit_date, created_at, created_by, client_id, partner_id, client:clients(name), partner:partners(name)");
      if (targetUserIds.length > 0) {
        q = q.in("created_by", targetUserIds);
      }
      if (dateRange && prevDateRange) {
        q = q.gte("visit_date", prevDateRange.from).lte("visit_date", dateRange.to);
      } else if (dateRange) {
        q = q.gte("visit_date", dateRange.from).lte("visit_date", dateRange.to);
      }
      const { data, error } = await q.order("visit_date", { ascending: false }).limit(10000); // bypass default 1000 row limit
      if (error) throw error;
      return data || [];
    },
  });

  // ── Fetch Clients ────────────────────────────────
  const { data: clients = [] } = useQuery({
    queryKey: ["dashboard-clients", targetUserIds, dateRange, prevDateRange],
    queryFn: async () => {
      let q = supabase.from("clients").select("id, name, created_at, created_by, status, partner_id");
      if (targetUserIds.length > 0) {
        q = q.in("created_by", targetUserIds);
      }
      if (dateRange && prevDateRange) {
        q = q.gte("created_at", `${prevDateRange.from}T00:00:00Z`).lte("created_at", `${dateRange.to}T23:59:59Z`);
      } else if (dateRange) {
        q = q.gte("created_at", `${dateRange.from}T00:00:00Z`).lte("created_at", `${dateRange.to}T23:59:59Z`);
      }
      const { data, error } = await q.order("created_at", { ascending: false }).limit(10000); // bypass default 1000 row limit
      if (error) throw error;
      return data || [];
    },
  });

  // ── Fetch Partners ───────────────────────────────
  const { data: partners = [] } = useQuery({
    queryKey: ["dashboard-partners", targetUserIds, dateRange, prevDateRange],
    queryFn: async () => {
      let q = supabase.from("partners").select("id, name, created_at, created_by, type");
      if (targetUserIds.length > 0) {
        q = q.in("created_by", targetUserIds);
      }
      if (dateRange && prevDateRange) {
        q = q.gte("created_at", `${prevDateRange.from}T00:00:00Z`).lte("created_at", `${dateRange.to}T23:59:59Z`);
      } else if (dateRange) {
        q = q.gte("created_at", `${dateRange.from}T00:00:00Z`).lte("created_at", `${dateRange.to}T23:59:59Z`);
      }
      const { data, error } = await q.order("created_at", { ascending: false }).limit(10000); // bypass default 1000 row limit
      if (error) throw error;
      return data || [];
    },
  });

  // ── Fetch Work Scope Items ───────────────────────
  const { data: workItems = [] } = useQuery({
    queryKey: ["dashboard-work-items", targetUserIds, dateRange, prevDateRange],
    queryFn: async () => {
      let q = supabase.from("work_scope_items").select("id, work_status, amount_in_lac, created_at, created_by, is_verified, client_id");
      if (targetUserIds.length > 0) {
        q = q.in("created_by", targetUserIds);
      }
      if (dateRange && prevDateRange) {
        q = q.gte("created_at", `${prevDateRange.from}T00:00:00Z`).lte("created_at", `${dateRange.to}T23:59:59Z`);
      } else if (dateRange) {
        q = q.gte("created_at", `${dateRange.from}T00:00:00Z`).lte("created_at", `${dateRange.to}T23:59:59Z`);
      }
      const { data, error } = await q.order("created_at", { ascending: false }).limit(10000); // bypass default 1000 row limit
      if (error) throw error;
      return data || [];
    },
  });


  // ═══════════════════════════════════════════════════
  // ─── Computed Metrics ─────────────────────────────
  // ═══════════════════════════════════════════════════  // ── Filtered Datasets (date + executive) ───────────────
  const filteredVisits = useMemo(() => {
    let d = visits;
    if (selectedExecutive !== 'all') d = d.filter(v => v.created_by === selectedExecutive);
    if (dateRange) d = d.filter(v => v.visit_date >= dateRange.from && v.visit_date <= dateRange.to);
    return d;
  }, [visits, selectedExecutive, dateRange]);

  const filteredClients = useMemo(() => {
    let d = clients;
    if (selectedExecutive !== 'all') d = d.filter(c => c.created_by === selectedExecutive);
    if (dateRange) d = d.filter(c => { const dt = c.created_at.split('T')[0]; return dt >= dateRange.from && dt <= dateRange.to; });
    return d;
  }, [clients, selectedExecutive, dateRange]);

  const filteredPartners = useMemo(() => {
    let d = partners;
    if (selectedExecutive !== 'all') d = d.filter(p => p.created_by === selectedExecutive);
    if (dateRange) d = d.filter(p => { const dt = p.created_at.split('T')[0]; return dt >= dateRange.from && dt <= dateRange.to; });
    return d;
  }, [partners, selectedExecutive, dateRange]);

  const filteredWorkItems = useMemo(() => {
    let d = workItems;
    if (selectedExecutive !== 'all') d = d.filter(w => w.created_by === selectedExecutive);
    if (dateRange) d = d.filter(w => { const dt = w.created_at.split('T')[0]; return dt >= dateRange.from && dt <= dateRange.to; });
    return d;
  }, [workItems, selectedExecutive, dateRange]);

  const metrics = useMemo(() => {
    const totalVisits = filteredVisits.length;
    const completedVisits = filteredVisits.filter(v => v.status === "done").length;
    const plannedVisits = filteredVisits.filter(v => v.status === "planned").length;
    const cancelledVisits = filteredVisits.filter(v => v.status === "cancelled").length;
    const completionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;

    const totalClients = filteredClients.length;
    const totalPartners = filteredPartners.length;
    // When a date filter is active, filteredClients is already scoped — use count directly
    const newClientsThisMonth = dateRange ? filteredClients.length : filteredClients.filter(c => c.created_at >= monthStart).length;
    const newPartnersThisMonth = dateRange ? filteredPartners.length : filteredPartners.filter(p => p.created_at >= monthStart).length;

    const totalOrders = filteredWorkItems.length;
    const ordersWon = filteredWorkItems.filter(w => w.work_status === "won").length;
    const ordersLost = filteredWorkItems.filter(w => w.work_status === "lost").length;
    // Pending = explicitly "pending" OR null/undefined status (unclassified orders)
    const ordersPending = filteredWorkItems.filter(w => w.work_status === "pending" || !w.work_status).length;
    // Submitted = orders filed/submitted but not yet actioned
    const ordersSubmitted = filteredWorkItems.filter(w => w.work_status === "submitted").length;
    const totalOrderValue = filteredWorkItems.reduce((s, w) => s + (w.amount_in_lac || 0), 0);
    const wonOrderValue = filteredWorkItems.filter(w => w.work_status === "won").reduce((s, w) => s + (w.amount_in_lac || 0), 0);
    const verifiedCount = filteredWorkItems.filter(w => w.is_verified).length;

    return {
      totalVisits, completedVisits, plannedVisits, cancelledVisits, completionRate,
      totalClients, totalPartners, newClientsThisMonth, newPartnersThisMonth,
      totalOrders, ordersWon, ordersLost, ordersPending, ordersSubmitted, totalOrderValue, wonOrderValue, verifiedCount,
    };
  }, [filteredVisits, filteredClients, filteredPartners, filteredWorkItems, monthStart, dateRange]);



  const prevVisits = useMemo(() => {
    if (!prevDateRange) return visits;
    let d = visits;
    if (selectedExecutive !== 'all') d = d.filter(v => v.created_by === selectedExecutive);
    return d.filter(v => v.visit_date >= prevDateRange.from && v.visit_date <= prevDateRange.to);
  }, [visits, selectedExecutive, prevDateRange]);

  const prevClients = useMemo(() => {
    if (!prevDateRange) return clients;
    let d = clients;
    if (selectedExecutive !== 'all') d = d.filter(c => c.created_by === selectedExecutive);
    return d.filter(c => { const dt = c.created_at.split('T')[0]; return dt >= prevDateRange.from && dt <= prevDateRange.to; });
  }, [clients, selectedExecutive, prevDateRange]);

  const prevPartners = useMemo(() => {
    if (!prevDateRange) return partners;
    let d = partners;
    if (selectedExecutive !== 'all') d = d.filter(p => p.created_by === selectedExecutive);
    return d.filter(p => { const dt = p.created_at.split('T')[0]; return dt >= prevDateRange.from && dt <= prevDateRange.to; });
  }, [partners, selectedExecutive, prevDateRange]);

  const prevWorkItems = useMemo(() => {
    if (!prevDateRange) return workItems;
    let d = workItems;
    if (selectedExecutive !== 'all') d = d.filter(w => w.created_by === selectedExecutive);
    return d.filter(w => { const dt = w.created_at.split('T')[0]; return dt >= prevDateRange.from && dt <= prevDateRange.to; });
  }, [workItems, selectedExecutive, prevDateRange]);

  const prevMetrics = useMemo(() => ({
    totalVisits:   prevVisits.length,
    completedVisits: prevVisits.filter(v => v.status === 'done').length,
    plannedVisits:   prevVisits.filter(v => v.status === 'planned').length,
    cancelledVisits: prevVisits.filter(v => v.status === 'cancelled').length,
    totalClients:  prevClients.length,
    totalPartners: prevPartners.length,
    totalOrders:      prevWorkItems.length,
    ordersWon:        prevWorkItems.filter(w => w.work_status === 'won').length,
    ordersLost:       prevWorkItems.filter(w => w.work_status === 'lost').length,
    ordersPending:    prevWorkItems.filter(w => w.work_status === 'pending' || !w.work_status).length,
    ordersSubmitted:  prevWorkItems.filter(w => w.work_status === 'submitted').length,
  }), [prevVisits, prevClients, prevPartners, prevWorkItems]);

  // % change helper — returns undefined when no date filter active (no comparison)
  const pctChange = (curr: number, prev: number): number | undefined => {
    if (!dateRange) return undefined;        // "All" → no comparison
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  // ── Pie Chart Data ───────────────────────────────
  const visitPieData = useMemo(() => [
    { name: "Completed", value: metrics.completedVisits, color: "hsl(142, 72%, 42%)" },
    { name: "Planned", value: metrics.plannedVisits, color: "hsl(217, 91%, 60%)" },
    { name: "Cancelled", value: metrics.cancelledVisits, color: "hsl(0, 72%, 51%)" },
  ], [metrics]);

  const orderPieData = useMemo(() => [
    { name: "Won", value: metrics.ordersWon, color: "hsl(142, 72%, 42%)" },
    { name: "Pending", value: metrics.ordersPending, color: "hsl(45, 93%, 47%)" },
    { name: "Lost", value: metrics.ordersLost, color: "hsl(0, 72%, 51%)" },
  ], [metrics]);

  // ── Visit Trend (last 7 days) ────────────────────
  const barData = useMemo(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), "yyyy-MM-dd"));
    return last7.map(date => ({
      date: format(new Date(date), "MMM dd"),
      visits: filteredVisits.filter(v => v.visit_date === date).length,
      done: filteredVisits.filter(v => v.visit_date === date && v.status === "done").length,
    }));
  }, [filteredVisits]);

  // ── Top Visited Partners ─────────────────────────
  const topPartners = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    visits.filter(v => v.partner_id).forEach(v => {
      const name = (v.partner as any)?.name || "Unknown";
      const existing = map.get(v.partner_id!);
      if (existing) existing.count++;
      else map.set(v.partner_id!, { name, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [visits]);

  // ── Top Visited Clients ─────────────────────────
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    visits.filter(v => v.client_id).forEach(v => {
      const name = (v.client as any)?.name || "Unknown";
      const existing = map.get(v.client_id!);
      if (existing) existing.count++;
      else map.set(v.client_id!, { name, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [visits]);

  // ── Performance Leaderboard (Executive + Manager + TL) ─
  const execPerformance: ExecutivePerf[] = useMemo(() => {
    if (isExec) return [];
    const fieldRoles = ["executive", "manager", "tl"];
    const fieldUsers = allUserRoles.filter(r => fieldRoles.includes(r.role));
    const fieldIds = [...new Set(fieldUsers.map(r => r.user_id))];
    const showroomMap = Object.fromEntries(showrooms.map(s => [s.id, s.name]));
    const fieldShowroomMap = Object.fromEntries(fieldUsers.map(r => [r.user_id, r.showroom_id]));
    const fieldRoleMap = Object.fromEntries(fieldUsers.map(r => [r.user_id, r.role]));

    return fieldIds.map(uid => {
      const uVisits = visits.filter(v => v.created_by === uid);
      const uCompleted = uVisits.filter(v => v.status === "done").length;
      const uClients = clients.filter(c => c.created_by === uid).length;
      const uPartners = partners.filter(p => p.created_by === uid).length;
      const uWon = workItems.filter(w => w.created_by === uid && w.work_status === "won").length;
      const uValue = workItems.filter(w => w.created_by === uid && w.work_status === "won").reduce((s, w) => s + (w.amount_in_lac || 0), 0);
      const sr = fieldShowroomMap[uid];
      const userRole = fieldRoleMap[uid];
      const roleLabel = userRole === "manager" ? "Manager" : userRole === "tl" ? "TL" : "Executive";
      return {
        userId: uid,
        name: (profileMap[uid] || "Unknown") + ` (${roleLabel})`,
        showroomName: sr ? (showroomMap[sr] || "—") : "—",
        totalVisits: uVisits.length,
        completedVisits: uCompleted,
        completionRate: uVisits.length > 0 ? Math.round((uCompleted / uVisits.length) * 100) : 0,
        clientsAdded: uClients,
        partnersAdded: uPartners,
        ordersWon: uWon,
        orderValue: uValue,
      };
    }).sort((a, b) => b.completedVisits - a.completedVisits);
  }, [isExec, allUserRoles, visits, clients, partners, workItems, profileMap, showrooms]);


  // ── Showroom Comparison ──────────────────────────
  const showroomComparison: ShowroomMetrics[] = useMemo(() => {
    if (!canSeeAll || showrooms.length === 0) return [];
    return showrooms.map(sr => {
      const srUsers = allUserRoles.filter(r => r.showroom_id === sr.id).map(r => r.user_id);
      const srVisits = visits.filter(v => srUsers.includes(v.created_by));
      const srClients = clients.filter(c => srUsers.includes(c.created_by));
      const srPartners = partners.filter(p => srUsers.includes(p.created_by));
      const srOrders = workItems.filter(w => srUsers.includes(w.created_by));
      const completed = srVisits.filter(v => v.status === "done").length;
      return {
        showroomId: sr.id,
        showroomName: sr.name,
        showroomCity: sr.city,
        totalVisits: srVisits.length,
        completedVisits: completed,
        plannedVisits: srVisits.filter(v => v.status === "planned").length,
        cancelledVisits: srVisits.filter(v => v.status === "cancelled").length,
        completionRate: srVisits.length > 0 ? Math.round((completed / srVisits.length) * 100) : 0,
        totalClients: srClients.length,
        totalPartners: srPartners.length,
        newClientsThisMonth: srClients.filter(c => c.created_at >= monthStart).length,
        newPartnersThisMonth: srPartners.filter(p => p.created_at >= monthStart).length,
        totalOrders: srOrders.length,
        ordersWon: srOrders.filter(w => w.work_status === "won").length,
        ordersLost: srOrders.filter(w => w.work_status === "lost").length,
        ordersPending: srOrders.filter(w => w.work_status === "pending").length,
        totalOrderValue: srOrders.reduce((s, w) => s + (w.amount_in_lac || 0), 0),
        wonOrderValue: srOrders.filter(w => w.work_status === "won").reduce((s, w) => s + (w.amount_in_lac || 0), 0),
        executiveCount: allUserRoles.filter(r => r.showroom_id === sr.id && r.role === "executive").length,
      };
    }).sort((a, b) => b.completedVisits - a.completedVisits);
  }, [canSeeAll, showrooms, allUserRoles, visits, clients, partners, workItems, monthStart]);

  // ── Radar Data for Comparison ────────────────────
  const radarData = useMemo(() => {
    if (showroomComparison.length === 0) return [];
    const maxVisits = Math.max(...showroomComparison.map(s => s.totalVisits), 1);
    const maxClients = Math.max(...showroomComparison.map(s => s.totalClients), 1);
    const maxPartners = Math.max(...showroomComparison.map(s => s.totalPartners), 1);
    const maxOrders = Math.max(...showroomComparison.map(s => s.totalOrders), 1);
    const maxValue = Math.max(...showroomComparison.map(s => s.totalOrderValue), 1);

    return [
      { metric: "Visits", ...Object.fromEntries(showroomComparison.map(s => [s.showroomName, Math.round((s.totalVisits / maxVisits) * 100)])) },
      { metric: "Clients", ...Object.fromEntries(showroomComparison.map(s => [s.showroomName, Math.round((s.totalClients / maxClients) * 100)])) },
      { metric: "Partners", ...Object.fromEntries(showroomComparison.map(s => [s.showroomName, Math.round((s.totalPartners / maxPartners) * 100)])) },
      { metric: "Orders", ...Object.fromEntries(showroomComparison.map(s => [s.showroomName, Math.round((s.totalOrders / maxOrders) * 100)])) },
      { metric: "Value", ...Object.fromEntries(showroomComparison.map(s => [s.showroomName, Math.round((s.totalOrderValue / maxValue) * 100)])) },
      { metric: "Completion %", ...Object.fromEntries(showroomComparison.map(s => [s.showroomName, s.completionRate])) },
    ];
  }, [showroomComparison]);

  const radarColors = ["hsl(217, 91%, 60%)", "hsl(142, 72%, 42%)", "hsl(280, 80%, 55%)", "hsl(25, 95%, 53%)", "hsl(340, 82%, 52%)"];

  // ── Recent Activity ──────────────────────────────
  const recentActivity = useMemo(() =>
    [...filteredVisits]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .map(v => ({
        id: v.id,
        status: v.status,
        desc: (v.client as any)?.name || (v.partner as any)?.name || "Visit",
        time: new Date(v.created_at).toLocaleDateString(),
        statusLabel: v.status.charAt(0).toUpperCase() + v.status.slice(1),
      })),
    [filteredVisits]
  );

  const statusColor: Record<string, string> = {
    done: "bg-green-500",
    planned: "bg-blue-500",
    in_progress: "bg-blue-400",
    missed: "bg-red-500",
    rescheduled: "bg-orange-500",
    cancelled: "bg-red-500",
  };

  // ── Drawer item datasets (precomputed for clean JSX) ──
  const visitsBadge = (status: string) =>
    status === "done" ? { badge: "Done", color: "bg-emerald-500/20 text-emerald-400" } :
    status === "planned" ? { badge: "Planned", color: "bg-sky-500/20 text-sky-400" } :
    status === "cancelled" ? { badge: "Cancelled", color: "bg-red-500/20 text-red-400" } :
    { badge: status, color: "bg-white/10 text-white" };

  const allVisitsItems: DrawerItem[] = useMemo(() =>
    [...filteredVisits].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(v => {
        const vb = visitsBadge(v.status);
        return { id: v.id, primary: (v.partner as any)?.name || (v.client as any)?.name || "Visit", secondary: v.visit_date, badge: vb.badge, badgeColor: vb.color };
      }), [filteredVisits]);

  const completedItems: DrawerItem[] = useMemo(() =>
    [...filteredVisits].filter(v => v.status === "done").sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
      .map(v => ({ id: v.id, primary: (v.partner as any)?.name || (v.client as any)?.name || "Visit", secondary: v.visit_date, badge: "Done", badgeColor: "bg-emerald-500/20 text-emerald-400" })), [filteredVisits]);

  const plannedItems: DrawerItem[] = useMemo(() =>
    [...filteredVisits].filter(v => v.status === "planned").sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
      .map(v => ({ id: v.id, primary: (v.partner as any)?.name || (v.client as any)?.name || "Visit", secondary: v.visit_date, badge: "Planned", badgeColor: "bg-sky-500/20 text-sky-400" })), [filteredVisits]);

  const cancelledItems: DrawerItem[] = useMemo(() =>
    [...filteredVisits].filter(v => v.status === "cancelled").sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
      .map(v => ({ id: v.id, primary: (v.partner as any)?.name || (v.client as any)?.name || "Visit", secondary: v.visit_date, badge: "Cancelled", badgeColor: "bg-red-500/20 text-red-400" })), [filteredVisits]);

  const clientItems: DrawerItem[] = useMemo(() =>
    [...filteredClients].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(c => ({
        id: c.id, primary: c.name || "Client", secondary: new Date(c.created_at).toLocaleDateString("en-IN"),
        badge: c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : undefined,
        badgeColor: c.status === "converted" ? "bg-emerald-500/20 text-emerald-400" : c.status === "hot" ? "bg-orange-500/20 text-orange-400" : c.status === "lost" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400",
      })), [filteredClients]);

  const partnerItems: DrawerItem[] = useMemo(() =>
    [...filteredPartners].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(p => ({
        id: p.id, primary: p.name || "Partner",
        secondary: `${p.type || ""} · ${new Date(p.created_at).toLocaleDateString("en-IN")}`,
        badge: p.type || undefined, badgeColor: "bg-purple-500/20 text-purple-400",
      })), [filteredPartners]);

  const wosItemsBadge = (status: string) =>
    status === "won"       ? { badge: "Won",       color: "bg-emerald-500/20 text-emerald-400" } :
    status === "lost"      ? { badge: "Lost",      color: "bg-red-500/20 text-red-400" } :
    status === "submitted" ? { badge: "Submitted", color: "bg-indigo-500/20 text-indigo-400" } :
    { badge: "Pending", color: "bg-amber-500/20 text-amber-400" };

  const allWosItems: DrawerItem[] = useMemo(() =>
    [...filteredWorkItems].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(w => {
        const wb = wosItemsBadge(w.work_status || "");
        return { id: w.id, primary: `Order — ${wb.badge}`, secondary: new Date(w.created_at).toLocaleDateString("en-IN"), amount: w.amount_in_lac ? `₹${w.amount_in_lac}L` : undefined, badge: wb.badge, badgeColor: wb.color };
      }), [filteredWorkItems]);

  const wonItems: DrawerItem[] = useMemo(() =>
    [...filteredWorkItems].filter(w => w.work_status === "won").sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(w => ({ id: w.id, primary: "Won Order", secondary: new Date(w.created_at).toLocaleDateString("en-IN"), amount: w.amount_in_lac ? `₹${w.amount_in_lac}L` : undefined, badge: "Won", badgeColor: "bg-emerald-500/20 text-emerald-400" })), [filteredWorkItems]);

  const lostItems: DrawerItem[] = useMemo(() =>
    [...filteredWorkItems].filter(w => w.work_status === "lost").sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(w => ({ id: w.id, primary: "Lost Order", secondary: new Date(w.created_at).toLocaleDateString("en-IN"), amount: w.amount_in_lac ? `₹${w.amount_in_lac}L` : undefined, badge: "Lost", badgeColor: "bg-red-500/20 text-red-400" })), [filteredWorkItems]);

  const pendingItems: DrawerItem[] = useMemo(() =>
    [...filteredWorkItems].filter(w => w.work_status === "pending" || !w.work_status).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(w => ({ id: w.id, primary: "Pending Order", secondary: new Date(w.created_at).toLocaleDateString("en-IN"), amount: w.amount_in_lac ? `₹${w.amount_in_lac}L` : undefined, badge: "Pending", badgeColor: "bg-amber-500/20 text-amber-400" })), [filteredWorkItems]);

  const submittedItems: DrawerItem[] = useMemo(() =>
    [...filteredWorkItems].filter(w => w.work_status === "submitted").sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(w => ({ id: w.id, primary: "Submitted Order", secondary: new Date(w.created_at).toLocaleDateString("en-IN"), amount: w.amount_in_lac ? `₹${w.amount_in_lac}L` : undefined, badge: "Submitted", badgeColor: "bg-indigo-500/20 text-indigo-400" })), [filteredWorkItems]);

  // ── Executive List for filter dropdown ───────────────
  const execList = useMemo(() => {
    const fieldRoles = ['executive', 'manager', 'tl'];
    const seen = new Set<string>();
    return allUserRoles
      .filter(r => fieldRoles.includes(r.role))
      .filter(r => { if (seen.has(r.user_id)) return false; seen.add(r.user_id); return true; })
      .map(r => ({ id: r.user_id, name: profileMap[r.user_id] || 'Unknown', role: r.role }));
  }, [allUserRoles, profileMap]);

  // ── Loading State ────────────────────────────────
  if (visitsLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-lg animate-shimmer" />
          <div className="h-4 w-72 rounded-lg animate-shimmer" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-children">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-xl animate-shimmer" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-4 h-80 rounded-xl animate-shimmer" />
          <div className="col-span-3 h-80 rounded-xl animate-shimmer" />
        </div>
      </div>
    );
  }

  // ── Role Label ───────────────────────────────────
  const roleLabel = isMd ? "Managing Director" : isAdmin ? "Admin" : isManager ? "Showroom Manager" : isTL ? "Team Leader" : role === "accountant" ? "Accountant" : role === "backhand_executive" ? "Backhand Executive" : "Executive";

  // ═══════════════════════════════════════════════════
  // ─── RENDER ─────────────────────────────────────
  // ═══════════════════════════════════════════════════
  return (
    <div className="w-full bg-[#0A0B0E] text-[#F5F5F7] font-sans pb-24 selection:bg-[#A6192E]/30 relative overflow-x-hidden">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6 pt-6 px-4 md:px-6 lg:px-8"
      >
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <motion.div variants={itemVariants} className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome back! Here's your <Badge variant="secondary" className="ml-1 text-[10px] font-bold uppercase tracking-wider">{roleLabel}</Badge> overview.
            </p>

            {/* Quick Top Shortcuts Bar for MD / Management */}
            {(isMd || isAdmin || isManager) && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2.5 scrollbar-none">
                <Link to="/reports" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold shrink-0 hover:bg-indigo-500/20 transition-all">
                  <BarChart3 className="h-3.5 w-3.5" /> Reports 📊
                </Link>
                <Link to="/visits" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold shrink-0 hover:bg-emerald-500/20 transition-all">
                  <CalendarCheck className="h-3.5 w-3.5" /> Visits
                </Link>
                <Link to="/clients" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold shrink-0 hover:bg-blue-500/20 transition-all">
                  <Users className="h-3.5 w-3.5" /> Clients
                </Link>
                <Link to="/hierarchy" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold shrink-0 hover:bg-purple-500/20 transition-all">
                  <GitCompare className="h-3.5 w-3.5" /> Hierarchy
                </Link>
                <Link to="/md-dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold shrink-0 hover:bg-amber-500/20 transition-all">
                  <Crown className="h-3.5 w-3.5" /> Command Center
                </Link>
              </div>
            )}
          </motion.div>

          {/* Start Day shortcut for Executives or Notification Bell for others */}
          <motion.div variants={itemVariants} className="flex items-center gap-2">
            {!isExec && <NotificationBell />}
            {isExec && (
              <a
                href="/visits"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:scale-105"
                style={{ background: "linear-gradient(135deg, #C21833 0%, #A6192E 100%)" }}
              >
                <Target className="h-4 w-4" />
                Start Day / Visits
              </a>
            )}
          </motion.div>
        </div>

        {/* ── Filter Bar — single scrollable row ── */}
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {/* Date pills */}
            {([
              { key: 'all',        label: 'All' },
              { key: 'today',      label: 'Today' },
              { key: 'yesterday',  label: 'Yesterday' },
              { key: 'this_week',  label: 'This Week' },
              { key: 'this_month', label: 'This Month' },
              { key: 'custom',     label: '📅 Custom' },
            ] as { key: typeof dateFilter; label: string }[]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setDateFilter(opt.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all border ${
                  dateFilter === opt.key
                    ? 'bg-[#A6192E] text-white border-[#A6192E] shadow-md'
                    : 'bg-white/5 text-[#A1A5AE] border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}

            {/* Custom date inputs inline */}
            {dateFilter === 'custom' && (
              <>
                <input
                  type="date" value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="shrink-0 bg-[#1A1D24] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-[#F5F5F7] focus:outline-none focus:border-[#A6192E] w-[120px]"
                />
                <span className="text-[#8E939D] text-[11px] shrink-0">→</span>
                <input
                  type="date" value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="shrink-0 bg-[#1A1D24] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-[#F5F5F7] focus:outline-none focus:border-[#A6192E] w-[120px]"
                />
              </>
            )}

            {/* Divider */}
            {((canSeeAll || (isManager && showroomIds && showroomIds.length > 1)) && showrooms.length > 0) || (canSeeShowroom && execList.length > 0) ? (
              <div className="h-5 w-px bg-white/10 shrink-0 mx-1" />
            ) : null}

            {/* Showroom dropdown */}
            {(canSeeAll || (isManager && showroomIds && showroomIds.length > 1)) && showrooms.length > 0 && (
              <div className="shrink-0 flex items-center gap-1 bg-[#1A1D24] border border-white/10 rounded-full px-2.5 py-1">
                <Building2 className="h-3 w-3 text-[#A1A5AE]" />
                <Select value={selectedShowroom} onValueChange={setSelectedShowroom}>
                  <SelectTrigger className="border-none shadow-none bg-transparent h-5 text-[11px] text-[#F5F5F7] w-[120px] p-0 focus:ring-0 font-medium">
                    <SelectValue placeholder="All Showrooms" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/10 text-[#F5F5F7]">
                    <SelectItem value="all" className="hover:bg-[#A6192E]/10">All Showrooms</SelectItem>
                    {showrooms
                      .filter(s => canSeeAll || (showroomIds && showroomIds.includes(s.id)))
                      .map(sr => (
                        <SelectItem key={sr.id} value={sr.id} className="hover:bg-[#A6192E]/10">{sr.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Executive dropdown */}
            {canSeeShowroom && execList.length > 0 && (
              <div className="shrink-0 flex items-center gap-1 bg-[#1A1D24] border border-white/10 rounded-full px-2.5 py-1">
                <UserCheck className="h-3 w-3 text-[#A1A5AE]" />
                <Select value={selectedExecutive} onValueChange={setSelectedExecutive}>
                  <SelectTrigger className="border-none shadow-none bg-transparent h-5 text-[11px] text-[#F5F5F7] w-[130px] p-0 focus:ring-0 font-medium">
                    <SelectValue placeholder="All Members" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    {execList.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} · {e.role === 'executive' ? 'Exec' : e.role === 'manager' ? 'Mgr' : 'TL'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Clear all filters */}
            {(dateFilter !== 'all' || selectedExecutive !== 'all' || (canSeeAll && selectedShowroom !== 'all')) && (
              <button
                onClick={() => { setDateFilter('all'); setSelectedExecutive('all'); setSelectedShowroom('all'); setCustomFrom(''); setCustomTo(''); }}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#A6192E]/20 text-[#A6192E] border border-[#A6192E]/30 text-[10px] font-bold hover:bg-[#A6192E]/30 transition-colors"
              >
                <XCircle className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        </motion.div>

        {/* ── Champion Banner (first 3 days of month) ── */}
        <ChampionBanner />

        {/* ── KPI Cards Row 1 (4 main metrics) ── */}
        <motion.div
          variants={containerVariants}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}
        >
          <ClickableStatCard
            label="Total Visits" value={metrics.totalVisits} icon={CalendarCheck}
            gradient="bg-gradient-to-br from-blue-500 to-blue-700" accent="#3b82f6"
            sub={`${metrics.completionRate}% completion`}
            change={pctChange(metrics.totalVisits, prevMetrics.totalVisits)}
            onClick={() => openDrawer(`Total Visits (${metrics.totalVisits})`, allVisitsItems)}
          />
          <ClickableStatCard
            label="Clients" value={metrics.totalClients} icon={Users}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700" accent="#10b981"
            sub={dateFilter === 'all' ? `+${metrics.newClientsThisMonth} this month` : `in selected period`}
            change={pctChange(metrics.totalClients, prevMetrics.totalClients)}
            onClick={() => openDrawer(`Clients (${metrics.totalClients})`, clientItems)}
          />
          <ClickableStatCard
            label="Partners" value={metrics.totalPartners} icon={Building2}
            gradient="bg-gradient-to-br from-purple-500 to-purple-700" accent="#a855f7"
            sub={dateFilter === 'all' ? `+${metrics.newPartnersThisMonth} this month` : `in selected period`}
            change={pctChange(metrics.totalPartners, prevMetrics.totalPartners)}
            onClick={() => openDrawer(`Partners (${metrics.totalPartners})`, partnerItems)}
          />
          <ClickableStatCard
            label="Work Orders" value={metrics.totalOrders} icon={Briefcase}
            gradient="bg-gradient-to-br from-orange-500 to-orange-700" accent="#f97316"
            change={pctChange(metrics.totalOrders, prevMetrics.totalOrders)}
            onClick={() => openDrawer(`Work Orders (${metrics.totalOrders})`, allWosItems)}
          />
        </motion.div>

        {/* ── KPI Cards Row 2 (6 status metrics) ── */}
        <motion.div
          variants={containerVariants}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}
        >
          <ClickableStatCard
            label="Completed" value={metrics.completedVisits} icon={CheckCircle2}
            gradient="bg-gradient-to-br from-green-500 to-green-700" accent="#22c55e"
            change={pctChange(metrics.completedVisits, prevMetrics.completedVisits)}
            onClick={() => openDrawer(`Completed Visits (${metrics.completedVisits})`, completedItems)}
          />
          <ClickableStatCard
            label="Planned" value={metrics.plannedVisits} icon={Clock}
            gradient="bg-gradient-to-br from-sky-500 to-sky-700" accent="#0ea5e9"
            change={pctChange(metrics.plannedVisits, prevMetrics.plannedVisits)}
            onClick={() => openDrawer(`Planned Visits (${metrics.plannedVisits})`, plannedItems)}
          />
          <ClickableStatCard
            label="Cancelled" value={metrics.cancelledVisits} icon={XCircle}
            gradient="bg-gradient-to-br from-red-500 to-red-700" accent="#ef4444"
            change={pctChange(metrics.cancelledVisits, prevMetrics.cancelledVisits)}
            onClick={() => openDrawer(`Cancelled Visits (${metrics.cancelledVisits})`, cancelledItems)}
          />
          <ClickableStatCard
            label="Orders Won" value={metrics.ordersWon} icon={Trophy}
            gradient="bg-gradient-to-br from-emerald-500 to-teal-700" accent="#10b981"
            change={pctChange(metrics.ordersWon, prevMetrics.ordersWon)}
            onClick={() => openDrawer(`Orders Won (${metrics.ordersWon})`, wonItems)}
          />
          <ClickableStatCard
            label="Orders Lost" value={metrics.ordersLost} icon={XCircle}
            gradient="bg-gradient-to-br from-rose-500 to-red-700" accent="#f43f5e"
            change={pctChange(metrics.ordersLost, prevMetrics.ordersLost)}
            onClick={() => openDrawer(`Orders Lost (${metrics.ordersLost})`, lostItems)}
          />
          <ClickableStatCard
            label="Pending" value={metrics.ordersPending} icon={Clock}
            gradient="bg-gradient-to-br from-amber-500 to-orange-600" accent="#f59e0b"
            change={pctChange(metrics.ordersPending, prevMetrics.ordersPending)}
            onClick={() => openDrawer(`Pending Orders (${metrics.ordersPending})`, pendingItems)}
          />
          <ClickableStatCard
            label="Submitted" value={metrics.ordersSubmitted} icon={Briefcase}
            gradient="bg-gradient-to-br from-indigo-500 to-indigo-700" accent="#6366f1"
            change={pctChange(metrics.ordersSubmitted, prevMetrics.ordersSubmitted)}
            onClick={() => openDrawer(`Submitted Orders (${metrics.ordersSubmitted})`, submittedItems)}
          />
        </motion.div>

        {/* ── Detail Drawer ── */}
        <DetailDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={drawerTitle}
          items={drawerItems}
        />

        {/* ── Main Content Tabs ── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <motion.div variants={itemVariants}>
            <TabsList className="bg-[#12141A] border border-[#F5F5F7]/5 p-1 h-auto flex-wrap rounded-xl">
              <TabsTrigger value="overview" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><BarChart3 className="h-3.5 w-3.5" />Overview</TabsTrigger>
              <TabsTrigger value="top-visited" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><Star className="h-3.5 w-3.5" />Top Visited</TabsTrigger>
              {canSeeShowroom && <TabsTrigger value="team" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><Award className="h-3.5 w-3.5" />Team Performance</TabsTrigger>}
              {canSeeShowroom && <TabsTrigger value="live-map" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><MapPin className="h-3.5 w-3.5" />Live Map</TabsTrigger>}
              {canSeeAll && <TabsTrigger value="comparison" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><GitCompare className="h-3.5 w-3.5" />Compare Showrooms</TabsTrigger>}
              {canSeeShowroom && <TabsTrigger value="hall-of-fame" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><Crown className="h-3.5 w-3.5 text-[#D4AF37]" />Hall of Fame</TabsTrigger>}
            </TabsList>
          </motion.div>

          {/* ═══ OVERVIEW TAB ═══ */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              {/* Bar Chart */}
              <motion.div variants={itemVariants} className="col-span-full lg:col-span-4">
                <Card className="h-full bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-[#F5F5F7]">
                      <TrendingUp className="h-4 w-4 text-[#A6192E]" />Visit Trends
                    </CardTitle>
                    <CardDescription className="text-[#A1A5AE]">Daily visits — last 7 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[260px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1A1D24" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#A1A5AE" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: "#A1A5AE" }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip cursor={{ fill: "#1A1D24" }} contentStyle={{ borderRadius: "10px", border: "1px solid rgba(245,245,247,0.05)", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", background: "#12141A", color: "#F5F5F7", fontSize: "13px" }} />
                          <Bar dataKey="visits" fill="#1A1D24" radius={[6, 6, 0, 0]} maxBarSize={36} name="Total" />
                          <Bar dataKey="done" fill="#2E7D32" radius={[6, 6, 0, 0]} maxBarSize={36} name="Completed" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Right Side - Donut Charts */}
              <motion.div variants={itemVariants} className="col-span-full lg:col-span-3 space-y-4">
                {/* Visit Status Pie */}
                <Card className="bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-[#F5F5F7]">Visit Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[180px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={visitPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value" strokeWidth={0}>
                            {visitPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid rgba(245,245,247,0.05)", background: "#1A1D24", color: "#F5F5F7", fontSize: "12px" }} itemStyle={{ color: "#F5F5F7" }} />
                          <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={7} formatter={(v: string) => <span style={{ color: "#A1A5AE", fontSize: "11px" }}>{v}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Order Status Pie */}
                <Card className="bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-[#F5F5F7]">Order Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[180px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={orderPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value" strokeWidth={0}>
                            {orderPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid rgba(245,245,247,0.05)", background: "#1A1D24", color: "#F5F5F7", fontSize: "12px" }} itemStyle={{ color: "#F5F5F7" }} />
                          <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={7} formatter={(v: string) => <span style={{ color: "#A1A5AE", fontSize: "11px" }}>{v}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Recent Activity */}
            <motion.div variants={itemVariants}>
              <Card className="bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-[#F5F5F7]">
                    <Activity className="h-4 w-4 text-[#A6192E]" />Recent Activity
                  </CardTitle>
                  <CardDescription className="text-[#A1A5AE]">Latest updates</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentActivity.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-[#1A1D24] flex items-center justify-center mb-3">
                        <Activity className="h-5 w-5 text-[#8E939D]" />
                      </div>
                      <p className="text-sm text-[#A1A5AE]">No recent activity found.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {recentActivity.map((a, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[#1A1D24] rounded-xl border border-[#F5F5F7]/5 transition-colors duration-150 hover:bg-[#F5F5F7]/10">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor[a.status] || "bg-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#F5F5F7] leading-tight truncate">{a.desc}</p>
                            <p className="text-xs text-[#8E939D] mt-0.5">{a.time}</p>
                          </div>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${a.status === "done" ? "bg-[#2E7D32]/20 text-[#2E7D32]" :
                            a.status === "planned" ? "bg-[#2B6CB0]/20 text-[#3182CE]" :
                              "bg-[#C21833]/20 text-[#C21833]"
                            }`}>
                            {a.statusLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* ═══ TOP VISITED TAB ═══ */}
          <TabsContent value="top-visited" className="space-y-4 mt-0">
            <motion.div variants={containerVariants} className="grid gap-4 md:grid-cols-2">
              {/* Top Partners */}
              <motion.div variants={itemVariants}>
                <Card className="h-full bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2 text-[#F5F5F7]">
                        <Building2 className="h-4 w-4 text-[#C21833]" />Top Visited Partners
                      </CardTitle>
                      <Badge variant="outline" className="font-mono text-xs border-[#F5F5F7]/10 text-[#A1A5AE] bg-[#1A1D24]">{topPartners.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      {topPartners.length === 0 ? (
                        <p className="text-center text-sm text-[#A1A5AE] py-10">No partner visits found.</p>
                      ) : (
                        <div className="space-y-2">
                          {topPartners.map((p, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F7]/5 transition-colors border border-transparent hover:border-[#F5F5F7]/10">
                              <RankBadge rank={i + 1} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-[#F5F5F7]">{p.name}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-[#F5F5F7] font-mono">{p.count}</p>
                                <p className="text-[9px] text-[#8E939D] uppercase tracking-wider font-semibold">visits</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Top Clients */}
              <motion.div variants={itemVariants}>
                <Card className="h-full bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2 text-[#F5F5F7]">
                        <Users className="h-4 w-4 text-[#A6192E]" />Top Visited Clients
                      </CardTitle>
                      <Badge variant="outline" className="font-mono text-xs border-[#F5F5F7]/10 text-[#A1A5AE] bg-[#1A1D24]">{topClients.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      {topClients.length === 0 ? (
                        <p className="text-center text-sm text-[#A1A5AE] py-10">No client visits found.</p>
                      ) : (
                        <div className="space-y-2">
                          {topClients.map((c, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F7]/5 transition-colors border border-transparent hover:border-[#F5F5F7]/10">
                              <RankBadge rank={i + 1} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-[#F5F5F7]">{c.name}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-[#F5F5F7] font-mono">{c.count}</p>
                                <p className="text-[9px] text-[#8E939D] uppercase tracking-wider font-semibold">visits</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* New Additions This Month */}
            <motion.div variants={itemVariants}>
              <Card className="bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-[#F5F5F7]">
                    <UserPlus className="h-4 w-4 text-[#A6192E]" />New Additions This Month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-[#1A1D24] rounded-xl border border-[#F5F5F7]/5 shadow-inner">
                      <p className="text-3xl font-bold font-mono text-[#F5F5F7]">{metrics.newClientsThisMonth}</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A5AE] mt-1">New Clients</p>
                    </div>
                    <div className="text-center p-4 bg-[#1A1D24] rounded-xl border border-[#F5F5F7]/5 shadow-inner">
                      <p className="text-3xl font-bold font-mono text-[#F5F5F7]">{metrics.newPartnersThisMonth}</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A5AE] mt-1">New Partners</p>
                    </div>
                    <div className="text-center p-4 bg-[#1A1D24] rounded-xl border border-[#F5F5F7]/5 shadow-inner">
                      <p className="text-3xl font-bold font-mono text-[#2E7D32]">{metrics.ordersWon}</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A5AE] mt-1">Orders Won</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* ═══ TEAM PERFORMANCE TAB ═══ */}
          {canSeeShowroom && (
            <TabsContent value="team" className="space-y-4 mt-0">
              <motion.div variants={itemVariants}>
                <Card className="overflow-hidden bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                  <CardHeader className="bg-[#1A1D24] border-b border-[#F5F5F7]/5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2 text-[#F5F5F7]">
                          <Trophy className="h-4 w-4 text-[#D4AF37]" />Employee Performance Leaderboard
                        </CardTitle>
                        <CardDescription className="text-[#A1A5AE]">Ranked by completed visits</CardDescription>
                      </div>
                      <Badge variant="secondary" className="font-mono text-xs bg-[#12141A] text-[#F5F5F7] border-[#F5F5F7]/10">{execPerformance.length} Executives</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[600px]">
                      <div className="p-4 space-y-2">
                        {execPerformance.length === 0 ? (
                          <p className="text-center text-sm text-[#A1A5AE] py-10">No executive data found.</p>
                        ) : (
                          execPerformance.map((exec, i) => (
                            <motion.div
                              key={exec.userId}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04 }}
                              className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md ${i === 0 ? "bg-gradient-to-r from-[#D4AF37]/10 to-transparent border-[#D4AF37]/30" :
                                i === 1 ? "bg-gradient-to-r from-[#F5F5F7]/10 to-transparent border-[#F5F5F7]/20" :
                                  i === 2 ? "bg-gradient-to-r from-[#B08D57]/10 to-transparent border-[#B08D57]/30" :
                                    "bg-[#1A1D24] border-[#F5F5F7]/5"
                                }`}
                            >
                              <RankBadge rank={i + 1} />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate text-[#F5F5F7]">{exec.name}</p>
                                {canSeeAll && <p className="text-[10px] text-[#8E939D]">{exec.showroomName}</p>}
                              </div>
                              <div className="grid grid-cols-5 gap-3 text-center">
                                <div>
                                  <p className="text-sm font-bold text-[#F5F5F7] font-mono">{exec.completedVisits}</p>
                                  <p className="text-[9px] text-[#A1A5AE] uppercase tracking-wider font-semibold">Done</p>
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-[#F5F5F7] font-mono">{exec.completionRate}%</p>
                                  <p className="text-[9px] text-[#A1A5AE] uppercase tracking-wider font-semibold">Rate</p>
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-[#F5F5F7] font-mono">{exec.clientsAdded}</p>
                                  <p className="text-[9px] text-[#A1A5AE] uppercase tracking-wider font-semibold">Clients</p>
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-[#F5F5F7] font-mono">{exec.ordersWon}</p>
                                  <p className="text-[9px] text-[#A1A5AE] uppercase tracking-wider font-semibold">Won</p>
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-[#2E7D32] font-mono">₹{exec.orderValue.toFixed(1)}L</p>
                                  <p className="text-[9px] text-[#A1A5AE] uppercase tracking-wider font-semibold">Value</p>
                                </div>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          )}

          {/* ═══ COMPARE SHOWROOMS TAB (MD/Admin) ═══ */}
          {canSeeAll && (
            <TabsContent value="comparison" className="space-y-4 mt-0">
              {/* Radar Comparison Chart */}
              {showroomComparison.length > 0 && (
                <motion.div variants={itemVariants}>
                  <Card className="bg-[#12141A] border-[#F5F5F7]/5 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2 text-[#F5F5F7]">
                        <GitCompare className="h-4 w-4 text-[#A6192E]" />Showroom Comparison
                      </CardTitle>
                      <CardDescription className="text-[#A1A5AE]">Normalized performance metrics across showrooms</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart outerRadius="75%" data={radarData}>
                            <PolarGrid stroke="#1A1D24" />
                            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#A1A5AE" }} />
                            <PolarRadiusAxis tick={false} axisLine={false} />
                            {showroomComparison.slice(0, 5).map((sr, i) => (
                              <Radar key={sr.showroomId} name={sr.showroomName} dataKey={sr.showroomName} stroke={radarColors[i]} fill={radarColors[i]} fillOpacity={0.15} strokeWidth={2} />
                            ))}
                            <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ color: "#A1A5AE", fontSize: "12px" }}>{v}</span>} />
                            <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid rgba(245,245,247,0.05)", background: "#1A1D24", color: "#F5F5F7", fontSize: "12px" }} itemStyle={{ color: "#F5F5F7" }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Showroom Cards Grid */}
              <motion.div variants={containerVariants} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {showroomComparison.map((sr, i) => (
                  <motion.div key={sr.showroomId} variants={itemVariants}>
                    <Card className={`overflow-hidden h-full bg-[#12141A] border-[#F5F5F7]/5 shadow-sm ${i === 0 ? "ring-1 ring-[#D4AF37]/50" : ""}`}>
                      <CardHeader className="pb-3 bg-[#1A1D24] border-b border-[#F5F5F7]/5">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2 text-[#F5F5F7]">
                              {i === 0 && <Crown className="h-4 w-4 text-[#D4AF37]" />}
                              {sr.showroomName}
                            </CardTitle>
                            <CardDescription className="text-xs text-[#8E939D]">{sr.showroomCity} · {sr.executiveCount} executives</CardDescription>
                          </div>
                          {i === 0 && <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20 text-[10px]">Top Performer</Badge>}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-4">
                        {/* Visits */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-[#A1A5AE] flex items-center gap-1"><CalendarCheck className="h-3 w-3" />Visits</p>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-[#1A1D24] rounded-lg p-2 border border-[#F5F5F7]/5 shadow-inner">
                              <p className="text-sm font-bold text-[#F5F5F7] font-mono">{sr.completedVisits}</p>
                              <p className="text-[9px] text-[#A1A5AE]">Done</p>
                            </div>
                            <div className="bg-[#1A1D24] rounded-lg p-2 border border-[#F5F5F7]/5 shadow-inner">
                              <p className="text-sm font-bold text-[#F5F5F7] font-mono">{sr.plannedVisits}</p>
                              <p className="text-[9px] text-[#A1A5AE]">Planned</p>
                            </div>
                            <div className="bg-[#2A2D35] rounded-lg p-2 border border-[#F5F5F7]/5">
                              <p className="text-sm font-bold text-[#F5F5F7] font-mono">{sr.completionRate}%</p>
                              <p className="text-[9px] text-[#A1A5AE]">Rate</p>
                            </div>
                          </div>
                        </div>

                        <div className="h-px w-full bg-[#1A1D24] my-2" />

                        {/* Clients & Partners */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-[#A1A5AE]">Clients</p>
                            <p className="text-lg font-bold text-[#F5F5F7] font-mono">{sr.totalClients} <span className="text-xs text-[#2E7D32] font-normal">+{sr.newClientsThisMonth}</span></p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-[#A1A5AE]">Partners</p>
                            <p className="text-lg font-bold text-[#F5F5F7] font-mono">{sr.totalPartners} <span className="text-xs text-[#8E24AA] font-normal">+{sr.newPartnersThisMonth}</span></p>
                          </div>
                        </div>

                        <div className="h-px w-full bg-[#1A1D24] my-2" />

                        {/* Orders */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-[#A1A5AE] flex items-center gap-1"><ShoppingCart className="h-3 w-3" />Orders</p>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-[#2E7D32]/10 rounded-lg p-2 border border-[#2E7D32]/20 shadow-inner">
                              <p className="text-sm font-bold text-[#2E7D32] font-mono">{sr.ordersWon}</p>
                              <p className="text-[9px] text-[#A1A5AE]">Won</p>
                            </div>
                            <div className="bg-[#C21833]/10 rounded-lg p-2 border border-[#C21833]/20 shadow-inner">
                              <p className="text-sm font-bold text-[#C21833] font-mono">{sr.ordersLost}</p>
                              <p className="text-[9px] text-[#A1A5AE]">Lost</p>
                            </div>
                            <div className="bg-[#D4AF37]/10 rounded-lg p-2 border border-[#D4AF37]/20 shadow-inner">
                              <p className="text-sm font-bold text-[#D4AF37] font-mono">{sr.ordersPending}</p>
                              <p className="text-[9px] text-[#A1A5AE]">Pending</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </TabsContent>
          )}

          {/* ═══ LIVE MAP TAB ═══ */}
          {canSeeShowroom && (
            <TabsContent value="live-map" className="space-y-4 mt-0">
              <LiveTracking />
            </TabsContent>
          )}
          {/* ═══ HALL OF FAME TAB ═══ */}
          {canSeeShowroom && (
            <TabsContent value="hall-of-fame" className="space-y-4 mt-0">
              <motion.div variants={itemVariants}>
                <div className="flex items-center gap-2 mb-4">
                  <Crown className="h-5 w-5 text-[#D4AF37]" />
                  <div>
                    <h3 className="text-base font-bold text-[#F5F5F7]">Hall of Fame</h3>
                    <p className="text-[10px] text-[#8E939D]">Monthly top performers — Executives, TLs & Managers</p>
                  </div>
                </div>
                <HallOfFame />
              </motion.div>
            </TabsContent>
          )}
        </Tabs>
      </motion.div>
    </div>
  );
};

const Dashboard = () => {
  const { role } = useAuth();

  if (!role) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-8 bg-[#0A0B0E]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#A6192E] border-t-transparent" />
      </div>
    );
  }

  // Executive, TL, Manager → PersonalHome (visits + check-in + KPIs + showroom leaderboard)
  // MD, Admin → AnalyticsDashboard (full org-wide analytics)
  if (role === 'executive' || role === 'tl' || role === 'manager') {
    return <ExecutiveHome />;
  }
  return <AnalyticsDashboard />;

};

export default Dashboard;
