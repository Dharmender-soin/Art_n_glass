/** Presentation only: never change employee IDs, roles, or record ownership. */
export function employeeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/^mr(?:\.\s*|\s+)/i, '').trim();
}
