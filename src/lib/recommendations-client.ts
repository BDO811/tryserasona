/**
 * Client for the recommendations endpoint.
 *
 * The URL is hardcoded with an env override rather than env-only: Vite inlines
 * import.meta.env at build time, and the .env file is gitignored, so an
 * env-only URL resolves to undefined in CI and ships a dead call. That is
 * exactly how the notify-lead endpoint went missing from a production bundle.
 */

const DEFAULT_RECOMMENDATIONS_URL =
  "https://us-central1-amits-playground-po.cloudfunctions.net/recommendations";

const RECOMMENDATIONS_URL =
  (import.meta.env.VITE_RECOMMENDATIONS_URL as string | undefined) ||
  DEFAULT_RECOMMENDATIONS_URL;

export interface RecommendationSign {
  label: string;
  band: string;
}

export interface RecommendationsResult {
  text: string;
  signs: number;
}

/**
 * Fetches written suggestions for the readings that are not normal.
 *
 * Throws on failure so the caller can offer a retry: unlike the lead
 * notification, this one is user-initiated and its absence is visible, so it
 * must not fail silently.
 */
export async function fetchRecommendations(
  signs: RecommendationSign[],
  assessment: string
): Promise<RecommendationsResult> {
  const response = await fetch(RECOMMENDATIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signs, assessment }),
  });

  if (!response.ok) {
    throw new Error(`recommendations failed: ${response.status}`);
  }

  const payload = (await response.json()) as Partial<RecommendationsResult>;
  return { text: payload.text || "", signs: payload.signs || 0 };
}
