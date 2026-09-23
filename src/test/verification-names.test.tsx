import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Verification from "@/pages/Verification";

const mocks = vi.hoisted(() => ({ names: vi.fn(), from: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "manager" }, role: "manager", showroomIds: ["room"] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/employeeNames", () => ({ loadEmployeeNames: mocks.names, unavailableEmployeeName: (id: string) => `Name unavailable (${id})` }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockImplementation((table: string) => {
    const chain = { select: () => chain, order: () => chain, range: () => chain, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "work_scope_items" ? [{ id: "work", created_by: "sandeep", creator_name: "sandeep", work_status: "pending" }] : [], error: null }).then(resolve) };
    return chain;
  });
});
afterEach(cleanup);
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><Verification /></QueryClientProvider>);
}

it("waits for employee names instead of flashing Unknown Executive", async () => {
  let resolveNames!: (value: unknown) => void;
  mocks.names.mockImplementation(() => new Promise(resolve => { resolveNames = resolve; }));
  open();
  await waitFor(() => expect(mocks.names).toHaveBeenCalled());
  expect(screen.getByText("Loading verification items...")).toBeInTheDocument();
  expect(screen.queryByText(/Unknown Executive|Name unavailable/)).not.toBeInTheDocument();
  await act(async () => resolveNames({ names: { sandeep: "sandeep" }, unresolvedIds: [] }));
  expect(await screen.findByRole("button", { name: /sandeep 1 items/ })).toBeInTheDocument();
  expect(mocks.names).toHaveBeenCalledWith(["sandeep"], [{ user_id: "sandeep", full_name: "sandeep" }]);
});

it("shows name lookup errors and allows retry to restore the real name", async () => {
  mocks.names.mockRejectedValueOnce(new Error("Network failed")).mockResolvedValue({ names: { sandeep: "sandeep" }, unresolvedIds: [] });
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Some employee names could not be loaded");
  fireEvent.click(screen.getByRole("button", { name: "Retry names" }));
  expect(await screen.findByRole("button", { name: /sandeep 1 items/ })).toBeInTheDocument();
});
