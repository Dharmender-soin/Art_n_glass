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

const Clients = () => {
  const { user } = useAuth();
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
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*, partners(name, type)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("id, name, type");
      if (error) throw error;
      return data;
    },
  });

  const { data: workScopeCounts = {} } = useQuery({
    queryKey: ["work-scope-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_scope_items").select("client_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((item) => { counts[item.client_id] = (counts[item.client_id] || 0) + 1; });
      return counts;
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async () => {
      const insertData: any = { ...form, created_by: user!.id };
      if (!insertData.partner_id) delete insertData.partner_id;
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
      if (!updateData.partner_id) updateData.partner_id = null;
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

  const ClientForm = ({ values, onChange, onSubmit, isPending, submitLabel }: {
    values: typeof emptyForm; onChange: (v: typeof emptyForm) => void;
    onSubmit: () => void; isPending: boolean; submitLabel: string;
  }) => (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Name</Label><Input value={values.name} onChange={(e) => onChange({ ...values, name: e.target.value })} required /></div>
        <div className="space-y-1"><Label>Mobile</Label><Input value={values.mobile} onChange={(e) => onChange({ ...values, mobile: e.target.value })} required /></div>
      </div>
      <div className="space-y-1"><Label>Address</Label><Input value={values.address} onChange={(e) => onChange({ ...values, address: e.target.value })} /></div>
      <div className="space-y-1"><Label>City</Label><Input value={values.city} onChange={(e) => onChange({ ...values, city: e.target.value })} /></div>
      <div className="space-y-1">
        <Label>Lead Source (Partner)</Label>
        <Select value={values.partner_id} onValueChange={(v) => onChange({ ...values, partner_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select partner..." /></SelectTrigger>
          <SelectContent className="bg-popover">{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Status</Label>
        <Select value={values.status} onValueChange={(v) => onChange({ ...values, status: v as ClientStatus })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="new">New</SelectItem><SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="converted">Converted</SelectItem><SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label>Notes</Label><Textarea value={values.notes} onChange={(e) => onChange({ ...values, notes: e.target.value })} /></div>
      <Button type="submit" className="w-full" disabled={isPending}>{isPending ? "Saving..." : submitLabel}</Button>
    </form>
  );

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
            <ClientForm values={form} onChange={setForm} onSubmit={() => createClientMutation.mutate()} isPending={createClientMutation.isPending} submitLabel="Save Client" />
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
            <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer group relative" onClick={() => setSelectedClient(c.id)}>
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
                {(workScopeCounts as any)[c.id] && (
                  <div className="mt-2 text-xs font-medium text-primary">{(workScopeCounts as any)[c.id]} work scope items</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editClient} onOpenChange={(open) => !open && setEditClient(null)}>
        <DialogContent className="bg-popover max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Client — {editClient?.name}</DialogTitle></DialogHeader>
          <ClientForm values={editForm} onChange={setEditForm} onSubmit={() => updateClientMutation.mutate()} isPending={updateClientMutation.isPending} submitLabel="Save Changes" />
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
