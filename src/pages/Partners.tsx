import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, Building2, Phone, MapPin } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Partner = Database["public"]["Tables"]["partners"]["Row"];
type PartnerType = Database["public"]["Enums"]["partner_type"];

const Partners = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showClientForm, setShowClientForm] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({ type: "builder" as PartnerType, name: "", mobile: "", company_name: "", address: "", city: "" });
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
      setForm({ type: "builder", name: "", mobile: "", company_name: "", address: "", city: "" });
      setDialogOpen(false);
      setShowClientForm(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createClientForPartner = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase.from("clients").insert({
        ...clientForm,
        partner_id: partnerId,
        created_by: user!.id,
      });
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

  const filtered = partners.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.mobile.includes(search);
    const matchCity = !filterCity || p.city?.toLowerCase().includes(filterCity.toLowerCase());
    const matchType = !filterType || p.type === filterType;
    return matchSearch && matchCity && matchType;
  });

  const cities = [...new Set(partners.map((p) => p.city).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Partners</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add Partner</Button>
          </DialogTrigger>
          <DialogContent className="bg-popover">
            <DialogHeader><DialogTitle>New Partner</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createPartner.mutate(); }} className="space-y-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PartnerType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover"><SelectItem value="builder">Builder</SelectItem><SelectItem value="architect">Architect</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="space-y-1"><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required /></div>
              </div>
              <div className="space-y-1"><Label>Company</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={createPartner.isPending}>Save Partner</Button>
            </form>
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
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
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
                  <form onSubmit={(e) => { e.preventDefault(); createClientForPartner.mutate(p.id); }} className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">Quick Add Client</p>
                    <Input placeholder="Client Name" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} required />
                    <Input placeholder="Mobile" value={clientForm.mobile} onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })} required />
                    <Input placeholder="City" value={clientForm.city} onChange={(e) => setClientForm({ ...clientForm, city: e.target.value })} />
                    <div className="flex gap-2">
                      <Button size="sm" type="submit" disabled={createClientForPartner.isPending}>Save Client</Button>
                      <Button size="sm" variant="outline" type="button" onClick={() => setShowClientForm(null)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setShowClientForm(p.id)}>
                    <Plus className="mr-1 h-3 w-3" />Add Client
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Partners;
