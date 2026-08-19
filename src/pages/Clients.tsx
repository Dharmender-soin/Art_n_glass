import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Plus, Search, Phone, MapPin, Briefcase, Pencil, Trash2, UserCircle, Calendar, HardHat, ClipboardList, MessageSquare, ChevronDown } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import WorkScopeSection from "@/components/WorkScopeSection";
import VisitHistoryList from "@/components/VisitHistoryList";
import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { sendNotification } from "@/lib/notifications";

type ClientStatus = Database["public"]["Enums"]["client_status"];
type Client = Database["public"]["Tables"]["clients"]["Row"] & {
  partners?: { name: string; type: string } | null;
  _creator_name?: string | null;
  _creator_role?: string | null;
  architect_name?: string | null;
};

const emptyForm = { name: "", mobile: "", address: "", city: "", architect_name: "", partner_id: "", notes: "", status: "new" as ClientStatus };

const statusColors: Record<ClientStatus, string> = {
  new: "bg-[hsl(var(--status-new))] text-white",
  hot: "bg-[hsl(var(--status-hot))] text-white",
  converted: "bg-[hsl(var(--status-converted))] text-white",
  lost: "bg-[hsl(var(--status-lost))] text-white",
};

// ─── Hoisted outside Clients so it never remounts on parent re-render ─────────
interface ClientFormProps {
  values: typeof emptyForm;
  onChange: (v: typeof emptyForm) => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
  partners: { id: string; name: string; type: string }[];
}

const ClientForm = ({ values, onChange, onSubmit, isPending, submitLabel, partners }: ClientFormProps) => (
  <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4 pt-1">

    {/* ── Mandatory Fields ── */}
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          placeholder="Client name"
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          required
          className="h-9 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
          Mobile <span className="text-red-500">*</span>
        </Label>
        <Input
          placeholder="Phone number"
          value={values.mobile}
          onChange={(e) => onChange({ ...values, mobile: e.target.value })}
          required
          className="h-9 text-sm"
          type="tel"
        />
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground">Address <span className="text-[10px] text-muted-foreground font-normal">(optional)</span></Label>
        <Input placeholder="Street / area" value={values.address} onChange={(e) => onChange({ ...values, address: e.target.value })} className="h-9 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground">City <span className="text-[10px] text-muted-foreground font-normal">(optional)</span></Label>
        <Input placeholder="City" value={values.city} onChange={(e) => onChange({ ...values, city: e.target.value })} className="h-9 text-sm" />
      </div>
    </div>

    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">Architect Name <span className="text-[10px] text-muted-foreground font-normal">(optional)</span></Label>
      <Input placeholder="Architect Name" value={values.architect_name} onChange={(e) => onChange({ ...values, architect_name: e.target.value })} className="h-9 text-sm" />
    </div>

    {/* ── Status selector — pill buttons ── */}
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
        Status <span className="text-red-500">*</span>
      </Label>
      <div className="grid grid-cols-4 gap-1.5">
        {([
          { value: 'new',       label: 'New',       active: 'bg-blue-600 text-white border-blue-600',       idle: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30' },
          { value: 'hot',       label: 'Hot 🔥',    active: 'bg-orange-500 text-white border-orange-500',     idle: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30' },
          { value: 'converted', label: 'Won ✅',    active: 'bg-emerald-600 text-white border-emerald-600',  idle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' },
          { value: 'lost',      label: 'Lost',      active: 'bg-red-600 text-white border-red-600',          idle: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30' },
        ] as const).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ ...values, status: opt.value as ClientStatus })}
            className={`py-1.5 rounded-lg border text-[11px] font-bold transition-all ${values.status === opt.value ? opt.active : opt.idle}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>

    {/* ── Lead Source / Partner ── */}
    <div className="space-y-1.5 p-3 rounded-xl border border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-950/30">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1">
          <span>⭐ Lead Source / Partner (Architect / Builder)</span>
        </Label>
        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full">Recommended</span>
      </div>
      <Select value={values.partner_id} onValueChange={(v) => onChange({ ...values, partner_id: v })}>
        <SelectTrigger className="h-9 text-sm border-indigo-300 dark:border-indigo-700 bg-background font-semibold text-foreground">
          <SelectValue placeholder="Select partner or architect..." />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="none">— Direct Client (No Partner) —</SelectItem>
          {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 font-medium">
        💡 Selecting a Partner connects this client to the Partner's pipeline in Hierarchy.
      </p>
    </div>

    {/* ── Notes ── */}
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">
        Notes <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>
      </Label>
      <Textarea
        placeholder="Any additional notes about this client..."
        value={values.notes}
        onChange={(e) => onChange({ ...values, notes: e.target.value })}
        className="text-sm resize-none min-h-[72px]"
      />
    </div>

    <div className="pt-1">
      <p className="text-[10px] text-muted-foreground mb-2"><span className="text-red-500">*</span> Required fields</p>
      <Button type="submit" className="w-full h-10 font-bold" disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </div>
  </form>
);


/* ─── Client Avatar (initials) ────────────────────────────────── */
const statusBg: Record<string, string> = {
  new:       "bg-blue-500",
  hot:       "bg-orange-500",
  converted: "bg-emerald-500",
  lost:      "bg-red-500",
};
const ClientAvatar = ({ name, status }: { name: string; status: string }) => {
  const initials = name.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  const bg = statusBg[status] ?? "bg-slate-400";
  return (
    <div className={`${bg} w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm`}>
      <span className="text-white font-bold text-sm">{initials || "?"}</span>
    </div>
  );
};

/* ─── WOS status styling ─────────────────────────────────────── */
const wosStatusStyle = (status: string) => {
  switch (status) {
    case 'won':       return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/25';
    case 'lost':      return 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-300 dark:border-red-500/25';
    case 'hold':      return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/25';
    case 'submitted': return 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/25';
    default:          return 'bg-slate-50 dark:bg-white/[0.04] text-slate-600 dark:text-white/70 border-slate-200 dark:border-white/10';
  }
};
const wosDot = (status: string) => {
  switch (status) {
    case 'won':       return '#22c55e';
    case 'lost':      return '#ef4444';
    case 'hold':      return '#f59e0b';
    case 'submitted': return '#3b82f6';
    default:          return '#94a3b8';
  }
};

/* ─── Client Card ─────────────────────────────────────────── */
const ClientCard = ({
  c,
  creatorName,
  creatorRole,
  architectName,
  lastVisit,
  wosItems,
  hasWos,
  openEdit,
  openDelete,
  setSelectedClient,
  canDelete,
}: {
  c: Client & { _creator_name?: string | null; _creator_role?: string | null; architect_name?: string | null; partner_id?: string | null };
  creatorName: string | null;
  creatorRole: string | null;
  architectName: string | null;
  lastVisit: { visit_date: string; remarks: string | null; exec_name: string | null } | null;
  wosItems: { name: string; status: string }[];
  hasWos: boolean;
  openEdit: (c: Client, e: React.MouseEvent) => void;
  openDelete: (c: Client, e: React.MouseEvent) => void;
  setSelectedClient: (id: string) => void;
  canDelete: boolean;
}) => {
  const [remarkExpanded, setRemarkExpanded] = useState(false);
  const [wosExpanded, setWosExpanded] = useState(false);

  const creatorLabel =
    creatorRole === "manager" ? "Assigned Manager"
    : creatorRole === "tl"      ? "Assigned TL"
    : creatorRole === "md"      ? "Assigned MD"
    : creatorRole === "admin"   ? "Assigned Admin"
    : "Assigned Executive";

  return (
    <div className={`group relative flex flex-col bg-white dark:bg-white/[0.03] rounded-2xl border shadow-sm hover:shadow-lg dark:hover:shadow-none transition-all duration-200 ${
      !hasWos
        ? 'border-red-300 dark:border-red-500/30'
        : 'border-gray-100 dark:border-white/8 hover:border-gray-200 dark:hover:border-white/15'
    }`}>

      {/* ── Edit / Delete ── */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button type="button" className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 flex items-center justify-center transition-colors" onClick={(e) => openEdit(c, e)} title="Edit client">
          <Pencil className="h-3.5 w-3.5 text-gray-400" />
        </button>
        {canDelete && (
          <button type="button" className="h-7 w-7 rounded-lg bg-red-50 dark:bg-red-500/10 hover:bg-red-100 flex items-center justify-center transition-colors" onClick={(e) => openDelete(c, e)} title="Delete client">
            <Trash2 className="h-3.5 w-3.5 text-red-400" />
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">

        {/* ── Section 1: Header ── */}
        <div className="flex items-start gap-3">
          <ClientAvatar name={c.name} status={c.status} />
          <div className="flex-1 min-w-0 pr-12">
            <h3 className="font-bold text-[15px] text-gray-900 dark:text-white leading-tight truncate">{c.name}</h3>
            <p className="text-xs text-gray-500 dark:text-white/40 font-medium mt-0.5 truncate flex items-center gap-1">
              <Briefcase className="h-3 w-3 shrink-0" />
              {c.partners ? c.partners.name : "Direct"}
            </p>
            {/* Status badge */}
            <div className="mt-1.5">
              <Badge className={`${statusColors[c.status as ClientStatus]} capitalize text-[10px] border-0 px-2 py-0.5`}>{c.status}</Badge>
            </div>
          </div>
        </div>

        {/* ── Section 2: Creator row ── */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-500/8 border border-blue-100 dark:border-blue-500/15">
          <UserCircle className="h-4 w-4 text-blue-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-blue-400 dark:text-blue-500 uppercase tracking-wider">{creatorLabel}</span>
            <p className="text-xs font-bold text-blue-700 dark:text-blue-300 truncate">
              {creatorName || <span className="font-normal italic text-blue-300">Unknown</span>}
            </p>
          </div>
        </div>

        {/* ── Section 3: Architect (if any) ── */}
        {architectName && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50/70 dark:bg-purple-500/8 border border-purple-100 dark:border-purple-500/15">
            <HardHat className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">Architect</span>
              <p className="text-xs font-bold text-purple-700 dark:text-purple-300 truncate">{architectName}</p>
            </div>
          </div>
        )}

        {/* ── Section 4: Contact ── */}
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-white/50">
          <div className="flex items-center gap-1.5 min-w-0">
            <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-700 dark:text-white/60 truncate">{c.mobile || "—"}</span>
          </div>
          {c.city && (
            <>
              <div className="w-px h-3.5 bg-gray-200 dark:bg-white/10 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="capitalize truncate">{c.city}</span>
              </div>
            </>
          )}
        </div>

        {/* ── Section 5: WOS Tags ── */}
        <div>
          {hasWos ? (
            <div className="flex flex-wrap gap-1.5">
              {(wosExpanded ? wosItems : wosItems.slice(0, 3)).map((wos: { name: string; status: string }, i: number) => (
                <span key={i} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate max-w-[140px] ${wosStatusStyle(wos.status)}`} title={wos.name}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: wosDot(wos.status) }} />
                  <span className="truncate">{wos.name}</span>
                </span>
              ))}
              {wosItems.length > 3 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setWosExpanded(!wosExpanded); }}
                  className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  {wosExpanded ? "Show Less ↑" : `+${wosItems.length - 3} more`}
                </button>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/25 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              No WOS Added
            </span>
          )}
        </div>

        {/* ── Section 6: Last Visit ── */}
        <div className="rounded-xl border border-amber-100 dark:border-amber-500/15 overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-500/8 px-3 py-1.5 flex items-center gap-1.5 border-b border-amber-100 dark:border-amber-500/15">
            <Calendar className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Last Visit</span>
          </div>
          {lastVisit ? (
            <div className="px-3 py-2.5 space-y-1.5 bg-white dark:bg-white/[0.02]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-gray-800 dark:text-white/80">{format(parseISO(lastVisit.visit_date), "dd MMM yyyy")}</span>
                {lastVisit.exec_name && (
                  <div className="flex items-center gap-1">
                    <UserCircle className="h-3 w-3 text-blue-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-blue-500 dark:text-blue-400 truncate max-w-[130px]">{lastVisit.exec_name}</span>
                  </div>
                )}
              </div>
              {lastVisit.remarks ? (
                <div>
                  <p className={`text-[11px] text-gray-500 dark:text-white/40 leading-relaxed ${remarkExpanded ? "" : "line-clamp-2"}`}>
                    <span className="font-semibold text-gray-600 dark:text-white/50">Remark: </span>{lastVisit.remarks}
                  </p>
                  {lastVisit.remarks.length > 80 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setRemarkExpanded(!remarkExpanded); }} className="text-[10px] text-primary font-semibold mt-0.5 hover:underline">
                      {remarkExpanded ? "View Less" : "View More"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-300 dark:text-white/20 italic">No remarks recorded</p>
              )}
            </div>
          ) : (
            <div className="px-3 py-3 bg-white dark:bg-white/[0.02] flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-gray-300 dark:text-white/20 shrink-0" />
              <p className="text-[11px] text-gray-300 dark:text-white/20 italic">No visit recorded yet</p>
            </div>
          )}
        </div>

        {/* ── Section 7: Action buttons ── */}
        <div className="grid grid-cols-2 gap-2 pt-2 mt-auto border-t border-gray-100 dark:border-white/5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelectedClient(c.id); }}
            className="flex items-center justify-center gap-1.5 h-9 px-2 rounded-xl border border-dashed border-primary/30 dark:border-primary/20 text-[11px] sm:text-xs font-semibold text-primary hover:bg-primary/5 transition-all truncate"
          >
            <ClipboardList className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Add Note</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedClient(c.id)}
            className="flex items-center justify-center gap-1.5 h-9 px-2 rounded-xl bg-primary text-white text-[11px] sm:text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm truncate"
          >
            <ChevronDown className="h-3.5 w-3.5 -rotate-90 shrink-0" />
            <span className="truncate">View Details</span>
          </button>
        </div>

      </div>
    </div>
  );
};

const Clients = () => {
  const { user, role, showroomId, showroomIds, reportsTo } = useAuth();
  const canDelete = role !== "executive" && role !== "tl";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterExecutive, setFilterExecutive] = useState<string>("all");
  const [filterArchitect, setFilterArchitect] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });

  const { data: executivesList = [] } = useQuery({
    queryKey: ["executives-list-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").order("full_name");
      if (error) throw error;
      return (data || []) as { user_id: string; full_name: string }[];
    },
  });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", user?.id, role],
    queryFn: async () => {
      let q = supabase.from("clients")
        .select("*, partners(name, type)")
        .order("created_at", { ascending: false });

      if (role === "executive" && user) {
        const ids = [user.id, ...(reportsTo ? [reportsTo] : [])];
        q = q.in("created_by", ids);

      } else if (role === "tl" && user) {
        const { data: myExecs } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("reports_to", user.id)
          .eq("role", "executive");
        const execIds = (myExecs || []).map((r: { user_id: string }) => r.user_id);
        const ids = [user.id, ...execIds];
        q = q.in("created_by", ids);

      } else if (role === "manager") {
        const effectiveShowrooms = [...new Set([...showroomIds, ...(showroomId ? [showroomId] : [])])];
        if (effectiveShowrooms.length > 0) {
          const { data: teamRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("showroom_id", effectiveShowrooms);
          const teamIds = (teamRoles || []).map((r: { user_id: string }) => r.user_id);
          if (teamIds.length > 0) {
            q = q.in("created_by", teamIds);
          } else {
            return [] as Client[];
          }
        }
      }
      // MD / Admin: no filter

      const { data, error } = await q;
      if (error) throw error;

      // ── Fetch creator profiles + roles separately ──
      const creatorIds = [...new Set((data || []).map(c => c.created_by).filter(Boolean))];
      const [{ data: profilesData }, { data: rolesData }] = await Promise.all([
        creatorIds.length > 0
          ? supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds)
          : Promise.resolve({ data: [] }),
        creatorIds.length > 0
          ? supabase.from("user_roles").select("user_id, role").in("user_id", creatorIds)
          : Promise.resolve({ data: [] }),
      ]);
      const profileMap = Object.fromEntries((profilesData || []).map(p => [p.user_id, p.full_name]));
      const roleMap = Object.fromEntries((rolesData || []).map(r => [r.user_id, r.role]));

      return (data || []).map(c => ({
        ...c,
        _creator_name: c.created_by ? (profileMap[c.created_by] || null) : null,
        _creator_role: c.created_by ? (roleMap[c.created_by] || null) : null,
      })) as Client[];
    },
  });

  const clientIds = useMemo(() => clients.map(c => c.id), [clients]);

  // ── Last visit per client (profiles fetched separately) ──
  const { data: clientLastVisitsMap = {} } = useQuery({
    queryKey: ["client-last-visits", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("client_id, visit_date, remarks, created_by")
        .in("client_id", clientIds)
        .eq("status", "done")
        .order("visit_date", { ascending: false });

      const creatorIds = [...new Set((data || []).map(v => v.created_by).filter(Boolean))];
      const { data: profilesData } = creatorIds.length > 0
        ? await supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds)
        : { data: [] };
      const profileMap = Object.fromEntries((profilesData || []).map(p => [p.user_id, p.full_name]));

      const seen = new Set<string>();
      const result: Record<string, { visit_date: string; remarks: string | null; exec_name: string | null }> = {};
      (data || []).forEach((v: { client_id: string | null; visit_date: string; remarks: string | null; created_by: string }) => {
        if (!v.client_id || seen.has(v.client_id)) return;
        seen.add(v.client_id);
        result[v.client_id] = { visit_date: v.visit_date, remarks: v.remarks, exec_name: profileMap[v.created_by] || null };
      });
      return result;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partners", user?.id, role],
    queryFn: async () => {
      let q = supabase.from("partners").select("id, name, type");

      if (role === "executive" && user) {
        const ids = [user.id, ...(reportsTo ? [reportsTo] : [])];
        q = q.in("created_by", ids);
      } else if (role === "tl" && user) {
        const { data: myExecs } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("reports_to", user.id)
          .eq("role", "executive");
        const execIds = (myExecs || []).map((r: { user_id: string }) => r.user_id);
        q = q.in("created_by", [user.id, ...execIds]);
      } else if (role === "manager") {
        const effectiveShowrooms = [...new Set([...showroomIds, ...(showroomId ? [showroomId] : [])])];
        if (effectiveShowrooms.length > 0) {
          const { data: teamRoles } = await supabase.from("user_roles").select("user_id").in("showroom_id", effectiveShowrooms);
          const teamIds = (teamRoles || []).map((r: { user_id: string }) => r.user_id);
          if (teamIds.length > 0) q = q.in("created_by", teamIds);
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: workScopeByClient = {} } = useQuery({
    queryKey: ["work-scope-items-with-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("client_id, work_status, master_work_types(type_of_work, sub_work)");
      if (error) throw error;
      // Group by client_id: { [clientId]: [{name, status}] }
      const grouped: Record<string, { name: string; status: string }[]> = {};
      (data || []).forEach((item: { client_id: string | null; work_status: string | null; master_work_types: { type_of_work: string; sub_work: string | null } | null }) => {
        if (!item.client_id) return;
        const typeName = item.master_work_types?.type_of_work || "Work";
        const subWork = item.master_work_types?.sub_work;
        const label = subWork ? `${typeName} – ${subWork}` : typeName;
        if (!grouped[item.client_id]) grouped[item.client_id] = [];
        grouped[item.client_id].push({ name: label, status: item.work_status || "pending" });
      });
      return grouped;
    },
  });

  // Keep backward-compat count reference
  const workScopeCounts: Record<string, number> = {};
  Object.entries(workScopeByClient).forEach(([cid, items]) => {
    workScopeCounts[cid] = items.length;
  });

  const createClientMutation = useMutation({
    mutationFn: async () => {
      const { partner_id, ...rest } = { ...form, created_by: user!.id };
      const rawData = (!partner_id || partner_id === 'none')
        ? { ...rest, partner_id: null }
        : { ...rest, partner_id };
      const insertData: Database["public"]["Tables"]["clients"]["Insert"] = {
        name: rawData.name,
        mobile: rawData.mobile,
        address: rawData.address || null,
        city: rawData.city || null,
        architect_name: rawData.architect_name || null,
        partner_id: rawData.partner_id,
        notes: rawData.notes || null,
        status: rawData.status,
        created_by: rawData.created_by,
      };
      const { error } = await supabase.from("clients").insert(insertData);
      if (error) throw error;

      try {
        const { data: mdAdmins } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["md", "admin"]);
        const targetIds = (mdAdmins || []).map((m) => m.user_id);
        if (rawData.created_by) {
          const { data: creatorRole } = await supabase
            .from("user_roles")
            .select("reports_to")
            .eq("user_id", rawData.created_by)
            .maybeSingle();
          if (creatorRole?.reports_to) targetIds.push(creatorRole.reports_to);
        }
        const uniqueTargetIds = [...new Set(targetIds)];
        await Promise.all(
          uniqueTargetIds.map((uid) =>
            sendNotification({
              userId: uid,
              title: "New Lead Onboarded 🆕",
              message: `Client ${rawData.name} was added to pipeline`,
              targetUrl: "/clients",
            })
          )
        );
      } catch (e) {
        console.error("Error notifying new client creation:", e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client created!");
      setForm({ ...emptyForm });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateClientMutation = useMutation({
    mutationFn: async () => {
      if (!editClient) return;
      const { partner_id, ...rest } = editForm;
      const rawData = (!partner_id || partner_id === 'none')
        ? { ...rest, partner_id: null }
        : { ...rest, partner_id };
      const updateData: Database["public"]["Tables"]["clients"]["Update"] = {
        name: rawData.name,
        mobile: rawData.mobile,
        address: rawData.address || null,
        city: rawData.city || null,
        architect_name: rawData.architect_name || null,
        partner_id: rawData.partner_id,
        notes: rawData.notes || null,
        status: rawData.status,
      };
      const { error } = await supabase.from("clients").update(updateData).eq("id", editClient.id);
      if (error) throw error;

      if (rawData.status === "converted" || rawData.status === "lost") {
        try {
          // 1. Fetch MDs & Admins
          const { data: mdAdmins } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["md", "admin"]);
          const targetIds = (mdAdmins || []).map((m) => m.user_id);

          // 2. Fetch Creator's Showroom Manager & TL
          if (editClient.created_by) {
            const { data: creatorRole } = await supabase
              .from("user_roles")
              .select("showroom_id, reports_to")
              .eq("user_id", editClient.created_by)
              .maybeSingle();

            if (creatorRole?.showroom_id) {
              const { data: managers } = await supabase
                .from("user_roles")
                .select("user_id")
                .eq("showroom_id", creatorRole.showroom_id)
                .eq("role", "manager");
              (managers || []).forEach((m) => targetIds.push(m.user_id));
            }
            if (creatorRole?.reports_to) {
              targetIds.push(creatorRole.reports_to);
            }
          }

          const uniqueTargetIds = [...new Set(targetIds)];
          if (uniqueTargetIds.length > 0) {
            const title = `Client Marked ${rawData.status === "converted" ? "WON ✅" : "LOST ❌"}`;
            const message = `Client ${rawData.name} was marked as ${rawData.status.toUpperCase()}`;
            await Promise.all(
              uniqueTargetIds.map((uid) =>
                sendNotification({
                  userId: uid,
                  title,
                  message,
                  targetUrl: "/clients",
                })
              )
            );
          }
        } catch (e) {
          console.error("Failed to notify MD/Admin/Manager:", e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client updated!");
      setEditClient(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canDelete) throw new Error("Your role is not allowed to delete clients.");
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["work-scope-counts"] });
      toast.success("Client deleted.");
      setDeleteClient(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: Client, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setEditForm({
      name: c.name,
      mobile: c.mobile,
      address: c.address || "",
      city: c.city || "",
      architect_name: c.architect_name || "",
      partner_id: (c as Client & { partner_id?: string | null }).partner_id || "",
      notes: c.notes || "",
      status: c.status,
    });
    setEditClient(c);
  };

  const openDelete = (c: Client, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setDeleteClient(c);
  };

  const architectsList = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.architect_name && c.architect_name.trim()) {
        set.add(c.architect_name.trim());
      }
    });
    return Array.from(set).sort();
  }, [clients]);

  const filtered = clients.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search);
    const matchStatus = !filterStatus || filterStatus === "all" || c.status === filterStatus;
    const matchExec = !filterExecutive || filterExecutive === "all" || c.created_by === filterExecutive;
    const matchArchitect = !filterArchitect || filterArchitect === "all" || c.architect_name === filterArchitect;
    return matchSearch && matchStatus && matchExec && matchArchitect;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-2xl font-bold">Clients</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full md:w-auto"><Plus className="mr-1 h-4 w-4" />Add Client</Button>
          </DialogTrigger>
          <DialogContent className="bg-popover max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
            <ClientForm values={form} onChange={setForm} onSubmit={() => createClientMutation.mutate()} isPending={createClientMutation.isPending} submitLabel="Save Client" partners={partners} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 w-full bg-card" placeholder="Search name or mobile..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[120px] shrink-0"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem><SelectItem value="hot">Hot</SelectItem><SelectItem value="converted">Converted</SelectItem><SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
          {executivesList.length > 0 && (
            <Select value={filterExecutive} onValueChange={setFilterExecutive}>
              <SelectTrigger className="w-[140px] shrink-0"><SelectValue placeholder="All Executives" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Executives</SelectItem>
                {executivesList.map((e) => (
                  <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {architectsList.length > 0 && (
            <Select value={filterArchitect} onValueChange={setFilterArchitect}>
              <SelectTrigger className="w-[140px] shrink-0"><SelectValue placeholder="All Architects" /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Architects</SelectItem>
                {architectsList.map((arch) => (
                  <SelectItem key={arch} value={arch}>{arch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No clients found.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const lastVisit = (clientLastVisitsMap as Record<string, { visit_date: string; remarks: string | null; exec_name: string | null }>)[c.id] || null;
            const creatorName = (c as { _creator_name?: string | null })._creator_name || null;
            const creatorRole = (c as { _creator_role?: string | null })._creator_role || null;
            const architectName = (c as { architect_name?: string | null }).architect_name || null;
            const wosItems = workScopeByClient[c.id] || [];
            const hasWos = wosItems.length > 0;

            return (
              <ClientCard
                key={c.id}
                c={c}
                creatorName={creatorName}
                creatorRole={creatorRole}
                architectName={architectName}
                lastVisit={lastVisit}
                wosItems={wosItems}
                hasWos={hasWos}
                openEdit={openEdit}
                openDelete={openDelete}
                setSelectedClient={setSelectedClient}
                canDelete={canDelete}
              />
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editClient} onOpenChange={(open) => !open && setEditClient(null)}>
        <DialogContent className="bg-popover max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Client — {editClient?.name}</DialogTitle></DialogHeader>
          <ClientForm values={editForm} onChange={setEditForm} onSubmit={() => updateClientMutation.mutate()} isPending={updateClientMutation.isPending} submitLabel="Save Changes" partners={partners} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={canDelete && !!deleteClient} onOpenChange={(open) => !open && setDeleteClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <b>{deleteClient?.name}</b>? Their visit history and work scope items may also be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteClient && deleteClientMutation.mutate(deleteClient.id)} disabled={deleteClientMutation.isPending}>
              {deleteClientMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Work Scope / Visit History Sheet */}
      <Sheet open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <SheetContent className="overflow-y-auto bg-background sm:max-w-md">
          <SheetHeader><SheetTitle>Client Details</SheetTitle></SheetHeader>
          <Tabs defaultValue="work_scope" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="work_scope">Work Scope</TabsTrigger>
              <TabsTrigger value="visits">Visit History</TabsTrigger>
            </TabsList>
            <TabsContent value="work_scope">
              {selectedClient && <WorkScopeSection clientId={selectedClient} />}
            </TabsContent>
            <TabsContent value="visits">
              {selectedClient && <VisitHistoryList clientId={selectedClient} />}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Clients;
