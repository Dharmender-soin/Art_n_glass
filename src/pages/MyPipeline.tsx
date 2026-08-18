import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Clock, Send, CheckCircle2, XCircle, PauseCircle,
  TrendingUp, Target, Award, BarChart2, Loader2,
  AlertTriangle, GitBranch, ChevronRight, Phone, MapPin, Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { notifyAllMDs } from "@/lib/notifications";

/* ─── Types ────────────────────────────────────────────────── */
type WorkStatus = "pending" | "submitted" | "won" | "lost" | "draft" | "rejected" | "hold";

interface WOSRecord {
  id: string; client_id: string; work_type_id: string;
  work_status: WorkStatus; created_at: string; submitted_at: string | null;
  verified_at: string | null; quantity: number | null;
  description: string | null; created_by: string;
  subWork: string; typeOfWork: string;
}

interface PipelineClient {
  client_id: string; client_name: string;
  client_address: string; client_mobile: string;
  wos: WOSRecord[];
}

/* ─── Config ────────────────────────────────────────────────── */
const STATUS_PRIORITY: Record<string, number> = { won: 5, submitted: 4, pending: 3, hold: 3, draft: 2, lost: 1, rejected: 0 };

const STATUS_CFG: Record<WorkStatus, { label: string; badgeCls: string; dotCls: string }> = {
  pending:   { label: "WOS",      badgeCls: "bg-sky-50 text-sky-700 border-sky-200",         dotCls: "bg-sky-500" },
  draft:     { label: "WOS",      badgeCls: "bg-slate-50 text-slate-500 border-slate-200",   dotCls: "bg-slate-400" },
  submitted: { label: "Quoted",   badgeCls: "bg-amber-50 text-amber-700 border-amber-200",   dotCls: "bg-amber-500" },
  won:       { label: "Won ✓",   badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200", dotCls: "bg-emerald-500" },
  lost:      { label: "Lost",     badgeCls: "bg-rose-50 text-rose-600 border-rose-200",      dotCls: "bg-rose-500" },
  hold:      { label: "Hold",     badgeCls: "bg-purple-50 text-purple-700 border-purple-200",dotCls: "bg-purple-500" },
  rejected:  { label: "Rejected", badgeCls: "bg-rose-50 text-rose-600 border-rose-200",      dotCls: "bg-rose-400" },
};

function displayDate(r: WOSRecord): string {
  const d = (r.work_status === "won" || r.work_status === "lost" || r.work_status === "rejected")
    ? r.verified_at : r.work_status === "submitted" ? r.submitted_at : r.created_at;
  if (!d) return "";
  try { return format(parseISO(d), "d MMM"); } catch { return ""; }
}

/* ─── Filter chip tabs ──────────────────────────────────────── */
const FILTER_TABS = [
  { key: "all",       label: "All" },
  { key: "pending",   label: "WOS" },
  { key: "submitted", label: "Quoted" },
  { key: "won",       label: "Won" },
  { key: "hold",      label: "Hold" },
  { key: "lost",      label: "Lost" },
];

/* ─── WOS Badge (tappable) ──────────────────────────────────── */
const WOSBadge = ({ rec, onClick }: { rec: WOSRecord; onClick: () => void }) => {
  const cfg = STATUS_CFG[rec.work_status] ?? STATUS_CFG.pending;
  const date = displayDate(rec);
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold transition-all active:scale-95 hover:shadow-sm ${cfg.badgeCls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls} shrink-0`} />
      <span>{rec.subWork}</span>
      <span className="opacity-60 font-normal">· {cfg.label}{date ? ` ${date}` : ""}</span>
    </button>
  );
};

/* ─── Client Card ───────────────────────────────────────────── */
const ClientCard = ({
  client, onBadgeClick
}: {
  client: PipelineClient;
  onBadgeClick: (rec: WOSRecord) => void;
}) => {
  const hasWOS = client.wos.length > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm
        ${!hasWOS
          ? "border-red-100 dark:border-red-900/30"
          : "border-slate-100 dark:border-slate-800"}`}
    >
      {/* Card top */}
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-[14px] text-slate-900 dark:text-white leading-snug truncate">
              {client.client_name}
            </h3>
            {client.client_address && client.client_address !== "—" && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {client.client_address}
                </p>
              </div>
            )}
          </div>
          {/* Status summary badge */}
          {!hasWOS ? (
            <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-2 py-1 rounded-lg">
              <AlertTriangle className="h-3 w-3" /> No WOS
            </span>
          ) : (
            <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg">
              {client.wos.length} WOS
            </span>
          )}
        </div>

        {/* Mobile */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <Phone className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 font-mono">
            {client.client_mobile}
          </span>
        </div>

        {/* WOS badges — horizontal wrap */}
        {hasWOS ? (
          <div className="flex flex-wrap gap-1.5">
            {client.wos.map(rec => (
              <WOSBadge key={rec.id} rec={rec} onClick={() => onBadgeClick(rec)} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-red-400 dark:text-red-500 italic">
            No Work Scope added yet — tap to add from client details
          </p>
        )}
      </div>
    </motion.div>
  );
};

/* ─── KPI Mini Card ─────────────────────────────────────────── */
const KpiCard = ({ label, value, icon, grad, extra }: {
  label: string; value: number; icon: React.ReactNode;
  grad: string; extra?: string | null;
}) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl px-3 py-3 flex items-center gap-2.5 shadow-sm">
    <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white shadow-sm shrink-0`}>
      {icon}
    </div>
    <div className="min-w-0">
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className="text-xl font-extrabold text-slate-900 dark:text-white leading-none">{value}</span>
        {extra && (
          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 px-1.5 py-0.5 rounded-full">
            {extra}
          </span>
        )}
      </div>
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-none mt-0.5 truncate">{label}</p>
    </div>
  </div>
);

/* ─── Main Component ────────────────────────────────────────── */
const MyPipeline = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCell, setSelectedCell] = useState<WOSRecord | null>(null);
  const [updateStatus, setUpdateStatus] = useState<WorkStatus>("submitted");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  /* ── Fetch work types ── */
  const { data: allWorkTypes = [] } = useQuery({
    queryKey: ["wt-pipeline", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("master_work_types")
        .select("id,type_of_work,sub_work")
        .order("type_of_work");
      return data || [];
    },
  });

  /* ── Fetch MY WOS records ── */
  const { data: rawWOS = [], isLoading } = useQuery({
    queryKey: ["wos-pipeline", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("id,client_id,work_type_id,work_status,created_at,submitted_at,verified_at,quantity,description,created_by,clients(name,address,mobile),master_work_types(type_of_work,sub_work)")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string; client_id: string; work_type_id: string; work_status: string;
        created_at: string; submitted_at: string | null; verified_at: string | null;
        quantity: number | null; description: string | null; created_by: string;
        clients: { name: string; address: string | null; mobile: string } | null;
        master_work_types: { type_of_work: string; sub_work: string } | null;
      }>;
    },
  });

  /* ── Fetch MY clients (no-WOS detection) ── */
  const { data: myClients = [] } = useQuery({
    queryKey: ["my-clients-pipeline", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("clients").select("id,name").eq("created_by", user.id);
      return data || [];
    },
  });

  /* ── Build client pipeline cards ── */
  const pivotClients = useMemo((): PipelineClient[] => {
    const cm = new Map<string, PipelineClient>();
    const wtMap: Record<string, { typeOfWork: string; subWork: string }> = {};
    allWorkTypes.forEach(wt => { wtMap[wt.id] = { typeOfWork: wt.type_of_work, subWork: wt.sub_work }; });

    rawWOS.forEach(r => {
      if (!r.clients) return;
      if (!cm.has(r.client_id)) {
        cm.set(r.client_id, {
          client_id: r.client_id,
          client_name: r.clients.name,
          client_address: r.clients.address || "",
          client_mobile: r.clients.mobile,
          wos: [],
        });
      }
      const cl = cm.get(r.client_id)!;
      const wtInfo = wtMap[r.work_type_id] || r.master_work_types || { typeOfWork: "Work", subWork: "Item" };
      // Keep highest priority WOS per work_type_id
      const existing = cl.wos.findIndex(w => w.work_type_id === r.work_type_id);
      const newRec: WOSRecord = {
        id: r.id, client_id: r.client_id, work_type_id: r.work_type_id,
        work_status: r.work_status as WorkStatus,
        created_at: r.created_at, submitted_at: r.submitted_at,
        verified_at: r.verified_at, quantity: r.quantity,
        description: r.description, created_by: r.created_by,
        subWork: (wtInfo as any).subWork || (wtInfo as any).sub_work || "Work",
        typeOfWork: (wtInfo as any).typeOfWork || (wtInfo as any).type_of_work || "",
      };
      if (existing === -1) {
        cl.wos.push(newRec);
      } else if ((STATUS_PRIORITY[r.work_status] ?? 0) > (STATUS_PRIORITY[cl.wos[existing].work_status] ?? 0)) {
        cl.wos[existing] = newRec;
      }
    });
    return Array.from(cm.values()).sort((a, b) => a.client_name.localeCompare(b.client_name));
  }, [rawWOS, allWorkTypes]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    let total = 0, won = 0, sent = 0, pending = 0;
    rawWOS.forEach(r => {
      total++;
      if (r.work_status === "won") won++;
      else if (r.work_status === "submitted") sent++;
      else if (r.work_status === "pending" || r.work_status === "draft") pending++;
    });
    return { total, won, sent, pending, rate: total > 0 ? Math.round((won / total) * 100) : 0 };
  }, [rawWOS]);

  /* ── No-WOS alert ── */
  const clientsWithWOS = useMemo(() => new Set(rawWOS.map(r => r.client_id)), [rawWOS]);
  const noWosClients = myClients.filter(c => !clientsWithWOS.has(c.id));

  /* ── Filtered clients ── */
  const filteredClients = useMemo(() => {
    if (activeFilter === "all") return pivotClients;
    return pivotClients.filter(c =>
      c.wos.some(w => {
        if (activeFilter === "pending") return w.work_status === "pending" || w.work_status === "draft";
        return w.work_status === activeFilter;
      })
    );
  }, [pivotClients, activeFilter]);

  /* ── Update mutation ── */
  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WorkStatus }) => {
      const upd: Record<string, unknown> = { work_status: status };
      if (status === "won" || status === "lost" || status === "rejected") {
        upd.verified_at = new Date().toISOString();
        upd.is_verified = status === "won";
      } else if (status === "submitted") {
        upd.submitted_at = new Date().toISOString();
      }
      const { error } = await supabase.from("work_scope_items").update(upd).eq("id", id);
      if (error) throw error;

      if (status === "won" || status === "lost" || status === "submitted" || status === "hold") {
        try {
          const { data: wosItem } = await supabase
            .from("work_scope_items")
            .select("created_by, client_id, master_work_types(sub_work), clients(name)")
            .eq("id", id)
            .single();

          if (wosItem) {
            const clientName = (wosItem as any).clients?.name || "Client";
            const subWork = (wosItem as any).master_work_types?.sub_work || "WOS Item";
            const title = `WOS ${status === "won" ? "Won ✅" : status === "lost" ? "Lost ❌" : "Quoted 🟡"}`;
            const message = `WOS Item "${subWork}" for ${clientName} was updated to ${status.toUpperCase()}`;

            await notifyAllMDs({
              title,
              message,
              category: status === "lost" ? "critical" : status === "won" ? "important" : "informational",
              priority: status === "lost" || status === "won" ? "high" : "normal",
              notificationType: status === "won" ? "deal_won" : status === "lost" ? "deal_lost" : "wos_update",
              targetUrl: "/my-pipeline",
              entityType: "work_scope_item",
              entityId: id,
              metadata: { client_id: wosItem.client_id, status },
            });
          }
        } catch (e) {
          console.error("Failed to notify WOS update:", e);
        }
      }
    },
    onSuccess: () => {
      toast.success("Status updated!");
      setSelectedCell(null);
      queryClient.invalidateQueries({ queryKey: ["wos-pipeline", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["wos-h3"] });
      queryClient.invalidateQueries({ queryKey: ["work-scope-items-with-names"] });
    },
    onError: () => toast.error("Update failed"),
  });

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 space-y-3">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 py-2">
          <div className="h-10 w-10 rounded-2xl bg-gray-200 dark:bg-white/10 animate-pulse shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-28 bg-gray-200 dark:bg-white/10 rounded-full animate-pulse" />
            <div className="h-4 w-40 bg-gray-300 dark:bg-white/15 rounded-full animate-pulse" />
          </div>
        </div>
        {/* KPI skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl animate-pulse" />
          ))}
        </div>
        {/* Cards skeleton */}
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-28">

      {/* ── Compact Header ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-sm shrink-0">
            <GitBranch className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
              <span>Dashboard</span>
              <ChevronRight className="h-2.5 w-2.5" />
              <span className="text-red-500 font-semibold">My Pipeline</span>
            </div>
            <h1 className="text-[15px] font-extrabold text-slate-900 dark:text-white leading-tight">
              My WOS Pipeline
            </h1>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-3">

        {/* ── Alert Banner ── */}
        <AnimatePresence>
          {noWosClients.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2.5"
            >
              <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-amber-700 dark:text-amber-400 leading-none">
                  {noWosClients.length} client{noWosClients.length > 1 ? "s have" : " has"} no WOS added
                </p>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 mt-0.5 truncate">
                  {noWosClients.slice(0, 3).map(c => c.name).join(", ")}
                  {noWosClients.length > 3 ? ` +${noWosClients.length - 3} more` : ""}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── KPI Cards — forced 2×2 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <KpiCard label="Total WOS"  value={stats.total}   grad="from-slate-600 to-slate-700"  icon={<Target    className="h-4 w-4" />} />
          <KpiCard label="Won"        value={stats.won}     grad="from-emerald-500 to-teal-600" icon={<Award     className="h-4 w-4" />} extra={`${stats.rate}%`} />
          <KpiCard label="Quotations" value={stats.sent}    grad="from-amber-500 to-orange-500" icon={<Send      className="h-4 w-4" />} />
          <KpiCard label="Pending"    value={stats.pending} grad="from-sky-500 to-indigo-500"   icon={<BarChart2 className="h-4 w-4" />} />
        </div>

        {/* ── Win Rate Bar ── */}
        {stats.total > 0 && (
          <div className="flex items-center gap-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2">
            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">Win Rate</span>
            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stats.rate}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
              />
            </div>
            <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">
              {stats.won}/{stats.total} · {stats.rate}%
            </span>
          </div>
        )}

        {/* ── Client Pipeline Section ── */}
        <div>
          {/* Section header */}
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100">Client Pipeline</h2>
            <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 px-2 py-0.5 rounded-full">
              {pivotClients.length} client{pivotClients.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── Filter Chips — horizontal scroll ── */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: "none" }}>
            {FILTER_TABS.map(tab => {
              const isActive = activeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all
                    ${isActive
                      ? "bg-red-600 text-white border-red-600 shadow-sm shadow-red-200 dark:shadow-red-900/30"
                      : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Client Cards ── */}
          {pivotClients.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-slate-300 dark:text-slate-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No WOS added yet</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Add Work Scope from client visits</p>
              </div>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <p className="text-sm font-bold text-slate-400">No clients match this filter</p>
              <button onClick={() => setActiveFilter("all")} className="text-[11px] text-red-500 font-semibold underline">
                Clear filter
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredClients.map((client, i) => (
                <motion.div
                  key={client.client_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <ClientCard
                    client={client}
                    onBadgeClick={rec => { setSelectedCell(rec); setUpdateStatus(rec.work_status); }}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

  <Dialog open={!!selectedCell} onOpenChange={o => { if (!o) setSelectedCell(null); }}>
    <DialogContent className="w-[calc(100vw-32px)] max-w-sm rounded-2xl p-4 overflow-hidden">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-[13px] font-bold text-slate-900 dark:text-white">
          <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shrink-0">
            <TrendingUp className="h-3.5 w-3.5 text-white" />
          </div>
          Update WOS Status
        </DialogTitle>
      </DialogHeader>

      {selectedCell && (
        <div className="space-y-3 mt-1">
          {/* Current info */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-500 shrink-0">Work Item</span>
              <span className="font-bold text-slate-800 dark:text-white text-right truncate max-w-[60%]">{selectedCell.subWork}</span>
            </div>
            {selectedCell.quantity != null && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Quantity</span>
                <span className="font-bold text-slate-800 dark:text-white">{selectedCell.quantity}</span>
              </div>
            )}
            {selectedCell.description && (
              <div className="flex justify-between items-start gap-2">
                <span className="text-slate-500 shrink-0">Note</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-right truncate max-w-[60%]">{selectedCell.description}</span>
              </div>
            )}
            <div className="flex justify-between items-center gap-2">
              <span className="text-slate-500 shrink-0">Stage</span>
              <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${STATUS_CFG[selectedCell.work_status]?.badgeCls}`}>
                {STATUS_CFG[selectedCell.work_status]?.label}
              </span>
            </div>
            {/* Timeline */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="flex justify-between items-center gap-2">
                <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 shrink-0 text-[11px]">
                  <Clock className="h-3 w-3" />WOS Added
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px] shrink-0">
                  {format(parseISO(selectedCell.created_at), "d MMM yy")}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0 text-[11px]">
                  <Send className="h-3 w-3" />Quotation
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px] shrink-0">
                  {selectedCell.submitted_at
                    ? format(parseISO(selectedCell.submitted_at), "d MMM yy")
                    : <span className="text-slate-400">Not yet</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Stage selector — executive controls the complete WOS lifecycle */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Change Stage</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {([
                { s: "pending",   label: "WOS",      icon: <Clock className="h-3.5 w-3.5" /> },
                { s: "submitted", label: "Quotation", icon: <Send  className="h-3.5 w-3.5" /> },
                { s: "won",       label: "Won",       icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
                { s: "lost",      label: "Lost",      icon: <XCircle className="h-3.5 w-3.5" /> },
                { s: "hold",      label: "Hold",      icon: <PauseCircle className="h-3.5 w-3.5" /> },
              ] as { s: WorkStatus; label: string; icon: React.ReactNode }[]).map(({ s, label, icon }) => {
                const cfg = STATUS_CFG[s];
                const sel = updateStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => setUpdateStatus(s)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-bold transition-all active:scale-95
                      ${sel
                        ? s === "submitted" ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                          : s === "won" ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : s === "lost" ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                          : s === "hold" ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                          : "bg-sky-500 text-white border-sky-500 shadow-sm"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}
                  >
                    {icon} {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Confirm */}
          <button
            disabled={updateMutation.isPending || updateStatus === selectedCell.work_status}
            onClick={() => updateMutation.mutate({ id: selectedCell.id, status: updateStatus })}
            className={`w-full h-11 rounded-xl text-white text-sm font-bold shadow-lg
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]
                       ${
                         updateStatus === "submitted" ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-200 dark:shadow-amber-900/30"
                           : updateStatus === "won" ? "bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-200"
                           : updateStatus === "lost" ? "bg-gradient-to-r from-rose-500 to-red-700 shadow-rose-200"
                           : updateStatus === "hold" ? "bg-gradient-to-r from-violet-500 to-purple-700 shadow-violet-200"
                           : "bg-gradient-to-r from-sky-500 to-indigo-500 shadow-sky-200 dark:shadow-sky-900/30"
                       }`}
          >
            {updateMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </span>
            ) : `Mark as ${STATUS_CFG[updateStatus]?.label} →`}
          </button>
        </div>
      )}
    </DialogContent>
  </Dialog>
    </div>
  );
};

export default MyPipeline;
