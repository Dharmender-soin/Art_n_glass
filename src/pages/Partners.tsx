import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Plus, Search, Building2, Phone, MapPin, Pencil, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import VisitHistoryList from "@/components/VisitHistoryList";

type Partner = Database["public"]["Tables"]["partners"]["Row"];
type PartnerType = Database["public"]["Enums"]["partner_type"];

const emptyForm = { type: "builder" as PartnerType, name: "", mobile: "", company_name: "", address: "", city: "" };

// ─── Hoisted outside Partners so it never remounts on parent re-render ───────
const PartnerForm = ({ values, onChange, onSubmit, isPending, submitLabel }: {
  values: typeof emptyForm; onChange: (v: typeof emptyForm) => void;
  onSubmit: () => void; isPending: boolean; submitLabel: string;
}) => (
  <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
    <div className="space-y-1">
      <Label>Type</Label>
      <Select value={values.type} onValueChange={(v) => onChange({ ...values, type: v as PartnerType })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent className="bg-popover"><SelectItem value="builder">Builder</SelectItem><SelectItem value="architect">Architect</SelectItem></SelectContent>
      </Select>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1"><Label>Name</Label><Input value={values.name} onChange={(e) => onChange({ ...values, name: e.target.value })} required /></div>
      <div className="space-y-1"><Label>Mobile</Label><Input value={values.mobile} onChange={(e) => onChange({ ...values, mobile: e.target.value })} required /></div>
    </div>
    <div className="space-y-1"><Label>Company</Label><Input value={values.company_name} onChange={(e) => onChange({ ...values, company_name: e.target.value })} /></div>
    <div className="space-y-1"><Label>Address</Label><Input value={values.address} onChange={(e) => onChange({ ...values, address: e.target.value })} /></div>
    <div className="space-y-1"><Label>City</Label><Input value={values.city} onChange={(e) => onChange({ ...values, city: e.target.value })} /></div>
    <Button type="submit" className="w-full" disabled={isPending}>{isPending ? "Saving..." : submitLabel}</Button>
  </form>
);

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
    setEditForm({
      type: p.type,
      name: p.name,
      mobile: p.mobile,
      company_name: p.company_name || "",
      address: p.address || "",
      city: p.city || "",
    });
    setEditPartner(p);
  };

  const filtered = partners.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.mobile.includes(search);
    const matchCity = !filterCity || p.city?.toLowerCase().includes(filterCity.toLowerCase());
    const matchType = !filterType || filterType === "all" || p.type === filterType;
    return matchSearch && matchCity && matchType;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Partners</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Partner</Button>
          </DialogTrigger>
          <DialogContent className="bg-popover">
            <DialogHeader><DialogTitle>New Partner</DialogTitle></DialogHeader>
            <PartnerForm values={form} onChange={setForm} onSubmit={() => createPartner.mutate()} isPending={createPartner.isPending} submitLabel="Save Partner" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name or mobile..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="builder">Builder</SelectItem>
            <SelectItem value="architect">Architect</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No partners found. Add your first partner!</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow group relative cursor-pointer" onClick={() => setSelectedPartner(p.id)}>
              {/* Action buttons — visible on hover */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 hover:bg-muted" onClick={(e) => openEdit(p, e)} title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setDeletePartner(p); }} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="pr-16">
                    <h3 className="font-semibold">{p.name}</h3>
                    {p.company_name && <p className="text-sm text-muted-foreground">{p.company_name}</p>}
                  </div>
                  <Badge variant={p.type === "builder" ? "default" : "secondary"} className="capitalize text-xs">{p.type}</Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.mobile}</div>
                  {p.city && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.city}</div>}
                </div>
                {showClientForm === p.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); createClientForPartner.mutate(p.id); }} className="mt-3 space-y-2 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                    <p className="text-sm font-medium">Quick Add Client</p>
                    <Input placeholder="Client Name" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} required />
                    <Input placeholder="Mobile" value={clientForm.mobile} onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })} required />
                    <Input placeholder="Address" value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} />
                    <Input placeholder="City" value={clientForm.city} onChange={(e) => setClientForm({ ...clientForm, city: e.target.value })} />
                    <div className="flex gap-2">
                      <Button size="sm" type="submit" disabled={createClientForPartner.isPending}>Save Client</Button>
                      <Button size="sm" variant="outline" type="button" onClick={() => setShowClientForm(null)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <Button size="sm" variant="outline" className="mt-3 w-full" onClick={(e) => { e.stopPropagation(); setShowClientForm(p.id); }}>
                    <Plus className="mr-1 h-3 w-3" />Add Client
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editPartner} onOpenChange={(open) => !open && setEditPartner(null)}>
        <DialogContent className="bg-popover">
          <DialogHeader><DialogTitle>Edit Partner — {editPartner?.name}</DialogTitle></DialogHeader>
          <PartnerForm values={editForm} onChange={setEditForm} onSubmit={() => updatePartner.mutate()} isPending={updatePartner.isPending} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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

      {/* Visit History Sheet */}
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
