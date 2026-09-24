import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), from: vi.fn(), listener: null as any }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from, auth: { getSession: mocks.getSession, onAuthStateChange: (callback: any) => { mocks.listener = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } },
} }));
const session = { user: { id: "manager", user_metadata: {} } };
function State() {
  const auth = useAuth();
  return <div>{auth.loading ? "Loading" : auth.authError || `${auth.user?.id ?? "signed out"}:${auth.role ?? "none"}:${auth.showroomIds.join(",")}`}</div>;
}
function open() { render(<AuthProvider><State /></AuthProvider>); }
beforeEach(() => {
  vi.useFakeTimers();
  mocks.getSession.mockReset().mockResolvedValue({ data: { session }, error: null });
  mocks.from.mockReset().mockImplementation((table: string) => {
    const result = { data: table === "user_roles" ? [{ role: "manager", showroom_id: "zirakpur" }, { role: "manager", showroom_id: "gurgaon" }, { role: "executive", showroom_id: "other" }] : { id: "profile" }, error: null };
    const chain = { select: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve(result), then: (resolve: any) => Promise.resolve(result).then(resolve) };
    return chain;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("waits for the highest role and all assigned showrooms", async () => {
  open();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText("manager:manager:zirakpur,gurgaon")).toBeInTheDocument();
  await act(async () => mocks.listener("TOKEN_REFRESHED", session));
  expect(screen.queryByText("Loading")).not.toBeInTheDocument();
});
it("stops a hanging session lookup after 15 seconds", async () => {
  mocks.getSession.mockReturnValue(new Promise(() => {}));
  open();
  await act(async () => { await vi.advanceTimersByTimeAsync(15001); });
  expect(screen.getByText(/account could not be loaded/)).toBeInTheDocument();
  expect(screen.queryByText("Loading")).not.toBeInTheDocument();
});
it("surfaces a rejected role request instead of leaving the dashboard spinner", async () => {
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: "Network failed" } }) }) }));
  open();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText(/account could not be loaded/)).toBeInTheDocument();
});
it("times out role loading and ignores its late result", async () => {
  let resolveRole!: (result: unknown) => void;
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => new Promise(resolve => { resolveRole = resolve; }) }) }));
  open();
  await act(async () => { await vi.advanceTimersByTimeAsync(15002); });
  expect(screen.getByText(/account could not be loaded/)).toBeInTheDocument();
  await act(async () => resolveRole({ data: [{ role: "manager", showroom_id: "zirakpur" }], error: null }));
  expect(screen.getByText(/account could not be loaded/)).toBeInTheDocument();
});
it("ignores a pending role response after sign-out", async () => {
  let resolveRole!: (result: unknown) => void;
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => new Promise(resolve => { resolveRole = resolve; }) }) }));
  open();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  await act(async () => mocks.listener("SIGNED_OUT", null));
  await act(async () => resolveRole({ data: [{ role: "admin", showroom_id: null }], error: null }));
  expect(screen.getByText("signed out:none:")).toBeInTheDocument();
});
