export type DisplayVisit = {
  client_id?: string | null;
  partner_id?: string | null;
  visit_with_type?: string | null;
  address?: string | null;
  clients?: { name?: string | null } | null;
  partners?: { name?: string | null } | null;
};

export function visitTypeLabel(visit: DisplayVisit): string {
  const type = visit.visit_with_type || (visit.client_id ? 'client' : visit.partner_id ? 'partner' : '');
  return ({ client: 'Client', partner: 'Partner', showroom: 'Showroom', home: 'Home', hotel: 'Hotel' } as Record<string, string>)[type] || 'Unlinked';
}

export function visitDisplayName(visit: DisplayVisit): string {
  const name = visit.clients?.name?.trim() || visit.partners?.name?.trim();
  if (name) return name;
  const type = visitTypeLabel(visit);
  if (visit.client_id || visit.partner_id) return `${type} Visit${visit.address?.trim() ? ' — ' + visit.address.trim() : ''}`;
  if (['Showroom', 'Home', 'Hotel'].includes(type)) return visit.address?.trim() || `${type} Visit`;
  return visit.address?.trim() ? `Unlinked visit — ${visit.address.trim()}` : 'Unlinked visit';
}

export function isCountedVisit(visit: { status?: string | null }): boolean {
  return ['planned', 'in_progress', 'done'].includes(visit.status || '');
}
