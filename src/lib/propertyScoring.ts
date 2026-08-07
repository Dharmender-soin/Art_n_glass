// ════════════════════════════════════════════════════════════════════
// PROPERTY OS — PROPERTY QUALITY SCORE ALGORITHM (0 - 100)
// ════════════════════════════════════════════════════════════════════

export interface PropertyScoreInput {
  title?: string;
  price?: number;
  address?: string;
  location_lat?: number | null;
  location_lng?: number | null;
  owner_id?: string | null;
  verification_status?: string | null;
  photos_count?: number;
  video_url?: string | null;
  documents_count?: number;
  amenities_count?: number;
  description?: string | null;
}

export interface PropertyScoreResult {
  score: number;
  label: "90+ Excellent 🌟" | "75+ Good ✅" | "55+ Needs Improvement ⚠️" | "Low Quality ❌";
  color: string;
  missingItems: string[];
}

export const calculatePropertyQualityScore = (input: PropertyScoreInput): PropertyScoreResult => {
  let score = 0;
  const missingItems: string[] = [];

  // 1. Photos (20 pts)
  if ((input.photos_count || 0) >= 3) {
    score += 20;
  } else if ((input.photos_count || 0) >= 1) {
    score += 10;
    missingItems.push("Add at least 3 property photos (+10)");
  } else {
    missingItems.push("Upload property photos (+20)");
  }

  // 2. Location (10 pts)
  if (input.address && input.address.trim().length > 5) {
    score += 10;
  } else {
    missingItems.push("Complete location address (+10)");
  }

  // 3. Price (10 pts)
  if (input.price && input.price > 0) {
    score += 10;
  } else {
    missingItems.push("Enter property price (+10)");
  }

  // 4. Owner / Partner (15 pts)
  if (input.owner_id) {
    score += 15;
  } else {
    missingItems.push("Link property owner / builder (+15)");
  }

  // 5. Verification (10 pts)
  if (input.verification_status === "verified") {
    score += 10;
  } else {
    missingItems.push("Verify property documents (+10)");
  }

  // 6. Amenities (10 pts)
  if ((input.amenities_count || 0) >= 2) {
    score += 10;
  } else {
    missingItems.push("Add property amenities (+10)");
  }

  // 7. Description (10 pts)
  if (input.description && input.description.trim().length > 10) {
    score += 10;
  } else {
    missingItems.push("Add detailed description (+10)");
  }

  // 8. Video (5 pts)
  if (input.video_url) {
    score += 5;
  } else {
    missingItems.push("Upload video walkthrough (+5)");
  }

  // 9. Map Location GPS (5 pts)
  if (input.location_lat && input.location_lng) {
    score += 5;
  } else {
    missingItems.push("Pin exact map GPS location (+5)");
  }

  // 10. Title / Configuration (5 pts)
  if (input.title && input.title.trim().length > 3) {
    score += 5;
  } else {
    missingItems.push("Set descriptive title (+5)");
  }

  let label: "90+ Excellent 🌟" | "75+ Good ✅" | "55+ Needs Improvement ⚠️" | "Low Quality ❌" = "Low Quality ❌";
  let color = "text-red-500 bg-red-500/10 border-red-500/20";

  if (score >= 90) {
    label = "90+ Excellent 🌟";
    color = "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
  } else if (score >= 75) {
    label = "75+ Good ✅";
    color = "text-blue-600 bg-blue-500/10 border-blue-500/20";
  } else if (score >= 55) {
    label = "55+ Needs Improvement ⚠️";
    color = "text-amber-600 bg-amber-500/10 border-amber-500/20";
  }

  return {
    score,
    label,
    color,
    missingItems,
  };
};
