import React, { useEffect, useState } from "react";
import { GoogleMap, useJsApiLoader, OverlayView } from "@react-google-maps/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Navigation, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const containerStyle = {
  width: "100%",
  height: "600px",
  borderRadius: "0.75rem",
};

// Default to India
const defaultCenter = {
  lat: 20.5937,
  lng: 78.9629,
};

const libraries: "places"[] = ["places"];

interface ExecutiveLocation {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
  full_name: string;
  showroom_id?: string;
}

export const LiveTracking = () => {
  const { role, showroomId } = useAuth();
  const [locations, setLocations] = useState<ExecutiveLocation[]>([]);
  const isAdminOrMd = role === "admin" || role === "md";

  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  // Fetch initial locations and user profiles
  useEffect(() => {
    const fetchLocations = async () => {
      // 1. Get live locations
      const { data: locData, error: locError } = await (supabase as any)
        .from("live_locations")
        .select("*");
      
      if (locError) {
        console.error("Error fetching live locations:", locError);
        return;
      }

      // 2. Get profiles and roles for filtering
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
      const { data: roles } = await supabase.from("user_roles").select("user_id, showroom_id");

      const enriched: ExecutiveLocation[] = (locData || []).map((loc) => {
        const profile = profiles?.find((p) => p.user_id === loc.user_id);
        const roleData = roles?.find((r) => r.user_id === loc.user_id);
        return {
          user_id: loc.user_id,
          lat: loc.lat,
          lng: loc.lng,
          updated_at: loc.updated_at,
          full_name: profile?.full_name || "Unknown Executive",
          showroom_id: roleData?.showroom_id,
        };
      });

      // Filter for managers (only their showroom)
      const filtered = isAdminOrMd
        ? enriched
        : enriched.filter((e) => e.showroom_id === showroomId);

      setLocations(filtered);
    };

    fetchLocations();

    // Set up Realtime Subscription for live_locations table
    const channel = (supabase as any)
      .channel("live_locations_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_locations",
        },
        () => {
          // Re-fetch all to get names correctly
          fetchLocations();
        }
      )
      .subscribe();

    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [isAdminOrMd, showroomId]);

  if (!isLoaded) return <div className="h-[600px] w-full animate-pulse bg-muted rounded-xl border flex items-center justify-center text-muted-foreground">Loading Map...</div>;

  const center = locations.length > 0
    ? { lat: locations[0].lat, lng: locations[0].lng }
    : defaultCenter;

  const zoom = locations.length > 0 ? 12 : 5;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="col-span-1 md:col-span-3 bg-[#12141A] border-[#F5F5F7]/5 shadow-sm overflow-hidden">
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={zoom}
            options={{
              disableDefaultUI: false,
              clickableIcons: false,
              styles: [
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                {
                  featureType: "administrative.locality",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#d59563" }],
                },
                {
                  featureType: "poi",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#d59563" }],
                },
                {
                  featureType: "poi.park",
                  elementType: "geometry",
                  stylers: [{ color: "#263c3f" }],
                },
                {
                  featureType: "poi.park",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#6b9a76" }],
                },
                {
                  featureType: "road",
                  elementType: "geometry",
                  stylers: [{ color: "#38414e" }],
                },
                {
                  featureType: "road",
                  elementType: "geometry.stroke",
                  stylers: [{ color: "#212a37" }],
                },
                {
                  featureType: "road",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#9ca5b3" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "geometry",
                  stylers: [{ color: "#746855" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "geometry.stroke",
                  stylers: [{ color: "#1f2835" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#f3d19c" }],
                },
                {
                  featureType: "water",
                  elementType: "geometry",
                  stylers: [{ color: "#17263c" }],
                },
                {
                  featureType: "water",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#515c6d" }],
                },
                {
                  featureType: "water",
                  elementType: "labels.text.stroke",
                  stylers: [{ color: "#17263c" }],
                },
              ]
            }}
          >
            {locations.map((loc) => {
              const isStale = new Date().getTime() - new Date(loc.updated_at).getTime() > 1000 * 60 * 5; // Older than 5 minutes
              return (
                <OverlayView
                  key={loc.user_id}
                  position={{ lat: loc.lat, lng: loc.lng }}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                >
                  <div className="relative -translate-x-1/2 -translate-y-[calc(100%+12px)] flex flex-col items-center">
                    <div className="bg-[#12141A] border border-[#2E7D32]/50 shadow-lg rounded-xl px-3 py-1.5 flex flex-col items-center min-w-max mb-1 z-10 transition-transform hover:scale-105">
                      <p className="text-[#F5F5F7] text-xs font-bold leading-tight">{loc.full_name}</p>
                      <p className={`text-[9px] font-semibold mt-0.5 ${isStale ? "text-amber-500" : "text-[#2E7D32]"}`}>
                        {isStale ? "Last seen" : "Live"}: {formatDistanceToNow(new Date(loc.updated_at))} ago
                      </p>
                    </div>
                    {/* Map Marker Pin */}
                    <div className={`relative ${isStale ? "text-amber-500" : "text-[#2E7D32] animate-bounce"}`}>
                      <Navigation className="w-8 h-8 fill-current stroke-[#0E0F12] stroke-2 drop-shadow-md pb-1" />
                    </div>
                  </div>
                </OverlayView>
              );
            })}
          </GoogleMap>
        </Card>

        {/* Active Executives List */}
        <Card className="col-span-1 bg-[#12141A] border-[#F5F5F7]/5 shadow-sm max-h-[600px] flex flex-col">
          <CardHeader className="py-4 border-b border-[#F5F5F7]/5 bg-[#1A1D24]">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="text-[#F5F5F7] flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[#2E7D32]" /> Tracking Active
              </span>
              <Badge variant="outline" className="bg-[#12141A] text-[#F5F5F7] border-[#F5F5F7]/10">{locations.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs text-[#A1A5AE]">Location broadcasts every 60s</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {locations.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#A1A5AE] flex flex-col items-center gap-2">
                <MapPin className="h-8 w-8 text-[#A1A5AE]/50" />
                <p>No executives are currently checked in and broadcasting location.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#F5F5F7]/5">
                {locations.map(loc => {
                  const isStale = new Date().getTime() - new Date(loc.updated_at).getTime() > 1000 * 60 * 5;
                  return (
                    <div key={loc.user_id} className="p-4 hover:bg-[#F5F5F7]/5 transition-colors flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#F5F5F7] leading-tight">{loc.full_name}</p>
                        <p className="text-[10px] text-[#A1A5AE] flex items-center gap-1 mt-1 font-medium">
                          <Clock className="h-3 w-3" /> updated {formatDistanceToNow(new Date(loc.updated_at))} ago
                        </p>
                      </div>
                      <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-[#12141A] ${isStale ? "bg-amber-500" : "bg-[#2E7D32] animate-pulse"}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
