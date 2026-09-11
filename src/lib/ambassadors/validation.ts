import { isValidCountryCode } from "./countries";

export const AMBASSADOR_LIMITS = {
  cityRegion: 120,
  motivation: 3000,
  communityDescription: 3000,
  maxLanguages: 10,
  maxCommunityLinks: 5,
  linkLength: 500,
  languageLength: 40,
  maxAudienceSize: 500_000_000, // generous ceiling, just enough to reject garbage input
} as const;

export interface AmbassadorApplicationInput {
  countryCode: string;
  cityRegion: string | null;
  languages: string[];
  communityLinks: string[];
  motivation: string;
  communityDescription: string | null;
  audienceSize: number | null;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  value?: AmbassadorApplicationInput;
}

/**
 * A community/social link only has to be a real, well-formed https URL
 * - it isn't restricted to a fixed set of platforms the way media
 * uploads are (src/lib/media-url.ts), since an ambassador's community
 * could live anywhere (a Discord invite, a personal site, a ZRP
 * profile, ...). http:// is rejected the same way the rest of ZRP
 * treats plain http as unsafe to send anyone to.
 */
function isValidCommunityUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= AMBASSADOR_LIMITS.linkLength;
  } catch {
    return false;
  }
}

/**
 * Server-side validation for an ambassador application, shared by the
 * apply route so the frontend form's own validation is never the only
 * line of defense - the security requirement is explicit: "Validate:
 * application data ... Never rely on ... client-side ... state."
 */
export function validateApplication(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  // Server-side gate on the Ambassador Code of Conduct checkbox - the
  // form's own checkbox state is never trusted as the only enforcement.
  if (b.codeOfConductAccepted !== true) {
    return { ok: false, error: "You must accept the Ambassador Code of Conduct to apply." };
  }

  const countryCode = typeof b.countryCode === "string" ? b.countryCode.trim().toUpperCase() : "";
  if (!isValidCountryCode(countryCode)) {
    return { ok: false, error: "Select a valid country." };
  }

  const cityRegionRaw = typeof b.cityRegion === "string" ? b.cityRegion.trim() : "";
  const cityRegion = cityRegionRaw ? cityRegionRaw.slice(0, AMBASSADOR_LIMITS.cityRegion) : null;

  const languagesRaw = Array.isArray(b.languages) ? b.languages : [];
  const languages = languagesRaw
    .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    .map((l) => l.trim().slice(0, AMBASSADOR_LIMITS.languageLength))
    .slice(0, AMBASSADOR_LIMITS.maxLanguages);

  const linksRaw = Array.isArray(b.communityLinks) ? b.communityLinks : [];
  const candidateLinks = linksRaw
    .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    .map((l) => l.trim())
    .slice(0, AMBASSADOR_LIMITS.maxCommunityLinks);

  for (const link of candidateLinks) {
    if (!isValidCommunityUrl(link)) {
      return { ok: false, error: `"${link}" is not a valid https:// link.` };
    }
  }

  const motivation = typeof b.motivation === "string" ? b.motivation.trim() : "";
  if (!motivation) {
    return { ok: false, error: "Tell us why you want to become a ZRP Ambassador." };
  }
  if (motivation.length > AMBASSADOR_LIMITS.motivation) {
    return { ok: false, error: "Your motivation is too long." };
  }

  const communityDescriptionRaw =
    typeof b.communityDescription === "string" ? b.communityDescription.trim() : "";
  if (communityDescriptionRaw.length > AMBASSADOR_LIMITS.communityDescription) {
    return { ok: false, error: "Your community description is too long." };
  }
  const communityDescription = communityDescriptionRaw || null;

  let audienceSize: number | null = null;
  if (b.audienceSize !== undefined && b.audienceSize !== null && b.audienceSize !== "") {
    const n = Number(b.audienceSize);
    if (!Number.isFinite(n) || n < 0 || n > AMBASSADOR_LIMITS.maxAudienceSize) {
      return { ok: false, error: "Enter a valid audience/community size." };
    }
    audienceSize = Math.round(n);
  }

  return {
    ok: true,
    value: {
      countryCode,
      cityRegion,
      languages,
      communityLinks: candidateLinks,
      motivation,
      communityDescription,
      audienceSize,
    },
  };
}
