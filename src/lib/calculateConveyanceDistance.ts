import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { calculateRouteDistance } from "@/lib/utils";
import { estimateConveyanceDistance, type TrackPoint } from "@/lib/conveyanceDistance";
import { toast } from "sonner";

export async function calculateConveyanceDistance(userId: string, start: TrackPoint, end: TrackPoint): Promise<number> {
  const historyRequest = fetchAllRows<TrackPoint>((from, to) => supabase.from("location_history")
    .select("*") // Older projects may not yet have accuracy_m; missing accuracy is supported.
    .eq("user_id", userId)
    .gte("timestamp", start.timestamp).lte("timestamp", end.timestamp)
    .order("timestamp", { ascending: true }).order("id", { ascending: true }).range(from, to));
  const [roadKm, history] = await Promise.all([
    calculateRouteDistance(start.lat, start.lng, end.lat, end.lng),
    historyRequest.then(data => ({ data, failed: false })).catch(() => ({ data: [], failed: true })),
  ]);
  const result = estimateConveyanceDistance(start, end, history.data, roadKm);
  if (history.failed) toast.warning("GPS history unavailable. Conveyance uses an endpoint estimate; intermediate travel may be missing.");
  else if (result.hasGaps || result.rejectedPoints) toast.warning("GPS tracking has gaps or unreliable points. Conveyance is an estimate; review any missing travel.");
  return result.distanceKm;
}
