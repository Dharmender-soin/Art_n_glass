import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExecutiveHome } from "@/components/dashboard/ExecutiveHome";
import { LiveTracking } from "@/components/dashboard/LiveTracking";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2, Users, CalendarCheck, Briefcase, Activity, TrendingUp, ArrowUpRight,
  Trophy, Star, UserCheck, ShoppingCart, CheckCircle2, Clock, XCircle, BarChart3,
  UserPlus, GitCompare, Award, Target, Sparkles, Crown, MapPin
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis
} from "recharts";
import { format, subDays, startOfMonth } from "date-fns";

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

const StatCard = ({ label, value, icon: Icon, color, bg, trend, sub }: {
  label: string; value: string | number; icon: any; color: string; bg: string;
  trend?: string; sub?: string;
}) => (
  <motion.div variants={itemVariants} whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300 }}>
    <Card className="bg-[#12141A] border-[#F5F5F7]/5 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden relative h-full">
      <div className={`absolute top-0 right-0 p-3 opacity-10 ${color}`}>
        <Icon className="h-16 w-16 -mr-4 -mt-4 transform rotate-12" />
      </div>
      <CardContent className="p-5 relative z-10">
        <div className={`w-9 h-9 rounded-lg ${bg} ${color} flex items-center justify-center mb-3 border border-[#F5F5F7]/5 shadow-inner`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight text-[#F5F5F7] font-mono">{value}</p>
            {trend && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#2E7D32]">
                <ArrowUpRight className="h-2.5 w-2.5" />{trend}
              </span>
            )}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A5AE]">{label}</p>
          {sub && <p className="text-[10px] text-[#8E939D] mt-1 font-medium">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  </motion.div>
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
  const { user, role, showroomId: myShowroomId } = useAuth();

  const isMd = role === "md";
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isTL = role === "tl";
  const isExec = role === "executive";
  const canSeeAll = isMd || isAdmin;
  const canSeeShowroom = isManager || isTL || canSeeAll;

  const [selectedShowroom, setSelectedShowroom] = useState<string>("all");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  // ── Fetch Showrooms ──────────────────────────────
  const { data: showrooms = [] } = useQuery({
    queryKey: ["dashboard-showrooms"],
    enabled: canSeeAll,
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // ── Fetch User Roles (executives per showroom) ───
  const { data: allUserRoles = [] } = useQuery({
    queryKey: ["dashboard-user-roles"],
    enabled: canSeeShowroom,
    queryFn: async () => {
      let q = supabase.from("user_roles").select("user_id, role, showroom_id");
      if (isManager && myShowroomId) {
        q = q.eq("showroom_id", myShowroomId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // ── Fetch Profiles (names) ───────────────────────
  const execUserIds = useMemo(
    () => [...new Set(allUserRoles.filter(r => r.role === "executive").map(r => r.user_id))],
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
    if (isManager && myShowroomId) {
      return allUserRoles.filter(r => r.showroom_id === myShowroomId).map(r => r.user_id);
    }
    // Admin / MD – if a specific showroom is selected, filter to it
    if (canSeeAll && selectedShowroom !== "all") {
      return allUserRoles.filter(r => r.showroom_id === selectedShowroom).map(r => r.user_id);
    }
    return []; // empty = no filter (fetch all)
  }, [isExec, isManager, canSeeAll, user, myShowroomId, selectedShowroom, allUserRoles]);

  // ── Fetch Visits ─────────────────────────────────
  const { data: visits = [], isLoading: visitsLoading } = useQuery({
    queryKey: ["dashboard-visits-all", targetUserIds],
    queryFn: async () => {
      let q = supabase.from("visits").select("id, status, visit_date, created_at, created_by, client_id, partner_id, client:clients(name), partner:partners(name)");
      if (targetUserIds.length > 0) {
        q = q.in("created_by", targetUserIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // ── Fetch Clients ────────────────────────────────
  const { data: clients = [] } = useQuery({
    queryKey: ["dashboard-clients", targetUserIds],
    queryFn: async () => {
      let q = supabase.from("clients").select("id, name, created_at, created_by, status, partner_id");
      if (targetUserIds.length > 0) {
        q = q.in("created_by", targetUserIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // ── Fetch Partners ───────────────────────────────
  const { data: partners = [] } = useQuery({
    queryKey: ["dashboard-partners", targetUserIds],
    queryFn: async () => {
      let q = supabase.from("partners").select("id, name, created_at, created_by, type");
      if (targetUserIds.length > 0) {
        q = q.in("created_by", targetUserIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // ── Fetch Work Scope Items ───────────────────────
  const { data: workItems = [] } = useQuery({
    queryKey: ["dashboard-work-items", targetUserIds],
    queryFn: async () => {
      let q = supabase.from("work_scope_items").select("id, work_status, amount_in_lac, created_at, created_by, is_verified, client_id");
      if (targetUserIds.length > 0) {
        q = q.in("created_by", targetUserIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // ═══════════════════════════════════════════════════
  // ─── Computed Metrics ─────────────────────────────
  // ═══════════════════════════════════════════════════
  const metrics = useMemo(() => {
    const totalVisits = visits.length;
    const completedVisits = visits.filter(v => v.status === "done").length;
    const plannedVisits = visits.filter(v => v.status === "planned").length;
    const cancelledVisits = visits.filter(v => v.status === "cancelled").length;
    const completionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;

    const totalClients = clients.length;
    const totalPartners = partners.length;
    const newClientsThisMonth = clients.filter(c => c.created_at >= monthStart).length;
    const newPartnersThisMonth = partners.filter(p => p.created_at >= monthStart).length;

    const totalOrders = workItems.length;
    const ordersWon = workItems.filter(w => w.work_status === "won").length;
    const ordersLost = workItems.filter(w => w.work_status === "lost").length;
    const ordersPending = workItems.filter(w => w.work_status === "pending").length;
    const totalOrderValue = workItems.reduce((s, w) => s + (w.amount_in_lac || 0), 0);
    const wonOrderValue = workItems.filter(w => w.work_status === "won").reduce((s, w) => s + (w.amount_in_lac || 0), 0);
    const verifiedCount = workItems.filter(w => w.is_verified).length;

    return {
      totalVisits, completedVisits, plannedVisits, cancelledVisits, completionRate,
      totalClients, totalPartners, newClientsThisMonth, newPartnersThisMonth,
      totalOrders, ordersWon, ordersLost, ordersPending, totalOrderValue, wonOrderValue, verifiedCount,
    };
  }, [visits, clients, partners, workItems, monthStart]);

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
      visits: visits.filter(v => v.visit_date === date).length,
      done: visits.filter(v => v.visit_date === date && v.status === "done").length,
    }));
  }, [visits]);

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

  // ── Executive Performance ────────────────────────
  const execPerformance: ExecutivePerf[] = useMemo(() => {
    if (isExec) return [];
    const execIds = [...new Set(allUserRoles.filter(r => r.role === "executive").map(r => r.user_id))];
    const showroomMap = Object.fromEntries(showrooms.map(s => [s.id, s.name]));
    const execShowroomMap = Object.fromEntries(allUserRoles.filter(r => r.role === "executive").map(r => [r.user_id, r.showroom_id]));

    return execIds.map(uid => {
      const uVisits = visits.filter(v => v.created_by === uid);
      const uCompleted = uVisits.filter(v => v.status === "done").length;
      const uClients = clients.filter(c => c.created_by === uid).length;
      const uPartners = partners.filter(p => p.created_by === uid).length;
      const uWon = workItems.filter(w => w.created_by === uid && w.work_status === "won").length;
      const uValue = workItems.filter(w => w.created_by === uid && w.work_status === "won").reduce((s, w) => s + (w.amount_in_lac || 0), 0);
      const sr = execShowroomMap[uid];
      return {
        userId: uid,
        name: profileMap[uid] || "Unknown",
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
    [...visits]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8)
      .map(v => ({
        id: v.id,
        status: v.status,
        desc: (v.client as any)?.name || (v.partner as any)?.name || "Visit",
        time: new Date(v.created_at).toLocaleDateString(),
        statusLabel: v.status.charAt(0).toUpperCase() + v.status.slice(1),
      })),
    [visits]
  );

  const statusColor: Record<string, string> = {
    done: "bg-green-500",
    planned: "bg-blue-500",
    in_progress: "bg-blue-400",
    missed: "bg-red-500",
    rescheduled: "bg-orange-500",
    cancelled: "bg-red-500",
  };

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
    <div className="-m-4 md:-m-6 lg:-m-8 -mb-20 md:-mb-8 min-h-[calc(100vh-3.5rem)] bg-[#0A0B0E] text-[#F5F5F7] font-sans pb-24 selection:bg-[#A6192E]/30 relative overflow-x-hidden">
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
          </motion.div>

          {/* Showroom Filter (Admin / MD only) */}
          {canSeeAll && showrooms.length > 0 && (
            <motion.div variants={itemVariants}>
              <div className="flex items-center gap-2 bg-card border rounded-xl p-2 shadow-sm">
                <Building2 className="h-4 w-4 text-muted-foreground ml-2" />
                <Select value={selectedShowroom} onValueChange={setSelectedShowroom}>
                  <SelectTrigger className="w-[200px] border-none shadow-none bg-transparent h-8 text-sm">
                    <SelectValue placeholder="All Showrooms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Showrooms</SelectItem>
                    {showrooms.map(sr => (
                      <SelectItem key={sr.id} value={sr.id}>
                        {sr.name} – {sr.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── KPI Cards Row 1 ── */}
        <motion.div variants={containerVariants} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total Visits" value={metrics.totalVisits} icon={CalendarCheck} color="text-blue-500" bg="bg-blue-500/10" sub={`${metrics.completionRate}% completion`} />
          <StatCard label="Clients" value={metrics.totalClients} icon={Users} color="text-emerald-500" bg="bg-emerald-500/10" sub={`+${metrics.newClientsThisMonth} this month`} />
          <StatCard label="Partners" value={metrics.totalPartners} icon={Building2} color="text-purple-500" bg="bg-purple-500/10" sub={`+${metrics.newPartnersThisMonth} this month`} />
          <StatCard label="Work Orders" value={metrics.totalOrders} icon={Briefcase} color="text-orange-500" bg="bg-orange-500/10" />
        </motion.div>

        {/* ── KPI Cards Row 2 – Order Status ── */}
        <motion.div variants={containerVariants} className="grid grid-cols-3 gap-3 md:grid-cols-6">
          <StatCard label="Completed" value={metrics.completedVisits} icon={CheckCircle2} color="text-green-500" bg="bg-green-500/10" />
          <StatCard label="Planned" value={metrics.plannedVisits} icon={Clock} color="text-blue-500" bg="bg-blue-500/10" />
          <StatCard label="Cancelled" value={metrics.cancelledVisits} icon={XCircle} color="text-red-500" bg="bg-red-500/10" />
          <StatCard label="Orders Won" value={metrics.ordersWon} icon={Trophy} color="text-emerald-600" bg="bg-emerald-600/10" />
          <StatCard label="Orders Lost" value={metrics.ordersLost} icon={XCircle} color="text-red-500" bg="bg-red-500/10" />
          <StatCard label="Pending" value={metrics.ordersPending} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
        </motion.div>

        {/* ── Main Content Tabs ── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <motion.div variants={itemVariants}>
            <TabsList className="bg-[#12141A] border border-[#F5F5F7]/5 p-1 h-auto flex-wrap rounded-xl">
              <TabsTrigger value="overview" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><BarChart3 className="h-3.5 w-3.5" />Overview</TabsTrigger>
              <TabsTrigger value="top-visited" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><Star className="h-3.5 w-3.5" />Top Visited</TabsTrigger>
              {canSeeShowroom && <TabsTrigger value="team" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><Award className="h-3.5 w-3.5" />Team Performance</TabsTrigger>}
              {canSeeShowroom && <TabsTrigger value="live-map" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><MapPin className="h-3.5 w-3.5" />Live Map</TabsTrigger>}
              {canSeeAll && <TabsTrigger value="comparison" className="text-xs gap-1.5 data-[state=active]:bg-[#1A1D24] data-[state=active]:text-[#F5F5F7] text-[#A1A5AE]"><GitCompare className="h-3.5 w-3.5" />Compare Showrooms</TabsTrigger>}
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

  if (role === "executive") return <ExecutiveHome />;
  return <AnalyticsDashboard />;
};

export default Dashboard;
