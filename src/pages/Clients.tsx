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
import { Plus, Search, Phone, MapPin, Briefcase, Pencil, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import WorkScopeSection from "@/components/WorkScopeSection";
import VisitHistoryList from "@/components/VisitHistoryList";

type ClientStatus = Database["public"]["Enums"]["client_status"];
type Client = Database["public"]["Tables"]["clients"]["Row"] & { partners?: { name: string; type: string } | null };

const emptyForm = { name: "", mobile: "", address: "", city: "", partner_id: "", notes: "", status: "new" as ClientStatus };

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

    {/* ── Lead Source ── */}
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">Lead Source / Partner <span className="text-[10px] text-muted-foreground font-normal">(optional)</span></Label>
      <Select value={values.partner_id} onValueChange={(v) => onChange({ ...values, partner_id: v })}>
        <SelectTrigger className="h-9 text-sm text-foreground">
          <SelectValue placeholder="Select partner..." />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="none">— None —</SelectItem>
          {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>)}
        </SelectContent>
      </Select>
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


const Clients = () => {
  const { user, role, showroomId, showroomIds, reportsTo } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", user?.id, role],
    queryFn: async () => {
      let q = supabase.from("clients").select("*, partners(name, type)").order("created_at", { ascending: false });

      if (role === "executive" && user) {
        // Executive: own clients + TL's clients (if has a TL)
        const ids = [user.id, ...(reportsTo ? [reportsTo] : [])];
        q = q.in("created_by", ids);

      } else if (role === "tl" && user) {
        // TL: own clients + all executives who report to this TL
        const { data: myExecs } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("reports_to", user.id)
          .eq("role", "executive");
        const execIds = (myExecs || []).map((r: any) => r.user_id);
        const ids = [user.id, ...execIds];
        q = q.in("created_by", ids);

      } else if (role === "manager" && showroomIds.length > 0) {
        // Manager: all clients in any of their showrooms
        const { data: teamRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("showroom_id", showroomIds);
        const teamIds = (teamRoles || []).map((r: any) => r.user_id);
        if (teamIds.length > 0) q = q.in("created_by", teamIds);
      }
      // MD / Admin: no filter — see all

      const { data, error } = await q;
      if (error) throw error;
      return data as Client[];
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
        const execIds = (myExecs || []).map((r: any) => r.user_id);
        q = q.in("created_by", [user.id, ...execIds]);
      } else if (role === "manager" && showroomIds.length > 0) {
        const { data: teamRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("showroom_id", showroomIds);
        const teamIds = (teamRoles || []).map((r: any) => r.user_id);
        if (teamIds.length > 0) q = q.in("created_by", teamIds);
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
      (data || []).forEach((item: any) => {
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
      const insertData: any = { ...form, created_by: user!.id };
      if (!insertData.partner_id || insertData.partner_id === 'none') delete insertData.partner_id;
      const { error } = await supabase.from("clients").insert(insertData);
      if (error) throw error;
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
      const updateData: any = { ...editForm };
      if (!updateData.partner_id || updateData.partner_id === 'none') updateData.partner_id = null;
      const { error } = await supabase.from("clients").update(updateData).eq("id", editClient.id);
      if (error) throw error;
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
      partner_id: (c as any).partner_id || "",
      notes: c.notes || "",
      status: c.status,
    });
    setEditClient(c);
  };

  const openDelete = (c: Client, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setDeleteClient(c);
  };

  const filtered = clients.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search);
    const matchStatus = !filterStatus || filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Client</Button>
          </DialogTrigger>
          <DialogContent className="bg-popover max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
            <ClientForm values={form} onChange={setForm} onSubmit={() => createClientMutation.mutate()} isPending={createClientMutation.isPending} submitLabel="Save Client" partners={partners} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or mobile..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem><SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="converted">Converted</SelectItem><SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No clients found.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className={`hover:shadow-md transition-shadow cursor-pointer group relative border-2 ${
                  !(workScopeCounts as any)[c.id]
                    ? 'border-red-400 dark:border-red-500/30'
                    : 'border-border'
                }`} onClick={() => setSelectedClient(c.id)}>
              {/* Action buttons — visible on hover */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 hover:bg-muted" onClick={(e) => openEdit(c, e)} title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 text-destructive hover:bg-destructive/10" onClick={(e) => openDelete(c, e)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold pr-16">{c.name}</h3>
                  <Badge className={`${statusColors[c.status]} capitalize text-xs border-0`}>{c.status}</Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.mobile}</div>
                  {(c.address || c.city) && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[c.address, c.city].filter(Boolean).join(", ")}</div>}
                  {c.partners && <div className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{c.partners.name}</div>}
                </div>
                {/* WOS Tags */}
                <div className="mt-3">
                  {(workScopeByClient[c.id] && workScopeByClient[c.id].length > 0) ? (
                    <div className="flex flex-wrap gap-1.5">
                      {workScopeByClient[c.id].slice(0, 3).map((wos, i) => {
                        const statusStyle =
                          wos.status === 'won'
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/25'
                            : wos.status === 'lost'
                              ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-300 dark:border-red-500/25'
                              : wos.status === 'hold'
                                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/25'
                                : wos.status === 'submitted'
                                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/25'
                                  : 'bg-slate-50 dark:bg-white/[0.04] text-slate-600 dark:text-white/70 border-slate-200 dark:border-white/10';
                        return (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate max-w-[140px] ${statusStyle}`}
                            title={wos.name}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor:
                                wos.status === 'won' ? '#22c55e'
                                : wos.status === 'lost' ? '#ef4444'
                                : wos.status === 'hold' ? '#f59e0b'
                                : wos.status === 'submitted' ? '#3b82f6'
                                : '#94a3b8'
                              }}
                            />
                            <span className="truncate">{wos.name}</span>
                          </span>
                        );
                      })}
                      {workScopeByClient[c.id].length > 3 && (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40 border border-gray-200 dark:border-white/10">
                          +{workScopeByClient[c.id].length - 3} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/25 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                      No WOS Added
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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
      <AlertDialog open={!!deleteClient} onOpenChange={(open) => !open && setDeleteClient(null)}>
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
