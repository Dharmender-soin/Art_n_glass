import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Clients from "@/pages/Clients";
import Partners from "@/pages/Partners";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), insert: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn(),
  saveError: null as { message: string } | null,
  partnerType: "architect",
  extraPartners: [] as Record<string, unknown>[],
  clients: [] as Record<string, unknown>[],
  members: [] as Record<string, unknown>[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "employee-1", user_metadata: { full_name: "Test Executive" } },
  role: "executive", showroomIds: [], showroomId: null,
}) }));
vi.mock("@/hooks/useAssignableUsers", () => ({ useAssignableUsers: () => ({
  data: mocks.members, isSuccess: true, isPending: false, isError: false,
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
  mocks.extraPartners = [];
  mocks.clients = [];
  mocks.members = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  mocks.from.mockImplementation((table: string) => {
    const data = table === "partners" ? [{
      id: "partner-1", name: "Test Partner", type: mocks.partnerType,
      mobile: "9000000001", city: "Ludhiana", address: "Test Road",
      company_name: "Test Office", created_by: "employee-1", secondary_owner_id: null,
    }, ...mocks.extraPartners] : table === "clients" ? mocks.clients : [];
    const chain = {
      select: () => chain, order: () => chain, eq: () => chain, in: () => chain,
      not: () => chain, or: () => chain, range: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: data[0] || {id:'saved-id'}, error: mocks.saveError }),
      insert: (value: unknown) => {
        mocks.insert(table, value);
        if (table === 'partners') return chain;
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

it("saves a quick client using the Architect partner without asking for the same name again", async () => {
  const { form, architect } = await openCreate("partners");
  expect(architect).toHaveValue("Test Partner");
  fireEvent.click(within(form).getByRole("button", { name: "Save Client" }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Client created!"));
  expect(mocks.insert).toHaveBeenCalledWith("clients", expect.objectContaining({
    architect_name: "Test Partner", partner_id: "partner-1",
  }));
});

async function selectLeadSource(name: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Lead Source" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search lead source" }), { target: { value: name } });
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }));
}

it("saves a new client after selecting an Architect without separately typing the architect name", async () => {
  const { form, architect } = await openCreate("clients");
  await selectLeadSource("Test Partner");
  expect(architect).toHaveValue("Test Partner");
  fireEvent.click(within(form).getByRole("button", { name: "Save Client" }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Client created!"));
  expect(mocks.insert).toHaveBeenCalledWith("clients", expect.objectContaining({
    architect_name: "Test Partner", partner_id: "partner-1",
  }));
});

it("updates an automatically filled name when changing Architects and clears it for a Builder", async () => {
  mocks.extraPartners = [
    { id: "partner-2", name: "Second Architect", type: "architect" },
    { id: "partner-3", name: "Builder Referral", type: "builder" },
  ];
  const { form, architect } = await openCreate("clients");
  await selectLeadSource("Test Partner");
  await selectLeadSource("Second Architect");
  expect(architect).toHaveValue("Second Architect");
  await selectLeadSource("Builder Referral");
  expect(architect).toHaveValue("");
  fireEvent.submit(form);
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Architect Name is required"));
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("preserves an architect entered by the user when selecting or removing a lead source", async () => {
  const { form, architect } = await openCreate("clients");
  fireEvent.change(architect, { target: { value: "Project Architect" } });
  await selectLeadSource("Test Partner");
  expect(architect).toHaveValue("Project Architect");
  await selectLeadSource("Direct Client");
  expect(architect).toHaveValue("Project Architect");
  fireEvent.click(within(form).getByRole("button", { name: "Save Client" }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Client created!"));
  expect(mocks.insert).toHaveBeenCalledWith("clients", expect.objectContaining({
    architect_name: "Project Architect", partner_id: null,
  }));
});

it("clears an automatic architect when the user chooses a direct client", async () => {
  const { architect } = await openCreate("clients");
  await selectLeadSource("Test Partner");
  await selectLeadSource("Direct Client");
  expect(architect).toHaveValue("");
});

it("does not treat a Builder partner as an architect in the quick form", async () => {
  mocks.partnerType = "builder";
  const { architect } = await openCreate("partners");
  expect(architect).toHaveValue("");
  expect(architect).toHaveAccessibleDescription(/Enter the project's architect name/);
});

async function chooseSecondaryOwner() {
  fireEvent.click(screen.getByRole('combobox', {name:'Secondary owner'}));
  fireEvent.click(await screen.findByRole('option', {name:'Second Employee (KAM)'}));
}

it.each(['clients','partners'] as const)('saves the selected secondary owner when adding a client through %s', async flow => {
  mocks.members = [{user_id:'employee-2',full_name:'Mr. Second Employee',role:'executive'}];
  const {form,architect} = await openCreate(flow);
  fireEvent.change(architect, {target:{value:'Actual Architect'}});
  await chooseSecondaryOwner();
  fireEvent.click(within(form).getByRole('button', {name:'Save Client'}));
  await waitFor(()=>expect(mocks.success).toHaveBeenCalledWith('Client created!'));
  expect(mocks.insert).toHaveBeenCalledWith('clients',expect.objectContaining({created_by:'employee-1',secondary_owner_id:'employee-2'}));
});

it('saves the selected secondary owner when creating a partner',async()=>{
  mocks.members = [{user_id:'employee-2',full_name:'Mr. Second Employee',role:'executive'}];
  renderPage('partners');
  fireEvent.click(await screen.findByRole('button',{name:'Add Partner'}));
  fireEvent.change(screen.getByPlaceholderText('Partner name'),{target:{value:'New Architect'}});
  fireEvent.change(screen.getByPlaceholderText('Phone number'),{target:{value:'9000000003'}});
  await chooseSecondaryOwner();
  fireEvent.click(screen.getByRole('button',{name:'Save Partner'}));
  await waitFor(()=>expect(mocks.success).toHaveBeenCalledWith('Partner created!'));
  expect(mocks.insert).toHaveBeenCalledWith('partners',expect.objectContaining({created_by:'employee-1',secondary_owner_id:'employee-2'}));
});

it.each(['clients','partners'] as const)('does not falsely confirm an inaccessible %s update and preserves the chosen secondary owner',async flow=>{
  mocks.members = [{user_id:'employee-2',full_name:'Mr. Second Employee',role:'executive'}];
  mocks.clients = [{id:'client-1',name:'Existing Client',mobile:'9000000004',created_by:'employee-1',status:'new',architect_name:'Architect',secondary_owner_id:null}];
  renderPage(flow);
  fireEvent.click(await screen.findByTitle(flow==='clients'?'Edit client':'Edit partner'));
  await chooseSecondaryOwner();
  mocks.saveError = {message:'No accessible record was updated'};
  fireEvent.click(screen.getByRole('button',{name:'Save Changes'}));
  await waitFor(()=>expect(mocks.error).toHaveBeenCalledWith('No accessible record was updated'));
  expect(mocks.update).toHaveBeenCalledWith(flow,expect.objectContaining({secondary_owner_id:'employee-2'}));
  expect(mocks.success).not.toHaveBeenCalled();
  expect(screen.getByRole('combobox',{name:'Secondary owner'})).toHaveTextContent('Second Employee');
});
