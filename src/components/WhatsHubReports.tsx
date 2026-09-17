import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReportSettings, saveReportSetting, previewReport, sendReport } from '@/lib/whatshub';
import { reportDefinitions } from '../../supabase/functions/whatshub/reports';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

function ReportRow({ showroomId, report, enabled, ready }: {showroomId: string; report: typeof reportDefinitions[number]; enabled: boolean; ready: boolean}) {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const save = useMutation({
    mutationFn: (value: boolean) => saveReportSetting(showroomId,report.key,value),
    onSuccess: () => {
      client.invalidateQueries({queryKey:['whatsapp-reports',showroomId]});
      client.invalidateQueries({queryKey:['whatshub-integration-showrooms']});
    },
  });
  const preview = useMutation({mutationFn: () => previewReport(showroomId,report.key), onSuccess: result => setMessage(result.message)});
  const test = useMutation({mutationFn: () => sendReport(showroomId,report.key)});
  const error = save.error || preview.error || test.error;
  return <div className="rounded-xl border p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-medium">{report.title}</p><p className="text-sm text-muted-foreground">{report.weekly ? 'Saturday' : 'Daily'} at {report.time} IST</p></div>
      <div className="flex items-center gap-2"><span className="text-sm">Auto-send</span><Switch aria-label={`${report.title} auto-send`} checked={enabled} disabled={!ready || save.isPending} onCheckedChange={v => save.mutate(v)} /></div>
    </div>
    <p className="text-xs text-muted-foreground">{report.key === 'conveyance' ? 'Destination: active showroom managers’ personal numbers. Missing coordinates are flagged for review.' : 'Destination: saved showroom group, or active staff numbers when no group is saved.'}</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={preview.isPending || !ready} onClick={() => preview.mutate()}>{preview.isPending ? 'Loading…' : 'Preview Report'}</Button>
      <Button variant="outline" disabled={test.isPending || !ready} onClick={() => test.mutate()}>{test.isPending ? 'Sending…' : 'Send Test Report'}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
    {test.isSuccess && <p role="status" className="text-sm text-emerald-600">WhatsHub accepted this report. Confirm receipt in WhatsApp.</p>}
    {message && <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{message}</pre>}
  </div>;
}

export function WhatsHubReports({showroomId}: {showroomId: string}) {
  const settings = useQuery({queryKey:['whatsapp-reports',showroomId],enabled:!!showroomId,queryFn:() => getReportSettings(showroomId),retry:false});
  return <Card><CardHeader><CardTitle>WhatsApp Reports</CardTitle><CardDescription>Reports for the showroom selected above. Daily Planned Visits includes active Executives, Team Leaders and Managers. Other reports include active Executives. Toggles save immediately. Test sends the actual report even when auto-send is OFF.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {settings.error && <div role="alert" className="text-sm text-destructive">Could not load saved report settings: {settings.error.message}. Apply the report SQL migration and deploy the updated WhatsHub function. <Button variant="outline" onClick={() => settings.refetch()}>Retry</Button></div>}
      {settings.isLoading && <p>Loading saved schedules…</p>}
      {reportDefinitions.map(report => <ReportRow key={`${showroomId}-${report.key}`} showroomId={showroomId} report={report} enabled={settings.data?.reports?.find((r: {key:string}) => r.key === report.key)?.enabled === true} ready={!!showroomId && settings.isSuccess} />)}
    </CardContent>
  </Card>;
}
