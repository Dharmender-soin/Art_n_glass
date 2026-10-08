import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Clients from "@/pages/Clients";
import Partners from "@/pages/Partners";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), insert: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn(),
  saveError: null as { message: string } | null,
  partnerType: "architect",
  clients: [] as Record<string, unknown>[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "employee-1", user_metadata: { full_name: "Test Executive" } },
  role: "executive", showroomIds: [], showroomId: null,
}) }));
vi.mock("@/hooks/useAssignableUsers", () => ({ useAssignableUsers: () => ({
  data: [], isSuccess: true, isPending: false, isError: false,
}) }));
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }));
vi.mock("@/components/WorkScopeSection", () => ({ default: () => null }));
vi.mock("@/components/VisitHistoryList", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

const queryClients: QueryClient[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveError = null;
  mocks.partnerType = "architect";
  mocks.clients = [];
  mocks.from.mockImplementation((table: string) => {
    const data = table === "partners" ? [{
      id: "partner-1", name: "Test Partner", type: mocks.partnerType,
      mobile: "9000000001", city: "Ludhiana", address: "Test Road",
      company_name: "Test Office", created_by: "employee-1", secondary_owner_id: null,
    }] : table === "clients" ? mocks.clients : [];
    const chain = {
      select: () => chain, order: () => chain, eq: () => chain, in: () => chain,
      not: () => chain, or: () => chain, range: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      insert: (value: unknown) => {
        mocks.insert(table, value);
        return Promise.resolve({ data: null, error: mocks.saveError });
      },
      update: (value: unknown) => { mocks.update(table, value); return chain; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return chain;
  });
});
afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach(client => client.clear());
});

function renderPage(flow: "clients" | "partners") {
  const client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: 0 }, mutations: { retry: false },
  } });
  queryClients.push(client);
  render(<QueryClientProvider client={client}>{flow === "clients" ? <Clients /> : <Partners />}</QueryClientProvider>);
}

async function openCreate(flow: "clients" | "partners") {
  renderPage(flow);
  fireEvent.click(await screen.findByRole("button", { name: "Add Client" }));
  const architect = await screen.findByRole("textbox", { name: /Architect Name/ });
  expect(architect).toBeRequired();
  const form = architect.closest("form")!;
  fireEvent.change(within(form).getByPlaceholderText(flow === "clients" ? "Client name" : "Name *"), { target: { value: "Test Client" } });
  fireEvent.change(within(form).getByPlaceholderText(flow === "clients" ? "Phone number" : "Mobile *"), { target: { value: "9000000002" } });
  return { form, architect };
}

describe.each(["clients", "partners"] as const)("%s client creation", flow => {
  it("saves the entered architect name with the client and selected partner", async () => {
    mocks.partnerType = "builder";
    const { form, architect } = await openCreate(flow);
    if (flow === "clients") {
      fireEvent.click(within(form).getByRole("combobox", { name: "Lead Source" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Search lead source" }), { target: { value: "Test Partner" } });
      fireEvent.click(await screen.findByRole("option", { name: /Test Partner/ }));
    }
    fireEvent.change(architect, { target: { value: "  Actual Architect  " } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Client" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Client created!"));
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith("clients", expect.objectContaining({
      name: "Test Client", mobile: "9000000002", architect_name: "Actual Architect",
      partner_id: "partner-1", created_by: "employee-1",
    }));
    expect(screen.queryByRole("textbox", { name: /Architect Name/ })).not.toBeInTheDocument();
  });

  it("blocks whitespace-only architect names before contacting the database", async () => {
    const { form, architect } = await openCreate(flow);
    fireEvent.change(architect, { target: { value: "   " } });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Architect Name is required"));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(within(form).getByDisplayValue("Test Client")).toBeInTheDocument();
  });

  it("keeps the entered details available after a database save error", async () => {
    mocks.saveError = { message: "Temporary connection error" };
    const { form, architect } = await openCreate(flow);
    fireEvent.change(architect, { target: { value: "Actual Architect" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save Client" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Temporary connection error"));
    expect(architect).toHaveValue("Actual Architect");
    expect(within(form).getByDisplayValue("Test Client")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

it("saves a quick client under an architect partner, matching the reported mobile flow", async () => {
  const { form, architect } = await openCreate("partners");
  fireEvent.change(architect, { target: { value: "Test Partner" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save Client" }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Client created!"));
  expect(mocks.insert).toHaveBeenCalledWith("clients", expect.objectContaining({
    architect_name: "Test Partner", partner_id: "partner-1",
  }));
});
