import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import NotificationSettings from "@/pages/NotificationSettings";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin" }, role: "admin", loading: false, showroomIds: [] }) }));
vi.mock("@/lib/scheduledReportGenerator", () => ({}));
vi.mock("@/lib/whatshub", () => ({ sendWhatsHubTest: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(supabase.from).mockImplementation((table) => {
    const result = { data: table === "showrooms" ? [{ id: "one", name: "Showroom", whatsapp_group_id: "12345@g.us", whatsapp_planning_enabled: false }] : null, error: null };
    const chain = { select: () => chain, order: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve(result), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    return chain as never;
  });
  vi.mocked(supabase.rpc).mockImplementation(async (name) => name === "get_whatshub_integration_status"
    ? { data: null, error: { message: "Integration function missing" } } as never
    : { data: null, error: null } as never);
});
afterEach(cleanup);

function openSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NotificationSettings /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Integrations" }));
}

it("allows actual secure save after a status failure and never saves secrets to localStorage", async () => {
  openSettings();
  await screen.findByText("Integration function missing");
  fireEvent.change(screen.getByPlaceholderText("Enter a new API key"), { target: { value: "test-secret" } });
  const buttons = screen.getAllByRole("button", { name: "Save Integration Securely" });
  expect(buttons).toHaveLength(2);
  expect(buttons[0]).toBeEnabled();
  expect(buttons[1]).toBeEnabled();
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith("configure_whatshub_integration", expect.objectContaining({ p_api_key: "test-secret", p_showroom_groups: [] })));
  await waitFor(() => expect(screen.getByPlaceholderText("Enter a new API key")).toHaveValue(""));
  expect(localStorage.length).toBe(0);
});

it("shows saved group values after asynchronous loading", async () => {
  openSettings();
  expect(await screen.findByDisplayValue("12345@g.us")).toBeInTheDocument();
  expect(screen.getByRole("switch")).not.toBeChecked();
});

it("keeps entered secrets and shows the error when secure saving fails", async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: "Only admin can configure integrations" } } as never);
  openSettings();
  fireEvent.change(screen.getByPlaceholderText("Enter a new API key"), { target: { value: "test-secret" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save Integration Securely" })[1]);
  expect(await screen.findByText("Integration was not saved: Only admin can configure integrations")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Enter a new API key")).toHaveValue("test-secret");
});
