export type WhatsHubSlot = 1 | 2;

export function parseWhatsHubSlot(value: unknown): WhatsHubSlot {
  if (value !== 1 && value !== 2) throw new Error("Choose WhatsHub Number 1 or Number 2");
  return value;
}

/** The saved sender applies to every delivery, including scheduler requests. */
export function createWhatsHubSender(baseUrl: string, apiKey: string, slot: WhatsHubSlot) {
  const selectedSlot = parseWhatsHubSlot(slot);
  return async (recipient: { kind: "group" | "phone"; target: string }, message: string, idempotencyKey?: string) => {
    const url = recipient.kind === "group"
      ? `${baseUrl}/api/groups/${encodeURIComponent(recipient.target)}/message`
      : `${baseUrl}/api/messages/send`;
    return fetch(url, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(recipient.kind === "group"
        ? { message, slot: selectedSlot }
        : { to: recipient.target, message, type: "text", slot: selectedSlot, idempotencyKey: idempotencyKey || crypto.randomUUID() }),
    });
  };
}
