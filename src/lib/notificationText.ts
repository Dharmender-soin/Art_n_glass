/** Converts legacy persisted notification copy to professional English. */
export function normalizeNotificationText(value: string | null | undefined): string {
  const text = (value || "").trim();
  const legacyWos = text.match(/^(.+?) ne client ["“](.+?)["”] ke (.+?) WOS ka status ["“](.+?)["”] se ["“](.+?)["”] update kiya hai\.?$/i);
  if (legacyWos) {
    const [, person, client, workType, previousStatus, nextStatus] = legacyWos;
    return `${person} updated the ${workType} WOS status for client "${client}" from ${previousStatus} to ${nextStatus}.`;
  }
  return text;
}
