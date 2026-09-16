import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WhatsHubSenderSettings } from "@/components/WhatsHubSenderSettings";

const state = vi.hoisted(() => ({ role: "admin", savedSlot: 1, rpc: vi.fn(), saveError: "" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin-user" }, role: state.role }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));

beforeEach(() => {
  state.role = "admin";
  state.savedSlot = 1;
  state.saveError = "";
  state.rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === "set_whatshub_sender_slot") {
      if (state.saveError) return { data: null, error: { message: state.saveError } };
      state.savedSlot = args.p_slot;
    }
    return { data: state.savedSlot, error: null };
  });
});
afterEach(cleanup);

function openSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><WhatsHubSenderSettings /></QueryClientProvider>);
  return client;
}

it("loads Number 1, saves Number 2 and retains it after reopening", async () => {
  openSettings();
  await waitFor(() => expect(screen.getByLabelText("Send using")).toHaveValue("1"));
  fireEvent.change(screen.getByLabelText("Send using"), { target: { value: "2" } });
  expect(screen.getByText(/Currently saved: Number 1/)).toBeInTheDocument();
  expect(state.rpc).not.toHaveBeenCalledWith("set_whatshub_sender_slot", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "Save Sending Number" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Number 2 saved");
  expect(state.rpc).toHaveBeenCalledWith("set_whatshub_sender_slot", { p_slot: 2 });
  cleanup();
  openSettings();
  await waitFor(() => expect(screen.getByLabelText("Send using")).toHaveValue("2"));
});

it("allows switching back to Number 1", async () => {
  state.savedSlot = 2;
  openSettings();
  await waitFor(() => expect(screen.getByLabelText("Send using")).toHaveValue("2"));
  fireEvent.change(screen.getByLabelText("Send using"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Sending Number" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Number 1 saved");
});

it("keeps the previous saved sender visible when saving fails", async () => {
  state.saveError = "Only admin can change the WhatsHub sender";
  openSettings();
  await waitFor(() => expect(screen.getByLabelText("Send using")).toHaveValue("1"));
  fireEvent.change(screen.getByLabelText("Send using"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Sending Number" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("was not saved");
  expect(screen.getByText(/Currently saved: Number 1/)).toBeInTheDocument();
  expect(screen.getByLabelText("Send using")).toHaveValue("2");
});

it("preserves an unsaved selection when saved settings refresh", async () => {
  const client = openSettings();
  await waitFor(() => expect(screen.getByLabelText("Send using")).toHaveValue("1"));
  fireEvent.change(screen.getByLabelText("Send using"), { target: { value: "2" } });
  await act(async () => { await client.invalidateQueries({ queryKey: ["whatshub-sender-slot"] }); });
  expect(screen.getByLabelText("Send using")).toHaveValue("2");
});

it.each(["manager", "md", "tl", "executive"])("does not expose sender controls to %s", async (role) => {
  state.role = role;
  openSettings();
  expect(screen.queryByLabelText("Send using")).not.toBeInTheDocument();
  expect(state.rpc).not.toHaveBeenCalled();
});

it("does not present Number 1 as saved when reading configuration fails", async () => {
  state.rpc.mockResolvedValue({ data: null, error: { message: "Configuration unavailable" } });
  openSettings();
  expect(await screen.findByRole("alert")).toHaveTextContent("Configuration unavailable");
  expect(screen.queryByText(/Currently saved:/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save Sending Number" })).toBeDisabled();
});
