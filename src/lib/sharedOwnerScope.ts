import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from './fetchAllRows';

export async function sharedOwnerFilter(creatorIds: string[], userId: string, includePartnerClients = false) {
  const clauses = [`created_by.in.(${[...new Set([...creatorIds,userId])].join(',')})`, `secondary_owner_id.eq.${userId}`];
  if (includePartnerClients) {
    const partners = await fetchAllRows<{id:string}>((from,to) => supabase.from('partners').select('id')
      .or(`created_by.eq.${userId},secondary_owner_id.eq.${userId}`).order('id').range(from,to) as any);
    if (partners.length) clauses.push(`partner_id.in.(${partners.map(partner => partner.id).join(',')})`);
  }
  return clauses.join(',');
}
