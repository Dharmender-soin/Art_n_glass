import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Plus, Search, Phone, MapPin, Pencil, Trash2, Building2, Users, ChevronDown, X, UserCircle, Calendar, MessageSquare } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import VisitHistoryList from "@/components/VisitHistoryList";
import { format, parseISO } from "date-fns";
import { useMemo } from "react";

type Partner = Database["public"]["Tables"]["partners"]["Row"] & {
  _creator_name?: string | null;
  _creator_role?: string | null;
};
type PartnerType = Database["public"]["Enums"]["partner_type"];

const emptyForm = { type: "builder" as PartnerType, name: "", mobile: "", company_name: "", address: "", city: "" };

/* ─── Type Badge ───────────────────────────────────────────── */
const TypeBadge = ({ type }: { type: string }) => {
  const cfg: Record<string, { label: string; cls: string }> = {
    builder:   { label: "Builder",   cls: "bg-red-600 text-white" },
    architect: { label: "Architect", cls: "bg-purple-600 text-white" },
    self:      { label: "Direct",    cls: "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
  };
  const { label, cls } = cfg[type] || { label: type, cls: "bg-gray-200 text-gray-700" };
  return (
    <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-wide ${cls}`}>
      {label}
    </span>
  );
};

/* ─── Avatar ───────────────────────────────────────────────── */
const PartnerAvatar = ({ name, type }: { name: string; type: string }) => {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  const colors: Record<string, string> = {
    builder:   "from-red-600 to-red-800",
    architect: "from-purple-600 to-purple-800",
    self:      "from-amber-500 to-orange-600",
  };
  const grad = colors[type] || "from-slate-500 to-slate-700";
  return (
    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
      {initials || <Building2 className="h-5 w-5" />}
    </div>
  );
};

/* ─── Skeleton Card ────────────────────────────────────────── */
const SkeletonCard = () => (
  <div className="rounded-2xl border border-border bg-white dark:bg-white/[0.03] p-4 space-y-3 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-2xl bg-gray-200 dark:bg-white/10" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 bg-gray-200 dark:bg-white/10 rounded-full w-2/3" />
        <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-full w-1/2" />
      </div>
      <div className="h-5 w-16 bg-gray-100 dark:bg-white/5 rounded-full" />
    </div>
    <div className="space-y-2 pl-14">
      <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-full w-3/4" />
      <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-full w-1/2" />
    </div>
    <div className="h-9 bg-gray-100 dark:bg-white/5 rounded-xl" />
  </div>
);

/* ─── Partner Form ─────────────────────────────────────────── */
const PartnerForm = ({ values, onChange, onSubmit, isPending, submitLabel }: {
  values: typeof emptyForm; onChange: (v: typeof emptyForm) => void;
  onSubmit: () => void; isPending: boolean; submitLabel: string;
}) => (
  <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4 pt-1">
    {/* Type selector pills */}
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
        Type <span className="text-red-500">*</span>
      </Label>
      <div className="grid grid-cols-3 gap-1.5">
        {([
          { value: "builder",   label: "Builder",   active: "bg-red-600 text-white border-red-600",      idle: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30" },
          { value: "architect", label: "Architect",  active: "bg-purple-600 text-white border-purple-600", idle: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/30" },
          { value: "self",      label: "Direct",     active: "bg-amber-500 text-white border-amber-500",   idle: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30" },
        ] as const).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ ...values, type: opt.value as PartnerType })}
            className={`py-2 rounded-xl border text-[11px] font-bold transition-all ${values.type === opt.value ? opt.active : opt.idle}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input placeholder="Partner name" value={values.name} onChange={(e) => onChange({ ...values, name: e.target.value })} required className="h-9 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
          Mobile <span className="text-red-500">*</span>
        </Label>
        <Input placeholder="Phone number" value={values.mobile} onChange={(e) => onChange({ ...values, mobile: e.target.value })} required className="h-9 text-sm" type="tel" />
      </div>
    </div>

    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">Company <span className="text-[10px] text-muted-foreground font-normal">(optional)</span></Label>
      <Input placeholder="Company / firm name" value={values.company_name} onChange={(e) => onChange({ ...values, company_name: e.target.value })} className="h-9 text-sm" />
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

    <div className="pt-1">
      <p className="text-[10px] text-muted-foreground mb-2"><span className="text-red-500">*</span> Required fields</p>
      <Button type="submit" className="w-full h-10 font-bold" disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </div>
  </form>
);

interface PartnerCardProps {
  p: Partner;
  execName: string | null;
  execRole: string | null;
  clientCount: number;
  wosCount: number;
  wonCount: number;
  lostCount: number;
  lastVisit: { visit_date: string; remarks: string | null; exec_name: string | null } | null;
  showClientForm: string | null;
  setShowClientForm: (id: string | null) => void;
  clientForm: { name: string; mobile: string; address: string; city: string; notes: string; status: "new" };
  setClientForm: (form: { name: string; mobile: string; address: string; city: string; notes: string; status: "new" }) => void;
  createClientForPartner: { mutate: (partnerId: string) => void; isPending: boolean };
  openEdit: (p: Partner, e: React.MouseEvent) => void;
  setDeletePartner: (p: Partner) => void;
  setSelectedPartner: (id: string) => void;
}

/* ─── Partner Card ─────────────────────────────────────────── */
const PartnerCard = ({
  p,
  execName,
  execRole,
  clientCount,
  wosCount,
  wonCount,
  lostCount,
  lastVisit,
  showClientForm,
  setShowClientForm,
  clientForm,
  setClientForm,
  createClientForPartner,
  openEdit,
  setDeletePartner,
  setSelectedPartner,
}: PartnerCardProps) => {
  const [remarkExpanded, setRemarkExpanded] = useState(false);

  const stats = [
    { label: "Clients", value: clientCount ?? 0, num: clientCount ?? 0, valueCls: "text-blue-600 dark:text-blue-400", bgCls: "bg-blue-50 dark:bg-blue-500/10", borderCls: "border-blue-100 dark:border-blue-500/20" },
    { label: "WOS",     value: wosCount  ?? 0, num: wosCount  ?? 0, valueCls: "text-slate-700 dark:text-slate-300", bgCls: "bg-slate-50 dark:bg-white/5",       borderCls: "border-slate-100 dark:border-white/10" },
    { label: "Won",     value: wonCount  ?? 0, num: wonCount  ?? 0, valueCls: "text-emerald-600 dark:text-emerald-400", bgCls: "bg-emerald-50 dark:bg-emerald-500/10", borderCls: "border-emerald-100 dark:border-emerald-500/20" },
    { label: "Lost",    value: lostCount ?? 0, num: lostCount ?? 0, valueCls: "text-red-500 dark:text-red-400",     bgCls: "bg-red-50 dark:bg-red-500/10",        borderCls: "border-red-100 dark:border-red-500/20" },
  ];

  return (
    <div className="group relative flex flex-col bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-100 dark:border-white/8 shadow-sm hover:shadow-lg dark:hover:shadow-none hover:border-gray-200 dark:hover:border-white/15 transition-all duration-200">

      {/* ── Edit / Delete icons ── */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 flex items-center justify-center transition-colors"
          onClick={(e) => openEdit(p, e)}
          title="Edit partner"
        >
          <Pencil className="h-3.5 w-3.5 text-gray-400 dark:text-white/50" />
        </button>
        <button
          className="h-7 w-7 rounded-lg bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 flex items-center justify-center transition-colors"
          onClick={(e) => { e.stopPropagation(); setDeletePartner(p); }}
          title="Delete partner"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-400" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">

        {/* ── Section 1: Header ── */}
        <div className="flex items-start gap-3">
          <PartnerAvatar name={p.name} type={p.type} />
          <div className="flex-1 min-w-0 pr-12">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-[15px] text-gray-900 dark:text-white leading-tight truncate">
                {p.name}
              </h3>
            </div>
            {p.company_name ? (
              <p className="text-xs text-gray-500 dark:text-white/40 font-medium mt-0.5 truncate">
                {p.company_name}
              </p>
            ) : (
              <p className="text-xs text-gray-300 dark:text-white/20 italic mt-0.5">No firm name</p>
            )}
            {/* Type badge below name */}
            <div className="mt-1.5">
              <TypeBadge type={p.type} />
            </div>
          </div>
        </div>

        {/* ── Section 2: Assigned By ── */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50/70 dark:bg-blue-500/8 border border-blue-100 dark:border-blue-500/15">
          <UserCircle className="h-4 w-4 text-blue-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-blue-400 dark:text-blue-500 uppercase tracking-wider">
              {execRole === "manager" ? "Assigned Manager"
                : execRole === "tl" ? "Assigned TL"
                : execRole === "md" ? "Assigned MD"
                : execRole === "admin" ? "Assigned Admin"
                : "Assigned Executive"}
            </span>
            <p className="text-xs font-bold text-blue-700 dark:text-blue-300 truncate">
              {execName ? execName : <span className="font-normal italic text-blue-300">Not Assigned</span>}
            </p>
          </div>
        </div>

        {/* ── Section 3: Contact info ── */}
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-white/50">
          <div className="flex items-center gap-1.5 min-w-0">
            <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-700 dark:text-white/60 truncate">{p.mobile || "—"}</span>
          </div>
          {p.city && (
            <>
              <div className="w-px h-3.5 bg-gray-200 dark:bg-white/10 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="capitalize truncate">{p.city}</span>
              </div>
            </>
          )}
        </div>

        {/* ── Section 4: Stats ── */}
        <div className="grid grid-cols-4 gap-1.5">
          {stats.map(s => (
            <div key={s.label} className={`${s.bgCls} ${s.borderCls} border rounded-xl py-2 px-1 text-center`}>
              <p className={`text-base font-extrabold leading-none ${s.valueCls}`}>{s.num}</p>
              <p className="text-[9px] font-semibold text-gray-400 dark:text-white/30 mt-1 leading-none tracking-wide uppercase">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Section 5: Last Visit ── */}
        <div className="rounded-xl border border-amber-100 dark:border-amber-500/15 overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-500/8 px-3 py-1.5 flex items-center gap-1.5 border-b border-amber-100 dark:border-amber-500/15">
            <Calendar className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Last Visit</span>
          </div>
          {lastVisit ? (
            <div className="px-3 py-2.5 space-y-1.5 bg-white dark:bg-white/[0.02]">
              {/* Date + exec */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-800 dark:text-white/80">
                    {format(parseISO(lastVisit.visit_date), "dd MMM yyyy")}
                  </span>
                </div>
                {lastVisit.exec_name && (
                  <div className="flex items-center gap-1">
                    <UserCircle className="h-3 w-3 text-blue-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-blue-500 dark:text-blue-400 truncate max-w-[130px]">
                      {lastVisit.exec_name}
                    </span>
                  </div>
                )}
              </div>
              {/* Remark */}
              {lastVisit.remarks ? (
                <div>
                  <p className={`text-[11px] text-gray-500 dark:text-white/40 leading-relaxed ${remarkExpanded ? "" : "line-clamp-2"}`}>
                    <span className="font-semibold text-gray-600 dark:text-white/50">Remark: </span>
                    {lastVisit.remarks}
                  </p>
                  {lastVisit.remarks.length > 80 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setRemarkExpanded(!remarkExpanded); }}
                      className="text-[10px] text-primary font-semibold mt-0.5 hover:underline"
                    >
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

        {/* ── Section 6: Add Client inline form ── */}
        {showClientForm === p.id && (
          <form
            onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); createClientForPartner.mutate(p.id); }}
            className="space-y-2.5 border-t border-gray-100 dark:border-white/5 pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700 dark:text-white/70 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" /> Quick Add Client
              </p>
              <button type="button" onClick={() => setShowClientForm(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Name *" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} required className="h-8 text-xs" />
              <Input placeholder="Mobile *" value={clientForm.mobile} onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })} required className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Address" value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} className="h-8 text-xs" />
              <Input placeholder="City" value={clientForm.city} onChange={(e) => setClientForm({ ...clientForm, city: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={createClientForPartner.isPending} className="flex-1 h-8 text-xs font-bold">
                {createClientForPartner.isPending ? "Saving..." : "Save Client"}
              </Button>
              <Button size="sm" variant="outline" type="button" onClick={() => setShowClientForm(null)} className="h-8 text-xs px-3">
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* ── Section 7: Action buttons ── */}
        <div className="flex items-center gap-2 pt-1 mt-auto border-t border-gray-100 dark:border-white/5">
          <button
            onClick={(e) => { e.stopPropagation(); setShowClientForm(showClientForm === p.id ? null : p.id); }}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-primary/30 dark:border-primary/20 text-xs font-semibold text-primary hover:bg-primary/5 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Client
          </button>
          <button
            onClick={() => setSelectedPartner(p.id)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 active:scale-[0.98] transition-all shadow-sm"
          >
            <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            View Details
          </button>
        </div>

      </div>
    </div>
  );
};

/* ─── Empty State ──────────────────────────────────────────── */
const EmptyState = ({ isFiltered, onAdd }: { isFiltered: boolean; onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-red-100 to-red-200 dark:from-red-500/20 dark:to-red-600/10 flex items-center justify-center mb-4">
      <Building2 className="h-8 w-8 text-red-500" />
    </div>
    <h3 className="text-base font-bold text-gray-800 dark:text-white mb-1">
      {isFiltered ? "No partners found" : "No partners yet"}
    </h3>
    <p className="text-sm text-gray-400 dark:text-white/30 mb-5 max-w-[240px] leading-relaxed">
      {isFiltered
        ? "Try adjusting your search or filter to find partners."
        : "Start building your network by adding your first partner."}
    </p>
    {!isFiltered && (
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-red-500/20 hover:bg-red-700 transition-all active:scale-95"
      >
        <Plus className="h-4 w-4" />
        Add First Partner
      </button>
    )}
  </div>
);

/* ─── Main Component ───────────────────────────────────────── */
const Partners = () => {
  const { user, role, showroomId, showroomIds, reportsTo } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterExecutive, setFilterExecutive] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<Partner | null>(null);
  const [deletePartner, setDeletePartner] = useState<Partner | null>(null);
  const [showClientForm, setShowClientForm] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [clientForm, setClientForm] = useState({ name: "", mobile: "", address: "", city: "", notes: "", status: "new" as const });

  const { data: executivesList = [] } = useQuery({
    queryKey: ["executives-list-partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").order("full_name");
      if (error) throw error;
      return (data || []) as { user_id: string; full_name: string }[];
    },
  });

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["partners", user?.id, role],
    queryFn: async () => {
      let q = supabase.from("partners").select("*").order("created_at", { ascending: false });

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
          const { data: teamRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("showroom_id", effectiveShowrooms);
          const teamIds = (teamRoles || []).map((r: { user_id: string }) => r.user_id);
          if (teamIds.length > 0) q = q.in("created_by", teamIds);
        }
      }
      // MD / Admin: no filter

      const { data, error } = await q;
      if (error) throw error;

      // ── Fetch creator profiles + roles separately ──
      const creatorIds = [...new Set((data || []).map(p => p.created_by).filter(Boolean))];
      const [{ data: profilesData }, { data: rolesData }] = await Promise.all([
        creatorIds.length > 0
          ? supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds)
          : Promise.resolve({ data: [] }),
        creatorIds.length > 0
          ? supabase.from("user_roles").select("user_id, role").in("user_id", creatorIds)
          : Promise.resolve({ data: [] }),
      ]);
      const profileMap = Object.fromEntries((profilesData || []).map(pr => [pr.user_id, pr.full_name]));
      const roleMap = Object.fromEntries((rolesData || []).map(r => [r.user_id, r.role]));

      return (data || []).map(p => ({
        ...p,
        _creator_name: p.created_by ? (profileMap[p.created_by] || null) : null,
        _creator_role: p.created_by ? (roleMap[p.created_by] || null) : null,
      }));
    },
  });

  const createPartner = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("partners").insert({ ...form, created_by: user!.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      toast.success("Partner created!");
      setForm({ ...emptyForm });
      setCreateOpen(false);
      setShowClientForm(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePartner = useMutation({
    mutationFn: async () => {
      if (!editPartner) return;
      const { error } = await supabase.from("partners").update(editForm).eq("id", editPartner.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      toast.success("Partner updated!");
      setEditPartner(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePartnerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Partner deleted.");
      setDeletePartner(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createClientForPartner = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase.from("clients").insert({ ...clientForm, partner_id: partnerId, created_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client created!");
      setClientForm({ name: "", mobile: "", address: "", city: "", notes: "", status: "new" });
      setShowClientForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (p: Partner, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setEditForm({ type: p.type, name: p.name, mobile: p.mobile, company_name: p.company_name || "", address: p.address || "", city: p.city || "" });
    setEditPartner(p);
  };

  const filtered = partners.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.mobile.includes(search);
    const matchCity = !filterCity || p.city?.toLowerCase().includes(filterCity.toLowerCase());
    const matchType = !filterType || filterType === "all" || p.type === filterType;
    const matchExec = !filterExecutive || filterExecutive === "all" || p.created_by === filterExecutive;
    return matchSearch && matchCity && matchType && matchExec;
  });

  const partnerIds = useMemo(() => partners.map(p => p.id), [partners]);

  // ── Partner stats: clients count + WOS totals ──
  const { data: partnerClients = [] } = useQuery({
    queryKey: ["partner-clients-stats", partnerIds],
    enabled: partnerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, partner_id, work_scope_items(work_status)")
        .in("partner_id", partnerIds);
      return data || [];
    },
  });

  const statsMap = useMemo(() => {
    const map: Record<string, { clients: number; total: number; won: number; lost: number }> = {};
    (partnerClients as { id: string; partner_id?: string; work_scope_items?: { work_status?: string }[] }[]).forEach(c => {
      if (!c.partner_id) return;
      if (!map[c.partner_id]) map[c.partner_id] = { clients: 0, total: 0, won: 0, lost: 0 };
      map[c.partner_id].clients++;
      (c.work_scope_items || []).forEach(w => {
        map[c.partner_id!].total++;
        if (w.work_status === "won") map[c.partner_id!].won++;
        if (w.work_status === "lost") map[c.partner_id!].lost++;
      });
    });
    return map;
  }, [partnerClients]);

  // ── Last visit per partner ──
  const { data: partnerVisits = {} } = useQuery({
    queryKey: ["partner-last-visits", partnerIds],
    enabled: partnerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("partner_id, visit_date, remarks, created_by")
        .in("partner_id", partnerIds)
        .eq("status", "done")
        .order("visit_date", { ascending: false });

      // Fetch profiles separately to get exec names and avoid FK join issues
      const creatorIds = [...new Set((data || []).map(v => v.created_by).filter(Boolean))];
      const { data: profilesData } = creatorIds.length > 0
        ? await supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds)
        : { data: [] };
      const profileMap = Object.fromEntries((profilesData || []).map(pr => [pr.user_id, pr.full_name]));

      // keep only most recent per partner
      const seen = new Set<string>();
      const result: Record<string, { visit_date: string; remarks: string | null; exec_name: string | null }> = {};
      (data || []).forEach((v: { partner_id: string | null; visit_date: string; remarks: string | null; created_by: string }) => {
        if (!v.partner_id || seen.has(v.partner_id)) return;
        seen.add(v.partner_id);
        result[v.partner_id] = { visit_date: v.visit_date, remarks: v.remarks, exec_name: profileMap[v.created_by] || null };
      });
      return result;
    },
  });

  const isFiltered = !!(search || (filterType && filterType !== "all") || (filterExecutive && filterExecutive !== "all"));

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white leading-none">Partners</h1>
          <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5 font-medium">
            {partners.length} partner{partners.length !== 1 ? "s" : ""} in your network
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-red-500/25 hover:bg-red-700 active:scale-95 transition-all">
              <Plus className="h-4 w-4" />
              Add Partner
            </button>
          </DialogTrigger>
          <DialogContent className="bg-popover">
            <DialogHeader><DialogTitle>New Partner</DialogTitle></DialogHeader>
            <PartnerForm values={form} onChange={setForm} onSubmit={() => createPartner.mutate()} isPending={createPartner.isPending} submitLabel="Save Partner" />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Search + Filter ── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-white/25 pointer-events-none" />
          <input
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/[0.03]
                       text-sm text-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                       focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            placeholder="Search name or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[130px] h-10 rounded-xl border-gray-200 dark:border-white/8 bg-white dark:bg-white/[0.03] text-sm text-foreground">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="builder">Builder</SelectItem>
            <SelectItem value="architect">Architect</SelectItem>
            <SelectItem value="self">Direct</SelectItem>
          </SelectContent>
        </Select>
        {role !== "executive" && (
          <Select value={filterExecutive} onValueChange={setFilterExecutive}>
            <SelectTrigger className="w-[160px] h-10 rounded-xl border-gray-200 dark:border-white/8 bg-white dark:bg-white/[0.03] text-sm text-foreground">
              <SelectValue placeholder="All Executives" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">All Executives</SelectItem>
              {executivesList.map((ex) => (
                <SelectItem key={ex.user_id} value={ex.user_id}>{ex.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState isFiltered={isFiltered} onAdd={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const execName = (p as { _creator_name?: string | null })._creator_name || null;
            const execRole = (p as { _creator_role?: string | null })._creator_role || null;
            const stats = statsMap[p.id] || { clients: 0, total: 0, won: 0, lost: 0 };
            const lastVisit = (partnerVisits as Record<string, { visit_date: string; remarks: string | null; exec_name: string | null }>)[p.id] || null;

            return (
              <PartnerCard
                key={p.id}
                p={p}
                execName={execName}
                execRole={execRole}
                clientCount={stats.clients}
                wosCount={stats.total}
                wonCount={stats.won}
                lostCount={stats.lost}
                lastVisit={lastVisit}
                showClientForm={showClientForm}
                setShowClientForm={setShowClientForm}
                clientForm={clientForm}
                setClientForm={setClientForm}
                createClientForPartner={createClientForPartner}
                openEdit={openEdit}
                setDeletePartner={setDeletePartner}
                setSelectedPartner={setSelectedPartner}
              />
            );
          })}
        </div>
      )}

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editPartner} onOpenChange={(open) => !open && setEditPartner(null)}>
        <DialogContent className="bg-popover">
          <DialogHeader><DialogTitle>Edit — {editPartner?.name}</DialogTitle></DialogHeader>
          <PartnerForm values={editForm} onChange={setEditForm} onSubmit={() => updatePartner.mutate()} isPending={updatePartner.isPending} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deletePartner} onOpenChange={(open) => !open && setDeletePartner(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Partner</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <b>{deletePartner?.name}</b>? Clients linked to this partner will lose their lead source reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletePartner && deletePartnerMutation.mutate(deletePartner.id)} disabled={deletePartnerMutation.isPending}>
              {deletePartnerMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Visit History Sheet ── */}
      <Sheet open={!!selectedPartner} onOpenChange={() => setSelectedPartner(null)}>
        <SheetContent className="overflow-y-auto bg-background sm:max-w-md">
          <SheetHeader><SheetTitle>Partner Details</SheetTitle></SheetHeader>
          <div className="mt-4">
            <h3 className="font-semibold text-sm mb-2 px-1">Visit History</h3>
            {selectedPartner && <VisitHistoryList partnerId={selectedPartner} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Partners;
