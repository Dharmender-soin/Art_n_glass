const fs = require('fs');
const FILE_PATH = 'src/components/dashboard/ExecutiveHome.tsx';

let content = fs.readFileSync(FILE_PATH, 'utf8');

// 1. Add Imports
if (!content.includes('import { Dialog')) {
    content = content.replace('import { toast } from "sonner";', 'import { toast } from "sonner";\nimport { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";');
}

// 2. Add State inside ExecutiveHome
const stateStr = `    const [selectedDate, setSelectedDate] = useState(new Date());

    const [kpiPopup, setKpiPopup] = useState<{
        title: string;
        metrics: { label: string; value: string | number }[];
        list: any[];
        type: 'visits' | 'wos_count' | 'wos_won';
    } | null>(null);

    const [leadPopup, setLeadPopup] = useState<{
        name: string;
        visits: number;
        wosCount: number;
        wosWon: number;
        rankingLogic: string;
    } | null>(null);`;

if (!content.includes('const [kpiPopup')) {
    content = content.replace('    const [selectedDate, setSelectedDate] = useState(new Date());', stateStr);
}

// 3. Update calculateRingKpis
const oldCalc = `
        const wonPercent = estValue > 0 ? Math.round((wonValue / estValue) * 100) : 0;

        return { plannedVisits, doneVisits, wosCount, estValue, wonValue, wonPercent };
`;

const newCalc = `
        const wonPercent = estValue > 0 ? Math.round((wonValue / estValue) * 100) : 0;

        const wonItems: any[] = [];
        filteredWos.forEach(w => {
            if (w.work_status === 'won' || w.verified_amount) wonItems.push(w);
        });

        return { 
            plannedVisits, 
            doneVisits, 
            wosCount, 
            estValue, 
            wonValue, 
            wonPercent,
            rawVisits: filteredVisits,
            rawWos: filteredWos,
            rawWosWon: wonItems
        };
`;

content = content.replace(oldCalc.trim(), newCalc.trim());

// 4. Update the labels for KPI rings in weekKpis
content = content.replace(/label="WOS Value"/g, 'label="WOS Count"');
content = content.replace(/label="Verified"/g, 'label="WOS Won"');
content = content.replace(/Top Value/g, 'Top WOS Won');

// Re-write the ProgressRing component definition to support onClick
content = content.replace(/interface ProgressRingProps \{/, 'interface ProgressRingProps {\n    onClick?: () => void;');
content = content.replace(/const ProgressRing = \(\{ value, max, label, sublabel, color, displayValue, delay \}: ProgressRingProps\) => \{/, 'const ProgressRing = ({ value, max, label, sublabel, color, displayValue, delay, onClick }: ProgressRingProps) => {');
content = content.replace(/<div className="flex flex-col items-center justify-center">/g, '<div className="flex flex-col items-center justify-center cursor-pointer group hover:scale-105 transition-transform" onClick={onClick}>');

fs.writeFileSync(FILE_PATH, content);
console.log('Interactions partially applied.');
