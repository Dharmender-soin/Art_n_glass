import { beforeEach, expect, it, vi } from "vitest";
import { calculateConveyanceDistance } from "@/lib/calculateConveyanceDistance";
import { calculateRouteDistance } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/utils", () => ({ calculateRouteDistance: vi.fn() }));
vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));
const start = { lat: 0, lng: 0, timestamp: "2026-08-14T08:00:00Z" };
const end = { lat: 0.02, lng: 0, timestamp: "2026-08-14T16:00:00Z" };
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks();
  query = Object.fromEntries(["select", "eq", "gte", "lte", "order", "range"].map(key => [key, vi.fn()]));
  for (const method of Object.values(query)) method.mockReturnValue(query);
  vi.mocked(supabase.from).mockReturnValue(query as never);
  vi.mocked(calculateRouteDistance).mockResolvedValue(5.5);
});

it("reads all GPS pages for only this executive and leg", async () => {
  const sameLocation = { lat: 0, lng: 0, timestamp: "2026-08-14T08:01:00Z" };
  query.range.mockResolvedValueOnce({ data: Array(1000).fill(sameLocation), error: null })
    .mockResolvedValueOnce({ data: [{ lat: 0.17, lng: 0, timestamp: "2026-08-14T10:00:00Z" }], error: null });
  expect(await calculateConveyanceDistance("executive-id", start, end)).toBeGreaterThan(35);
  expect(query.eq).toHaveBeenCalledWith("user_id", "executive-id");
  expect(query.gte).toHaveBeenCalledWith("timestamp", start.timestamp);
  expect(query.lte).toHaveBeenCalledWith("timestamp", end.timestamp);
  expect(query.range).toHaveBeenNthCalledWith(2, 1000, 1999);
});

it("warns and uses endpoint estimate when history cannot be read", async () => {
  query.range.mockResolvedValue({ data: null, error: { message: "Offline" } });
  expect(await calculateConveyanceDistance("executive-id", start, end)).toBe(5.5);
  expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("GPS history unavailable"));
});

it("reports missing coverage instead of implying complete GPS tracking", async () => {
  query.range.mockResolvedValue({ data: [], error: null });
  expect(await calculateConveyanceDistance("executive-id", start, end)).toBe(5.5);
  expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("gaps"));
});
