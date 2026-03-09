const fs = require('fs');

const FILE_PATH = 'src/components/dashboard/ExecutiveHome.tsx';
let content = fs.readFileSync(FILE_PATH, 'utf8');

// Backgrounds
content = content.replace(/bg-\[#0E0F12\]/g, 'bg-[#0A0B0E]');
content = content.replace(/bg-\[#15171C\]/g, 'bg-[#12141A]');
content = content.replace(/bg-\[#1A1C21\]/g, 'bg-[#1A1D24]');

// Text
content = content.replace(/text-white/g, 'text-[#F5F5F7]');
content = content.replace(/text-gray-300/g, 'text-[#D1D5DB]');
content = content.replace(/text-gray-400/g, 'text-[#A1A5AE]');
content = content.replace(/text-gray-500/g, 'text-[#8E939D]');
content = content.replace(/text-gray-600/g, 'text-[#6B7280]');

// Reds
content = content.replace(/\[#991b1b\]/g, '[#A6192E]');
content = content.replace(/\[#b91c1c\]/g, '[#C21833]');
content = content.replace(/\[#8b0000\]/g, '[#7A121F]');

// Additional Premium Highlights
content = content.replace(/emerald-500/g, '[#2E7D32]');
content = content.replace(/emerald-600/g, '[#276749]');
content = content.replace(/amber-500/g, '[#B4690E]');
content = content.replace(/amber-600/g, '[#9A5B0B]');
content = content.replace(/blue-400/g, '[#3182CE]');
content = content.replace(/blue-500/g, '[#2B6CB0]');
content = content.replace(/purple-500/g, '[#553C9A]');

// Borders & Dividers
content = content.replace(/border-white\/5/g, 'border-[#F5F5F7]/5');
content = content.replace(/border-white\/10/g, 'border-[#F5F5F7]/10');
content = content.replace(/bg-white\/5/g, 'bg-[#F5F5F7]/5');
content = content.replace(/bg-white\/10/g, 'bg-[#F5F5F7]/10');

// Fix Accidental Overlaps
content = content.replace(/fill-\[#F5F5F7\]/g, 'fill-[#F5F5F7]');

fs.writeFileSync(FILE_PATH, content);
console.log('Colors successfully mapped in', FILE_PATH);
