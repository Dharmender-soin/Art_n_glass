import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import Admin from "@/pages/Admin";

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), rate: 8 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, functions: { invoke: async () => ({ data: { users: [] } }) } } }));
vi.mock("@/components/dashboard/SendNotificationForm", () => ({ SendNotificationForm: () => null }));
vi.mock("@/components/dashboard/ScheduledNotificationsPanel", () => ({ ScheduledNotificationsPanel: () => null }));
beforeEach(() => {
  mocks.rate = 8;
  mocks.update.mockClear();
  mocks.from.mockImplementation((table: string) => {
    const data = table === "profiles" ? [{ user_id: "pravesh", full_name: "Mr. PRAVESH KUMAR", conveyance_type: "car", conveyance_rate: mocks.rate }]
      : table === "user_roles" ? [{ user_id: "pravesh", id: "role", role: "manager", showroom_id: "zirakpur" }]
      : table === "showrooms" ? [{ id: "zirakpur", name: "Zirakpur" }]
      : table === "conveyance_settings" ? [{ id: "car", vehicle_type: "car", rate_per_km: 8 }] : [];
    const chain = { select: () => chain, order: () => chain, eq: () => chain,
      update: (value: unknown) => { mocks.update(value); return chain; },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
    return chain;
  });
});
afterEach(cleanup);
async function openEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><Admin /></QueryClientProvider>);
  fireEvent.click(await screen.findByTitle("Edit Profile"));
  return screen.getByRole("dialog");
}

it("preserves the saved car and rate when the admin edits a name", async () => {
  const dialog = await openEditor();
  expect(within(dialog).getByRole("spinbutton")).toHaveValue(8);
  fireEvent.change(within(dialog).getByDisplayValue("Mr. PRAVESH KUMAR"), { target: { value: "Pravesh Kumar" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ full_name: "Pravesh Kumar", conveyance_type: "car", conveyance_rate: 8 })));
});

it("preserves a deliberately configured zero rate", async () => {
  mocks.rate = 0;
  const dialog = await openEditor();
  expect(within(dialog).getByRole("spinbutton")).toHaveValue(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ conveyance_type: "car", conveyance_rate: 0 })));
});
