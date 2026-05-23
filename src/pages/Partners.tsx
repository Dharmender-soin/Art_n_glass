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
import { Plus, Search, Phone, MapPin, Pencil, Trash2, Building2, Users, ChevronDown, X } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import VisitHistoryList from "@/components/VisitHistoryList";

type Partner = Database["public"]["Tables"]["partners"]["Row"];
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

/* ─── Partner Card ─────────────────────────────────────────── */
const PartnerCard = ({
  p,
  showClientForm,
  setShowClientForm,
  clientForm,
  setClientForm,
  createClientForPartner,
  openEdit,
  setDeletePartner,
  setSelectedPartner,
}: any) => (
  <div
    className="group relative bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-100 dark:border-white/5
               shadow-sm hover:shadow-md dark:hover:shadow-none
               hover:border-gray-200 dark:hover:border-white/10
               transition-all duration-200 cursor-pointer
               hover:-translate-y-0.5 active:scale-[0.99]"
    onClick={() => setSelectedPartner(p.id)}
  >
    {/* Action buttons — top right, visible on hover */}
    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
      <button
        className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 flex items-center justify-center transition-colors"
        onClick={(e) => openEdit(p, e)}
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5 text-gray-500 dark:text-white/60" />
      </button>
      <button
        className="h-7 w-7 rounded-lg bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 flex items-center justify-center transition-colors"
        onClick={(e) => { e.stopPropagation(); setDeletePartner(p); }}
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-500" />
      </button>
    </div>

    <div className="p-4">
      {/* Top row: avatar + info + badge */}
      <div className="flex items-start gap-3 mb-3">
        <PartnerAvatar name={p.name} type={p.type} />
        <div className="flex-1 min-w-0 pr-14">
          <h3 className="font-bold text-[15px] text-gray-900 dark:text-white leading-tight truncate">
            {p.name}
          </h3>
          {p.company_name && (
            <p className="text-xs text-gray-400 dark:text-white/40 font-medium mt-0.5 truncate">
              {p.company_name}
            </p>
          )}
        </div>
        <div className="absolute top-4 right-[72px] group-hover:right-[76px] transition-all">
          <TypeBadge type={p.type} />
        </div>
      </div>

      {/* Contact info */}
      <div className="space-y-1.5 mb-3 pl-14">
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-gray-400 dark:text-white/30 shrink-0" />
          <span className="text-sm text-gray-600 dark:text-white/60 font-medium">{p.mobile}</span>
        </div>
        {p.city && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-gray-400 dark:text-white/30 shrink-0" />
            <span className="text-sm text-gray-500 dark:text-white/50 capitalize">{p.city}</span>
          </div>
        )}
      </div>

      {/* Add Client section */}
      {showClientForm === p.id ? (
        <form
          onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); createClientForPartner.mutate(p.id); }}
          className="mt-2 space-y-2.5 border-t border-gray-100 dark:border-white/5 pt-3"
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
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setShowClientForm(p.id); }}
          className="w-full mt-1 h-9 rounded-xl border border-dashed border-gray-200 dark:border-white/10
                     text-xs font-semibold text-gray-400 dark:text-white/30
                     hover:border-primary/40 hover:text-primary hover:bg-red-50/50 dark:hover:bg-red-500/5
                     transition-all flex items-center justify-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Client
        </button>
      )}
    </div>
  </div>
);

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<Partner | null>(null);
  const [deletePartner, setDeletePartner] = useState<Partner | null>(null);
  const [showClientForm, setShowClientForm] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [clientForm, setClientForm] = useState({ name: "", mobile: "", address: "", city: "", notes: "", status: "new" as const });

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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
    return matchSearch && matchCity && matchType;
  });

  const isFiltered = !!(search || filterType);

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
      <div className="flex gap-2">
        <div className="relative flex-1">
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
          {filtered.map((p) => (
            <PartnerCard
              key={p.id}
              p={p}
              showClientForm={showClientForm}
              setShowClientForm={setShowClientForm}
              clientForm={clientForm}
              setClientForm={setClientForm}
              createClientForPartner={createClientForPartner}
              openEdit={openEdit}
              setDeletePartner={setDeletePartner}
              setSelectedPartner={setSelectedPartner}
            />
          ))}
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
