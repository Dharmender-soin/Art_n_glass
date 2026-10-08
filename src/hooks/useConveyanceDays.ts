import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { type DayAttendance, type DayVisit } from '@/lib/conveyanceDayDetails';

export function useConveyanceDays(userIds: string[], fromDate: string, toDate: string, enabled: boolean) {
  return useQuery({
    queryKey: ['conveyance-day-details', userIds, fromDate, toDate],
    enabled: enabled && userIds.length > 0,
    queryFn: async () => {
      const [attendance, visits] = await Promise.all([
        fetchAllRows<DayAttendance>((from,to) => supabase.from('daily_attendance').select('*').in('user_id',userIds).gte('date',fromDate).lte('date',toDate).order('id').range(from,to) as any),
        fetchAllRows<DayVisit>((from,to) => supabase.from('visits').select('*,clients(name),partners(name)').in('created_by',userIds).gte('visit_date',fromDate).lte('visit_date',toDate).eq('status','done').order('id').range(from,to) as any),
      ]);
      return { attendance, visits };
    },
  });
}
