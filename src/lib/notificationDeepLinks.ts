export interface DeepLinkTarget {
  path: string;
  params: Record<string, string>;
  fullUrl: string;
  fallbackPath: string;
}

/**
 * Parses notification deep link URL strings into route paths and query parameters.
 * Supports context-aware navigation, cold-start restoration, and safe fallback routing.
 */
export function parseNotificationDeepLink(urlStr?: string | null): DeepLinkTarget {
  const fallbackPath = "/notifications";
  if (!urlStr) {
    return { path: "/notifications", params: {}, fullUrl: "/notifications", fallbackPath: "/md-dashboard" };
  }

  try {
    // Handle relative or full URLs
    const base = window.location.origin;
    const url = new URL(urlStr.startsWith("/") ? `${base}${urlStr}` : urlStr);
    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return {
      path: url.pathname,
      params,
      fullUrl: url.pathname + url.search,
      fallbackPath,
    };
  } catch (e) {
    console.warn("Failed to parse deep link URL:", urlStr, e);
    return { path: "/notifications", params: {}, fullUrl: "/notifications", fallbackPath: "/md-dashboard" };
  }
}

/**
 * Constructs standardized deep link URLs for each of the 20 notification types.
 */
export function buildNotificationDeepLink(type: string, payload?: Record<string, any>): string {
  switch (type) {
    case "daily_summary":
      return `/reports?type=daily&date=${payload?.date || new Date().toISOString().split("T")[0]}`;
    case "morning_plan":
      return `/reports?type=morning_plan&date=${payload?.date || new Date().toISOString().split("T")[0]}`;
    case "dsr_report":
      return `/reports?type=dsr&date=${payload?.date || new Date().toISOString().split("T")[0]}`;
    case "missed_visit":
      return `/visits?status=missed&date=${payload?.date || new Date().toISOString().split("T")[0]}${payload?.execId ? `&execId=${payload.execId}` : ""}`;
    case "overdue_followup":
      return `/clients?filter=overdue_followups${payload?.execId ? `&execId=${payload.execId}` : ""}`;
    case "exec_performance":
      return `/reports?type=performance_summary${payload?.execId ? `&execId=${payload.execId}` : ""}`;
    case "low_performance":
      return `/hierarchy?execId=${payload?.execId || ""}&view=performance`;
    case "target_update":
      return `/md-dashboard?section=targets`;
    case "pipeline_report":
      return `/md-dashboard?section=pipeline`;
    case "deal_won":
      return `/clients?highlightDeal=${payload?.dealId || ""}`;
    case "deal_lost":
      return `/clients?highlightDeal=${payload?.dealId || ""}&view=loss_analysis`;
    case "high_value_opportunity":
      return `/clients?highlightDeal=${payload?.dealId || ""}`;
    case "pending_quotation":
      return `/clients?quotationStatus=pending&age=${payload?.age || 7}`;
    case "client_activity":
      return `/clients`;
    case "no_visit_client":
      return `/clients?noVisitDays=${payload?.days || 30}&priority=high`;
    case "team_activity":
      return `/hierarchy`;
    case "partner_report":
      return `/partners`;
    case "exception_report":
      return `/reports?type=exceptions`;
    case "weekly_report":
      return `/reports?type=weekly`;
    case "monthly_report":
      return `/reports?type=monthly`;
    default:
      return payload?.targetUrl || "/notifications";
  }
}
