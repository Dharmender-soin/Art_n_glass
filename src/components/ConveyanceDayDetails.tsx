import { type ConveyanceDay, actualVisitLocation } from '@/lib/conveyanceDayDetails';
import { visitDisplayName } from '@/lib/visitDisplay';
import { visitMapUrl } from '@/lib/visitLocation';

export function ConveyanceDayDetails({ days, names, loading, error }: { days: ConveyanceDay[]; names: Record<string,string>; loading: boolean; error?: Error | null }) {
  const time = (value: string | null) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not recorded';
  return <section className="rounded-xl border bg-card p-4 space-y-3">
    <h2 className="font-semibold">Day &amp; Completed Visit Details</h2>
    <p className="text-xs text-muted-foreground">Times are in IST. Visits Done counts completed visits, including showroom and pooled visits. Return trips are separate conveyance trips.</p>
    {error ? <p role="alert" className="text-destructive text-sm">Day details could not be loaded: {error.message}</p> : loading ? <p>Loading day details…</p> :
      <div className="overflow-auto max-h-[480px]"><table className="w-full min-w-[850px] text-xs"><thead><tr className="border-b text-left">
        {['Date / Employee','Start Day/Time','End Day/Time','Visits Done','Visit / Actual Location'].map(label => <th key={label} className="p-2">{label}</th>)}
      </tr></thead><tbody>{days.map(day => <tr key={day.key} className="border-b align-top">
        <td className="p-2">{day.date}<strong className="block">{names[day.userId] || 'Employee'}</strong></td><td className="p-2">{time(day.start)}</td><td className="p-2">{time(day.end)}</td><td className="p-2">{day.visits.length}</td>
        <td className="p-2 space-y-2">{day.visits.length ? day.visits.map(visit => {
          const url = visitMapUrl(visit.gps_latitude,visit.gps_longitude);
          return <div key={visit.id}><strong>{visitDisplayName(visit)}</strong><p>{actualVisitLocation(visit)}</p>{url && <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">View actual location on map</a>}</div>;
        }) : 'No completed visits'}</td>
      </tr>)}</tbody></table>{!days.length && <p className="p-3">No day or visit records in this period.</p>}</div>}
  </section>;
}
