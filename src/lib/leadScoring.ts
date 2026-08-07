// ════════════════════════════════════════════════════════════════════
// PROPERTY OS — LEAD SCORING & TEMPERATURE ALGORITHM (0 - 100)
// ════════════════════════════════════════════════════════════════════

export interface LeadScoreInput {
  status: "new" | "hot" | "converted" | "lost" | string;
  project_status?: string | null;
  mobile?: string | null;
  address?: string | null;
  partner_id?: string | null;
  architect_name?: string | null;
  visitsCount?: number;
  wosCount?: number;
  wosWonCount?: number;
}

export interface LeadScoreResult {
  score: number;
  temperature: "hot" | "warm" | "cold";
  label: "Hot Deal 🔥" | "Strong Lead ⚡" | "Medium Interest" | "Low Engagement 💤";
  color: string;
  badgeClass: string;
  reasons: string[];
}

export const calculateLeadScore = (input: LeadScoreInput): LeadScoreResult => {
  let score = 20; // Base score for lead entry
  const reasons: string[] = [];

  // 1. Contact completeness
  if (input.mobile && input.mobile.length >= 10) {
    score += 15;
    reasons.push("Valid contact number confirmed (+15)");
  }
  if (input.address && input.address.trim().length > 3) {
    score += 10;
    reasons.push("Location / Address set (+10)");
  }

  // 2. Partner / Source linkage
  if (input.partner_id || (input.architect_name && input.architect_name.trim())) {
    score += 15;
    reasons.push("Architect or Partner linked (+15)");
  }

  // 3. Status weight
  if (input.status === "hot") {
    score += 25;
    reasons.push("Marked as Hot Lead (+25)");
  } else if (input.status === "converted") {
    score += 40;
    reasons.push("Converted Lead (+40)");
  }

  // 4. Site Visits engagement
  const visits = input.visitsCount || 0;
  if (visits >= 3) {
    score += 20;
    reasons.push(`${visits} Site Visits completed (+20)`);
  } else if (visits >= 1) {
    score += 10;
    reasons.push(`${visits} Site Visit scheduled/completed (+10)`);
  }

  // 5. Scope of Work / Deals Pipeline
  const wos = input.wosCount || 0;
  const won = input.wosWonCount || 0;
  if (won > 0) {
    score += 20;
    reasons.push(`${won} Deals/WOS won (+20)`);
  } else if (wos > 0) {
    score += 10;
    reasons.push(`${wos} Deals in negotiation (+10)`);
  }

  // Clamp 0 to 100
  const finalScore = Math.min(Math.max(score, 10), 100);

  let temperature: "hot" | "warm" | "cold" = "cold";
  let label: "Hot Deal 🔥" | "Strong Lead ⚡" | "Medium Interest" | "Low Engagement 💤" = "Low Engagement 💤";
  let color = "text-blue-500 bg-blue-500/10 border-blue-500/20";
  let badgeClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";

  if (finalScore >= 75) {
    temperature = "hot";
    label = "Hot Deal 🔥";
    color = "text-red-500 bg-red-500/10 border-red-500/20";
    badgeClass = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-bold";
  } else if (finalScore >= 50) {
    temperature = "warm";
    label = "Strong Lead ⚡";
    color = "text-amber-500 bg-amber-500/10 border-amber-500/20";
    badgeClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold";
  } else if (finalScore >= 35) {
    temperature = "warm";
    label = "Medium Interest";
    color = "text-blue-500 bg-blue-500/10 border-blue-500/20";
    badgeClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  }

  return {
    score: finalScore,
    temperature,
    label,
    color,
    badgeClass,
    reasons,
  };
};
