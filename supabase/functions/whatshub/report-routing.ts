/** Director reports must never use the showroom group or staff fallback. */
export function reportDestination(key: string): 'director' | 'management' | 'showroom' {
  return key === 'plan_actual' ? 'director' : key === 'conveyance' ? 'management' : 'showroom';
}
