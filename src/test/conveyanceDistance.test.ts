import { describe, it, expect } from "vitest";
import { estimateConveyanceDistance, type TrackPoint } from "@/lib/conveyanceDistance";

const point = (lat: number, minute: number, extra: Partial<TrackPoint> = {}): TrackPoint => ({
  lat, lng: 0, timestamp: new Date(Date.UTC(2026, 7, 14, 8, minute)).toISOString(), ...extra,
});

describe("conveyance journey estimate", () => {
  it("includes intermediate travel when a trip returns near its starting location", () => {
    const result = estimateConveyanceDistance(point(0, 0), point(0.02, 480), [
      point(0.17, 90), point(0.17, 150), point(0.01, 450),
    ], 5.5);
    expect(result.distanceKm).toBeCloseTo(37.8, 1);
    expect(result.hasGaps).toBe(true);
  });
  it("preserves the road estimate when it exceeds observed straight segments", () => {
    expect(estimateConveyanceDistance(point(0, 0), point(0.01, 30), [], 1.9).distanceKm).toBe(1.9);
  });
  it("counts a round trip even when the endpoints are identical", () => {
    expect(estimateConveyanceDistance(point(0, 0), point(0, 60), [point(0.05, 30)], 0).distanceKm).toBe(11.1);
  });
  it("ignores points outside the leg and sorts points within it", () => {
    const result = estimateConveyanceDistance(point(0, 0), point(0.02, 60), [
      point(10, -1), point(0.01, 40), point(0.03, 20), point(10, 61),
    ], 0);
    expect(result.distanceKm).toBe(6.7);
  });
  it("rejects inaccurate and physically implausible intermediate points", () => {
    const result = estimateConveyanceDistance(point(0, 0), point(0.02, 60), [
      point(10, 1), point(10, 20, { accuracy_m: 1000 }), point(0.01, 30),
    ], 3);
    expect(result.distanceKm).toBe(3);
    expect(result.rejectedPoints).toBe(2);
  });
  it("does not bill stationary GPS jitter as travel", () => {
    const samples = Array.from({ length: 59 }, (_, i) => point(i % 2 ? 0.00005 : -0.00005, i + 1));
    expect(estimateConveyanceDistance(point(0, 0), point(0, 60), samples, 0).distanceKm).toBe(0);
  });
  it("sums small moving segments before rounding", () => {
    const samples = Array.from({ length: 99 }, (_, i) => point((i + 1) * 0.0003, i + 1));
    const result = estimateConveyanceDistance(point(0, 0), point(0.03, 100), samples, 0);
    expect(result.distanceKm).toBe(3.3);
    expect(result.hasGaps).toBe(false);
  });
  it("supports old telemetry with no accuracy and rejects invalid coordinates", () => {
    const result = estimateConveyanceDistance(point(0, 0), point(0.02, 60), [point(NaN, 10), point(91, 20)], 3);
    expect(result.distanceKm).toBe(3);
  });
  it("rejects reversed windows and invalid endpoints", () => {
    expect(() => estimateConveyanceDistance(point(0, 60), point(0, 0), [], 0)).toThrow();
    expect(() => estimateConveyanceDistance(point(NaN, 0), point(0, 60), [], 0)).toThrow();
  });
});
