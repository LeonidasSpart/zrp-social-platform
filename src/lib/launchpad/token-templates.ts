/*
 * Static, read-only token-creation presets for /launchpad/create's
 * template selector. These are a UI convenience only: they prefill the
 * existing manual creation form's supply/decimals/authority-revocation
 * fields and nothing else. The form itself, the wallet-signed mint flow
 * (mintTokenFromBrowser in client-token-mint.ts), and server-side
 * verification are unchanged and remain the only source of truth for
 * the actual transaction - a template id is never sent to the backend
 * and never used for authorization.
 */

export type TokenTemplateId = "meme" | "utility" | "governance" | "simple" | "scratch";

export interface TokenTemplatePresetValues {
  supply: number;
  decimals: number;
  revokeMint: boolean;
  revokeFreeze: boolean;
  revokeUpdate: boolean;
}

export interface TokenTemplate {
  id: TokenTemplateId;
  label: string;
  description: string;
  // null for "Start from Scratch" - selecting it applies no preset and
  // leaves every field (including supply/decimals/authorities) as-is.
  preset: TokenTemplatePresetValues | null;
}

export const TOKEN_TEMPLATES: readonly TokenTemplate[] = [
  {
    id: "meme",
    label: "Meme Coin",
    description: "Viral community tokens, memecoins, social experiments",
    preset: { supply: 1_000_000_000, decimals: 6, revokeMint: true, revokeFreeze: true, revokeUpdate: true },
  },
  {
    id: "utility",
    label: "Utility Token",
    description: "Project tokens, utility and ecosystem use",
    preset: { supply: 10_000_000, decimals: 6, revokeMint: false, revokeFreeze: true, revokeUpdate: true },
  },
  {
    id: "governance",
    label: "Governance DAO",
    description: "Governance and DAO voting",
    preset: { supply: 100_000_000, decimals: 6, revokeMint: false, revokeFreeze: true, revokeUpdate: true },
  },
  {
    id: "simple",
    label: "Simple Token",
    description: "Testing, private use and experimentation",
    preset: { supply: 1_000_000, decimals: 9, revokeMint: true, revokeFreeze: true, revokeUpdate: false },
  },
  {
    id: "scratch",
    label: "Start from Scratch",
    description: "Manual configuration - nothing is pre-filled",
    preset: null,
  },
];

export function getTokenTemplate(id: TokenTemplateId): TokenTemplate {
  const found = TOKEN_TEMPLATES.find((template) => template.id === id);
  if (!found) throw new Error(`Unknown token template id: ${id}`);
  return found;
}

export interface TokenTemplateFormFields {
  supply: string;
  decimals: string;
  revokeMint: boolean;
  revokeFreeze: boolean;
  revokeUpdate: boolean;
}

/*
 * Merges a template's preset onto an existing form-field snapshot. Only
 * ever touches supply/decimals/revokeMint/revokeFreeze/revokeUpdate -
 * every other field a caller's object may carry (name, symbol,
 * description, image, socials, ...) is passed through unchanged via the
 * spread, and "Start from Scratch" (preset === null) returns the input
 * completely untouched rather than resetting anything.
 */
export function applyTokenTemplate<T extends TokenTemplateFormFields>(current: T, template: TokenTemplate): T {
  if (!template.preset) return current;
  return {
    ...current,
    supply: String(template.preset.supply),
    decimals: String(template.preset.decimals),
    revokeMint: template.preset.revokeMint,
    revokeFreeze: template.preset.revokeFreeze,
    revokeUpdate: template.preset.revokeUpdate,
  };
}
