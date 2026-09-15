import { expect, it, vi } from "vitest";
import { withLocationTelemetryFallback } from "@/lib/locationTelemetry";

it.each([
  { code: "42703", message: "column location_history.accuracy_m does not exist" },
  { code: "PGRST204", message: "Could not find the 'recorded_at' column of 'live_locations' in the schema cache" },
])("retries basic GPS fields when telemetry is missing: $code", async (error) => {
  const full = vi.fn().mockResolvedValue({ data: null, error });
  const basic = vi.fn().mockResolvedValue({ data: [{ user_id: "exec" }], error: null });
  expect(await withLocationTelemetryFallback(full, basic)).toEqual({ data: [{ user_id: "exec" }], error: null });
  expect(basic).toHaveBeenCalledTimes(1);
});

it.each([
  null,
  { code: "42501", message: "new row violates row-level security policy" },
  { code: "PGRST204", message: "Could not find the 'user_id' column" },
  { code: "", message: "Failed to fetch" },
])("does not retry successful queries or unrelated failures: %j", async (error) => {
  const result = { data: null, error };
  const basic = vi.fn();
  expect(await withLocationTelemetryFallback(() => Promise.resolve(result), basic)).toBe(result);
  expect(basic).not.toHaveBeenCalled();
});

it("returns a failed basic GPS write instead of pretending it succeeded", async () => {
  const error = { code: "42501", message: "Permission denied" };
  const result = await withLocationTelemetryFallback(
    async () => ({ error: { code: "42703", message: "column accuracy_m does not exist" } }),
    async () => ({ error }),
  );
  expect(result.error).toBe(error);
});
