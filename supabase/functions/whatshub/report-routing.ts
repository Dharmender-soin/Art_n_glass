export const directorReportKeys = ['manager_planning', 'plan_actual', 'manager_outcomes'] as const;
export type DirectorReportKey = typeof directorReportKeys[number];
export function isDirectorReport(key: string): key is DirectorReportKey {
  return directorReportKeys.some(report => report === key);
}

export function directorIdempotencyKey(key: DirectorReportKey, date: string, phone: string) {
  // Retain the existing 7 PM key; new reports must not deduplicate against one another.
  return `${key === 'plan_actual' ? 'director-plan' : 'director-' + key}-${date}-${phone}`;
}

/** Director reports must never use the showroom group or staff fallback. */
export function reportDestination(key: string): 'director' | 'management' | 'showroom' {
  return isDirectorReport(key) ? 'director' : key === 'conveyance' ? 'management' : 'showroom';
}
