import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePurposes } from "@/hooks/usePurposes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, CalendarCheck, MapPin, Camera, Loader2, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, isToday, isTomorrow, parseISO, addDays } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import { calculateDistance, calculateRouteDistance } from "@/lib/utils";
import { useJsApiLoader, Autocomplete } from "@react-google-maps/api";

const libraries: ("places")[] = ["places"];

import { TripMap } from "@/components/TripMap";

type VisitStatus = Database["public"]["Enums"]["visit_status"];
type VisitWithType = Database["public"]["Enums"]["visit_with_type"];

const visitStatusColors: Record<string, string> = {
  planned: "bg-[hsl(var(--status-new))] text-white",
  in_progress: "bg-blue-500 text-white",
  done: "bg-[hsl(var(--status-converted))] text-white",
  missed: "bg-red-500 text-white",
  rescheduled: "bg-orange-500 text-white",
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
  const [search, setSearch] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const [conveyanceModalInfo, setConveyanceModalInfo] = useState<{distance: number, amount: number, vehicle: string, from: string, to: string, fromLat: number, fromLng: number, toLat: number, toLng: number} | null>(null);
  
  const [editVisitId, setEditVisitId] = useState<string | null>(null);
  const [editVisitDate, setEditVisitDate] = useState("");

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const onLoadAutocomplete = (autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();
      if (place.formatted_address) {
        setForm((prev) => ({ ...prev, address: place.formatted_address || "" }));
      } else if (place.name) {
        setForm((prev) => ({ ...prev, address: place.name || "" }));
      }
    }
  };

  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const [form, setForm] = useState({
    visit_date: format(new Date(), "yyyy-MM-dd"),
    visit_with_type: "client" as VisitWithType,
    client_id: "",
    partner_id: "",
    address: "",
    purpose_id: "",
    travel_mode: "own" as "own" | "pooled",
    pooled_with_user_id: "",
  });

  const { data: purposes = [] } = usePurposes(form.visit_with_type);

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
      const { data, error } = await supabase.from("clients").select("id, name, address, city");
      if (error) throw error;
      return data;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partners-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("id, name, address, city");
      if (error) throw error;
      return data;
    },
  });

  // Fetch showroom colleagues for pooled travel selection
  const { data: colleagues = [] } = useQuery({
    queryKey: ["colleagues-list"],
    queryFn: async () => {
      if (!user) return [];
      // Get the current user's showroom
      const { data: myRole } = await supabase
        .from("user_roles")
        .select("showroom_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!myRole?.showroom_id) return [];
      // Get all executives in same showroom
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("showroom_id", myRole.showroom_id)
        .eq("role", "executive")
        .neq("user_id", user.id);
      if (!roles?.length) return [];
      const ids = roles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, conveyance_type, conveyance_rate")
        .in("user_id", ids);
      return profiles || [];
    },
    enabled: !!user,
  });

  const createVisit = useMutation({
    mutationFn: async () => {
      const insertData: any = {
        visit_date: form.visit_date,
        visit_with_type: form.visit_with_type,
        address: form.address,
        purpose_id: form.purpose_id,
        purpose: purposes.find(p => p.id === form.purpose_id)?.purpose_name || "Meeting",
        created_by: user!.id,
        travel_mode: form.travel_mode,
        pooled_with_user_id: form.travel_mode === "pooled" && form.pooled_with_user_id ? form.pooled_with_user_id : null,
      };
      if (form.visit_with_type === "client") insertData.client_id = form.client_id;
      else insertData.partner_id = form.partner_id;
      const { error } = await supabase.from("visits").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      toast.success("Visit planned!");
      setForm({ visit_date: format(new Date(), "yyyy-MM-dd"), visit_with_type: "client", client_id: "", partner_id: "", address: "", purpose_id: "", travel_mode: "own", pooled_with_user_id: "" });
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

      const { data: profile } = await supabase.from("profiles").select("conveyance_type, conveyance_rate").eq("user_id", user!.id).single();

      const today = format(new Date(), "yyyy-MM-dd");
      const { data: lastVisit } = await supabase.from("visits")
        .select("*")
        .eq("created_by", user!.id)
        .eq("visit_date", today)
        .eq("status", "done")
        .neq("id", visitId)
        .order("done_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let fromLat: number | null = null;
      let fromLng: number | null = null;
      let fromLocationName = "Unknown Location";

      if (lastVisit && lastVisit.gps_latitude && lastVisit.gps_longitude) {
         fromLat = lastVisit.gps_latitude;
         fromLng = lastVisit.gps_longitude;
         fromLocationName = lastVisit.address || "Previous Visit";
      } else {
         const { data: attendance } = await supabase.from("daily_attendance")
           .select("*")
           .eq("user_id", user!.id)
           .eq("date", today)
           .maybeSingle();
         
         if (attendance) {
            fromLat = attendance.check_in_lat;
            fromLng = attendance.check_in_lng;
            fromLocationName = "Start Day Check-In";
         }
      }

      // ─── Pooled Passenger: skip conveyance ───
      const { data: visitForMode } = await supabase.from("visits").select("travel_mode, pooled_with_user_id").eq("id", visitId).single();
      if (visitForMode?.travel_mode === "pooled") {
        const { error } = await supabase.from("visits").update({
          status: "done" as VisitStatus,
          remarks,
          photo_url: photoPath,
          gps_latitude: gpsLat,
          gps_longitude: gpsLng,
          done_at: new Date().toISOString(),
        }).eq("id", visitId);
        if (error) throw error;
        toast.success("Visit marked done! (No conveyance — pooled trip)");
        return null;
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

      let convResult = null;
      if (fromLat && fromLng && profile?.conveyance_type) {
         const distance = await calculateRouteDistance(fromLat, fromLng, gpsLat, gpsLng);
         const amount = Number((distance * (profile.conveyance_rate || 0)).toFixed(2));
         
         const { data: currentVisit } = await supabase.from("visits").select("address").eq("id", visitId).single();
         const toLocationName = currentVisit?.address || "Visit Location";

         // Note: Assuming conveyance_type exists in Database Types, if it fails, it's bypassed in TS anyway if cast implicitly
         const { error: convError } = await supabase.from("conveyance_records").insert({
             user_id: user!.id,
             visit_id: visitId,
             date: today,
             from_location_name: fromLocationName,
             from_lat: fromLat,
             from_lng: fromLng,
             to_location_name: toLocationName,
             to_lat: gpsLat,
             to_lng: gpsLng,
             distance_km: distance,
             vehicle_type: profile.conveyance_type,
             rate_per_km: profile.conveyance_rate || 0,
             amount: amount
         });
         
         if (!convError && distance > 0) {
             convResult = { distance, amount, vehicle: profile.conveyance_type, from: fromLocationName, to: toLocationName, fromLat, fromLng, toLat: gpsLat, toLng: gpsLng };
         }
      }
      return convResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      setDoneDialogId(null);
      setRemarks("");
      setPhoto(null);
      if (data) {
          setConveyanceModalInfo(data);
      } else {
          toast.success("Visit marked done!");
      }
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

  const checkIn = useMutation({
    mutationFn: async (visitId: string) => {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, enableHighAccuracy: true })
      );
      const { error } = await supabase.from("visits").update({
        status: "in_progress" as VisitStatus,
        check_in_at: new Date().toISOString(),
        check_in_lat: pos.coords.latitude,
        check_in_lng: pos.coords.longitude,
      }).eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      toast.success("Checked in! Timer started.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateVisitDate = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: string }) => {
      const { error } = await supabase.from("visits").update({ visit_date: newDate }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      toast.success("Visit rescheduled");
      setEditVisitId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSelectEntity = (id: string) => {
    if (form.visit_with_type === "client") {
      const c = clients.find((x) => x.id === id);
      setForm({ ...form, client_id: id, address: c?.address || c?.city || "" });
    } else {
      const p = partners.find((x) => x.id === id);
      setForm({ ...form, partner_id: id, address: p?.address || p?.city || "" });
    }
  };

  const canMarkDone = (visit: any) => {
    if (visit.status !== "planned") return false;
    // Only allow marking done if visit date is today
    if (!isToday(parseISO(visit.visit_date))) return false;
    return true;
  };

  // Executives can plan today + tomorrow only
  const canPlanDate = (date: string) => {
    if (role === "admin" || role === "manager") return true;
    const d = parseISO(date);
    return isToday(d) || isTomorrow(d);
  };

  const filtered = visits.filter((v) => {
    const matchStatus = !filterStatus || filterStatus === "all" || v.status === filterStatus;
    const clientName = (v as any).clients?.name || "";
    const partnerName = (v as any).partners?.name || "";
    const address = v.address || "";
    const remarks = v.remarks || "";
    const purpose = v.purpose || "";
    const searchLower = search.toLowerCase();
    
    const matchSearch = !search || 
      clientName.toLowerCase().includes(searchLower) || 
      partnerName.toLowerCase().includes(searchLower) ||
      address.toLowerCase().includes(searchLower) ||
      remarks.toLowerCase().includes(searchLower) ||
      purpose.toLowerCase().includes(searchLower);
      
    return matchStatus && matchSearch;
  });

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

  const toggleDate = (dateKey: string) => {
    setOpenDates((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  const isDateOpen = (dateKey: string) => {
    return !!openDates[dateKey];
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
                <Select value={form.visit_with_type} onValueChange={(v) => setForm({ ...form, visit_with_type: v as VisitWithType, client_id: "", partner_id: "", address: "", purpose_id: "" })}>
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
              <div className="space-y-1">
                <Label>Address</Label>
                {isLoaded ? (
                  <Autocomplete onLoad={onLoadAutocomplete} onPlaceChanged={onPlaceChanged}>
                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Search or auto-filled from client/partner" />
                  </Autocomplete>
                ) : (
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Auto-filled from client/partner" />
                )}
              </div>
              <div className="space-y-1">
                <Label>Purpose</Label>
                <Select value={form.purpose_id} onValueChange={(v) => setForm({ ...form, purpose_id: v })} required>
                  <SelectTrigger><SelectValue placeholder="Select purpose..." /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {purposes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.purpose_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Travel Mode */}
              <div className="space-y-2 pt-1 border-t border-border">
                <Label className="text-sm font-semibold">🚗 How will you travel?</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, travel_mode: "own", pooled_with_user_id: "" })}
                    className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                      form.travel_mode === "own"
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    🏍️ Own Vehicle
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, travel_mode: "pooled" })}
                    className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                      form.travel_mode === "pooled"
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    🚗 With Colleague
                  </button>
                </div>
                {form.travel_mode === "pooled" && (
                  <div className="space-y-1 mt-2">
                    <Label>Select Colleague (vehicle owner)</Label>
                    <Select value={form.pooled_with_user_id} onValueChange={(v) => setForm({ ...form, pooled_with_user_id: v })} required>
                      <SelectTrigger><SelectValue placeholder="Select colleague..." /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        {colleagues.length === 0 ? (
                          <SelectItem value="none" disabled>No colleagues found</SelectItem>
                        ) : (
                          colleagues.map((c) => (
                            <SelectItem key={c.user_id} value={c.user_id}>
                              {c.full_name} ({c.conveyance_type || "vehicle"}, ₹{c.conveyance_rate || 0}/km)
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">⚠️ No conveyance will be claimed for pooled travel.</p>
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={createVisit.isPending}>Save Visit</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!conveyanceModalInfo} onOpenChange={(open) => !open && setConveyanceModalInfo(null)}>
        <DialogContent className="bg-popover sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-primary"><MapPin className="h-5 w-5"/> Trip Summary</DialogTitle></DialogHeader>
          {conveyanceModalInfo && (
            <div className="space-y-4 py-2">
               <div className="rounded-xl bg-muted/50 p-4 border border-border">
                  <div className="flex justify-between items-center mb-3">
                     <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Mode</span>
                     <Badge variant="outline" className="capitalize bg-background">{conveyanceModalInfo.vehicle}</Badge>
                  </div>
                  <div className="space-y-3 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                     <div className="relative flex items-center gap-3">
                        <div className="h-6 w-6 rounded-full bg-background border-2 border-border flex items-center justify-center z-10"><div className="h-2 w-2 rounded-full bg-muted-foreground"/></div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{conveyanceModalInfo.from}</p><p className="text-[10px] text-muted-foreground uppercase">From</p></div>
                     </div>
                     <div className="relative flex items-center gap-3">
                        <div className="h-6 w-6 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center z-10"><div className="h-2 w-2 rounded-full bg-primary"/></div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{conveyanceModalInfo.to}</p><p className="text-[10px] text-muted-foreground uppercase">To</p></div>
                     </div>
                  </div>
               </div>
               
               <div className="grid grid-cols-2 gap-3">
                   <div className="bg-card border border-border rounded-xl p-3 flex flex-col items-center justify-center text-center">
                       <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Distance</p>
                       <p className="text-xl font-bold font-mono">{conveyanceModalInfo.distance} <span className="text-sm text-muted-foreground font-sans">km</span></p>
                   </div>
                   <div className="bg-card border border-border rounded-xl p-3 flex flex-col items-center justify-center text-center">
                       <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Generated</p>
                       <p className="text-xl font-bold font-mono text-green-500">₹{conveyanceModalInfo.amount}</p>
                   </div>
               </div>
               
               <TripMap 
                 fromLat={conveyanceModalInfo.fromLat} 
                 fromLng={conveyanceModalInfo.fromLng} 
                 toLat={conveyanceModalInfo.toLat} 
                 toLng={conveyanceModalInfo.toLng} 
               />
            </div>
          )}
          <Button onClick={() => setConveyanceModalInfo(null)} className="w-full">Done</Button>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search visits, clients, address..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="planned">Planned</SelectItem><SelectItem value="done">Done</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : sortedDates.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No visits found.</p>
      ) : (
        <div className="space-y-5">
          {sortedDates.map((dateKey) => (
            <Collapsible key={dateKey} open={isDateOpen(dateKey)} onOpenChange={() => toggleDate(dateKey)}>
              <CollapsibleTrigger className="w-full">
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer ${isDateOpen(dateKey) ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-card border-border hover:border-primary/20 hover:bg-muted/60'}`}>
                  {isDateOpen(dateKey) ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <CalendarCheck className={`h-4 w-4 ${isDateOpen(dateKey) ? 'text-primary' : 'text-muted-foreground'}`} />
                  <h2 className={`text-sm font-semibold ${isDateOpen(dateKey) ? 'text-primary' : 'text-foreground'}`}>{getDateLabel(dateKey)}</h2>
                  <Badge variant="outline" className="text-[10px] ml-auto font-medium">{groupedByDate[dateKey].length} visits</Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 mt-2 ml-2">
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
                          {(v as any).travel_mode === "pooled" && (
                            <p className="text-[10px] font-semibold text-amber-500 flex items-center gap-1">
                              🚗 Pooled — no conveyance claimed
                            </p>
                          )}
                          {v.remarks && <p className="text-xs italic">Remarks: {v.remarks}</p>}
                        </div>
                        {((v.status as string) === "planned" || (v.status as string) === "in_progress") && (
                          <div className="flex gap-2 mt-3 flex-wrap">
                            {/* Check In — capture arrival time */}
                            {(v.status as string) === "planned" && isToday(parseISO(v.visit_date)) && !(v as any).check_in_at && (
                              <Button size="sm" variant="outline" className="border-green-600/50 text-green-400 hover:bg-green-900/20" onClick={() => checkIn.mutate(v.id)} disabled={checkIn.isPending}>
                                📍 Check In
                              </Button>
                            )}
                            {((v.status as string) === "planned" || (v.status as string) === "in_progress") && isToday(parseISO(v.visit_date)) && (
                              <Button size="sm" onClick={() => setDoneDialogId(v.id)}>Mark Done</Button>
                            )}
                            {(v.status as string) === "planned" && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => { setEditVisitId(v.id); setEditVisitDate(v.visit_date); }}>Reschedule</Button>
                                <Button size="sm" variant="outline" onClick={() => cancelVisit.mutate(v.id)}>Cancel</Button>
                              </>
                            )}
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
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Reschedule dialog */}
      <Dialog open={!!editVisitId} onOpenChange={(open) => !open && setEditVisitId(null)}>
        <DialogContent className="bg-popover sm:max-w-md">
          <DialogHeader><DialogTitle>Reschedule Visit</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!canPlanDate(editVisitDate)) { toast.error("You can only plan visits for today or tomorrow"); return; } if (editVisitId) updateVisitDate.mutate({ id: editVisitId, newDate: editVisitDate }); }} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>New Visit Date</Label>
              <Input type="date" value={editVisitDate} onChange={(e) => setEditVisitDate(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={updateVisitDate.isPending}>
              {updateVisitDate.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
              {markDone.isPending ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Calculating Distance & Saving...</> : "Confirm Done"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Visits;
