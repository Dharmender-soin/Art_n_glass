import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendWhatsHubTest } from "@/lib/whatshub";
import { parseTestTarget } from "../../supabase/functions/whatshub/test-target";

export function WhatsHubTestButton({ target, showroomId }: { target: string; showroomId?: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ target: string; text: string; ok: boolean } | null>(null);
  async function sendTest() {
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      const recipient = parseTestTarget(target, !!showroomId);
      const response = await sendWhatsHubTest(recipient.target, showroomId);
      if (!response?.accepted) throw new Error("Test was not accepted. Deploy the latest WhatsHub function and try again.");
      setResult({ target, text: `WhatsHub accepted the test for ${recipient.target}. Check WhatsApp to confirm receipt.`, ok: true });
    } catch (error) {
      setResult({ target, text: error instanceof Error ? error.message : "Test failed. Please try again.", ok: false });
    } finally {
      setPending(false);
    }
  }
  return <div className="space-y-2">
    <Button type="button" variant="outline" className="gap-2" disabled={pending || !target.trim()} onClick={sendTest} aria-label={showroomId ? "Test showroom group" : "Send test message"}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{pending ? "Sending…" : "Send Test"}
    </Button>
    {result && result.target === target && <p role={result.ok ? "status" : "alert"} className={`max-w-sm break-words text-xs ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.text}</p>}
  </div>;
}
