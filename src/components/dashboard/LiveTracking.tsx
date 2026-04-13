import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  OverlayView,
  DirectionsRenderer,
  TrafficLayer,
} from "@react-google-maps/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Navigation, Clock, Users, Calendar, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Activity, Route,
  Building2, ArrowLeft, Layers, Zap, Timer, Car, Target,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInMinutes } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// ─── Constants ────────────────────────────────────────────────────────────────
const containerStyle = { width: "100%", height: "100%", borderRadius: "0.75rem" };
const defaultCenter = { lat: 28.6139, lng: 77.209 };
const libraries: ("places" | "geometry")[] = ["places", "geometry"];

const darkMapStyles: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1d27" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1d27" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExecutiveLocation {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
  full_name: string;
  showroom_id?: string;
  showroom_name?: string;
  current_address?: string; // reverse geocoded
  is_live?: boolean;
}

interface VisitPoint {
  id: string;
  client_name: string;
  partner_name: string | null;
  address: string | null;
  check_in_at: string | null;
  done_at: string | null;
  status: string;
  gps_lat: number | null;
  gps_lng: number | null;
  purpose: string | null;
  created_at: string;
  // enriched by Distance Matrix
  distFromPrev?: string;
  travelTimeFromPrev?: string;
  etaFromCurrent?: string;
}

interface LocationHistoryPoint { lat: number; lng: number; timestamp: string; }

interface DistMatrixResult {
  totalRoadKm: string;
  nextVisitDist: string | null;
  nextVisitEta: string | null;
  legDistances: string[];
  legDurations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusColor = (s: string) => {
  if (s === "done") return "#22c55e";
  if (s === "planned") return "#3b82f6";
  if (s === "cancelled") return "#ef4444";
  return "#f59e0b";
};

const statusIcon = (s: string) => {
  if (s === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  if (s === "cancelled") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  return <AlertCircle className="h-3.5 w-3.5 text-amber-400" />;
};

function durationStr(from: string | null, to: string | null): string {
  if (!from || !to) return "—";
  const mins = differenceInMinutes(new Date(to), new Date(from));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Cache for reverse geocoding: avoids repeated API calls for the same coords
const geocodeCache = new Map<string, string>();

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  return new Promise(resolve => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        // Use locality + sublocality for a short human label
        const components = results[0].address_components;
        const sublocality = components.find(c => c.types.includes("sublocality_level_1"))?.long_name;
        const locality = components.find(c => c.types.includes("locality"))?.long_name;
        const label = sublocality ? `${sublocality}, ${locality}` : (locality || results[0].formatted_address);
        geocodeCache.set(key, label);
        resolve(label);
      } else {
        resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    });
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export const LiveTracking = () => {
  const { role, showroomId } = useAuth();
  const [liveLocations, setLiveLocations] = useState<ExecutiveLocation[]>([]);
  const [selectedExecId, setSelectedExecId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterShowroom, setFilterShowroom] = useState("all");
  const [showroomList, setShowroomList] = useState<{ id: string; name: string }[]>([]);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [distMatrix, setDistMatrix] = useState<DistMatrixResult | null>(null);
  const [distMatrixLoading, setDistMatrixLoading] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const isAdminOrMd = role === "admin" || role === "md";
  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  // ── Fetch live locations + enrich with reverse geocode ──────────────────────
  useEffect(() => {
    const fetchLocations = async () => {
      const { data: locData } = await (supabase as any).from("live_locations").select("*");
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
      const { data: roles } = await supabase.from("user_roles").select("user_id, showroom_id, showrooms(name)");

      const enriched: ExecutiveLocation[] = (locData || []).map((loc: any) => {
        const profile = profiles?.find((p: any) => p.user_id === loc.user_id);
        const roleData = roles?.find((r: any) => r.user_id === loc.user_id);
        const isLive = differenceInMinutes(new Date(), new Date(loc.updated_at)) <= 15;
        return {
          user_id: loc.user_id,
          lat: loc.lat,
          lng: loc.lng,
          updated_at: loc.updated_at,
          full_name: profile?.full_name || "Unknown",
          showroom_id: roleData?.showroom_id,
          showroom_name: (roleData as any)?.showrooms?.name || "—",
          current_address: undefined,
          is_live: isLive,
        };
      });

      const filtered = isAdminOrMd ? enriched : enriched.filter(e => e.showroom_id === showroomId);
      setLiveLocations(filtered);

      // Build showroom list
      const seen = new Set<string>();
      const rooms: { id: string; name: string }[] = [];
      filtered.forEach(e => {
        if (e.showroom_id && !seen.has(e.showroom_id)) {
          seen.add(e.showroom_id);
          rooms.push({ id: e.showroom_id, name: e.showroom_name || "—" });
        }
      });
      setShowroomList(rooms);

      // Reverse geocode each live exec (only if Maps is loaded)
      if (isLoaded && filtered.length > 0) {
        const withAddresses = await Promise.all(
          filtered.map(async (loc) => {
            try {
              const addr = await reverseGeocode(loc.lat, loc.lng);
              return { ...loc, current_address: addr };
            } catch {
              return loc;
            }
          })
        );
        setLiveLocations(withAddresses);
      }
    };

    fetchLocations();
    const channel = (supabase as any)
      .channel("live-tracking-v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, fetchLocations)
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [isAdminOrMd, showroomId, isLoaded]);

  // ── Visits query ────────────────────────────────────────────────────────────
  const { data: execVisits = [] } = useQuery<VisitPoint[]>({
    queryKey: ["exec-visits-route", selectedExecId, selectedDate],
    queryFn: async () => {
      if (!selectedExecId) return [];
      const { data } = await supabase
        .from("visits")
        .select("id, clients(name), partners(name), address, check_in_at, done_at, status, gps_latitude, gps_longitude, purpose, created_at")
        .eq("created_by", selectedExecId)
        .eq("visit_date", selectedDate);
      const visits = (data || []).map((v: any) => ({
        id: v.id,
        client_name: v.clients?.name || v.partners?.name || "Meeting",
        partner_name: v.partners?.name || null,
        address: v.address,
        check_in_at: v.check_in_at,
        done_at: v.done_at,
        status: v.status,
        gps_lat: v.gps_latitude,
        gps_lng: v.gps_longitude,
        purpose: v.purpose,
        created_at: v.created_at,
      }));
      visits.sort((a, b) => {
        const tA = new Date(a.check_in_at || a.done_at || a.created_at).getTime();
        const tB = new Date(b.check_in_at || b.done_at || b.created_at).getTime();
        return tA - tB;
      });
      return visits;
    },
    enabled: !!selectedExecId,
    refetchInterval: 30000,
  });

  // ── Location history ────────────────────────────────────────────────────────
  const { data: locationHistory = [] } = useQuery<LocationHistoryPoint[]>({
    queryKey: ["exec-location-history", selectedExecId, selectedDate],
    queryFn: async () => {
      if (!selectedExecId) return [];
      const { data } = await (supabase as any)
        .from("location_history")
        .select("lat, lng, timestamp")
        .eq("user_id", selectedExecId)
        .gte("timestamp", `${selectedDate}T00:00:00.000Z`)
        .lte("timestamp", `${selectedDate}T23:59:59.999Z`)
        .order("timestamp", { ascending: true });
      return (data || []) as LocationHistoryPoint[];
    },
    enabled: !!selectedExecId,
    refetchInterval: 60000,
  });

  // ── Daily attendance ────────────────────────────────────────────────────────
  const { data: startDayLocation } = useQuery<{ lat: number; lng: number; time: string } | null>({
    queryKey: ["exec-attendance", selectedExecId, selectedDate],
    queryFn: async () => {
      if (!selectedExecId) return null;
      const { data } = await supabase
        .from("daily_attendance")
        .select("check_in_lat, check_in_lng, created_at")
        .eq("user_id", selectedExecId)
        .eq("date", selectedDate)
        .maybeSingle();
      if (!data?.check_in_lat || !data?.check_in_lng) return null;
      return { lat: data.check_in_lat, lng: data.check_in_lng, time: data.created_at };
    },
    enabled: !!selectedExecId,
  });

  // ── Route path ──────────────────────────────────────────────────────────────
  const routePath = React.useMemo(() => {
    const startPt = startDayLocation ? [{ lat: startDayLocation.lat, lng: startDayLocation.lng }] : [];
    if (locationHistory.length > 1) return [...startPt, ...locationHistory.map(p => ({ lat: p.lat, lng: p.lng }))];
    const visitPts = execVisits.filter(v => v.gps_lat && v.gps_lng).map(v => ({ lat: v.gps_lat!, lng: v.gps_lng! }));
    return [...startPt, ...visitPts];
  }, [locationHistory, execVisits, startDayLocation]);

  // ── Directions API — traffic-aware ──────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !selectedExecId || routePath.length < 2) { setDirections(null); return; }

    const svc = new window.google.maps.DirectionsService();
    const origin = routePath[0];
    const destination = routePath[routePath.length - 1];
    let wpts = routePath.slice(1, -1);
    if (wpts.length > 23) {
      const step = Math.ceil(wpts.length / 23);
      wpts = wpts.filter((_, i) => i % step === 0).slice(0, 23);
    }

    svc.route(
      {
        origin,
        destination,
        waypoints: wpts.map(p => ({ location: p, stopover: false })),
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
        // Traffic-aware routing (only meaningful for current time)
        ...(isToday && {
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
          },
        }),
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
        }
      }
    );
  }, [isLoaded, selectedExecId, routePath.length, JSON.stringify(routePath), isToday]);

  // ── Distance Matrix API ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !selectedExecId) { setDistMatrix(null); return; }

    const gpsVisits = execVisits.filter(v => v.gps_lat && v.gps_lng);
    const selectedExec = liveLocations.find(l => l.user_id === selectedExecId);
    if (gpsVisits.length < 1) { setDistMatrix(null); return; }

    setDistMatrixLoading(true);

    const service = new window.google.maps.DistanceMatrixService();

    // Build origins + destinations for chained leg calculation
    const allPoints: google.maps.LatLng[] = [];
    if (startDayLocation) allPoints.push(new window.google.maps.LatLng(startDayLocation.lat, startDayLocation.lng));
    gpsVisits.forEach(v => allPoints.push(new window.google.maps.LatLng(v.gps_lat!, v.gps_lng!)));

    // Find next pending/planned visit for ETA from current live location
    const nextPending = execVisits.find(v => v.status === "planned" && v.gps_lat && v.gps_lng);
    const execCurrentLoc = selectedExec ? new window.google.maps.LatLng(selectedExec.lat, selectedExec.lng) : null;

    const promises: Promise<void>[] = [];

    // Promise 1: leg-by-leg distances between GPS visit points
    let legDistances: string[] = [];
    let legDurations: string[] = [];
    let totalRoadMeters = 0;

    if (allPoints.length >= 2) {
      const origins = allPoints.slice(0, -1);
      const destinations = allPoints.slice(1);

      promises.push(new Promise(resolve => {
        service.getDistanceMatrix(
          {
            origins,
            destinations,
            travelMode: window.google.maps.TravelMode.DRIVING,
            ...(isToday && { drivingOptions: { departureTime: new Date(), trafficModel: window.google.maps.TrafficModel.BEST_GUESS } }),
          },
          (res, status) => {
            if (status === "OK" && res) {
              res.rows.forEach((row, i) => {
                const el = row.elements[i]; // diagonal: origin[i] → dest[i]
                if (el?.status === "OK") {
                  legDistances.push(el.distance.text);
                  legDurations.push(
                    isToday && (el as any).duration_in_traffic
                      ? (el as any).duration_in_traffic.text
                      : el.duration.text
                  );
                  totalRoadMeters += el.distance.value;
                }
              });
            }
            resolve();
          }
        );
      }));
    }

    // Promise 2: current location → next pending visit ETA
    let nextVisitDist: string | null = null;
    let nextVisitEta: string | null = null;

    if (execCurrentLoc && nextPending && isToday) {
      promises.push(new Promise(resolve => {
        service.getDistanceMatrix(
          {
            origins: [execCurrentLoc],
            destinations: [new window.google.maps.LatLng(nextPending.gps_lat!, nextPending.gps_lng!)],
            travelMode: window.google.maps.TravelMode.DRIVING,
            drivingOptions: { departureTime: new Date(), trafficModel: window.google.maps.TrafficModel.BEST_GUESS },
          },
          (res, status) => {
            if (status === "OK" && res?.rows[0]?.elements[0]?.status === "OK") {
              const el = res.rows[0].elements[0];
              nextVisitDist = el.distance.text;
              nextVisitEta = (el as any).duration_in_traffic?.text || el.duration.text;
            }
            resolve();
          }
        );
      }));
    }

    Promise.all(promises).then(() => {
      setDistMatrix({
        totalRoadKm: totalRoadMeters > 0 ? (totalRoadMeters / 1000).toFixed(1) : "—",
        nextVisitDist,
        nextVisitEta,
        legDistances,
        legDurations,
      });
      setDistMatrixLoading(false);
    });
  }, [isLoaded, selectedExecId, execVisits.length, JSON.stringify(execVisits.map(v => v.id)), isToday]);

  // ── Route summary ───────────────────────────────────────────────────────────
  const routeSummary = React.useMemo(() => {
    if (!selectedExecId) return null;
    const doneVisits = execVisits.filter(v => v.status === "done");
    let totalAtClientMins = 0;
    doneVisits.forEach(v => {
      if (v.check_in_at && v.done_at) totalAtClientMins += differenceInMinutes(new Date(v.done_at), new Date(v.check_in_at));
    });
    const firstActivity = startDayLocation?.time || execVisits.find(v => v.check_in_at)?.check_in_at;
    const lastActivity = [...execVisits].reverse().find(v => v.done_at)?.done_at;
    let totalTravelMins = 0;
    if (firstActivity && lastActivity) {
      totalTravelMins = Math.max(0, differenceInMinutes(new Date(lastActivity), new Date(firstActivity)) - totalAtClientMins);
    }
    // Fallback haversine if Distance Matrix not done yet
    let haversineKmTotal = 0;
    if (locationHistory.length > 1) {
      for (let i = 1; i < locationHistory.length; i++) {
        haversineKmTotal += haversineKm(locationHistory[i-1].lat, locationHistory[i-1].lng, locationHistory[i].lat, locationHistory[i].lng);
      }
    }
    return {
      totalVisits: execVisits.length,
      doneVisits: doneVisits.length,
      pendingVisits: execVisits.filter(v => v.status === "planned").length,
      totalAtClientMins,
      totalTravelMins,
      firstCheckIn: firstActivity,
      lastActivity,
      haversineKmTotal: haversineKmTotal.toFixed(1),
    };
  }, [execVisits, locationHistory, startDayLocation, selectedExecId]);

  // ── Fit bounds on data change ───────────────────────────────────────────────
  const filteredLocations = liveLocations.filter(loc =>
    filterShowroom === "all" || loc.showroom_id === filterShowroom
  );
  const selectedExec = liveLocations.find(l => l.user_id === selectedExecId);

  const fitBounds = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = new window.google.maps.LatLngBounds();
    if (selectedExecId) {
      if (startDayLocation) bounds.extend({ lat: startDayLocation.lat, lng: startDayLocation.lng });
      locationHistory.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
      execVisits.forEach(v => { if (v.gps_lat && v.gps_lng) bounds.extend({ lat: v.gps_lat, lng: v.gps_lng }); });
      if (selectedExec) bounds.extend({ lat: selectedExec.lat, lng: selectedExec.lng });
    } else {
      filteredLocations.forEach(l => bounds.extend({ lat: l.lat, lng: l.lng }));
    }
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 80);
  }, [locationHistory, execVisits, filteredLocations, selectedExecId, startDayLocation, selectedExec]);

  useEffect(() => {
    if (isLoaded && mapRef.current) setTimeout(fitBounds, 300);
  }, [locationHistory, filteredLocations, fitBounds, isLoaded]);

  if (!isLoaded) return (
    <div className="h-[calc(100vh-8rem)] w-full animate-pulse bg-[#1a1d27] rounded-xl border border-[#2a2d3a] flex items-center justify-center text-[#6b7280]">
      Loading Map...
    </div>
  );

  // ─── JSX ──────────────────────────────────────────────────────────────────
  const nextPending = execVisits.find(v => v.status === "planned" && v.gps_lat && v.gps_lng);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-0 text-[#f1f5f9]">

      {/* ── COMPACT FILTER BAR ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pb-2.5 flex-nowrap overflow-x-auto scrollbar-none">
        {/* Date */}
        <div className="flex items-center gap-1.5 bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-2.5 py-1.5 shrink-0">
          <Calendar className="h-3 w-3 text-[#6b7280] shrink-0" />
          <Input
            type="date"
            value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setDistMatrix(null); setDirections(null); }}
            className="border-0 bg-transparent p-0 h-auto text-[11px] text-[#f1f5f9] w-[110px] focus-visible:ring-0 cursor-pointer"
          />
        </div>

        {/* Showroom filter */}
        {isAdminOrMd && showroomList.length > 0 && (
          <Select value={filterShowroom} onValueChange={setFilterShowroom}>
            <SelectTrigger className="bg-[#1a1d27] border-[#2a2d3a] text-[11px] h-8 rounded-lg min-w-[130px] max-w-[160px] shrink-0 gap-1">
              <Building2 className="h-3 w-3 text-[#6b7280] shrink-0" />
              <SelectValue placeholder="All Showrooms" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d27] border-[#2a2d3a] text-[#f1f5f9] text-xs">
              <SelectItem value="all">All Showrooms</SelectItem>
              {showroomList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Traffic toggle */}
        <button
          onClick={() => setShowTraffic(v => !v)}
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-semibold transition-all shrink-0 ${
            showTraffic
              ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
              : "bg-[#1a1d27] border-[#2a2d3a] text-[#6b7280] hover:border-[#3a3d4a]"
          }`}
        >
          <Layers className="h-3 w-3" />
          Traffic
        </button>

        {/* Back button */}
        {selectedExecId && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg bg-[#1a1d27] border-[#2a2d3a] text-[11px] gap-1 text-[#f1f5f9] hover:bg-[#2a2d3a] px-2.5 shrink-0"
            onClick={() => { setSelectedExecId(null); setDistMatrix(null); setDirections(null); }}
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </Button>
        )}

        <div className="flex-1" />

        {/* Live indicator */}
        {filteredLocations.filter(l => l.is_live).length > 0 ? (
          <div className="flex items-center gap-1.5 bg-[#1a1d27] border border-green-500/30 rounded-lg px-2.5 py-1.5 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest">
              {filteredLocations.filter(l => l.is_live).length} Live
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-2.5 py-1.5 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6b7280]" />
            <span className="text-[10px] text-[#6b7280] font-bold uppercase tracking-widest">
              0 Live
            </span>
          </div>
        )}
      </div>

      {/* ── MAIN LAYOUT ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-3 overflow-hidden">

        {/* MAP */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-[#2a2d3a] bg-[#1a1d27] relative shadow-lg">
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={defaultCenter}
            zoom={5}
            onLoad={map => { mapRef.current = map; }}
            options={{ disableDefaultUI: false, clickableIcons: false, styles: showTraffic ? [] : darkMapStyles }}
          >
            {/* Traffic Layer */}
            {showTraffic && <TrafficLayer />}

            {/* Road route */}
            {selectedExecId && directions && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: { strokeColor: "#dc2626", strokeOpacity: 0.9, strokeWeight: 4 },
                }}
              />
            )}

            {/* Loading route indicator */}
            {selectedExecId && !directions && routePath.length > 1 && (
              <OverlayView position={routePath[Math.floor(routePath.length / 2)]} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
                <div className="bg-[#0e0f12] border border-[#2a2d3a] rounded-xl px-3 py-1.5 text-[10px] text-[#9ca3af] font-medium animate-pulse">
                  🛣️ Building road route…
                </div>
              </OverlayView>
            )}

            {/* Start of Day marker */}
            {selectedExecId && startDayLocation && (
              <OverlayView position={{ lat: startDayLocation.lat, lng: startDayLocation.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
                <div className="relative -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center">
                  <div className="bg-[#0e0f12] border border-green-500/60 rounded-xl px-2.5 py-1.5 min-w-max mb-1 shadow-xl">
                    <p className="text-[10px] font-bold text-green-400">🏠 Day Start</p>
                    <p className="text-[9px] text-[#9ca3af]">{format(new Date(startDayLocation.time), "hh:mm a")}</p>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-green-500 border-2 border-[#0e0f12] flex items-center justify-center text-[10px] font-bold text-white shadow-lg">S</div>
                </div>
              </OverlayView>
            )}

            {/* Visit markers */}
            {selectedExecId && execVisits.filter(v => v.gps_lat && v.gps_lng).map((v, i) => (
              <OverlayView key={v.id} position={{ lat: v.gps_lat!, lng: v.gps_lng! }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
                <div className="relative -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center">
                  <div className="bg-[#0e0f12] border rounded-xl px-2.5 py-1.5 min-w-max mb-1 shadow-xl text-left"
                    style={{ borderColor: statusColor(v.status) + "80" }}>
                    <p className="text-[11px] font-bold text-[#f1f5f9] leading-tight">{i + 1}. {v.client_name}</p>
                    {v.check_in_at && <p className="text-[9px] text-[#9ca3af] mt-0.5">In: {format(new Date(v.check_in_at), "hh:mm a")}</p>}
                    {v.done_at && <p className="text-[9px] text-[#9ca3af]">Out: {format(new Date(v.done_at), "hh:mm a")}</p>}
                    {distMatrix?.legDistances[i] && (
                      <p className="text-[9px] text-amber-400 font-semibold mt-0.5">
                        {distMatrix.legDistances[i]} · {distMatrix.legDurations[i]}
                      </p>
                    )}
                  </div>
                  <div className="w-5 h-5 rounded-full border-2 border-[#0e0f12] flex items-center justify-center text-[9px] font-bold text-white shadow-md"
                    style={{ backgroundColor: statusColor(v.status) }}>
                    {i + 1}
                  </div>
                </div>
              </OverlayView>
            ))}

            {/* All execs — overview mode */}
            {!selectedExecId && filteredLocations.map(loc => {
              const isStale = Date.now() - new Date(loc.updated_at).getTime() > 300000;
              return (
                <OverlayView key={loc.user_id} position={{ lat: loc.lat, lng: loc.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
                  <div className="relative -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center cursor-pointer group"
                    onClick={() => setSelectedExecId(loc.user_id)}>
                    <div className="bg-[#0e0f12] border border-[#2a2d3a] group-hover:border-[#dc2626]/60 shadow-xl rounded-xl px-2.5 py-1.5 min-w-max mb-1 transition-all">
                      <p className="text-[11px] font-bold text-[#f1f5f9]">{loc.full_name}</p>
                      {loc.current_address && (
                        <p className="text-[9px] text-[#6b7280] mt-0.5 max-w-[160px] truncate">📍 {loc.current_address}</p>
                      )}
                      <p className={`text-[9px] font-medium mt-0.5 ${isStale ? "text-amber-400" : "text-green-400"}`}>
                        {isStale ? "⚠ " : "● "}{formatDistanceToNow(new Date(loc.updated_at))} ago
                      </p>
                    </div>
                    <Navigation className={`w-7 h-7 fill-current stroke-[#0e0f12] stroke-2 drop-shadow-lg ${isStale ? "text-amber-400" : "text-green-500 animate-bounce"}`} />
                  </div>
                </OverlayView>
              );
            })}

            {/* Selected exec current location */}
            {selectedExecId && selectedExec && (
              <OverlayView position={{ lat: selectedExec.lat, lng: selectedExec.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
                <div className="relative -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center">
                  <div className="bg-[#dc2626] text-white rounded-xl px-2.5 py-1 min-w-max mb-1 shadow-xl">
                    <p className="text-[10px] font-bold">📍 Now</p>
                    {selectedExec.current_address && (
                      <p className="text-[8px] text-white/70 max-w-[150px] truncate">{selectedExec.current_address}</p>
                    )}
                  </div>
                  <Navigation className="w-7 h-7 fill-[#dc2626] stroke-[#0e0f12] stroke-2 drop-shadow-lg animate-bounce" />
                </div>
              </OverlayView>
            )}
          </GoogleMap>
        </div>

        {/* ── RIGHT SIDEBAR ───────────────────────────────────────────────── */}
        <div className="w-80 xl:w-96 flex flex-col gap-2.5 overflow-hidden">

          {/* ── EXEC DETAIL VIEW ── */}
          {selectedExecId && routeSummary && (
            <>
              {/* Executive header card */}
              <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl p-3.5 shrink-0 shadow-md">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#dc2626] to-[#7f1d1d] flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {selectedExec?.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#f1f5f9] truncate">{selectedExec?.full_name}</p>
                    {selectedExec?.current_address && (
                      <p className="text-[10px] text-[#6b7280] truncate">📍 {selectedExec.current_address}</p>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[9px] text-green-400 font-bold uppercase tracking-wider">Live</span>
                  </div>
                </div>

                {/* Next Visit ETA — only today */}
                {isToday && nextPending && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-2 mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-blue-400 font-semibold">Next: {nextPending.client_name}</p>
                      {distMatrixLoading ? (
                        <p className="text-[9px] text-[#6b7280] animate-pulse">Calculating ETA…</p>
                      ) : distMatrix?.nextVisitEta ? (
                        <p className="text-[9px] text-[#9ca3af]">
                          <span className="text-blue-300 font-bold">{distMatrix.nextVisitDist}</span>
                          {" · "}
                          <span className="text-amber-300 font-bold">~{distMatrix.nextVisitEta}</span>
                          {" away (with traffic)"}
                        </p>
                      ) : (
                        <p className="text-[9px] text-[#6b7280]">No GPS for this visit</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Stats grid */}
              <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl p-3.5 shrink-0 shadow-md">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Route className="h-3.5 w-3.5 text-[#dc2626]" />
                  <p className="text-[10px] font-bold text-[#f1f5f9] uppercase tracking-widest">Day Summary</p>
                  {distMatrixLoading && <span className="text-[9px] text-amber-400 animate-pulse ml-auto">Calculating…</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#0e0f12] rounded-xl p-2 border border-[#2a2d3a] text-center">
                    <p className="text-[8px] text-[#6b7280] uppercase font-semibold">Road Dist</p>
                    <p className="text-base font-bold text-[#f1f5f9] font-mono leading-tight">
                      {distMatrix ? distMatrix.totalRoadKm : routeSummary.haversineKmTotal}
                      <span className="text-[9px] text-[#6b7280]">km</span>
                    </p>
                    <p className="text-[8px] text-[#4b5563]">{distMatrix ? "road" : "~est"}</p>
                  </div>
                  <div className="bg-[#0e0f12] rounded-xl p-2 border border-[#2a2d3a] text-center">
                    <p className="text-[8px] text-[#6b7280] uppercase font-semibold">Visits</p>
                    <p className="text-base font-bold text-[#f1f5f9] font-mono leading-tight">
                      {routeSummary.doneVisits}
                      <span className="text-[9px] text-[#6b7280]">/{routeSummary.totalVisits}</span>
                    </p>
                    {routeSummary.pendingVisits > 0 && (
                      <p className="text-[8px] text-amber-400">{routeSummary.pendingVisits} left</p>
                    )}
                  </div>
                  <div className="bg-[#0e0f12] rounded-xl p-2 border border-[#2a2d3a] text-center">
                    <p className="text-[8px] text-[#6b7280] uppercase font-semibold">At Client</p>
                    <p className="text-sm font-bold text-green-400 font-mono leading-tight">
                      {routeSummary.totalAtClientMins >= 60
                        ? `${Math.floor(routeSummary.totalAtClientMins / 60)}h${routeSummary.totalAtClientMins % 60}m`
                        : `${routeSummary.totalAtClientMins}m`}
                    </p>
                  </div>
                </div>
                {routeSummary.firstCheckIn && (
                  <div className="flex justify-between mt-2 pt-2 border-t border-[#2a2d3a] text-[9px] text-[#4b5563] font-medium">
                    <span>First In: <span className="text-[#9ca3af]">{format(new Date(routeSummary.firstCheckIn), "hh:mm a")}</span></span>
                    {routeSummary.lastActivity && (
                      <span>Last Out: <span className="text-[#9ca3af]">{format(new Date(routeSummary.lastActivity), "hh:mm a")}</span></span>
                    )}
                  </div>
                )}
              </div>

              {/* Visit timeline */}
              <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl flex flex-col overflow-hidden shadow-md flex-1 min-h-0">
                <div className="px-3.5 py-2.5 border-b border-[#2a2d3a] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-[#dc2626]" />
                    <p className="text-[10px] font-bold text-[#f1f5f9] uppercase tracking-widest">Visit Timeline</p>
                  </div>
                  <Badge className="bg-[#0e0f12] text-[#9ca3af] border-[#2a2d3a] text-[9px]">{execVisits.length}</Badge>
                </div>
                <div className="overflow-y-auto flex-1 p-3 space-y-2">
                  {execVisits.length === 0 ? (
                    <div className="py-8 text-center text-sm text-[#4b5563]">
                      <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No visits for this date
                    </div>
                  ) : execVisits.map((v, i) => (
                    <div key={v.id} className="relative pl-5">
                      {i < execVisits.length - 1 && (
                        <div className="absolute left-[8px] top-5 bottom-0 w-px bg-[#2a2d3a]" />
                      )}
                      <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-[#0e0f12] flex items-center justify-center text-[8px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: statusColor(v.status) }}>
                        {i + 1}
                      </div>
                      <div className="bg-[#0e0f12] border border-[#2a2d3a] rounded-xl p-2.5 hover:border-[#3a3d4a] transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-[11px] font-bold text-[#f1f5f9] leading-tight">{v.client_name}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            {statusIcon(v.status)}
                            <span className="text-[8px] font-semibold uppercase" style={{ color: statusColor(v.status) }}>
                              {v.status}
                            </span>
                          </div>
                        </div>
                        {v.purpose && <p className="text-[9px] text-[#6b7280] mb-1">{v.purpose}</p>}
                        {v.address && (
                          <p className="text-[9px] text-[#4b5563] flex items-center gap-1 mb-1.5 truncate">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />{v.address}
                          </p>
                        )}

                        {/* Drive info from Distance Matrix */}
                        {distMatrix?.legDistances[i - 1] && (
                          <div className="flex items-center gap-1.5 mb-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                            <Car className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                            <span className="text-[9px] text-amber-300 font-semibold">
                              {distMatrix.legDistances[i - 1]} · {distMatrix.legDurations[i - 1]}
                              {isToday ? " (traffic)" : ""}
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-1 mt-1.5 pt-1.5 border-t border-[#2a2d3a]">
                          <div>
                            <p className="text-[7px] text-[#4b5563] uppercase font-semibold">In</p>
                            <p className="text-[9px] font-semibold text-[#9ca3af]">
                              {v.check_in_at ? format(new Date(v.check_in_at), "hh:mm a") : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[7px] text-[#4b5563] uppercase font-semibold">Out</p>
                            <p className="text-[9px] font-semibold text-[#9ca3af]">
                              {v.done_at ? format(new Date(v.done_at), "hh:mm a") : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[7px] text-[#4b5563] uppercase font-semibold">Stayed</p>
                            <p className="text-[9px] font-semibold text-green-400">
                              {durationStr(v.check_in_at, v.done_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── OVERVIEW MODE — all execs list ── */}
          {!selectedExecId && (
            <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl flex flex-col overflow-hidden shadow-md flex-1 min-h-0">
              <div className="px-3.5 py-2.5 border-b border-[#2a2d3a] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <Navigation className="h-3.5 w-3.5 text-green-500" />
                  <p className="text-[10px] font-bold text-[#f1f5f9] uppercase tracking-widest">Executives</p>
                </div>
                <Badge className="bg-[#0e0f12] text-[#9ca3af] border-[#2a2d3a] text-[9px]">{filteredLocations.length}</Badge>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-[#2a2d3a]">
                {filteredLocations.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#4b5563] flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 opacity-30" />
                    <p>No executives found</p>
                  </div>
                ) : [...filteredLocations].sort((a,b) => (a.is_live === b.is_live ? 0 : a.is_live ? -1 : 1)).map(loc => {
                  const isStale = Date.now() - new Date(loc.updated_at).getTime() > 300000;
                  return (
                    <div
                      key={loc.user_id}
                      className="p-3.5 hover:bg-[#2a2d3a]/40 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                      onClick={() => setSelectedExecId(loc.user_id)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2a2d3a] to-[#3a3d4a] border border-[#3a3d4a] flex items-center justify-center text-xs font-bold text-[#f1f5f9] shrink-0">
                          {loc.full_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#f1f5f9] truncate">{loc.full_name}</p>
                          {/* Reverse geocoded address */}
                          {loc.current_address ? (
                            <p className="text-[9px] text-[#6b7280] truncate flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />{loc.current_address}
                            </p>
                          ) : (
                            <p className="text-[9px] text-[#4b5563] flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatDistanceToNow(new Date(loc.updated_at))} ago
                            </p>
                          )}
                          {loc.showroom_name && (
                            <p className="text-[9px] text-[#4b5563]">{loc.showroom_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-2">
                          {!loc.is_live ? (
                            <div className="w-2 h-2 rounded-full bg-[#4b5563]" />
                          ) : isStale ? (
                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          )}
                          <ChevronRight className="h-3.5 w-3.5 text-[#4b5563] group-hover:text-[#9ca3af] transition-colors" />
                        </div>
                        <span className="text-[8px] font-bold uppercase tracking-wider" 
                          style={{ color: !loc.is_live ? "#6b7280" : isStale ? "#fbbf24" : "#4ade80" }}>
                          {!loc.is_live ? "OFFLINE" : isStale ? "AWAY" : "LIVE"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
