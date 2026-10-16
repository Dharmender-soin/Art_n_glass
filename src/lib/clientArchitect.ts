type Partner = { type: string; name: string };

/** Only an Architect partner supplies an architect name; typed names take precedence. */
export function suggestClientArchitect(
  currentName: string,
  lastSuggestedName: string | null,
  partner?: Partner,
) {
  if (currentName.trim() && currentName !== lastSuggestedName) {
    return { name: currentName, suggestedName: null };
  }
  const name = partner?.type === "architect" ? partner.name.trim() : "";
  return { name, suggestedName: name || null };
}
