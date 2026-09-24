import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import Conveyance from "@/pages/Conveyance";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), recordTargets: vi.fn(), failRoles: false, failRecords: false,
  auth: { user: { id: "admin" }, role: "admin", showroomIds: [] as string[] } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));
const roster = [
  { user_id: "pravesh", role: "manager", showroom_id: "zirakpur" },
  { user_id: "exec", role: "executive", showroom_id: "gurgaon" },
];
beforeEach(() => {
  mocks.auth = { user: { id: "admin" }, role: "admin", showroomIds: [] };
  mocks.from.mockClear(); mocks.rpc.mockReset(); mocks.recordTargets.mockClear();
  mocks.failRoles = false;
  mocks.failRecords = false;
  mocks.from.mockImplementation((table: string) => {
    let rows: any[] = table === "user_roles" ? roster : table === "profiles" ? [
      { user_id: "pravesh", full_name: "Mr. PRAVESH KUMAR" }, { user_id: "exec", full_name: "Other Employee" },
    ] : table === "showrooms" ? [
      { id: "zirakpur", name: "Zirakpur" }, { id: "gurgaon", name: "Gurgaon" }, { id: "empty", name: "Empty showroom" },
    ] : table === "conveyance_records" ? [
      { id: "trip", user_id: "pravesh", date: "2026-09-24", distance_km: 10, amount: 80, vehicle_type: "car", rate_per_km: 8, from_location_name: "Start", to_location_name: "Client", visit_id: "visit" },
    ] : [];
    const chain = {
      select: () => chain, order: () => chain, range: () => chain, gte: () => chain, lte: () => chain,
      in: (key: string, values: string[]) => { if (table === "conveyance_records") mocks.recordTargets(values); rows = rows.filter(r => values.includes(r[key])); return chain; },
      eq: (key: string, value: string) => { rows = rows.filter(r => r[key] === value); return chain; },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: (table === "user_roles" && mocks.failRoles) || (table === "conveyance_records" && mocks.failRecords) ? { message: "Network failed" } : null }).then(resolve),
    };
    return chain;
  });
});
afterEach(cleanup);
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><Conveyance /></QueryClientProvider>);
}

it("includes manager trips under Zirakpur and never leaks them into an empty showroom", async () => {
  open();
  await screen.findByRole("option", { name: "Mr. PRAVESH KUMAR" });
  await waitFor(() => expect(screen.getAllByText("10.0 km").length).toBeGreaterThan(0));
  fireEvent.change(screen.getByDisplayValue("All Showrooms"), { target: { value: "zirakpur" } });
  await waitFor(() => expect(screen.getAllByText("Mr. PRAVESH KUMAR").length).toBeGreaterThan(0));
  expect(screen.queryByText("No conveyance records found")).not.toBeInTheDocument();
  fireEvent.change(screen.getByDisplayValue("Zirakpur"), { target: { value: "empty" } });
  expect(await screen.findByText("No conveyance records found")).toBeInTheDocument();
  expect(screen.queryByText("10.0 km")).not.toBeInTheDocument();
});

it("shows role lookup failure as unavailable instead of zero conveyance, and retries", async () => {
  mocks.failRoles = true;
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Conveyance could not be loaded");
  expect(screen.queryByText("No conveyance records found")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export Excel" })).toBeDisabled();
  mocks.failRoles = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getAllByText("10.0 km").length).toBeGreaterThan(0));
});

it("does not call a failed records request an empty report", async () => {
  mocks.failRecords = true;
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("totals are unavailable");
  expect(screen.queryByText("No conveyance records found")).not.toBeInTheDocument();
  expect(screen.queryByText("₹0")).not.toBeInTheDocument();
});

function asAccountant(showroomIds = ["zirakpur"]) {
  mocks.auth = { user: { id: "accountant" }, role: "accountant", showroomIds };
  mocks.rpc.mockImplementation(async (_name, { p_showroom_id }) => ({ data: p_showroom_id === "zirakpur" ? [
    { user_id: "pravesh", role: "manager", full_name: "Mr. PRAVESH KUMAR" },
    { user_id: "zirak-exec", role: "executive", full_name: "Zirakpur Executive" },
    { user_id: "zirak-tl", role: "tl", full_name: "Zirakpur Team Leader" },
  ] : [], error: null }));
}

it("lets a Zirakpur accountant view manager, TL and executive names and manager conveyance without another profiles lookup", async () => {
  asAccountant();
  open();
  await screen.findByRole("option", { name: "Mr. PRAVESH KUMAR" });
  expect(screen.getByRole("option", { name: "Zirakpur Executive" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Zirakpur Team Leader" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Other Employee" })).not.toBeInTheDocument();
  expect(mocks.rpc).toHaveBeenCalledWith("get_showroom_leaderboard", { p_showroom_id: "zirakpur" });
  expect(mocks.from).not.toHaveBeenCalledWith("profiles");
  await waitFor(() => expect(mocks.recordTargets).toHaveBeenCalledWith(["pravesh", "zirak-exec", "zirak-tl"]));
  fireEvent.change(screen.getByDisplayValue("All Employees"), { target: { value: "pravesh" } });
  await waitFor(() => expect(mocks.recordTargets).toHaveBeenCalledWith(["pravesh"]));
  await waitFor(() => expect(screen.getAllByText("10.0 km").length).toBeGreaterThan(0));
  expect(screen.getByRole("button", { name: "Export Excel" })).toBeEnabled();
});

it("keeps an accountant with no assigned showroom from querying every employee's records", async () => {
  asAccountant([]);
  open();
  expect(await screen.findByText("No conveyance records found")).toBeInTheDocument();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalledWith("conveyance_records");
});

it("shows an accountant's roster failure with retry rather than an empty claim", async () => {
  asAccountant();
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Roster failed" } });
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Conveyance could not be loaded");
  expect(mocks.from).not.toHaveBeenCalledWith("conveyance_records");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getAllByText("10.0 km").length).toBeGreaterThan(0));
});
