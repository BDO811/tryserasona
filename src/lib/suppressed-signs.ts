/**
 * Signs withheld from every surface.
 *
 * Empty on purpose. This held elevated-blood-pressure and head-impact, removed
 * on the grounds that each reads as a clinical finding the voice model is not
 * making. That call is reversed here in favour of the API's own vocabulary: the
 * docs publish both as first-class signs with display labels, and withholding
 * them had two costs beyond the missing rows.
 *
 * It changed the grade. Both were reading `low`, the levels the docs call
 * "Faint indicator", so dropping them removed the only unflagged signals and
 * pushed both assessments down the scale.
 *
 * And it could not fully succeed. The API's own narrative named Elevated Blood
 * Pressure anyway, so the sign reached the screen through prose while its row
 * was hidden.
 *
 * The hook stays because a future suppression should route through one place
 * rather than being scattered across the mapper and the analysis copy again.
 */
export const SUPPRESSED_SIGNS: ReadonlySet<string> = new Set<string>();

export function isSuppressedSign(name: string | null | undefined): boolean {
  return SUPPRESSED_SIGNS.has((name || "").toLowerCase());
}
