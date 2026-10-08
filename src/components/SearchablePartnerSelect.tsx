import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type PartnerOption = { id: string; name: string; type: string; address?: string | null; city?: string | null };
export function SearchablePartnerSelect({ value, partners, onChange }: {
  value: string; partners: PartnerOption[]; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = partners.find(p => p.id === value);
  const label = (p: PartnerOption) => `${p.name} (${p.type === 'self' ? 'Partner' : p.type})`;
  const options = partners.filter(p => `${label(p)} ${p.address || ''} ${p.city || ''}`.toLowerCase().includes(search.toLowerCase().trim()));
  const choose = (id: string) => { onChange(id); setOpen(false); setSearch(''); };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label="Lead Source" aria-expanded={open} className="w-full justify-start h-auto min-h-9 whitespace-normal text-left">
      {selected ? label(selected) : value === 'none' ? 'Direct Client (No Partner)' : 'Select Partner / Architect / Builder…'}
    </Button></PopoverTrigger>
    <PopoverContent className="w-[min(360px,90vw)] p-2" align="start">
      <Input aria-label="Search lead source" placeholder="Search Partner, Architect or Builder…" value={search} onChange={e => setSearch(e.target.value)} />
      <div role="listbox" aria-label="Lead sources" className="max-h-60 overflow-y-auto mt-2">
        <button type="button" role="option" aria-selected={value === 'none'} onClick={() => choose('none')} className="w-full rounded p-2 text-left text-sm hover:bg-muted">Direct Client (No Partner)</button>
        {options.map(p => <button key={p.id} type="button" role="option" aria-selected={value === p.id} onClick={() => choose(p.id)} className="w-full rounded p-2 text-left text-sm hover:bg-muted">
          {label(p)}{(p.address || p.city) && <span className="block text-xs text-muted-foreground">{[p.address, p.city].filter(Boolean).join(', ')}</span>}
        </button>)}
        {!options.length && <p className="p-2 text-sm text-muted-foreground">No matching partners.</p>}
      </div>
    </PopoverContent>
  </Popover>;
}
