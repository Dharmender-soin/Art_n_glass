const fs = require('fs');
const FILE_PATH = 'src/components/dashboard/ExecutiveHome.tsx';

let content = fs.readFileSync(FILE_PATH, 'utf8');

// Leaderboard Top Visits
content = content.replace(
    '<div key={exec.user_id} className="flex items-center justify-between">',
    `<div key={exec.user_id} className="flex items-center justify-between cursor-pointer hover:bg-[#F5F5F7]/10 p-1 -mx-1 rounded transition-colors" onClick={() => setLeadPopup({ name: exec.full_name || 'Executive', visits: exec.visits, wosCount: exec.wosCount, wosWon: exec.wosWon, rankingLogic: 'Ranked by Total Visits Completed' })}>`);

// Leaderboard Top WOS
content = content.replace(
    '<div key={exec.user_id} className="flex items-center justify-between">',
    `<div key={exec.user_id} className="flex items-center justify-between cursor-pointer hover:bg-[#F5F5F7]/10 p-1 -mx-1 rounded transition-colors" onClick={() => setLeadPopup({ name: exec.full_name || 'Executive', visits: exec.visits, wosCount: exec.wosCount, wosWon: exec.wosWon, rankingLogic: 'Ranked by Total WOS Added' })}>`);

// Leaderboard Top WOS Won
content = content.replace(
    '<div key={exec.user_id} className="flex items-center justify-between">',
    `<div key={exec.user_id} className="flex items-center justify-between cursor-pointer hover:bg-[#F5F5F7]/10 p-1 -mx-1 rounded transition-colors" onClick={() => setLeadPopup({ name: exec.full_name || 'Executive', visits: exec.visits, wosCount: exec.wosCount, wosWon: exec.wosWon, rankingLogic: 'Ranked by Verified WOS Value' })}>`);

const addKpiPopup = (label, varPrefix, titlePrefix) => {
    // Visits Replace
    const visitsPattern = new RegExp(
        `<ProgressRing\\s*` +
        `value=\\{${varPrefix}\\.doneVisits\\}\\s*` +
        `max=\\{${varPrefix}\\.plannedVisits \\|\\| 1\\}\\s*` +
        `label=\"Visits\"\\s*` +
        `sublabel=\"Done\"\\s*` +
        `color=\"#b91c1c\"\\s*` +
        `displayValue=\\{\`\\$\\{${varPrefix}\\.doneVisits\\}\\/\\$\\{${varPrefix}\\.plannedVisits\\}\`\\}\\s*` +
        `delay=\\{[0-9.]+\\}\\s*/>`
    );

    content = content.replace(visitsPattern, (match) => {
        return match.replace('/>', 
            `onClick={() => setKpiPopup({\n` +
            `                                title: "${titlePrefix} - Visits",\n` +
            `                                metrics: [{ label: "Planned", value: ${varPrefix}.plannedVisits }, { label: "Done", value: ${varPrefix}.doneVisits }],\n` +
            `                                list: ${varPrefix}.rawVisits,\n` +
            `                                type: 'visits'\n` +
            `                            })}\n` +
            `                        />`
        );
    });

    // WOS Count Replace
    const wosCountPattern = new RegExp(
        `<ProgressRing\\s*` +
        `value=\\{${varPrefix}\\.estValue\\}\\s*` +
        `max=\\{Math\\.max\\(${varPrefix}\\.estValue, 10\\)\\}\\s*` +
        `label=\"WOS Count\"\\s*` +
        `sublabel=\\{\`\\$\\{${varPrefix}\\.wosCount\\} Added\`\\}\\s*` +
        `color=\"#b91c1c\"\\s*` +
        `displayValue=\\{${varPrefix}\\.estValue\\.toFixed\\(1\\)\\}\\s*` +
        `delay=\\{[0-9.]+\\}\\s*/>`
    );

    content = content.replace(wosCountPattern, (match) => {
        return match.replace('/>', 
            `onClick={() => setKpiPopup({\n` +
            `                                title: "${titlePrefix} - WOS Count",\n` +
            `                                metrics: [{ label: "WOS Added", value: ${varPrefix}.wosCount }, { label: "Estimated Total (L)", value: ${varPrefix}.estValue.toFixed(1) }],\n` +
            `                                list: ${varPrefix}.rawWos,\n` +
            `                                type: 'wos_count'\n` +
            `                            })}\n` +
            `                        />`
        );
    });

    // WOS Won Replace
    const wonPattern = new RegExp(
        `<ProgressRing\\s*` +
        `value=\\{${varPrefix}\\.wonPercent\\}\\s*` +
        `max=\\{100\\}\\s*` +
        `label=\"WOS Won\"\\s*` +
        `sublabel=\\{\`\\$\\{${varPrefix}\\.wonValue\\.toFixed\\(1\\)\\}L Won\`\\}\\s*` +
        `color=\"#b91c1c\"\\s*` +
        `displayValue=\\{\`\\$\\{${varPrefix}\\.wonPercent\\}%\`\\}\\s*` +
        `delay=\\{[0-9.]+\\}\\s*/>`
    );

    content = content.replace(wonPattern, (match) => {
        return match.replace('/>', 
            `onClick={() => setKpiPopup({\n` +
            `                                title: "${titlePrefix} - WOS Won",\n` +
            `                                metrics: [{ label: "Won Deals", value: ${varPrefix}.rawWosWon.length }, { label: "Secured Value (L)", value: ${varPrefix}.wonValue.toFixed(1) }],\n` +
            `                                list: ${varPrefix}.rawWosWon,\n` +
            `                                type: 'wos_won'\n` +
            `                            })}\n` +
            `                        />`
        );
    });
};

addKpiPopup('This Week', 'weekKpis', 'This Week');
addKpiPopup('This Month', 'monthKpis', 'This Month');
addKpiPopup('Total Overview', 'totalKpis', 'Overview');


// 5. Add Dialog components to the bottom
if (!content.includes('Dialog open={!!kpiPopup}')) {
    const dialogsStr = `
            {/* KPI Dialog Popup */}
            <Dialog open={!!kpiPopup} onOpenChange={(open) => !open && setKpiPopup(null)}>
                <DialogContent className="bg-[#12141A] border border-[#F5F5F7]/10 text-[#F5F5F7] max-w-sm w-[95vw] rounded-2xl p-0 overflow-hidden outline-none">
                    <div className="flex flex-col h-full max-h-[80vh]">
                        <div className="p-5 border-b border-[#F5F5F7]/5 bg-[#1A1D24] shrink-0">
                            <DialogHeader className="text-left mb-1">
                                <DialogTitle className="text-xl font-bold tracking-tight text-[#F5F5F7] flex items-center justify-between">
                                    {kpiPopup?.title}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="flex gap-3 mt-5">
                                {kpiPopup?.metrics.map((m, i) => (
                                    <div key={i} className="flex-1 bg-[#12141A] rounded-xl p-3 border border-[#F5F5F7]/5 shadow-inner">
                                        <p className="text-[9px] text-[#A1A5AE] font-semibold uppercase tracking-wider mb-1 line-clamp-1">{m.label}</p>
                                        <p className="text-lg font-bold text-[#F5F5F7] tracking-tight truncate">{m.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div className="p-4 overflow-y-auto w-full bg-[#0A0B0E] space-y-2">
                            {(!kpiPopup?.list || kpiPopup.list.length === 0) ? (
                                <div className="text-center py-8">
                                    <p className="text-sm text-[#8E939D] font-medium">No records found for this metric.</p>
                                </div>
                            ) : (
                                kpiPopup.list.map((item, idx) => (
                                    <div key={idx} className="bg-[#1A1D24] rounded-xl p-3 border border-[#F5F5F7]/5 flex flex-col gap-1.5 shadow-sm">
                                        {kpiPopup.type === 'visits' && (
                                            <>
                                                <div className="flex justify-between items-start">
                                                    <p className="font-semibold text-[13px] tracking-tight">{item.clients?.name || item.partners?.name || "Meeting"}</p>
                                                    <span className={\`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider whitespace-nowrap \${item.status === 'done' ? 'bg-[#2E7D32]/20 text-[#2E7D32]' : item.status === 'planned' ? 'bg-[#2B6CB0]/20 text-[#3182CE]' : 'bg-[#B4690E]/20 text-[#B4690E]'}\`}>
                                                        {item.status.replace("_", " ")}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px] text-[#A1A5AE] font-medium">
                                                    <span className="truncate pr-2">{item.purpose_masters?.purpose_name || "Follow up"}</span>
                                                    <span className="shrink-0">{format(parseISO(item.visit_date), "dd MMM")}</span>
                                                </div>
                                            </>
                                        )}
                                        {kpiPopup.type !== 'visits' && (
                                            <>
                                                <div className="flex justify-between items-start">
                                                    <p className="font-semibold text-[13px] tracking-tight">{item.clients?.name || "Client Work Scope"}</p>
                                                    <span className={\`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider whitespace-nowrap \${item.work_status === 'won' ? 'bg-[#2E7D32]/20 text-[#2E7D32]' : 'bg-[#B4690E]/20 text-[#B4690E]'}\`}>
                                                        {item.work_status}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px] text-[#A1A5AE] font-medium">
                                                    <span>Creation Date: {format(parseISO(item.created_at.split('T')[0]), "dd MMM")}</span>
                                                    <span className="font-bold text-[#D1D5DB]">₹ {item.amount_in_lac}L</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Leaderboard Dialog Popup */}
            <Dialog open={!!leadPopup} onOpenChange={(open) => !open && setLeadPopup(null)}>
                <DialogContent className="bg-[#1A1D24] border border-[#F5F5F7]/10 text-[#F5F5F7] max-w-sm w-[95vw] rounded-2xl p-6 outline-none shadow-2xl">
                    <DialogHeader className="text-left mb-6">
                        <DialogTitle className="text-2xl font-bold tracking-tight text-[#F5F5F7] flex items-center gap-3">
                            <span className="bg-[#12141A] w-10 h-10 rounded-full border border-[#F5F5F7]/10 flex items-center justify-center text-sm shadow-inner uppercase">
                                {leadPopup?.name.charAt(0)}
                            </span>
                            {leadPopup?.name}
                        </DialogTitle>
                        <p className="text-[10px] text-[#A1A5AE] font-semibold uppercase tracking-widest mt-2 bg-[#12141A] inline-block px-2 py-1 rounded-md border border-[#F5F5F7]/5 self-start">
                            {leadPopup?.rankingLogic}
                        </p>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        <div className="bg-[#12141A] rounded-xl p-4 border border-[#F5F5F7]/5 flex justify-between items-center shadow-inner group transition-colors hover:border-[#F5F5F7]/20">
                            <span className="text-[#8E939D] text-xs font-semibold uppercase tracking-wider group-hover:text-[#A1A5AE] transition-colors">Total Visits Done</span>
                            <span className="text-[#F5F5F7] text-xl font-bold font-mono tracking-tight">{leadPopup?.visits}</span>
                        </div>
                        <div className="bg-[#12141A] rounded-xl p-4 border border-[#F5F5F7]/5 flex justify-between items-center shadow-inner group transition-colors hover:border-[#F5F5F7]/20">
                            <span className="text-[#8E939D] text-xs font-semibold uppercase tracking-wider group-hover:text-[#A1A5AE] transition-colors">WOS Items Added</span>
                            <span className="text-[#F5F5F7] text-xl font-bold font-mono tracking-tight">{leadPopup?.wosCount}</span>
                        </div>
                        <div className="bg-gradient-to-r from-[#12141A] to-[#12141A] rounded-xl p-4 border border-[#A6192E]/30 flex justify-between items-center shadow-inner group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-[#A6192E]/5 to-transparent pointer-events-none" />
                            <span className="text-[#A1A5AE] text-xs font-semibold uppercase tracking-wider relative z-10">WOS Value Won</span>
                            <span className="text-[#F5F5F7] text-xl font-bold font-mono tracking-tight text-[#A6192E] relative z-10">₹ {leadPopup?.wosWon.toFixed(1)}L</span>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
`
    content = content.replace('{/* F. Floating Action Button */}', dialogsStr + '\n\n            {/* F. Floating Action Button */}');
}

fs.writeFileSync(FILE_PATH, content);
console.log('Interaction Dialogs Injected Successfully!');
