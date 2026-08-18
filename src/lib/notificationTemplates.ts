export type NotificationStyle = "standard" | "report" | "celebration" | "critical" | "image";

export type NotificationTemplate = {
  key: string;
  name: string;
  description: string;
  category: "critical" | "important" | "report" | "reminder" | "informational";
  priority: "urgent" | "high" | "medium" | "normal" | "low";
  style: NotificationStyle;
  title: string;
  body: string;
  targetUrl: string;
};

export const notificationVariables = [
  { key: "today", label: "Today", sample: "17 Aug 2026" },
  { key: "user_name", label: "Employee", sample: "Rizwee Hassan" },
  { key: "showroom_name", label: "Showroom", sample: "Kirti Nagar" },
  { key: "total_visits", label: "Total visits", sample: "109" },
  { key: "completed_visits", label: "Completed", sample: "82" },
  { key: "planned_visits", label: "Planned visits", sample: "6" },
  { key: "client_count", label: "Clients", sample: "134" },
  { key: "wos_count", label: "WOS", sample: "6" },
  { key: "won_count", label: "Won", sample: "2" },
  { key: "inactive_count", label: "Inactive staff", sample: "3" },
  { key: "overdue_count", label: "Overdue actions", sample: "5" },
  { key: "partner_overdue_count", label: "Partner follow-ups", sample: "12" },
  { key: "client_name", label: "Client", sample: "Sharma Residence" },
  { key: "wos_number", label: "WOS number", sample: "WOS-2048" },
  { key: "amount", label: "Amount", sample: "₹4.8 lakh" },
] as const;

export const notificationTemplates: NotificationTemplate[] = [
  {
    key: "daily_summary",
    name: "Daily Business Summary",
    description: "MD-ready KPI snapshot",
    category: "report",
    priority: "normal",
    style: "report",
    title: "Daily Summary — {{today}}",
    body: "{{total_visits}} visits, {{completed_visits}} completed, {{wos_count}} WOS and {{won_count}} wins across {{showroom_name}}.",
    targetUrl: "/md-dashboard",
  },
  {
    key: "start_day",
    name: "Start Day Reminder",
    description: "Attendance and visit reminder",
    category: "reminder",
    priority: "high",
    style: "standard",
    title: "Start Day Reminder — {{today}}",
    body: "Good morning {{user_name}}. Mark Start Day and check in for today's {{planned_visits}} planned visits.",
    targetUrl: "/daily-visits",
  },
  {
    key: "deal_won",
    name: "Deal Won Celebration",
    description: "Celebrate a work-order win",
    category: "informational",
    priority: "normal",
    style: "celebration",
    title: "Deal Won — {{client_name}} 🎉",
    body: "{{user_name}} won {{wos_number}} worth {{amount}}. Great work!",
    targetUrl: "/reports",
  },
  {
    key: "critical_alert",
    name: "Critical Action Alert",
    description: "Urgent operational escalation",
    category: "critical",
    priority: "high",
    style: "critical",
    title: "Action Required — {{showroom_name}}",
    body: "{{inactive_count}} employees need attention and {{overdue_count}} actions are overdue.",
    targetUrl: "/md-dashboard",
  },
  {
    key: "partner_overdue",
    name: "Partner Follow-up",
    description: "Coverage follow-up reminder",
    category: "reminder",
    priority: "high",
    style: "report",
    title: "Partner Follow-up — {{showroom_name}}",
    body: "{{partner_overdue_count}} partners have not been visited in the selected period.",
    targetUrl: "/partner-visits",
  },
];

export const renderNotificationPreview = (value: string) =>
  notificationVariables.reduce(
    (result, variable) => result.replaceAll(`{{${variable.key}}}`, variable.sample),
    value
  );

export const extractNotificationVariables = (title: string, body: string) => {
  const matches = `${title} ${body}`.match(/{{\s*([a-z0-9_]+)\s*}}/gi) || [];
  return Object.fromEntries(
    [...new Set(matches.map((match) => match.replace(/[{}\s]/g, "")))].map((key) => [key, `{{${key}}}`])
  );
};
