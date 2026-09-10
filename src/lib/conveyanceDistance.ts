export type TrackPoint = { lat: number; lng: number; timestamp: string; accuracy_m?: number | null };

function valid(point: TrackPoint) {
  return Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) && Math.abs(point.lng) <= 180 && Number.isFinite(Date.parse(point.timestamp));
}

// Keep full precision until the entire journey has been added, including small segments.
export function trackDistanceKm(a: TrackPoint, b: TrackPoint) {
  const radians = (value: number) => value * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** Conservative estimate: recorded movement can increase, but never reduce, the endpoint road estimate.
 * Missing intervals are joined by straight lines; this is not an odometer reading or a reconstructed road route.
 */
export function estimateConveyanceDistance(start: TrackPoint, end: TrackPoint, history: TrackPoint[], roadKm: number) {
  if (!valid(start) || !valid(end) || Date.parse(end.timestamp) < Date.parse(start.timestamp)) {
    throw new Error("Invalid conveyance location or time interval");
  }
  const startMs = Date.parse(start.timestamp);
  const endMs = Date.parse(end.timestamp);
  let previous = start;
  let anchor = start;
  let trackedKm = 0;
  let maxGapMinutes = 0;
  let rejectedPoints = 0;
  const points = history.filter(point => {
    const inWindow = valid(point) && Date.parse(point.timestamp) > startMs && Date.parse(point.timestamp) < endMs;
    if (!inWindow) return false;
    if (point.accuracy_m != null && (!Number.isFinite(point.accuracy_m) || point.accuracy_m < 0 || point.accuracy_m > 100)) {
      rejectedPoints++;
      return false;
    }
    return true;
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  for (const point of points) {
    const hours = (Date.parse(point.timestamp) - Date.parse(previous.timestamp)) / 3600000;
    if (hours <= 0 || trackDistanceKm(previous, point) / hours > 180) {
      rejectedPoints++;
      continue;
    }
    maxGapMinutes = Math.max(maxGapMinutes, hours * 60);
    previous = point;
    // Ignore stationary GPS jitter; accumulate real movement from the last accepted anchor.
    if (trackDistanceKm(anchor, point) >= 0.03) {
      trackedKm += trackDistanceKm(anchor, point);
      anchor = point;
    }
  }
  maxGapMinutes = Math.max(maxGapMinutes, (endMs - Date.parse(previous.timestamp)) / 60000);
  trackedKm += trackDistanceKm(anchor, end);
  const endpointKm = Number.isFinite(roadKm) && roadKm >= 0 ? roadKm : trackDistanceKm(start, end);
  return {
    distanceKm: Number(Math.max(endpointKm, trackedKm).toFixed(1)),
    trackedKm,
    maxGapMinutes,
    rejectedPoints,
    hasGaps: maxGapMinutes > 10,
  };
}
