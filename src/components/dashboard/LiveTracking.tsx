import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  OverlayView,
  Polyline,
  Marker,
  DirectionsRenderer,
} from "@react-google-maps/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Navigation,
  Clock,
  Users,
  Filter,
  Calendar,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  Route,
  Timer,
  Building2,
  ArrowLeft,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInMinutes, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const containerStyle = { width: "100%", height: "100%", borderRadius: "0.75rem" };
const defaultCenter = { lat: 28.6139, lng: 77.2090 };
const libraries: ("places" | "geometry")[] = ["places", "geometry"];

const darkMapStyles = [
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

interface ExecutiveLocation {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
  full_name: string;
  showroom_id?: string;
  showroom_name?: string;
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
}

interface LocationHistoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

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

export const LiveTracking = () => {
  const { role, showroomId } = useAuth();
  const [liveLocations, setLiveLocations] = useState<ExecutiveLocation[]>([]);
  const [selectedExecId, setSelectedExecId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterShowroom, setFilterShowroom] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showroomList, setShowroomList] = useState<{id: string, name: string}[]>([]);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(5);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const isAdminOrMd = role === "admin" || role === "md";

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  // --- Fetch live tracking data ---
  useEffect(() => {
    const fetchLocations = async () => {
      const { data: locData } = await (supabase as any).from("live_locations").select("*");
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
      const { data: roles } = await supabase.from("user_roles").select("user_id, showroom_id, showrooms(name)");

      const enriched: ExecutiveLocation[] = (locData || []).map((loc: any) => {
        const profile = profiles?.find((p: any) => p.user_id === loc.user_id);
        const roleData = roles?.find((r: any) => r.user_id === loc.user_id);
        return {
          user_id: loc.user_id,
          lat: loc.lat,
          lng: loc.lng,
          updated_at: loc.updated_at,
          full_name: profile?.full_name || "Unknown",
          showroom_id: roleData?.showroom_id,
          showroom_name: (roleData as any)?.showrooms?.name || "—",
        };
      });
      const filtered = isAdminOrMd ? enriched : enriched.filter(e => e.showroom_id === showroomId);
      setLiveLocations(filtered);
      
      // Build distinct showrooms list
      const seen = new Set<string>();
      const rooms: {id: string, name: string}[] = [];
      filtered.forEach(e => {
        if (e.showroom_id && !seen.has(e.showroom_id)) {
          seen.add(e.showroom_id);
          rooms.push({ id: e.showroom_id, name: e.showroom_name || "—" });
        }
      });
      setShowroomList(rooms);
    };
    fetchLocations();
    const channel = (supabase as any)
      .channel("live-tracking-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, fetchLocations)
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [isAdminOrMd, showroomId]);

  // --- Fetch selected executive's visits ---
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

      // Sort chronologically using check_in_at, falling back to done_at or created_at
      visits.sort((a, b) => {
        const timeA = new Date(a.check_in_at || a.done_at || a.created_at).getTime();
        const timeB = new Date(b.check_in_at || b.done_at || b.created_at).getTime();
        return timeA - timeB;
      });

      return visits;
    },
    enabled: !!selectedExecId,
    refetchInterval: 30000,
  });

  // --- Fetch location history for route polyline ---
  const { data: locationHistory = [] } = useQuery<LocationHistoryPoint[]>({
    queryKey: ["exec-location-history", selectedExecId, selectedDate],
    queryFn: async () => {
      if (!selectedExecId) return [];
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;
      const { data } = await (supabase as any)
        .from("location_history")
        .select("lat, lng, timestamp")
        .eq("user_id", selectedExecId)
        .gte("timestamp", startOfDay)
        .lte("timestamp", endOfDay)
        .order("timestamp", { ascending: true });
      return (data || []) as LocationHistoryPoint[];
    },
    enabled: !!selectedExecId,
    refetchInterval: 60000,
  });

  // --- Fetch daily attendance check-in (Start Day location) ---
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

  // --- Compute route summary ---
  const routeSummary = React.useMemo(() => {
    if (!selectedExecId) return null;
    const doneVisits = execVisits.filter(v => v.status === "done");
    
    // Prefer GPS history for distance; fall back to haversine between visit points
    let totalDistKm = 0;
    if (locationHistory.length > 1) {
      for (let i = 1; i < locationHistory.length; i++) {
        totalDistKm += haversineKm(
          locationHistory[i - 1].lat, locationHistory[i - 1].lng,
          locationHistory[i].lat, locationHistory[i].lng
        );
      }
    } else {
      // Fallback: connect start-day -> visit GPS points in order
      const gpsPoints: { lat: number; lng: number }[] = [];
      if (startDayLocation) gpsPoints.push({ lat: startDayLocation.lat, lng: startDayLocation.lng });
      execVisits.filter(v => v.gps_lat && v.gps_lng).forEach(v => gpsPoints.push({ lat: v.gps_lat!, lng: v.gps_lng! }));
      for (let i = 1; i < gpsPoints.length; i++) {
        totalDistKm += haversineKm(gpsPoints[i-1].lat, gpsPoints[i-1].lng, gpsPoints[i].lat, gpsPoints[i].lng);
      }
    }

    let totalAtClientMins = 0;
    doneVisits.forEach(v => {
      if (v.check_in_at && v.done_at) {
        totalAtClientMins += differenceInMinutes(new Date(v.done_at), new Date(v.check_in_at));
      }
    });
    // First activity = start day time, or first check-in
    const startDayTime = startDayLocation?.time || null;
    const firstCheckIn = execVisits.find(v => v.check_in_at)?.check_in_at;
    const firstActivity = startDayTime || firstCheckIn;
    const lastActivity = [...execVisits].reverse().find(v => v.done_at)?.done_at;
    let totalTravelMins = 0;
    if (firstActivity && lastActivity) {
      totalTravelMins = Math.max(0, differenceInMinutes(new Date(lastActivity), new Date(firstActivity)) - totalAtClientMins);
    }
    return {
      totalDistKm: totalDistKm.toFixed(1),
      totalVisits: execVisits.length,
      doneVisits: doneVisits.length,
      totalAtClientMins,
      totalTravelMins,
      firstCheckIn: firstActivity,
      lastActivity,
      usingFallback: locationHistory.length < 2,
    };
  }, [execVisits, locationHistory, startDayLocation, selectedExecId]);

  // Polyline path — starts from Start Day location, then GPS history or visit points
  const routePath = React.useMemo(() => {
    const startPt = startDayLocation ? [{ lat: startDayLocation.lat, lng: startDayLocation.lng }] : [];
    if (locationHistory.length > 1) {
      return [...startPt, ...locationHistory.map(p => ({ lat: p.lat, lng: p.lng }))];
    }
    // Fallback: start day → each visit GPS in order
    const visitPts = execVisits
      .filter(v => v.gps_lat && v.gps_lng)
      .map(v => ({ lat: v.gps_lat!, lng: v.gps_lng! }));
    return [...startPt, ...visitPts];
  }, [locationHistory, execVisits, startDayLocation]);

  // --- Fetch directions for fallback mode (Google Maps realistic road paths) ---
  useEffect(() => {
    if (!isLoaded || !selectedExecId || !routeSummary?.usingFallback || routePath.length < 2) {
      setDirections(null);
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    const origin = routePath[0];
    const destination = routePath[routePath.length - 1];
    const waypoints = routePath.slice(1, -1).slice(0, 23).map(p => ({ location: p, stopover: true }));

    directionsService.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          
          // Update the fallback distance to the actual driving distance calculated by DirectionsService
          if (routeSummary && result.routes[0]) {
            let actualDistanceMeters = 0;
            result.routes[0].legs.forEach(leg => {
              if (leg.distance) actualDistanceMeters += leg.distance.value;
            });
            // Assuming we only want to mutate distance for better accuracy
            routeSummary.totalDistKm = (actualDistanceMeters / 1000).toFixed(1);
          }
        }
      }
    );
  }, [isLoaded, selectedExecId, routeSummary?.usingFallback, routePath, routeSummary]);

  // Filter liveLocations by showroom and status
  const filteredLocations = liveLocations.filter(loc => {
    if (filterShowroom !== "all" && loc.showroom_id !== filterShowroom) return false;
    return true;
  });

  // Auto-fit map to route/pins
  const fitBounds = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = new window.google.maps.LatLngBounds();
    if (selectedExecId) {
      if (startDayLocation) bounds.extend({ lat: startDayLocation.lat, lng: startDayLocation.lng });
      if (locationHistory.length > 0) {
        locationHistory.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
      }
      execVisits.forEach(v => { if (v.gps_lat && v.gps_lng) bounds.extend({ lat: v.gps_lat, lng: v.gps_lng }); });
      if (selectedExec) bounds.extend({ lat: selectedExec.lat, lng: selectedExec.lng });
    } else {
      filteredLocations.forEach(l => bounds.extend({ lat: l.lat, lng: l.lng }));
    }
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 80);
  }, [locationHistory, execVisits, filteredLocations, selectedExecId]);

  useEffect(() => {
    if (isLoaded && mapRef.current) {
      setTimeout(fitBounds, 300);
    }
  }, [locationHistory, filteredLocations, fitBounds, isLoaded]);

  const selectedExec = liveLocations.find(l => l.user_id === selectedExecId);

  if (!isLoaded) return (
    <div className="h-[calc(100vh-8rem)] w-full animate-pulse bg-[#1a1d27] rounded-xl border border-[#2a2d3a] flex items-center justify-center text-[#6b7280]">
      Loading Map...
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-0 text-[#f1f5f9]">
      {/* TOP FILTER BAR */}
      <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
        <div className="flex items-center gap-1.5 bg-[#1a1d27] border border-[#2a2d3a] rounded-xl px-3 py-2">
          <Calendar className="h-3.5 w-3.5 text-[#6b7280]" />
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border-0 bg-transparent p-0 h-auto text-xs text-[#f1f5f9] w-[120px] focus-visible:ring-0"
          />
        </div>
        {isAdminOrMd && showroomList.length > 0 && (
          <Select value={filterShowroom} onValueChange={setFilterShowroom}>
            <SelectTrigger className="bg-[#1a1d27] border-[#2a2d3a] text-xs h-9 rounded-xl min-w-[140px]">
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-[#6b7280]" />
              <SelectValue placeholder="All Showrooms" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d27] border-[#2a2d3a] text-[#f1f5f9]">
              <SelectItem value="all">All Showrooms</SelectItem>
              {showroomList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {selectedExecId && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-xl bg-[#1a1d27] border-[#2a2d3a] text-xs gap-1.5 text-[#f1f5f9] hover:bg-[#2a2d3a]"
            onClick={() => setSelectedExecId(null)}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to All
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-[#6b7280] font-medium uppercase tracking-widest">
            {filteredLocations.length} active
          </span>
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* LEFT: MAP */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-[#2a2d3a] bg-[#1a1d27] relative shadow-lg">
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={mapCenter}
            zoom={mapZoom}
            onLoad={map => { mapRef.current = map; }}
            options={{ disableDefaultUI: false, clickableIcons: false, styles: darkMapStyles }}
          >
            {/* Real route polyline (continuous GPS history) */}
            {selectedExecId && !routeSummary?.usingFallback && routePath.length > 1 && (
              <Polyline
                path={routePath}
                options={{
                  strokeColor: "#b91c1c",
                  strokeOpacity: 0.85,
                  strokeWeight: 4,
                  geodesic: true,
                }}
              />
            )}

            {/* Fallback route directions (using Directions API for realistic road paths) */}
            {selectedExecId && routeSummary?.usingFallback && directions && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: {
                    strokeColor: "#f59e0b",
                    strokeOpacity: 0.6,
                    strokeWeight: 4,
                  }
                }}
              />
            )}

            {/* START DAY marker - where executive began the day */}
            {selectedExecId && startDayLocation && (
              <OverlayView
                position={{ lat: startDayLocation.lat, lng: startDayLocation.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="relative -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center">
                  <div className="bg-[#0e0f12] border border-green-500/60 rounded-xl px-2.5 py-1.5 min-w-max mb-1 shadow-xl">
                    <p className="text-[10px] font-bold text-green-400">🏠 Start of Day</p>
                    <p className="text-[9px] text-[#9ca3af]">{format(new Date(startDayLocation.time), "hh:mm a")}</p>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-green-500 border-2 border-[#0e0f12] flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
                    S
                  </div>
                </div>
              </OverlayView>
            )}

            {/* Visit markers when exec is selected */}
            {selectedExecId && execVisits.filter(v => v.gps_lat && v.gps_lng).map((v, i) => (
              <OverlayView
                key={v.id}
                position={{ lat: v.gps_lat!, lng: v.gps_lng! }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="relative -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center">
                  <div className="bg-[#0e0f12] border rounded-xl px-2.5 py-1.5 min-w-max mb-1 shadow-xl text-left"
                    style={{ borderColor: statusColor(v.status) + "80" }}>
                    <p className="text-[11px] font-bold text-[#f1f5f9] leading-tight">{i + 1}. {v.client_name}</p>
                    {v.check_in_at && <p className="text-[9px] text-[#9ca3af] mt-0.5">In: {format(new Date(v.check_in_at), "hh:mm a")}</p>}
                    {v.done_at && <p className="text-[9px] text-[#9ca3af]">Out: {format(new Date(v.done_at), "hh:mm a")}</p>}
                    {v.check_in_at && v.done_at && (
                      <p className="text-[9px] font-semibold" style={{ color: statusColor(v.status) }}>
                        {durationStr(v.check_in_at, v.done_at)}
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

            {/* Live location markers for ALL executives (when no exec selected) */}
            {!selectedExecId && filteredLocations.map(loc => {
              const isStale = new Date().getTime() - new Date(loc.updated_at).getTime() > 300000;
              return (
                <OverlayView
                  key={loc.user_id}
                  position={{ lat: loc.lat, lng: loc.lng }}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                >
                  <div
                    className="relative -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center cursor-pointer group"
                    onClick={() => setSelectedExecId(loc.user_id)}
                  >
                    <div className="bg-[#0e0f12] border border-[#2a2d3a] group-hover:border-[#b91c1c]/60 shadow-xl rounded-xl px-2.5 py-1.5 min-w-max mb-1 transition-all">
                      <p className="text-[11px] font-bold text-[#f1f5f9]">{loc.full_name}</p>
                      <p className={`text-[9px] font-medium mt-0.5 ${isStale ? "text-amber-400" : "text-green-400"}`}>
                        {isStale ? "⚠ Last seen" : "● Live"}: {formatDistanceToNow(new Date(loc.updated_at))} ago
                      </p>
                    </div>
                    <Navigation className={`w-7 h-7 fill-current stroke-[#0e0f12] stroke-2 drop-shadow-lg ${isStale ? "text-amber-400" : "text-green-500 animate-bounce"}`} />
                  </div>
                </OverlayView>
              );
            })}

            {/* Current live location of selected exec */}
            {selectedExecId && selectedExec && (
              <OverlayView
                position={{ lat: selectedExec.lat, lng: selectedExec.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="relative -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center">
                  <div className="bg-[#b91c1c] text-white rounded-xl px-2.5 py-1 min-w-max mb-1 shadow-xl">
                    <p className="text-[10px] font-bold">📍 Current Location</p>
                  </div>
                  <Navigation className="w-7 h-7 fill-[#b91c1c] stroke-[#0e0f12] stroke-2 drop-shadow-lg animate-bounce" />
                </div>
              </OverlayView>
            )}
          </GoogleMap>
        </div>

        {/* RIGHT SIDEBAR */}
        {showSidebar && (
          <div className="w-80 xl:w-96 flex flex-col gap-3 overflow-hidden">

            {/* ROUTE SUMMARY - only when exec selected */}
            {selectedExecId && routeSummary && (
              <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl p-4 shadow-md shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <Route className="h-4 w-4 text-[#b91c1c]" />
                  <p className="text-xs font-bold text-[#f1f5f9] uppercase tracking-widest">Route Summary</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-[#0e0f12] rounded-xl p-2.5 border border-[#2a2d3a]">
                    <p className="text-[9px] text-[#6b7280] uppercase font-semibold tracking-wider">
                      Distance {routeSummary.usingFallback && <span className="text-amber-500">~est</span>}
                    </p>
                    <p className="text-lg font-bold text-[#f1f5f9] font-mono leading-tight">{routeSummary.totalDistKm}<span className="text-xs text-[#6b7280] ml-0.5">km</span></p>
                  </div>
                  <div className="bg-[#0e0f12] rounded-xl p-2.5 border border-[#2a2d3a]">
                    <p className="text-[9px] text-[#6b7280] uppercase font-semibold tracking-wider">Visits</p>
                    <p className="text-lg font-bold text-[#f1f5f9] font-mono leading-tight">{routeSummary.doneVisits}<span className="text-xs text-[#6b7280] ml-0.5">/ {routeSummary.totalVisits}</span></p>
                  </div>
                  <div className="bg-[#0e0f12] rounded-xl p-2.5 border border-[#2a2d3a]">
                    <p className="text-[9px] text-[#6b7280] uppercase font-semibold tracking-wider">At Client</p>
                    <p className="text-sm font-bold text-green-400 font-mono leading-tight">
                      {routeSummary.totalAtClientMins >= 60
                        ? `${Math.floor(routeSummary.totalAtClientMins / 60)}h ${routeSummary.totalAtClientMins % 60}m`
                        : `${routeSummary.totalAtClientMins}m`}
                    </p>
                  </div>
                  <div className="bg-[#0e0f12] rounded-xl p-2.5 border border-[#2a2d3a]">
                    <p className="text-[9px] text-[#6b7280] uppercase font-semibold tracking-wider">Travel Time</p>
                    <p className="text-sm font-bold text-amber-400 font-mono leading-tight">
                      {routeSummary.totalTravelMins >= 60
                        ? `${Math.floor(routeSummary.totalTravelMins / 60)}h ${routeSummary.totalTravelMins % 60}m`
                        : `${routeSummary.totalTravelMins}m`}
                    </p>
                  </div>
                </div>
                {routeSummary.firstCheckIn && (
                  <div className="text-[10px] text-[#6b7280] font-medium flex justify-between">
                    <span>First In: <span className="text-[#9ca3af]">{format(new Date(routeSummary.firstCheckIn), "hh:mm a")}</span></span>
                    {routeSummary.lastActivity && (
                      <span>Last Out: <span className="text-[#9ca3af]">{format(new Date(routeSummary.lastActivity), "hh:mm a")}</span></span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* VISIT TIMELINE - when exec selected */}
            {selectedExecId && (
              <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl flex flex-col overflow-hidden shadow-md flex-1 min-h-0">
                <div className="px-4 py-3 border-b border-[#2a2d3a] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[#b91c1c]" />
                    <p className="text-xs font-bold text-[#f1f5f9] uppercase tracking-widest">Visit Timeline</p>
                  </div>
                  <Badge className="bg-[#0e0f12] text-[#9ca3af] border-[#2a2d3a] text-[10px]">{execVisits.length}</Badge>
                </div>
                <div className="overflow-y-auto flex-1 p-3 space-y-2">
                  {execVisits.length === 0 ? (
                    <div className="py-8 text-center text-sm text-[#4b5563]">
                      <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No visits for this date
                    </div>
                  ) : (
                    execVisits.map((v, i) => (
                      <div key={v.id} className="relative pl-6">
                        {/* Timeline connector */}
                        {i < execVisits.length - 1 && (
                          <div className="absolute left-[9px] top-5 bottom-0 w-px bg-[#2a2d3a]" />
                        )}
                        <div className="absolute left-0 top-1.5 w-5 h-5 rounded-full border-2 border-[#0e0f12] flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
                          style={{ backgroundColor: statusColor(v.status) }}>
                          {i + 1}
                        </div>
                        <div className="bg-[#0e0f12] border border-[#2a2d3a] rounded-xl p-3 hover:border-[#3a3d4a] transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <p className="text-xs font-bold text-[#f1f5f9] leading-tight">{v.client_name}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              {statusIcon(v.status)}
                              <span className="text-[9px] font-semibold uppercase tracking-wider"
                                style={{ color: statusColor(v.status) }}>
                                {v.status.replace("_", " ")}
                              </span>
                            </div>
                          </div>
                          {v.purpose && <p className="text-[10px] text-[#6b7280] mb-1.5">{v.purpose}</p>}
                          {v.address && (
                            <p className="text-[10px] text-[#4b5563] flex items-center gap-1 mb-1.5 truncate">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />{v.address}
                            </p>
                          )}
                          <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-[#2a2d3a]">
                            <div>
                              <p className="text-[8px] text-[#4b5563] uppercase font-semibold">Check In</p>
                              <p className="text-[10px] font-semibold text-[#9ca3af]">
                                {v.check_in_at ? format(new Date(v.check_in_at), "hh:mm a") : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[8px] text-[#4b5563] uppercase font-semibold">Check Out</p>
                              <p className="text-[10px] font-semibold text-[#9ca3af]">
                                {v.done_at ? format(new Date(v.done_at), "hh:mm a") : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[8px] text-[#4b5563] uppercase font-semibold">Duration</p>
                              <p className="text-[10px] font-semibold text-green-400">
                                {durationStr(v.check_in_at, v.done_at)}
                              </p>
                            </div>
                          </div>
                          {v.gps_lat && (
                            <p className="text-[8px] text-[#4b5563] mt-1.5 font-mono">
                              GPS: {v.gps_lat?.toFixed(5)}, {v.gps_lng?.toFixed(5)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TRACKING ACTIVE LIST - when no exec selected */}
            {!selectedExecId && (
              <div className="bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl flex flex-col overflow-hidden shadow-md flex-1 min-h-0">
                <div className="px-4 py-3 border-b border-[#2a2d3a] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-green-500" />
                    <p className="text-xs font-bold text-[#f1f5f9] uppercase tracking-widest">Tracking Active</p>
                  </div>
                  <Badge className="bg-[#0e0f12] text-[#9ca3af] border-[#2a2d3a] text-[10px]">{filteredLocations.length}</Badge>
                </div>
                <div className="overflow-y-auto flex-1">
                  {filteredLocations.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#4b5563] flex flex-col items-center gap-2">
                      <Users className="h-8 w-8 opacity-30" />
                      <p>No executives actively broadcasting location.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#2a2d3a]">
                      {filteredLocations.map(loc => {
                        const isStale = new Date().getTime() - new Date(loc.updated_at).getTime() > 300000;
                        return (
                          <div
                            key={loc.user_id}
                            className="p-4 hover:bg-[#2a2d3a]/40 transition-colors cursor-pointer flex items-center justify-between group"
                            onClick={() => setSelectedExecId(loc.user_id)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-[#2a2d3a] border border-[#3a3d4a] flex items-center justify-center text-xs font-bold text-[#f1f5f9] shrink-0">
                                {loc.full_name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#f1f5f9] truncate">{loc.full_name}</p>
                                <p className="text-[10px] text-[#6b7280] font-medium flex items-center gap-1 mt-0.5">
                                  <Clock className="h-2.5 w-2.5" />
                                  {isStale ? "⚠" : "●"} {formatDistanceToNow(new Date(loc.updated_at))} ago
                                </p>
                                {loc.showroom_name && (
                                  <p className="text-[9px] text-[#4b5563] truncate">{loc.showroom_name}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className={`w-2.5 h-2.5 rounded-full ${isStale ? "bg-amber-400" : "bg-green-500 animate-pulse"}`} />
                              <ChevronRight className="h-4 w-4 text-[#4b5563] group-hover:text-[#9ca3af] transition-colors" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
