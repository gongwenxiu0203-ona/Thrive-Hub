import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectivePermission } from "../../src/lib/permissionResolver";
import { canAccessRoute, permissionLanding, type PermissionMap } from "../../src/lib/routePermissions";

test("role defaults keep representative leaves available for all four roles", () => {
  assert.equal(resolveEffectivePermission({ role: "ADMIN", feature: "admin.permissions" }), "MANAGE");
  assert.equal(resolveEffectivePermission({ role: "USER", feature: "customers.records" }), "EDIT");
  assert.equal(resolveEffectivePermission({ role: "BRAND", feature: "bi.view" }), "READ");
  assert.equal(resolveEffectivePermission({ role: "CHANNEL", feature: "finance.channel_reconciliation" }), "EDIT");
});

test("legacy rows are inert after canonical leaf migration", () => {
  assert.equal(resolveEffectivePermission({
    role: "BRAND",
    feature: "customers.followup",
    rolePermissions: [{ feature: "customers", level: "READ" }],
  }), "NONE");
  assert.equal(resolveEffectivePermission({
    role: "CHANNEL",
    feature: "finance.affiliate_reconciliation",
    rolePermissions: [{ feature: "finance_channel", level: "MANAGE" }],
  }), "NONE");
});

test("canonical explicit NONE remains authoritative", () => {
  assert.equal(resolveEffectivePermission({
    role: "ADMIN",
    feature: "bi.export",
    userPermissions: [
      { feature: "bi", level: "MANAGE" },
      { feature: "bi.export", level: "NONE" },
    ],
  }), "NONE");
});

test("invalid stored levels fall back safely and unknown roles fail closed", () => {
  assert.equal(resolveEffectivePermission({
    role: "ADMIN",
    feature: "dashboard.view",
    rolePermissions: [{ feature: "dashboard", level: "BROKEN" }],
  }), "MANAGE");
  assert.equal(resolveEffectivePermission({ role: "UNKNOWN", feature: "dashboard.view" }), "NONE");
});

test("permission landing always points at an allowed route", () => {
  const cases: PermissionMap[] = [
    { "customers.records": "READ" },
    { "contracts.records": "READ" },
    { "projects.records": "READ" },
    { "bi.view": "READ" },
    { "finance.receivables": "READ" },
    { "intake.review": "READ" },
  ];
  for (const permissions of cases) {
    const landing = permissionLanding(permissions);
    assert.equal(canAccessRoute(landing, new URLSearchParams(), permissions), true, landing);
  }
});
