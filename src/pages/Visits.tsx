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
import { Plus, CalendarCheck, MapPin, Camera, Loader2 } from "lucide-react";
import { format, isToday, isTomorrow, parseISO, addDays } from "date-fns";
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
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");

  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

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
        .select("*, clients(name, address), partners(name, address)")
        .order("visit_date", { ascending: false });
      if (error) throw error;

      const visitsWithSignedUrls = await Promise.all(
        (data || []).map(async (v) => {
          if (v.photo_url && !v.photo_url.startsWith("http")) {
            const { data: urlData } = await supabase.storage
              .from("visit-photos")
              .createSignedUrl(v.photo_url, 3600);
            return { ...v, _signed_photo_url: urlData?.signedUrl || null };
          }
          return { ...v, _signed_photo_url: v.photo_url };
        })
      );
      return visitsWithSignedUrls;
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

      // GPS is mandatory
      setGpsLoading(true);
      setGpsError("");
      let gpsLat: number;
      let gpsLng: number;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, enableHighAccuracy: true })
        );
        gpsLat = pos.coords.latitude;
        gpsLng = pos.coords.longitude;
      } catch {
        setGpsLoading(false);
        throw new Error("GPS location is required. Please enable location access and try again.");
      }
      setGpsLoading(false);

      let photoPath: string | null = null;
      if (photo) {
        const ext = photo.name.split(".").pop();
        const path = `${user!.id}/${visitId}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("visit-photos").upload(path, photo, { upsert: true });
        if (uploadError) throw uploadError;
        photoPath = path;
      }

      const { error } = await supabase.from("visits").update({
        status: "done" as VisitStatus,
        remarks,
        photo_url: photoPath,
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

  // Executives can plan today + tomorrow only
  const canPlanDate = (date: string) => {
    if (role === "admin" || role === "manager") return true;
    const d = parseISO(date);
    return isToday(d) || isTomorrow(d);
  };

  const filtered = visits.filter((v) => !filterStatus || filterStatus === "all" || v.status === filterStatus);

  // Group visits by date
  const groupedByDate = filtered.reduce((acc, v) => {
    const dateKey = v.visit_date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(v);
    return acc;
  }, {} as Record<string, typeof filtered>);

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const getDateLabel = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "dd MMM yyyy, EEEE");
  };

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
            <form onSubmit={(e) => { e.preventDefault(); if (!canPlanDate(form.visit_date)) { toast.error("You can only plan visits for today or tomorrow"); return; } createVisit.mutate(); }} className="space-y-3">
              <div className="space-y-1"><Label>Visit Date</Label><Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} required /></div>
              <div className="space-y-1">
                <Label>Visit With</Label>
                <Select value={form.visit_with_type} onValueChange={(v) => setForm({ ...form, visit_with_type: v as VisitWithType, client_id: "", partner_id: "", address: "" })}>
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
              <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Auto-filled from client/partner" /></div>
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
      ) : sortedDates.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No visits found.</p>
      ) : (
        <div className="space-y-5">
          {sortedDates.map((dateKey) => (
            <div key={dateKey}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-primary">
                  {getDateLabel(dateKey)}
                </h2>
                <Badge variant="secondary" className="text-[10px]">{groupedByDate[dateKey].length}</Badge>
              </div>
              <div className="space-y-2">
                {groupedByDate[dateKey].map((v) => (
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
                      {(v as any)._signed_photo_url && (
                        <div className="mt-2">
                          <img src={(v as any)._signed_photo_url} alt="Visit photo" className="h-20 w-20 rounded-lg object-cover" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Done dialog — GPS mandatory */}
      <Dialog open={!!doneDialogId} onOpenChange={() => { setDoneDialogId(null); setGpsError(""); }}>
        <DialogContent className="bg-popover">
          <DialogHeader><DialogTitle>Mark Visit Done</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (doneDialogId) markDone.mutate(doneDialogId); }} className="space-y-3">
            <div className="space-y-1"><Label>Remarks *</Label><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} required /></div>
            <div className="space-y-1">
              <Label>Photo (optional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> GPS location will be captured (required).
            </p>
            {gpsError && <p className="text-xs text-destructive">{gpsError}</p>}
            <Button type="submit" className="w-full" disabled={markDone.isPending}>
              {markDone.isPending ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Capturing GPS...</> : "Confirm Done"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Visits;
