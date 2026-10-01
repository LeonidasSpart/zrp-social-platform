import { describe, it, expect } from "vitest";
import { TOKEN_TEMPLATES, getTokenTemplate, applyTokenTemplate, type TokenTemplateFormFields } from "../token-templates";

const baseFormState: TokenTemplateFormFields & {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
} = {
  name: "My Token",
  symbol: "MYTOK",
  description: "A description the user already typed",
  imageUrl: "https://example.com/image.png",
  supply: "42",
  decimals: "4",
  website: "https://example.com",
  twitter: "myhandle",
  telegram: "mygroup",
  discord: "myserver",
  revokeMint: false,
  revokeFreeze: false,
  revokeUpdate: true,
};

describe("TOKEN_TEMPLATES", () => {
  it("defines exactly five templates with the required ids", () => {
    expect(TOKEN_TEMPLATES).toHaveLength(5);
    expect(TOKEN_TEMPLATES.map((t) => t.id)).toEqual(["meme", "utility", "governance", "simple", "scratch"]);
  });

  it("Meme Coin preset matches the spec exactly", () => {
    const template = getTokenTemplate("meme");
    expect(template.label).toBe("Meme Coin");
    expect(template.preset).toEqual({
      supply: 1_000_000_000,
      decimals: 6,
      revokeMint: true,
      revokeFreeze: true,
      revokeUpdate: true,
    });
  });

  it("Utility Token preset matches the spec exactly", () => {
    const template = getTokenTemplate("utility");
    expect(template.label).toBe("Utility Token");
    expect(template.preset).toEqual({
      supply: 10_000_000,
      decimals: 6,
      revokeMint: false,
      revokeFreeze: true,
      revokeUpdate: true,
    });
  });

  it("Governance DAO preset matches the spec exactly", () => {
    const template = getTokenTemplate("governance");
    expect(template.label).toBe("Governance DAO");
    expect(template.preset).toEqual({
      supply: 100_000_000,
      decimals: 6,
      revokeMint: false,
      revokeFreeze: true,
      revokeUpdate: true,
    });
  });

  it("Simple Token preset matches the spec exactly", () => {
    const template = getTokenTemplate("simple");
    expect(template.label).toBe("Simple Token");
    expect(template.preset).toEqual({
      supply: 1_000_000,
      decimals: 9,
      revokeMint: true,
      revokeFreeze: true,
      revokeUpdate: false,
    });
  });

  it("Start from Scratch carries no preset", () => {
    const template = getTokenTemplate("scratch");
    expect(template.label).toBe("Start from Scratch");
    expect(template.preset).toBeNull();
  });

  it("getTokenTemplate throws on an unknown id", () => {
    // @ts-expect-error intentionally invalid id to exercise the guard
    expect(() => getTokenTemplate("not-a-real-template")).toThrow();
  });
});

describe("applyTokenTemplate", () => {
  it("applies only supply/decimals/revoke* for the Meme Coin template", () => {
    const next = applyTokenTemplate(baseFormState, getTokenTemplate("meme"));
    expect(next.supply).toBe("1000000000");
    expect(next.decimals).toBe("6");
    expect(next.revokeMint).toBe(true);
    expect(next.revokeFreeze).toBe(true);
    expect(next.revokeUpdate).toBe(true);
  });

  it("applies only supply/decimals/revoke* for the Utility Token template", () => {
    const next = applyTokenTemplate(baseFormState, getTokenTemplate("utility"));
    expect(next.supply).toBe("10000000");
    expect(next.decimals).toBe("6");
    expect(next.revokeMint).toBe(false);
    expect(next.revokeFreeze).toBe(true);
    expect(next.revokeUpdate).toBe(true);
  });

  it("applies only supply/decimals/revoke* for the Governance DAO template", () => {
    const next = applyTokenTemplate(baseFormState, getTokenTemplate("governance"));
    expect(next.supply).toBe("100000000");
    expect(next.decimals).toBe("6");
    expect(next.revokeMint).toBe(false);
    expect(next.revokeFreeze).toBe(true);
    expect(next.revokeUpdate).toBe(true);
  });

  it("applies only supply/decimals/revoke* for the Simple Token template", () => {
    const next = applyTokenTemplate(baseFormState, getTokenTemplate("simple"));
    expect(next.supply).toBe("1000000");
    expect(next.decimals).toBe("9");
    expect(next.revokeMint).toBe(true);
    expect(next.revokeFreeze).toBe(true);
    expect(next.revokeUpdate).toBe(false);
  });

  it("Start from Scratch returns the input completely unchanged", () => {
    const next = applyTokenTemplate(baseFormState, getTokenTemplate("scratch"));
    expect(next).toEqual(baseFormState);
    expect(next).toBe(baseFormState);
  });

  for (const id of ["meme", "utility", "governance", "simple"] as const) {
    it(`does not overwrite name/symbol/description/image/socials when applying the ${id} template`, () => {
      const next = applyTokenTemplate(baseFormState, getTokenTemplate(id));
      expect(next.name).toBe(baseFormState.name);
      expect(next.symbol).toBe(baseFormState.symbol);
      expect(next.description).toBe(baseFormState.description);
      expect(next.imageUrl).toBe(baseFormState.imageUrl);
      expect(next.website).toBe(baseFormState.website);
      expect(next.twitter).toBe(baseFormState.twitter);
      expect(next.telegram).toBe(baseFormState.telegram);
      expect(next.discord).toBe(baseFormState.discord);
    });
  }

  it("preset values remain editable afterward (merge result is a plain, independently mutable object)", () => {
    const next = applyTokenTemplate(baseFormState, getTokenTemplate("meme"));
    const edited = { ...next, supply: "123456", revokeUpdate: false };
    expect(edited.supply).toBe("123456");
    expect(edited.revokeUpdate).toBe(false);
    // Editing the result never mutates the original template definition.
    expect(getTokenTemplate("meme").preset).toEqual({
      supply: 1_000_000_000,
      decimals: 6,
      revokeMint: true,
      revokeFreeze: true,
      revokeUpdate: true,
    });
  });
});
