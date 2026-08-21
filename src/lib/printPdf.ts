export const escapeReportHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export const openPdfPrintDialog = (title: string, body: string, landscape = true) => {
  const reportWindow = window.open("", "_blank", "width=1200,height=850");
  if (!reportWindow) throw new Error("Pop-up blocked. Please allow pop-ups and try Export PDF again.");

  reportWindow.document.open();
  reportWindow.document.write(`<!doctype html>
  <html><head><meta charset="utf-8"><title>${escapeReportHtml(title)}</title>
  <style>
    @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font: 11px/1.45 Arial, sans-serif; }
    .report-head { border-bottom: 3px solid #dc2626; padding: 0 0 10px; margin-bottom: 12px; display: flex; justify-content: space-between; gap: 20px; align-items: end; }
    .brand { color: #dc2626; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { font-size: 21px; margin: 2px 0 0; color: #101828; }
    .meta { color: #667085; text-align: right; }
    .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; margin: 0 0 12px; }
    .kpi { border: 1px solid #dfe3ea; border-radius: 7px; padding: 8px; }
    .kpi b { display: block; font-size: 17px; color: #101828; }
    .kpi span { color: #667085; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #172033; color: #fff; font-size: 9px; text-align: left; text-transform: uppercase; letter-spacing: .04em; }
    th, td { border: 1px solid #dfe3ea; padding: 6px; vertical-align: top; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .section { margin: 14px 0 5px; color: #dc2626; font-size: 12px; font-weight: 800; }
    .status { font-weight: 700; text-transform: capitalize; }
    .muted { color: #667085; }
    .footer { margin-top: 10px; display: flex; justify-content: space-between; color: #98a2b3; font-size: 9px; }
    @media print { .no-print { display: none !important; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body>
  <div class="report-head"><div><div class="brand">Art N Glass</div><h1>${escapeReportHtml(title)}</h1></div><div class="meta">Generated ${escapeReportHtml(new Date().toLocaleString("en-IN"))}</div></div>
  ${body}
  <div class="footer"><span>Art N Glass · Internal report</span><span>Filtered data as visible in the application</span></div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)});<\/script>
  </body></html>`);
  reportWindow.document.close();
  reportWindow.opener = null;
};
