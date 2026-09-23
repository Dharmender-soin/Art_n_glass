import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LiveTracking } from "@/components/dashboard/LiveTracking";

const state = vi.hoisted(() => ({
  role: "admin",
  showroomIds: ["room"],
  errors: {} as Record<string, { message: string }>,
  rows: {} as Record<string, unknown[]>,
  mapError: undefined as Error | undefined,
  mapLoaded: false,
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: state.role, showroomId: "room", showroomIds: state.showroomIds }) }));
vi.mock("@react-google-maps/api", () => ({
  useJsApiLoader: () => ({ isLoaded: state.mapLoaded, loadError: state.mapError }),
  GoogleMap: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  OverlayView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DirectionsRenderer: () => null,
  TrafficLayer: () => null,
  Polyline: () => null,
  Circle: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: state.from,
  rpc: state.rpc,
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
} }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T10:00:00Z"));
  state.role = "admin";
  state.errors = {};
  state.mapError = undefined;
  state.mapLoaded = false;
  state.rows = {
    live_locations: [{ user_id: "exec", lat: 28.6, lng: 77.2, updated_at: "2026-09-15T09:59:50Z" }],
    location_history: [],
    profiles: [{ user_id: "exec", full_name: "Test Executive", conveyance_type: "bike" }],
    showrooms: [{ id: "room", name: "Test Showroom" }],
    user_roles: [{ user_id: "exec", role: "executive", showroom_id: "room", showrooms: { name: "Test Showroom" } }],
    daily_attendance: [{ user_id: "exec" }],
  };
  state.from.mockReset().mockImplementation((table: string) => {
    const chain = {
      select: () => chain, eq: () => chain, gte: () => chain, order: () => chain, range: () => chain,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: state.rows[table] || [], error: state.errors[table] || null }).then(resolve),
    };
    return chain;
  });
  state.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openMap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => {
    render(<QueryClientProvider client={client}><LiveTracking /></QueryClientProvider>);
  });
}

it("reports a failed GPS query as unavailable and lets Retry recover", async () => {
  state.errors.live_locations = { message: "Failed to fetch" };
  await openMap();
  expect(screen.getByRole("alert")).toHaveTextContent("could not be verified");
  expect(screen.getByText("GPS status unavailable")).toBeInTheDocument();
  expect(screen.queryByText("0 Live")).not.toBeInTheDocument();
  expect(screen.queryByText("No saved location found")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Loading executive locations")).not.toBeInTheDocument();
  delete state.errors.live_locations;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); });
  expect(screen.getByText("Test Executive")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps current GPS results available when location history fails", async () => {
  state.errors.location_history = { message: "History unavailable" };
  await openMap();
  expect(screen.getByText("Test Executive")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Location history is unavailable");
  expect(screen.queryByLabelText("Loading executive locations")).not.toBeInTheDocument();
});

it("recovers through polling even when no realtime events arrive", async () => {
  state.errors.live_locations = { message: "Offline" };
  await openMap();
  delete state.errors.live_locations;
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.getByText("Test Executive")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ages both the live indicator and employee status without new GPS writes", async () => {
  state.rows.live_locations[0] = { user_id: "exec", lat: 28.6, lng: 77.2, updated_at: "2026-09-15T09:55:10Z" };
  await openMap();
  expect(screen.getByText("1 Live")).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.getByText("0 Live")).toBeInTheDocument();
  expect(screen.getByText("STALE", { exact: true })).toBeInTheDocument();
});

it("retains last known positions with a warning after refresh fails", async () => {
  await openMap();
  state.errors.live_locations = { message: "Offline" };
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.getByText("Test Executive")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Showing previously saved locations");
  expect(screen.queryByText("0 Live")).not.toBeInTheDocument();
});

it("does not turn a failed manager team lookup into an empty team", async () => {
  state.role = "manager";
  state.rpc.mockResolvedValue({ data: null, error: { message: "Team lookup failed" } });
  await openMap();
  expect(screen.getByRole("alert")).toHaveTextContent("could not be verified");
  expect(screen.queryByText("No saved location found")).not.toBeInTheDocument();
});

it("shows executive status even if Google Maps fails to load", async () => {
  state.mapError = new Error("Map script failed");
  await openMap();
  expect(screen.getByRole("alert")).toHaveTextContent("The map could not load");
  expect(screen.getByText("Test Executive")).toBeInTheDocument();
});

it("keeps old GPS marker names visible without hover", async () => {
  state.mapLoaded = true;
  state.rows.live_locations[0] = { user_id: "exec", lat: 28.6, lng: 77.2, updated_at: "2026-09-15T08:00:00Z" };
  await openMap();
  const markerName = screen.getAllByText("Test Executive").find(el => screen.getByTestId("map").contains(el));
  expect(markerName).toBeVisible();
  expect(markerName?.parentElement?.className).not.toMatch(/opacity-0/);
  expect(screen.getByTestId("map")).toHaveTextContent("Last known location");
});

it("uses the manager's showroom roster names when profile RLS omits employees", async () => {
  state.role = "manager";
  state.rows.profiles = [];
  state.rpc.mockResolvedValue({ data: [{ user_id: "exec", role: "executive", full_name: "Roster name" }], error: null });
  await openMap();
  expect(screen.getByText("Roster name")).toBeInTheDocument();
  expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
});
