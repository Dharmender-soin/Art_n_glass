import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, CalendarCheck, MapPin, Camera } from "lucide-react";
import { format, isToday, parseISO } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type VisitStatus = Database["public"]["Enums"]["visit_status"];
type VisitWithType = Database["public"]["Enums"]["visit_with_type"];

const visitStatusColors: Record<VisitStatus, string> = {
  planned: "bg-[hsl(var(--status-new))] text-white",
  done: "bg-[hsl(var(--status-converted))] text-white",
  cancelled: "bg-[hsl(var(--status-lost))] text-white",
};

const Visits = () => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [doneDialogId, setDoneDialogId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [filterStatus, setFilterStatus] = useState("");

  const [form, setForm] = useState({
    visit_date: format(new Date(), "yyyy-MM-dd"),
    visit_with_type: "client" as VisitWithType,
    client_id: "",
    partner_id: "",
    address: "",
    purpose: "",
  });

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["visits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name), partners(name)")
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, address");
      if (error) throw error;
      return data;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partners-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("id, name, address");
      if (error) throw error;
      return data;
    },
  });

  const createVisit = useMutation({
    mutationFn: async () => {
      const insertData: any = {
        visit_date: form.visit_date,
        visit_with_type: form.visit_with_type,
        address: form.address,
        purpose: form.purpose,
        created_by: user!.id,
      };
      if (form.visit_with_type === "client") insertData.client_id = form.client_id;
      else insertData.partner_id = form.partner_id;
      const { error } = await supabase.from("visits").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      toast.success("Visit planned!");
      setForm({ visit_date: format(new Date(), "yyyy-MM-dd"), visit_with_type: "client", client_id: "", partner_id: "", address: "", purpose: "" });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markDone = useMutation({
    mutationFn: async (visitId: string) => {
      if (!remarks.trim()) throw new Error("Remarks are required");

      let photoUrl: string | null = null;
      if (photo) {
        const ext = photo.name.split(".").pop();
        const path = `${user!.id}/${visitId}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("visit-photos").upload(path, photo, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("visit-photos").getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }

      let gpsLat: number | null = null;
      let gpsLng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        );
        gpsLat = pos.coords.latitude;
        gpsLng = pos.coords.longitude;
      } catch {
        // GPS optional — continue without
      }

      const { error } = await supabase.from("visits").update({
        status: "done" as VisitStatus,
        remarks,
        photo_url: photoUrl,
        gps_latitude: gpsLat,
        gps_longitude: gpsLng,
        done_at: new Date().toISOString(),
      }).eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      toast.success("Visit marked done!");
      setDoneDialogId(null);
      setRemarks("");
      setPhoto(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelVisit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("visits").update({ status: "cancelled" as VisitStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      toast.success("Visit cancelled");
    },
  });

  const handleSelectEntity = (id: string) => {
    if (form.visit_with_type === "client") {
      const c = clients.find((x) => x.id === id);
      setForm({ ...form, client_id: id, address: c?.address || "" });
    } else {
      const p = partners.find((x) => x.id === id);
      setForm({ ...form, partner_id: id, address: p?.address || "" });
    }
  };

  const canMarkDone = (visit: any) => {
    if (visit.status !== "planned") return false;
    const isManager = role === "admin" || role === "manager";
    return isManager || isToday(parseISO(visit.visit_date));
  };

  const filtered = visits.filter((v) => !filterStatus || filterStatus === "all" || v.status === filterStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Visits</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" />Plan Visit</Button>
          </DialogTrigger>
          <DialogContent className="bg-popover">
            <DialogHeader><DialogTitle>Plan Visit</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createVisit.mutate(); }} className="space-y-3">
              <div className="space-y-1"><Label>Visit Date</Label><Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} required /></div>
              <div className="space-y-1">
                <Label>Visit With</Label>
                <Select value={form.visit_with_type} onValueChange={(v) => setForm({ ...form, visit_with_type: v as VisitWithType, client_id: "", partner_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover"><SelectItem value="client">Client</SelectItem><SelectItem value="partner">Partner</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{form.visit_with_type === "client" ? "Select Client" : "Select Partner"}</Label>
                <Select value={form.visit_with_type === "client" ? form.client_id : form.partner_id} onValueChange={handleSelectEntity}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {(form.visit_with_type === "client" ? clients : partners).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1"><Label>Purpose</Label><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} required /></div>
              <Button type="submit" className="w-full" disabled={createVisit.isPending}>Save Visit</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Select value={filterStatus} onValueChange={setFilterStatus}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="planned">Planned</SelectItem><SelectItem value="done">Done</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No visits found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold">{(v as any).clients?.name || (v as any).partners?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{v.visit_with_type}</p>
                  </div>
                  <Badge className={`${visitStatusColors[v.status]} capitalize text-xs border-0`}>{v.status}</Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1"><CalendarCheck className="h-3 w-3" />{format(parseISO(v.visit_date), "dd MMM yyyy")}</div>
                  {v.address && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{v.address}</div>}
                  <p className="text-xs">Purpose: {v.purpose}</p>
                  {v.remarks && <p className="text-xs italic">Remarks: {v.remarks}</p>}
                </div>
                {v.status === "planned" && (
                  <div className="flex gap-2 mt-3">
                    {canMarkDone(v) && (
                      <Button size="sm" onClick={() => setDoneDialogId(v.id)}>Mark Done</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => cancelVisit.mutate(v.id)}>Cancel</Button>
                  </div>
                )}
                {v.photo_url && (
                  <div className="mt-2">
                    <img src={v.photo_url} alt="Visit photo" className="h-20 w-20 rounded-lg object-cover" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Done dialog */}
      <Dialog open={!!doneDialogId} onOpenChange={() => setDoneDialogId(null)}>
        <DialogContent className="bg-popover">
          <DialogHeader><DialogTitle>Mark Visit Done</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (doneDialogId) markDone.mutate(doneDialogId); }} className="space-y-3">
            <div className="space-y-1"><Label>Remarks *</Label><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} required /></div>
            <div className="space-y-1">
              <Label>Photo (optional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </div>
            <p className="text-xs text-muted-foreground">GPS location will be captured automatically.</p>
            <Button type="submit" className="w-full" disabled={markDone.isPending}>Confirm Done</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Visits;
