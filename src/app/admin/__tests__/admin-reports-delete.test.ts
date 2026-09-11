import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guards for Admin > Reports deletion.
 *
 * Before this, PUT (status transitions) existed on
 * /api/admin/reports/[id] but there was no DELETE at all, and the
 * admin UI only ever rendered action buttons - Dismiss/Review/Action -
 * for status === "pending". Once a report left "pending" it had
 * literally no control on it, forever, which is exactly what the
 * screenshots this was reported from show: a Reviewed/Dismissed/
 * Actioned list with nothing to click.
 *
 * vitest runs with environment: "node" (see vitest.config.ts), so
 * there is no DOM to mount into; these assert on the source, matching
 * the pattern in admin-navigation-regressions.test.ts. The actual
 * delete/appeal-protection/audit-log behaviour is covered by the real-
 * Postgres integration test alongside the route itself
 * (src/app/api/admin/reports/[id]/__tests__/route.integration.test.ts);
 * the real authorization boundary - which actual roles pass or fail
 * requireAdmin(), not a mocked stand-in for it - is covered by
 * src/app/api/admin/reports/[id]/__tests__/authorization.integration.test.ts.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGE = "src/app/admin/reports/page.tsx";
const ROUTE = "src/app/api/admin/reports/[id]/route.ts";

describe("Admin > Reports has a delete action for processed reports", () => {
  const code = stripComments(read(PAGE));

  it("only offers Delete once a report has left pending", () => {
    expect(code).toMatch(/report\.status !== "pending" && \(/);
  });

  it("calls the DELETE route through a dedicated handler", () => {
    expect(code).toContain("const deleteReport = async (reportId: string)");
    expect(code).toMatch(/fetch\(`\/api\/admin\/reports\/\$\{reportId\}`,\s*\{\s*method:\s*"DELETE"\s*\}\)/);
  });

  it("requires confirmation before deleting", () => {
    const idx = code.indexOf("const deleteReport");
    const body = code.slice(idx, idx + 300);
    expect(body).toMatch(/if\s*\(!confirm\(/);
  });

  it("does not remove the report from view until the server confirms deletion", () => {
    // The report must stay visible (and the confirm-dialog / error path
    // must be reachable) if the request fails - state changes only
    // happen inside the res.ok branch.
    const idx = code.indexOf("const deleteReport");
    const fn = code.slice(idx, code.indexOf("\n  };", idx));
    const okIdx = fn.indexOf("if (res.ok)");
    expect(okIdx).toBeGreaterThan(-1);
    const okBranch = fn.slice(okIdx, fn.indexOf("} else", okIdx));
    expect(okBranch).toContain("fetchReports()");
    const elseBranch = fn.slice(fn.indexOf("} else", okIdx));
    expect(elseBranch).toMatch(/setMessage\(\{\s*type:\s*"error"/);
  });

  it("steps back a page when a deletion empties the current page", () => {
    expect(code).toMatch(/data\.reports \|\| \[\]\)\.length === 0 && page > 1/);
    expect(code).toContain("setPage((p) => p - 1)");
  });

  it("shows a translated confirm/success/error message, not literal English", () => {
    expect(code).toContain('t("adminReports.deleteConfirm")');
    expect(code).toContain('t("adminReports.deleteSuccess")');
    expect(code).toContain('t("adminReports.errDeleteFailed")');
  });
});

describe("Admin > Reports DELETE route", () => {
  const code = stripComments(read(ROUTE));

  // ⚠️ SECURITY: this originally asserted requireStaff() here, on the
  // reasoning that DELETE shouldn't invent a stricter check than PUT
  // (staff-gated, reversible status changes) on the same route file.
  // That reasoning does not hold for DELETE specifically: unlike PUT,
  // deleting a report is permanent and unrecoverable, and a moderator
  // - not just an admin - could previously erase a processed report
  // (and its moderation-transparency trail) outright with no way back.
  // Confirmed and fixed - see the ⚠️ SECURITY comment in route.ts and
  // authorization.integration.test.ts, which exercises the real
  // requireStaff()/requireAdmin() role-check chain against real user
  // rows (this file only asserts on source text, not behavior) and
  // proves a moderator is refused while an admin is allowed.
  it("exists and is admin-gated - a stricter check than the read/update endpoints on this same route, deliberately, because deletion is permanent", () => {
    expect(code).toMatch(/export async function DELETE/);
    const delIdx = code.indexOf("export async function DELETE");
    const delFn = code.slice(delIdx);
    expect(delFn).toContain("await requireAdmin()");
    expect(delFn).toMatch(/if\s*\(!adminCheck\.authorized\)\s*return adminCheck\.response/);
  });

  it("refuses to delete a pending report", () => {
    expect(code).toMatch(/report\.status === "pending"/);
    expect(code).toMatch(/status:\s*409/);
  });

  it("refuses to delete a report that has an appeal on file", () => {
    // The real risk this guards: Appeal.reportId is onDelete: Cascade
    // in schema.prisma, so a bare prisma.report.delete() would silently
    // destroy the appeal - the moderation audit trail - along with it.
    expect(code).toMatch(/_count:\s*\{\s*select:\s*\{\s*appeals:\s*true\s*\}\s*\}/);
    expect(code).toMatch(/report\._count\.appeals > 0/);
  });

  it("checks the report exists before deleting it, and 404s if not", () => {
    expect(code).toMatch(/if\s*\(!report\)/);
    expect(code).toContain('"Report not found"');
  });

  it("handles the already-deleted race (Prisma P2025) as a 404, not a 500", () => {
    expect(code).toContain("P2025");
  });

  it("records the deletion in the audit log with enough detail to survive the row being gone", () => {
    const delIdx = code.indexOf("export async function DELETE");
    const delFn = code.slice(delIdx);
    expect(delFn).toContain('action: "report.delete"');
    expect(delFn).toContain('targetType: "Report"');
    expect(delFn).toMatch(/metadata:\s*\{/);
  });

  it("does not introduce a schema change to make deletion work", () => {
    // The Report/Appeal relations already carry the onDelete semantics
    // needed; nothing here should touch prisma/schema.prisma.
    expect(code).not.toMatch(/prisma\.\$executeRaw/);
  });
});
