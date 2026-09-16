import { afterEach, expect, it, vi } from "vitest";
import { createWhatsHubSender, parseWhatsHubSlot } from "../../supabase/functions/whatshub/sender";

afterEach(() => vi.unstubAllGlobals());

it.each([1, 2] as const)("uses saved Number %i for phone and group deliveries", async (slot) => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"success":true}'));
  vi.stubGlobal("fetch", fetch);
  const send = createWhatsHubSender("https://provider.example", "test-key", slot);
  await send({ kind: "phone", target: "919876543210" }, "Phone report", "scheduled-report-id");
  await send({ kind: "group", target: "12345@g.us" }, "Group report");
  expect(fetch.mock.calls[0][0]).toBe("https://provider.example/api/messages/send");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ to: "919876543210", message: "Phone report", type: "text", slot, idempotencyKey: "scheduled-report-id" });
  expect(fetch.mock.calls[1][0]).toBe("https://provider.example/api/groups/12345%40g.us/message");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ message: "Group report", slot });
});

it.each([undefined, null, 0, 3, -1, 1.5, "2", true, {}])("rejects invalid sender settings instead of falling back to Number 1: %j", (slot) => {
  expect(() => parseWhatsHubSlot(slot)).toThrow("Number 1 or Number 2");
});

it("returns a provider rejection without retrying on another number", async () => {
  const response = new Response('{"error":"Number 2 disconnected"}', { status: 400 });
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  const send = createWhatsHubSender("https://provider.example", "test-key", 2);
  expect(await send({ kind: "phone", target: "919876543210" }, "Test", "test-id")).toBe(response);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body).slot).toBe(2);
});
