import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GlobalLocationTracker } from "@/components/GlobalLocationTracker";

const state = vi.hoisted(() => ({ tracking: vi.fn(), endDay: vi.fn(), role: "executive" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "staff" }, role: state.role }) }));
vi.mock("@/hooks/useBackgroundTracking", () => ({ useBackgroundTracking: state.tracking }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: () => table === "daily_attendance" ? Promise.resolve({ data: { id: "attendance" }, error: null }) : state.endDay() };
  return chain;
} } }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 23, 10)); vi.resetAllMocks(); state.role = "executive"; state.endDay.mockResolvedValue({ data: null, error: null }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => { render(<QueryClientProvider client={client}><GlobalLocationTracker /></QueryClientProvider>); await vi.advanceTimersByTimeAsync(1); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  return client;
}

it("waits for End Day status before starting GPS after login", async () => {
  let resolveEnd!: (value: unknown) => void;
  state.endDay.mockImplementation(() => new Promise(resolve => { resolveEnd = resolve; }));
  await mount();
  expect(state.tracking.mock.calls.every(call => call[0].active === false)).toBe(true);
  await act(async () => { resolveEnd({ data: { id: "ended" }, error: null }); await vi.advanceTimersByTimeAsync(1); });
  expect(state.tracking).toHaveBeenLastCalledWith({ userId: "staff", active: false });
});

it("responds immediately to the same attendance and End Day cache used by the home screen", async () => {
  const client = await mount();
  expect(state.tracking).toHaveBeenLastCalledWith({ userId: "staff", active: true });
  await act(async () => { client.setQueryData(["end-day-record", "staff", "2026-09-23"], { id: "ended" }); await vi.advanceTimersByTimeAsync(1); });
  expect(state.tracking).toHaveBeenLastCalledWith({ userId: "staff", active: false });
  await act(async () => { client.setQueryData(["daily-attendance", "staff", "2026-09-23"], null); client.setQueryData(["end-day-record", "staff", "2026-09-23"], null); await vi.advanceTimersByTimeAsync(1); });
  expect(state.tracking).toHaveBeenLastCalledWith({ userId: "staff", active: false });
  await act(async () => { client.setQueryData(["daily-attendance", "staff", "2026-09-23"], { id: "started" }); await vi.advanceTimersByTimeAsync(1); });
  expect(state.tracking).toHaveBeenLastCalledWith({ userId: "staff", active: true });
});

it("does not start tracking while the End Day query has failed", async () => {
  state.endDay.mockResolvedValue({ data: null, error: { message: "Offline" } });
  await mount();
  expect(state.tracking.mock.calls.every(call => !call[0].active)).toBe(true);
});

it.each(["admin", "md", "accountant"])("never starts GPS for %s", async role => {
  state.role = role; await mount();
  expect(state.tracking).toHaveBeenLastCalledWith({ userId: "staff", active: false });
  expect(state.endDay).not.toHaveBeenCalled();
});
