import assert from "node:assert/strict";
import test from "node:test";
import { AppError, errorResponse, normalizeError } from "../../src/lib/appError";
import { readApiError } from "../../src/lib/clientError";

test("known business errors keep their explicit reason", () => {
  const result = normalizeError(new AppError("该记录已确认，不能再次修改", 409, "STALE_STATE"), "test");
  assert.equal(result.status, 409);
  assert.deepEqual(result.payload, { error: "该记录已确认，不能再次修改", code: "STALE_STATE" });
});

test("unknown errors hide the original message and expose one trace code", async () => {
  const response = errorResponse(new Error("SQLITE secret path"), "test.unknown");
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.match(body.code, /^ERR-[A-Z0-9]+-[A-F0-9]{6}$/);
  assert.equal(response.headers.get("X-Error-Code"), body.code);
  assert.match(body.error, new RegExp(body.code));
  assert.doesNotMatch(body.error, /SQLITE secret path/);
});

test("client parser preserves server reasons and handles non-JSON failures", async () => {
  assert.equal(await readApiError(new Response(JSON.stringify({ error: "字段A不能为空" }), { status: 400 })), "字段A不能为空");
  assert.match(await readApiError(new Response("Bad gateway", { status: 502 })), /错误代码：CLIENT-/);
});
