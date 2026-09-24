import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { format } from "date-fns";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Visits from "@/pages/Visits";

const mocks = vi.hoisted(() => ({ from: vi.fn(), error: vi.fn(), update: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "pravesh" }, role: "executive", showroomIds: [] }) }));
vi.mock("@/hooks/usePurposes", () => ({ usePurposes: () => ({ purposes: [], isLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@react-google-maps/api", () => ({ useJsApiLoader: () => ({ isLoaded: false }), Autocomplete: ({ children }: any) => children }));
vi.mock("@/components/TripMap", () => ({ TripMap: () => null }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));

beforeEach(() => {
  mocks.error.mockClear(); mocks.update.mockClear();
  mocks.from.mockImplementation((table: string) => {
    const today = format(new Date(), "yyyy-MM-dd");
    let data: any[] = table === "visits" ? [
      { id: "own", created_by: "pravesh", visit_date: today, status: "planned", address: "Client site", purpose: "Meeting", visit_with_type: "client" },
      { id: "other", created_by: "other-user", visit_date: today, status: "planned", address: "Other site", purpose: "Meeting", visit_with_type: "client" },
      { id: "done", created_by: "pravesh", visit_date: today, status: "done", address: "Done site", purpose: "Meeting", visit_with_type: "client" },
    ] : [];
    const chain = { select: () => chain, order: () => chain, range: () => chain, in: () => chain, neq: () => chain,
      eq: (key: string, value: string) => { data = data.filter(row => row[key] === value); return chain; },
      update: mocks.update,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
    return chain;
  });
});
afterEach(cleanup);
function Location() { return <p data-testid="location">{useLocation().search || "no query"}</p>; }
function open(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/visits?complete=${id}`]}><Visits /><Location /></MemoryRouter></QueryClientProvider>);
}
it("opens the full GPS and conveyance form from the Home completion link without changing a visit", async () => {
  open("own");
  expect(await screen.findByRole("dialog")).toHaveTextContent("Mark Visit Done");
  expect(screen.getByRole("button", { name: "Confirm Done" })).toBeInTheDocument();
  expect(screen.getByText(/GPS location will be captured/)).toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("no query"));
});
it.each(["other", "done"])("does not open completion for an inaccessible or already completed visit: %s", async id => {
  open(id);
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Only your own pending visits for today can be marked done."));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
});
