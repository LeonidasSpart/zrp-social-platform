import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Regression test for the mobile drawer / Sign Out scroll bug: BottomNav
// (h-14 = 56px, portaled to document.body at z-[9999]) sits fixed to the
// viewport bottom, above the mobile drawer's z-50. The drawer's own last
// scrollable item (Sign Out) must reserve enough bottom clearance to
// scroll clear of BottomNav's real footprint, or it lands underneath it
// on small screens where the menu genuinely needs to scroll that far.
//
// There's no jsdom/RTL setup in this project (vitest runs in "node"
// environment only, see vitest.config.ts) and the mandate for this fix
// is explicit about reusing the existing framework rather than adding a
// new one - so this asserts at the source level instead of rendering
// the component. It still verifies the two things that matter: Sign Out
// remains present and wired to handleLogout, and its clearance is tied
// to BottomNav's actual height rather than an arbitrary guess.

const headerSource = readFileSync(
  path.resolve(__dirname, "../Header.tsx"),
  "utf-8"
);

describe("mobile drawer Sign Out clears BottomNav", () => {
  it("still renders a Sign Out button wired to handleLogout", () => {
    const logoutSection = headerSource.slice(headerSource.indexOf("LOGOUT"));
    expect(logoutSection).toContain("onClick={handleLogout}");
    expect(logoutSection).toContain('t("nav.signOut")');
  });

  it("reserves bottom clearance sized to BottomNav's real height (h-14 = 3.5rem) plus the safe-area inset, not a flat guess", () => {
    const logoutSection = headerSource.slice(
      headerSource.indexOf("LOGOUT"),
      headerSource.indexOf("LOGOUT") + 1500
    );
    expect(logoutSection).toMatch(
      /pb-\[calc\(3\.5rem\+env\(safe-area-inset-bottom\)\+1rem\)\]/
    );
  });

  it("handleLogout still calls the standard NextAuth signOut with the login redirect", () => {
    expect(headerSource).toMatch(
      /const handleLogout = async \(\) => \{[\s\S]{0,300}await signOut\(\{[\s\S]{0,50}callbackUrl:\s*"\/login"/
    );
  });
});
