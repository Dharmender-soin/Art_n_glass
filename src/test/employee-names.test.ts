import { beforeEach, expect, it, vi } from "vitest";
import { loadEmployeeNames, resolveEmployeeNames } from "@/lib/employeeNames";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), profiles: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc, from: () => ({ select: () => ({ in: mocks.profiles }) }),
} }));
beforeEach(() => { vi.resetAllMocks(); mocks.rpc.mockResolvedValue({ data: [], error: null }); });

it("keeps historical work authors named when profile RLS omits them", async () => {
  mocks.profiles.mockResolvedValue({ data: [], error: null });
  const result = await loadEmployeeNames(["old-employee"], [{ user_id: "old-employee", full_name: "Sandeep" }]);
  expect(result).toEqual({ names: { "old-employee": "Sandeep" }, unresolvedIds: [] });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("prefers current profile names over the historical work snapshot", async () => {
  mocks.profiles.mockResolvedValue({ data: [{ user_id: "staff", full_name: " Updated name " }], error: null });
  expect((await loadEmployeeNames(["staff"], [{ user_id: "staff", full_name: "Old name" }])).names.staff).toBe("Updated name");
});

it("recovers missing/blank names through the scoped RPC and preserves known names", async () => {
  mocks.rpc.mockResolvedValue({ data: [{ user_id: "missing", full_name: "Recovered name" }], error: null });
  const result = await resolveEmployeeNames(["known", "missing"], [{ user_id: "known", full_name: "Known name" }, { user_id: "missing", full_name: " " }]);
  expect(result.names).toEqual({ known: "Known name", missing: "Recovered name" });
  expect(mocks.rpc).toHaveBeenCalledWith("get_employee_display_names", { p_user_ids: ["missing"] });
});

it("reports unresolved IDs without replacing real names if the migration is pending", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  expect(await resolveEmployeeNames(["known", "missing"], [{ user_id: "known", full_name: "Known" }])).toEqual({ names: { known: "Known" }, unresolvedIds: ["missing"] });
});

it("chunks name requests within the RPC limit and deduplicates IDs", async () => {
  const ids = Array.from({ length: 205 }, (_, i) => `staff-${i}`);
  mocks.rpc.mockImplementation((_name, { p_user_ids }) => Promise.resolve({ data: p_user_ids.map((id: string) => ({ user_id: id, full_name: id })), error: null }));
  expect((await resolveEmployeeNames([...ids, ids[0]], [])).unresolvedIds).toEqual([]);
  expect(mocks.rpc.mock.calls.map(call => call[1].p_user_ids.length)).toEqual([100, 100, 5]);
});
