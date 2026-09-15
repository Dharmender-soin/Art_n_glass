type LocationQueryError = { code?: string; message?: string } | null;

export function isMissingLocationTelemetry(error: LocationQueryError): boolean {
  return !!error && ["42703", "PGRST204"].includes(error.code || "") &&
    /\b(accuracy_m|speed_mps|bearing_deg|altitude_m|recorded_at|permission_status)\b/.test(error.message || "");
}

/** Keep basic GPS working until the optional telemetry migration is installed. */
export async function withLocationTelemetryFallback<T extends { error: LocationQueryError }>(
  fullQuery: () => PromiseLike<T>,
  basicQuery: () => PromiseLike<T>,
): Promise<T> {
  const result = await fullQuery();
  return isMissingLocationTelemetry(result.error) ? await basicQuery() : result;
}
