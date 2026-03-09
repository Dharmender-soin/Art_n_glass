const fs = require('fs');
const FILE_PATH = 'src/pages/Admin.tsx';

let content = fs.readFileSync(FILE_PATH, 'utf8');

const importType = 'type VisitWithType = Database["public"]["Enums"]["visit_with_type"];\n';
if (!content.includes('type VisitWithType')) {
    content = content.replace('type AppRole = Database["public"]["Enums"]["app_role"];', 'type AppRole = Database["public"]["Enums"]["app_role"];\n' + importType);
}

const lucidePattern = 'import { Shield, MapPin, Users, UserPlus, Eye, EyeOff, Key, Trash2, Building, Plus, Search } from "lucide-react";';
if (content.includes(lucidePattern)) {
    content = content.replace(lucidePattern, 'import { Shield, MapPin, Users, UserPlus, Eye, EyeOff, Key, Trash2, Building, Plus, Search, Tag, Power, PowerOff } from "lucide-react";');
}

const statePattern = 'const [searchQuery, setSearchQuery] = useState("");';
const newState = statePattern + `
  const [createPurposeOpen, setCreatePurposeOpen] = useState(false);
  const [newPurpose, setNewPurpose] = useState({ purpose_name: "", entity_type: "client" as VisitWithType });
`;
if (!content.includes('setCreatePurposeOpen')) {
    content = content.replace(statePattern, newState);
}

const mutationPattern = '  // Fetch Users & Roles';
const purposeMutationStr = `
  // Fetch Purposes
  const { data: purposes = [] } = useQuery({
    queryKey: ["purpose-masters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purpose_masters").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createPurpose = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("purpose_masters").insert([newPurpose]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purpose-masters"] });
      toast.success("Purpose added!");
      setNewPurpose({ purpose_name: "", entity_type: "client" });
      setCreatePurposeOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePurpose = useMutation({
    mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
      const { error } = await supabase.from("purpose_masters").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purpose-masters"] });
      toast.success("Purpose status toggled!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePurpose = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purpose_masters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purpose-masters"] });
      toast.success("Purpose deleted!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

`;
if (!content.includes('queryKey: ["purpose-masters"]')) {
    content = content.replace(mutationPattern, purposeMutationStr + mutationPattern);
}

const renderPattern = '      {/* Users Section */}';
const renderPurposesStr = `
      {/* Master Data: Purposes */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Tag className="h-5 w-5" /> Visit Purposes
          </h2>
          <Dialog open={createPurposeOpen} onOpenChange={setCreatePurposeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add Purpose</Button>
            </DialogTrigger>
            <DialogContent className="bg-popover">
              <DialogHeader><DialogTitle>Add New Purpose</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createPurpose.mutate(); }} className="space-y-3">
                <div className="space-y-1"><Label>Purpose Name</Label><Input value={newPurpose.purpose_name} onChange={(e) => setNewPurpose({ ...newPurpose, purpose_name: e.target.value })} required placeholder="e.g. Follow-up meeting" /></div>
                <div className="space-y-1">
                  <Label>Entity Type</Label>
                  <Select value={newPurpose.entity_type} onValueChange={(v: any) => setNewPurpose({ ...newPurpose, entity_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createPurpose.isPending}>Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {purposes.map((p) => (
            <Card key={p.id} className={\`relative group overflow-hidden transition-all shadow-sm border \${p.is_active ? 'border-primary/20' : 'opacity-70 border-border'}\`}>
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-base">{p.purpose_name}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">Type: {p.entity_type}</p>
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className={\`h-7 w-7 \${p.is_active ? 'text-orange-500 hover:bg-orange-500/10' : 'text-green-500 hover:bg-green-500/10'}\`} onClick={() => togglePurpose.mutate({ id: p.id, is_active: p.is_active || false })} title={p.is_active ? 'Deactivate' : 'Activate'}>
                        {p.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { if (confirm('Delete this purpose?')) deletePurpose.mutate(p.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {purposes.length === 0 && <p className="text-muted-foreground text-sm">No purposes defined. Add one to get started.</p>}
        </div>
      </section>

      <div className="border-t my-8" />
`;
if (!content.includes('Visit Purposes')) {
    content = content.replace(renderPattern, renderPurposesStr + '\n' + renderPattern);
}

fs.writeFileSync(FILE_PATH, content);
console.log('Admin template structured updated.');
