import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBackgroundTracking } from "@/hooks/useBackgroundTracking";

const mocks = vi.hoisted(() => ({ native: false, addWatcher: vi.fn(), removeWatcher: vi.fn(), write: vi.fn(), gps: vi.fn(), error: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => mocks.native }, registerPlugin: () => ({ addWatcher: mocks.addWatcher, removeWatcher: mocks.removeWatcher, openSettings: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, dismiss: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => ({ upsert: (row: unknown) => mocks.write(table, row), insert: (row: unknown) => mocks.write(table, row) }) } }));
const position = () => ({ coords: { latitude: 28.6, longitude: 77.2, accuracy: 5, altitude: null, speed: null, heading: null }, timestamp: Date.now() - 90_000 });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-23T05:00:00Z"));
  vi.resetAllMocks(); mocks.native = false;
  mocks.write.mockResolvedValue({ error: null }); mocks.removeWatcher.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: mocks.gps } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("resumes after denied permission when the employee returns to the app", async () => {
  renderHook(() => useBackgroundTracking({ active: true, userId: "employee" }));
  act(() => mocks.gps.mock.calls[0][1]({ code: 1 }));
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(mocks.gps).toHaveBeenCalledTimes(1);
  act(() => window.dispatchEvent(new Event("focus")));
  await act(async () => mocks.gps.mock.calls[1][0](position()));
  expect(mocks.write).toHaveBeenCalledWith("live_locations", expect.objectContaining({ user_id: "employee" }));
});

it("refreshes GPS immediately when connectivity returns", async () => {
  renderHook(() => useBackgroundTracking({ active: true, userId: "employee" }));
  await act(async () => mocks.gps.mock.calls[0][0](position()));
  act(() => window.dispatchEvent(new Event("online")));
  expect(mocks.gps).toHaveBeenCalledTimes(2);
});

it("does not mark a cached GPS sample as newly recorded", async () => {
  renderHook(() => useBackgroundTracking({ active: true, userId: "employee" }));
  const sample = position();
  await act(async () => mocks.gps.mock.calls[0][0](sample));
  expect(mocks.write).toHaveBeenCalledWith("live_locations", expect.objectContaining({ updated_at: new Date(sample.timestamp).toISOString() }));
  expect(mocks.write).toHaveBeenCalledWith("location_history", expect.objectContaining({ timestamp: new Date(sample.timestamp).toISOString() }));
});

it("ignores late GPS callbacks and removes resume listeners after End Day", async () => {
  const { rerender } = renderHook(({ active }) => useBackgroundTracking({ active, userId: "employee" }), { initialProps: { active: true } });
  rerender({ active: false });
  await act(async () => mocks.gps.mock.calls[0][0](position()));
  act(() => window.dispatchEvent(new Event("focus")));
  expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.gps).toHaveBeenCalledTimes(1);
});

it("removes a native watcher whose registration finishes after cleanup", async () => {
  mocks.native = true;
  let complete!: (id: string) => void;
  mocks.addWatcher.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const { unmount } = renderHook(() => useBackgroundTracking({ active: true, userId: "employee" }));
  unmount();
  await act(async () => complete("late-watcher"));
  expect(mocks.removeWatcher).toHaveBeenCalledWith({ id: "late-watcher" });
  await act(async () => mocks.addWatcher.mock.calls[0][1]({ latitude: 28, longitude: 77 }, null));
  expect(mocks.write).not.toHaveBeenCalled();
});

it("does not write the previous employee's delayed GPS sample after account changes", async () => {
  const { rerender } = renderHook(({ userId }) => useBackgroundTracking({ active: true, userId }), { initialProps: { userId: "first" } });
  rerender({ userId: "second" });
  await act(async () => { mocks.gps.mock.calls[0][0](position()); mocks.gps.mock.calls[1][0](position()); });
  expect(mocks.write.mock.calls.every(call => call[1].user_id === "second")).toBe(true);
});
