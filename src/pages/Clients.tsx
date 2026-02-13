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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Plus, Search, Phone, MapPin, Briefcase } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import WorkScopeSection from "@/components/WorkScopeSection";

type ClientStatus = Database["public"]["Enums"]["client_status"];

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", mobile: "", address: "", city: "", partner_id: "", notes: "", status: "new" as ClientStatus });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*, partners(name, type)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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

  const createClient = useMutation({
    mutationFn: async () => {
      const insertData: any = { ...form, created_by: user!.id };
      if (!insertData.partner_id) delete insertData.partner_id;
      const { error } = await supabase.from("clients").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client created!");
      setForm({ name: "", mobile: "", address: "", city: "", partner_id: "", notes: "", status: "new" });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = clients.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search);
    const matchStatus = !filterStatus || filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Client</Button>
          </DialogTrigger>
          <DialogContent className="bg-popover max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createClient.mutate(); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="space-y-1"><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required /></div>
              </div>
              <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="space-y-1">
                <Label>Lead Source (Partner)</Label>
                <Select value={form.partner_id} onValueChange={(v) => setForm({ ...form, partner_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select partner..." /></SelectTrigger>
                  <SelectContent className="bg-popover">{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ClientStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="new">New</SelectItem><SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem><SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={createClient.isPending}>Save Client</Button>
            </form>
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
            <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedClient(c.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold">{c.name}</h3>
                  <Badge className={`${statusColors[c.status]} capitalize text-xs border-0`}>{c.status}</Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.mobile}</div>
                  {(c.address || c.city) && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[c.address, c.city].filter(Boolean).join(", ")}</div>}
                  {(c as any).partners && <div className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{(c as any).partners.name}</div>}
                </div>
                {(workScopeCounts as any)[c.id] && (
                  <div className="mt-2 text-xs font-medium text-primary">
                    {(workScopeCounts as any)[c.id]} work scope items
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <SheetContent className="overflow-y-auto bg-background">
          <SheetHeader><SheetTitle>Work Scope</SheetTitle></SheetHeader>
          {selectedClient && <WorkScopeSection clientId={selectedClient} />}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Clients;
