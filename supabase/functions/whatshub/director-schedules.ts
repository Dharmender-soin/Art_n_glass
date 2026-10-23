import { allRows, indiaDate, reportDue } from './reports.ts';
import { directorReportKeys, type DirectorReportKey } from './report-routing.ts';

/** New Director schedules are global, independent of every showroom's switches. */
export async function runScheduledDirectorReports(
  client: any, showroomSettings: any[], now: Date,
  deliver: (key: DirectorReportKey) => Promise<{ recipients: number; sent: number }>,
) {
  const results: any[] = [];
  let settings: any[] = [];
  try {
    settings = await allRows(client.from('whatshub_director_report_settings').select('report_key,enabled').order('report_key'));
  } catch (error) {
    results.push({ report: 'director_settings', error: error instanceof Error ? error.message : String(error) });
  }
  for (const key of directorReportKeys) {
    const enabled = key === 'plan_actual' ? showroomSettings.some(row => row.report_key === key && row.enabled === true)
      : settings.some(row => row.report_key === key && row.enabled === true);
    if (!enabled || !reportDue(key, now)) continue;
    const run = { report_key: key, report_date: indiaDate(now) };
    let claimed = false;
    try {
      const { error } = await client.from('whatshub_director_report_runs').insert(run);
      if (error?.code === '23505') continue;
      if (error) throw new Error(error.message);
      claimed = true;
      const delivery = await deliver(key);
      if (!delivery.recipients || delivery.sent !== delivery.recipients) throw new Error('Director report delivery incomplete');
      const { error: updateError } = await client.from('whatshub_director_report_runs').update({ status: 'sent' }).match(run);
      if (updateError) throw new Error(updateError.message);
      results.push({ report: key, ...delivery });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (claimed) await client.from('whatshub_director_report_runs').update({ status: 'failed', error: message }).match(run);
      results.push({ report: key, error: message });
    }
  }
  return results;
}
