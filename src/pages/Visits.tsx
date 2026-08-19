import { useState, useEffect, useMemo } from "react";
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
import { Plus, CalendarCheck, MapPin, Camera, Loader2, ChevronDown, ChevronRight, Search, UserCircle, Clock, Users } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, isToday, isTomorrow, parseISO, addDays } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import { sendNotification } from "@/lib/notifications";
import { calculateDistance, calculateRouteDistance } from "@/lib/utils";
import { useJsApiLoader, Autocomplete } from "@react-google-maps/api";
import { useSearchParams } from "react-router-dom";

const libraries: ("places")[] = ["places"];

import { TripMap } from "@/components/TripMap";

type VisitStatus = Database["public"]["Enums"]["visit_status"];
type VisitWithType = Database["public"]["Enums"]["visit_with_type"];

// Local types for Supabase joined/extended rows
type UserIdRow = { user_id: string };
type VisitRow = Database["public"]["Tables"]["visits"]["Row"] & {
  clients?: { name: string; address: string } | null;
  partners?: { name: string; address: string } | null;
  _signed_photo_url?: string | null;
  travel_mode?: string;
  check_in_at?: string | null;
};
type InsertVisitData = {
  visit_date: string;
  visit_with_type: VisitWithType;
  address: string;
  purpose_id: string;
  purpose: string;
  created_by: string;
  travel_mode: string;
  pooled_with_user_id: string | null;
  client_id?: string;
  partner_id?: string;
};

const visitStatusColors: Record<string, string> = {
  planned: "bg-[hsl(var(--status-new))] text-white",
  in_progress: "bg-blue-500 text-white",
  done: "bg-[hsl(var(--status-converted))] text-white",
  missed: "bg-red-500 text-white",
  rescheduled: "bg-orange-500 text-white",
  cancelled: "bg-[hsl(var(--status-lost))] text-white",
  // aliases / fallbacks
  submitted: "bg-purple-500 text-white",
  draft: "bg-gray-500 text-white",
};

const formatPlannedTime = (dateStr?: string | null) => {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return null;
    return format(d, "dd MMM yyyy, hh:mm a");
  } catch {
    return null;
  }
};

const Visits = () => {
  const { user, role, showroomId, showroomIds, reportsTo } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [doneDialogId, setDoneDialogId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({ [todayStr]: true });
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
    showroom_id: "",
    address: "",
    purpose_id: "",
    travel_mode: "own" as "own" | "pooled",
    pooled_with_user_id: "",
  });

  const { data: purposes = [] } = usePurposes(form.visit_with_type);

  // ── Auto-fill from URL params (e.g. from Pending Partners widget) ──────
  useEffect(() => {
    const partnerId = searchParams.get("partner_id");
    const vwt = searchParams.get("visit_with_type");
    if (partnerId && vwt === "partner") {
      setForm(prev => ({
        ...prev,
        visit_with_type: "partner",
        partner_id: partnerId,
      }));
      setDialogOpen(true);
      // Clear params so page refresh doesn't re-open
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["visits", user?.id, role],
    queryFn: async () => {
      let q = supabase
        .from("visits")
        .select("*, clients(name, address), partners(name, address)")
        .order("visit_date", { ascending: false })
        .limit(10000);

      if (role === "executive" && user) {
        // Exec sees own visits only
        q = q.eq("created_by", user.id);

      } else if (role === "tl" && user) {
        // TL sees own + all exec visits under them
        const { data: myExecs } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("reports_to", user.id)
          .eq("role", "executive");
        const execIds = (myExecs || []).map((r: UserIdRow) => r.user_id);
        q = q.in("created_by", [user.id, ...execIds]);

      } else if (role === "manager" && showroomIds.length > 0) {
        const { data: teamRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("showroom_id", showroomIds);  // multi-showroom
        const teamIds = (teamRoles || []).map((r: UserIdRow) => r.user_id);
        if (teamIds.length > 0) q = q.in("created_by", teamIds);
      }
      // MD / Admin: no filter

      const { data, error } = await q;
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

  const creatorUserIds = useMemo(() => [...new Set(visits.map(v => v.created_by).filter(Boolean))], [visits]);
  const { data: creatorProfilesMap = {} } = useQuery({
    queryKey: ["visit-creator-profiles", creatorUserIds],
    enabled: creatorUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", creatorUserIds);
      return Object.fromEntries((data || []).map(p => [p.user_id, p.full_name]));
    },
  });

  const overlappingPlans = useMemo(() => {
    const groups = new Map<string, typeof visits>();
    visits.forEach((visit) => {
      if (visit.status === "cancelled") return;
      const entityId = visit.client_id || visit.partner_id;
      if (!entityId) return;
      const key = `${visit.visit_date}:${visit.visit_with_type}:${entityId}`;
      const group = groups.get(key) || [];
      group.push(visit);
      groups.set(key, group);
    });
    const byVisitId: Record<string, string[]> = {};
    groups.forEach((group) => {
      const plannerIds = [...new Set(group.map((visit) => visit.created_by))];
      if (plannerIds.length < 2) return;
      group.forEach((visit) => { byVisitId[visit.id] = plannerIds; });
    });
    return byVisitId;
  }, [visits]);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list", user?.id, role],
    queryFn: async () => {
      let q = supabase.from("clients").select("id, name, address, city");

      if (role === "executive" && user) {
        const ids = [user.id, ...(reportsTo ? [reportsTo] : [])];
        q = q.in("created_by", ids);
      } else if (role === "tl" && user) {
        const { data: myExecs } = await supabase
          .from("user_roles").select("user_id")
          .eq("reports_to", user.id).eq("role", "executive");
        const execIds = (myExecs || []).map((r: UserIdRow) => r.user_id);
        q = q.in("created_by", [user.id, ...execIds]);
      } else if (role === "manager" && showroomIds.length > 0) {
        const { data: teamRoles } = await supabase
          .from("user_roles").select("user_id").in("showroom_id", showroomIds);
        const teamIds = (teamRoles || []).map((r: UserIdRow) => r.user_id);
        if (teamIds.length > 0) q = q.in("created_by", teamIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["partners-list", user?.id, role],
    queryFn: async () => {
      let q = supabase.from("partners").select("id, name, address, city");

      if (role === "executive" && user) {
        const ids = [user.id, ...(reportsTo ? [reportsTo] : [])];
        q = q.in("created_by", ids);
      } else if (role === "tl" && user) {
        const { data: myExecs } = await supabase
          .from("user_roles").select("user_id")
          .eq("reports_to", user.id).eq("role", "executive");
        const execIds = (myExecs || []).map((r: UserIdRow) => r.user_id);
        q = q.in("created_by", [user.id, ...execIds]);
      } else if (role === "manager" && showroomIds.length > 0) {
        const { data: teamRoles } = await supabase
          .from("user_roles").select("user_id").in("showroom_id", showroomIds);
        const teamIds = (teamRoles || []).map((r: UserIdRow) => r.user_id);
        if (teamIds.length > 0) q = q.in("created_by", teamIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const userShowroomName = useMemo(() => {
    const s = showrooms.find((item) => item.id === showroomId);
    return s?.name?.toLowerCase() || "";
  }, [showrooms, showroomId]);

  const filteredShowrooms = useMemo(() => {
    if (!userShowroomName || role === "admin" || role === "md") {
      return showrooms;
    }
    if (userShowroomName.includes("gurgaon") || userShowroomName.includes("kirti")) {
      return showrooms.filter((s) => s.name.toLowerCase().includes("gurgaon") || s.name.toLowerCase().includes("kirti"));
    }
    if (userShowroomName.includes("zirakpur") || userShowroomName.includes("zarkpur") || userShowroomName.includes("sarkpur")) {
      return showrooms.filter((s) => s.name.toLowerCase().includes("zirakpur") || s.name.toLowerCase().includes("kirti"));
    }
    return showrooms;
  }, [showrooms, userShowroomName, role]);

  // Fetch same-showroom colleagues via SECURITY DEFINER RPC (bypasses RLS on profiles)
  const { data: colleagues = [] } = useQuery({
    queryKey: ["colleagues-list", user?.id, showroomId],
    queryFn: async () => {
      if (!user) return [];
      // Try to get showroomId from auth context, fallback to DB query
      let sid: string | null = showroomId ?? null;
      if (!sid) {
        const { data: myRole } = await supabase
          .from("user_roles")
          .select("showroom_id")
          .eq("user_id", user.id)
          .maybeSingle();
        sid = myRole?.showroom_id ?? null;
      }
      if (!sid) return [];
      // Use the SECURITY DEFINER RPC — same as leaderboard, bypasses RLS
      const { data } = await supabase.rpc("get_showroom_leaderboard", { p_showroom_id: sid });
      return (data || [])
        .filter((item) => item.user_id !== user.id)
        .map((item) => ({ user_id: item.user_id, full_name: item.full_name || "Executive" }));
    },
    enabled: !!user,
  });

  const checkIfDayEnded = async (date: string) => {
    if (!user || role !== "executive") return false;
    const { data, error } = await supabase
      .from("conveyance_records")
      .select("id")
      .eq("user_id", user.id)
      .eq("date", date)
      .is("visit_id", null)
      .maybeSingle();
    
    if (error) {
      console.error("Error checking day status:", error);
      return false;
    }
    return !!data;
  };

  const createVisit = useMutation({
    mutationFn: async () => {
      const isDayEnded = await checkIfDayEnded(form.visit_date);
      if (isDayEnded) {
        throw new Error("This day has already been marked ended. Visits cannot be added.");
      }

      const insertData: InsertVisitData = {
        visit_date: form.visit_date,
        visit_with_type: form.visit_with_type,
        address: form.address,
        purpose_id: form.purpose_id,
        purpose: purposes.find(p => p.id === form.purpose_id)?.purpose_name || "Meeting",
        created_by: user!.id,
        travel_mode: form.travel_mode,
        pooled_with_user_id: form.travel_mode === "pooled" && form.pooled_with_user_id ? form.pooled_with_user_id : null,
      };
      if (form.visit_with_type === "client" || form.visit_with_type === "home") {
        if (form.client_id) insertData.client_id = form.client_id;
      } else if (form.visit_with_type === "partner") {
        if (form.partner_id) insertData.partner_id = form.partner_id;
      }
      const { error } = await supabase.from("visits").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      toast.success("Visit planned!");
      if (reportsTo) {
        sendNotification({
          userId: reportsTo,
          title: "New Visit Planned 📅",
          message: `A visit for ${form.visit_date} has been planned.`,
          targetUrl: "/visits",
        });
      }
      setForm({ visit_date: format(new Date(), "yyyy-MM-dd"), visit_with_type: "client", client_id: "", partner_id: "", showroom_id: "", address: "", purpose_id: "", travel_mode: "own", pooled_with_user_id: "" });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markDone = useMutation({
    mutationFn: async (visitId: string) => {
      const { data: visit } = await supabase.from("visits").select("visit_date").eq("id", visitId).single();
      if (!visit) throw new Error("Visit not found");
      const isDayEnded = await checkIfDayEnded(visit.visit_date);
      if (isDayEnded) {
        throw new Error("This day has already been marked ended. Visits cannot be modified.");
      }

      if (!remarks.trim()) throw new Error("Remarks are required");

      // GPS is mandatory — force fresh fix, never use cached stale location
      setGpsLoading(true);
      setGpsError("");
      let gpsLat: number;
      let gpsLng: number;
      try {
        const getGps = () => new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 20000,
            enableHighAccuracy: true,
            maximumAge: 0, // Never use cached GPS — always get a fresh fix
          })
        );
        let pos: GeolocationPosition;
        try {
          pos = await getGps();
        } catch {
          // Retry once — sometimes first attempt fails on mobile due to GPS warmup
          pos = await getGps();
        }
        gpsLat = pos.coords.latitude;
        gpsLng = pos.coords.longitude;
      } catch {
        setGpsLoading(false);
        throw new Error("GPS location is required. Please enable location access, move to an open area, and try again.");
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

         // Home-to-office commute check: starts at "Start Day Check-In" and ends at a showroom/office
         const isCommute = 
           (fromLocationName === "Start Day Check-In" || fromLocationName === "Start Day Location") && 
           (toLocationName.toLowerCase().includes("office") || toLocationName.toLowerCase().includes("showroom"));

         const finalDistance = isCommute ? 0 : distance;
         const finalAmount = isCommute ? 0 : amount;

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
             distance_km: finalDistance,
             vehicle_type: profile.conveyance_type,
             rate_per_km: profile.conveyance_rate || 0,
             amount: finalAmount
         });
         
         if (!convError && finalDistance > 0) {
             convResult = { distance: finalDistance, amount: finalAmount, vehicle: profile.conveyance_type, from: fromLocationName, to: toLocationName, fromLat, fromLng, toLat: gpsLat, toLng: gpsLng };
         }
      }
      return convResult;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      try {
        const { data: mdAdmins } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["md", "admin"]);
        const targetIds = (mdAdmins || []).map((m) => m.user_id);
        if (reportsTo) targetIds.push(reportsTo);
        const uniqueTargetIds = [...new Set(targetIds)];
        await Promise.all(
          uniqueTargetIds.map((uid) =>
            sendNotification({
              userId: uid,
              title: "Visit Marked Done ✅",
              message: `A field visit was completed on ${format(new Date(), "dd MMM yyyy")}`,
              targetUrl: "/visits",
            })
          )
        );
      } catch (e) {
        console.error("Error notifying visit completed:", e);
      }
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
      const { data: visit } = await supabase.from("visits").select("visit_date").eq("id", id).single();
      if (!visit) throw new Error("Visit not found");
      const isDayEnded = await checkIfDayEnded(visit.visit_date);
      if (isDayEnded) {
        throw new Error("This day has already been marked ended. Visits cannot be modified.");
      }

      const { error } = await supabase.from("visits").update({ status: "cancelled" as VisitStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      toast.success("Visit cancelled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkIn = useMutation({
    mutationFn: async (visitId: string) => {
      const { data: visit } = await supabase.from("visits").select("visit_date").eq("id", visitId).single();
      if (!visit) throw new Error("Visit not found");
      const isDayEnded = await checkIfDayEnded(visit.visit_date);
      if (isDayEnded) {
        throw new Error("This day has already been marked ended. Visits cannot be checked in.");
      }

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
      const { data: visit } = await supabase.from("visits").select("visit_date").eq("id", id).single();
      if (!visit) throw new Error("Visit not found");
      const isOldDayEnded = await checkIfDayEnded(visit.visit_date);
      if (isOldDayEnded) {
        throw new Error("This day has already been marked ended. Visits cannot be modified.");
      }
      const isNewDayEnded = await checkIfDayEnded(newDate);
      if (isNewDayEnded) {
        throw new Error("The target date has already been marked ended. Visits cannot be rescheduled to this date.");
      }

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
    if (form.visit_with_type === "client" || form.visit_with_type === "home") {
      const c = clients.find((x) => x.id === id);
      setForm({ ...form, client_id: id, partner_id: "", showroom_id: "", address: c?.address || c?.city || "" });
    } else if (form.visit_with_type === "partner") {
      const p = partners.find((x) => x.id === id);
      setForm({ ...form, partner_id: id, client_id: "", showroom_id: "", address: p?.address || p?.city || "" });
    } else if (form.visit_with_type === "showroom") {
      const s = showrooms.find((x) => x.id === id);
      setForm({ ...form, showroom_id: id, client_id: "", partner_id: "", address: s?.city ? `${s.name} Showroom, ${s.city}` : `${s?.name} Showroom` });
    }
  };

  const canMarkDone = (visit: VisitRow) => {
    // Allow marking done if planned
    if (visit.status !== "planned") return false;
    // Only allow marking done if visit date is today
    if (!isToday(parseISO(visit.visit_date))) return false;
    return true;
  };

  // Executives can plan today + any future date (not past dates)
  const canPlanDate = (date: string) => {
    const d = parseISO(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d >= today;
  };

  const filtered = visits.filter((v) => {
    const matchStatus = !filterStatus || filterStatus === "all" || v.status === filterStatus;
    const clientName = (v as VisitRow).clients?.name || "";
    const partnerName = (v as VisitRow).partners?.name || "";
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
            <form onSubmit={(e) => { e.preventDefault(); if (!canPlanDate(form.visit_date)) { toast.error("You cannot plan visits for past dates"); return; } createVisit.mutate(); }} className="space-y-3">
              <div className="space-y-1"><Label>Visit Date</Label><Input type="date" min={todayStr} value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} required /></div>
              <div className="space-y-1">
                <Label>Visit With</Label>
                <Select value={form.visit_with_type} onValueChange={(v) => setForm({ ...form, visit_with_type: v as VisitWithType, client_id: "", partner_id: "", showroom_id: "", address: "", purpose_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="hotel">Hotel</SelectItem>
                    <SelectItem value="showroom">Showroom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* ─── Searchable Entity / Showroom Picker ─── */}
              {(form.visit_with_type === "client" || form.visit_with_type === "partner" || form.visit_with_type === "showroom") && (
                <div className="space-y-1">
                  <Label>
                    {form.visit_with_type === "client"
                      ? "Select Client"
                      : form.visit_with_type === "partner"
                      ? "Select Partner"
                      : "Select Showroom"}
                  </Label>
                  <div className="relative">
                    {/* Trigger button */}
                    <button
                      type="button"
                      onClick={() => setEntityPickerOpen(o => !o)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-input bg-background text-sm transition-colors hover:bg-accent"
                    >
                      <span className={`truncate ${
                        (form.visit_with_type === "client" ? form.client_id : form.visit_with_type === "partner" ? form.partner_id : form.showroom_id)
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      }`}>
                        {form.visit_with_type === "client"
                          ? (form.client_id ? clients.find(e => e.id === form.client_id)?.name : "Select client...")
                          : form.visit_with_type === "partner"
                          ? (form.partner_id ? partners.find(e => e.id === form.partner_id)?.name : "Select partner...")
                          : (form.showroom_id ? filteredShowrooms.find(e => e.id === form.showroom_id)?.name : "Select showroom...")}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {(form.visit_with_type === "client" ? form.client_id : form.visit_with_type === "partner" ? form.partner_id : form.showroom_id) && (
                          <span
                            role="button"
                            onClick={e => { e.stopPropagation(); setForm({ ...form, client_id: "", partner_id: "", showroom_id: "", address: "" }); setEntityPickerOpen(false); }}
                            className="text-muted-foreground hover:text-destructive text-xs font-bold px-1"
                          >✕</span>
                        )}
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${entityPickerOpen ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    {/* Dropdown panel */}
                    {entityPickerOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
                        {/* Search */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <input
                            type="text"
                            autoFocus
                            placeholder={`Search...`}
                            value={entitySearch}
                            onChange={e => setEntitySearch(e.target.value)}
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground"
                          />
                          {entitySearch && (
                            <button type="button" onClick={() => setEntitySearch("")} className="text-muted-foreground hover:text-foreground text-xs font-bold">✕</button>
                          )}
                        </div>
                        {/* List */}
                        <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
                          {(form.visit_with_type === "client" ? clients : form.visit_with_type === "partner" ? partners : filteredShowrooms)
                            .filter(e => e.name.toLowerCase().includes(entitySearch.toLowerCase()))
                            .map(e => {
                              const currentId = form.visit_with_type === "client" ? form.client_id : form.visit_with_type === "partner" ? form.partner_id : form.showroom_id;
                              const isSelected = currentId === e.id;
                              return (
                                <button
                                  key={e.id}
                                  type="button"
                                  onClick={() => {
                                    handleSelectEntity(e.id);
                                    setEntitySearch("");
                                    setEntityPickerOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2
                                    ${isSelected
                                      ? "bg-primary/10 text-primary font-semibold"
                                      : "hover:bg-accent text-foreground"}`}
                                >
                                  {isSelected && <span className="text-primary text-xs">✓</span>}
                                  <span className="truncate">{e.name} {'city' in e && e.city ? `(${e.city})` : ''}</span>
                                </button>
                              );
                            })}
                          {(form.visit_with_type === "client" ? clients : form.visit_with_type === "partner" ? partners : filteredShowrooms)
                            .filter(e => e.name.toLowerCase().includes(entitySearch.toLowerCase())).length === 0 && (
                            <p className="text-center text-xs text-muted-foreground py-5">No results found</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                                  {c.full_name}
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
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-base font-bold text-foreground">{(v as VisitRow).clients?.name || (v as VisitRow).partners?.name || (v.address ? v.address.split(',')[0] : (v.visit_with_type === 'showroom' ? 'Showroom Visit' : v.visit_with_type === 'hotel' ? 'Hotel Visit' : v.visit_with_type === 'home' ? 'Home Visit' : '—'))}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-muted-foreground font-medium capitalize">{v.visit_with_type}</span>
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-500/20">
                                <UserCircle className="h-3 w-3" />
                                KAM: {creatorProfilesMap[v.created_by] || "Executive"}
                              </span>
                              {overlappingPlans[v.id] && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/25" title="More than one team member planned this client/partner on the same date">
                                  <Users className="h-3 w-3" />
                                  Team overlap: {overlappingPlans[v.id].map((id) => creatorProfilesMap[id] || "Team member").join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <Badge className={`${visitStatusColors[v.status]} capitalize text-xs border-0`}>{v.status}</Badge>
                            {v.created_at && formatPlannedTime(v.created_at) && (
                              <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 dark:bg-muted/30 px-2 py-0.5 rounded-md border border-border/50 whitespace-nowrap" title={`Planned on ${formatPlannedTime(v.created_at)}`}>
                                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span>Planned: {formatPlannedTime(v.created_at)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {((v as VisitRow).address || (v as VisitRow).clients?.address || (v as VisitRow).partners?.address) && (
                            <div className="flex items-start gap-1.5 text-xs text-foreground/80 font-medium bg-muted/30 p-1.5 rounded-lg border border-border/40">
                              <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                              <span>{v.address || (v as VisitRow).clients?.address || (v as VisitRow).partners?.address}</span>
                            </div>
                          )}
                          <p className="text-xs font-medium">Purpose: {v.purpose}</p>
                          {(v as VisitRow).travel_mode === "pooled" && (
                            <p className="text-[10px] font-semibold text-amber-500 flex items-center gap-1">
                              🚗 Pooled — no conveyance claimed
                            </p>
                          )}
                          {v.remarks && <p className="text-xs italic">Remarks: {v.remarks}</p>}
                        </div>
                        {((v.status as string) === "planned" || (v.status as string) === "in_progress") && (
                          <div className="flex gap-2 mt-3 flex-wrap">
                            {/* Check In — capture arrival time */}
                            {(v.status as string) === "planned" && isToday(parseISO(v.visit_date)) && !(v as VisitRow).check_in_at && (
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
                        {(v as VisitRow)._signed_photo_url && (
                          <div className="mt-2">
                            <img src={(v as VisitRow)._signed_photo_url ?? ""} alt="Visit photo" className="h-20 w-20 rounded-lg object-cover" />
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
          <form onSubmit={(e) => { e.preventDefault(); if (!canPlanDate(editVisitDate)) { toast.error("You cannot reschedule to a past date"); return; } if (editVisitId) updateVisitDate.mutate({ id: editVisitId, newDate: editVisitDate }); }} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>New Visit Date</Label>
              <Input type="date" min={todayStr} value={editVisitDate} onChange={(e) => setEditVisitDate(e.target.value)} required />
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
