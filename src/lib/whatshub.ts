import { supabase } from "@/integrations/supabase/client";

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("whatshub", { body });
  if (error) {
    const details = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
    throw new Error(details?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const sendInternalShowroomMessage = (showroomId: string, message: string) => invoke({ action: "send_internal", showroomId, message });
export const sendShowroomPlanningNow = async (showroomId?: string) => {
  const result = await invoke({ action: "send_planning_summaries", ...(showroomId ? { showroomId } : {}) });
  const deliveries = result?.results;
  if (!Array.isArray(deliveries) || !deliveries.length) {
    throw new Error("Nothing was sent. Update the WhatsHub Edge Function; older versions skip showrooms whose daily report switch is off.");
  }
  if (deliveries.some(row => !(row.recipients > 0) || row.sent !== row.recipients)) {
    throw new Error("Planning delivery was incomplete. Check the saved Group JID, staff phone numbers and WhatsHub delivery logs before retrying.");
  }
  return result;
};
export const sendWhatsHubTest = (target: string, showroomId?: string) => invoke({ action: "send_test", target, ...(showroomId ? { showroomId } : {}) });
