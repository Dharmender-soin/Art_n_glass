import { beforeEach, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { sendShowroomPlanningNow } from "@/lib/whatshub";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
beforeEach(() => vi.resetAllMocks());
it("rejects an empty successful HTTP response instead of showing sent", async () => {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { results: [] }, error: null });
  await expect(sendShowroomPlanningNow("one")).rejects.toThrow("Nothing was sent");
});
it.each([{ recipients: 0, sent: 0 }, { recipients: 3, sent: 1 }, { recipients: 1, sent: 0 }])("rejects incomplete delivery %j", async (row) => {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { results: [row] }, error: null });
  await expect(sendShowroomPlanningNow("one")).rejects.toThrow("incomplete");
});
it("accepts a successful delivery and targets the selected showroom", async () => {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { results: [{ recipients: 1, sent: 1 }] }, error: null });
  await expect(sendShowroomPlanningNow("one")).resolves.toBeTruthy();
  expect(supabase.functions.invoke).toHaveBeenCalledWith("whatshub", { body: { action: "send_planning_summaries", showroomId: "one" } });
});
