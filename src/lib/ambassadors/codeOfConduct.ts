/**
 * The version an Ambassador must have accepted to be considered current
 * on the Ambassador Code of Conduct (ZRP Community & Leadership Code,
 * section B). Bump this string when the Code's substance changes -
 * existing Ambassadors then see the re-acceptance prompt on their
 * dashboard (isCodeOfConductCurrent below) until they accept again.
 *
 * Keep in sync with the "communityCode.version" translation key
 * (src/lib/translations.ts) - that key is what a person actually reads on
 * /community-code, this constant is what the server checks and stores.
 */
export const CURRENT_CODE_OF_CONDUCT_VERSION = "1.0";

export function isCodeOfConductCurrent(acceptedVersion: string | null): boolean {
  return acceptedVersion === CURRENT_CODE_OF_CONDUCT_VERSION;
}
