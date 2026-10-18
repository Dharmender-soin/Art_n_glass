import { employeeName } from "@/lib/employeeDisplay";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssignableUsers, type AssignableUser } from "@/hooks/useAssignableUsers";
import { Button } from "@/components/ui/button";

interface SharedOwnershipFieldsProps {
  primaryOwnerId: string | null;
  primaryOwnerName: string;
  secondaryOwnerId: string;
  members: AssignableUser[];
  onSecondaryChange: (userId: string) => void;
}

export function SharedOwnershipFields({
  primaryOwnerId,
  primaryOwnerName,
  secondaryOwnerId,
  members,
  onSecondaryChange,
}: SharedOwnershipFieldsProps) {
  const ownerOptions = useAssignableUsers();
  const candidates = [...new Map(members.filter((member) => member.user_id !== primaryOwnerId).map(member => [member.user_id, member])).values()]
    .sort((a,b) => employeeName(a.full_name).localeCompare(employeeName(b.full_name)));

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/20">
      <Label className="text-xs font-bold text-indigo-950 dark:text-indigo-200">Shared ownership</Label>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Primary</Label>
          <div className="flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-semibold">
            {primaryOwnerName || "Current user"}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Secondary</Label>
          <Select disabled={ownerOptions.isPending || ownerOptions.isError} value={secondaryOwnerId || "none"} onValueChange={(value) => onSecondaryChange(value === "none" ? "" : value)}>
            <SelectTrigger aria-label="Secondary owner" className="h-9 bg-background text-sm"><SelectValue placeholder="Select second owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No secondary owner</SelectItem>
              {secondaryOwnerId && !candidates.some(member => member.user_id === secondaryOwnerId) && <SelectItem value={secondaryOwnerId} disabled>Currently assigned employee (not in eligible list)</SelectItem>}
              {candidates.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {employeeName(member.full_name)} ({member.role === "executive" ? "KAM" : member.role.toUpperCase()})
                </SelectItem>
              ))}
              {candidates.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No eligible team members found
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
      {ownerOptions.isPending && <p className="mt-2 text-xs text-muted-foreground">Loading eligible employees…</p>}
      {ownerOptions.isError && <div role="alert" className="mt-2 text-xs text-destructive">Could not load secondary owners. {ownerOptions.error.message}<Button type="button" variant="outline" size="sm" onClick={() => ownerOptions.refetch()}>Retry</Button></div>}
      <p className="mt-2 text-[10px] text-indigo-700/80 dark:text-indigo-300/80">
        Primary is the currently assigned owner. The selected Secondary owner can also view and update this record.
      </p>
    </div>
  );
}
