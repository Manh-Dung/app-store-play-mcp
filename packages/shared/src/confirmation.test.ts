import test from "node:test";
import assert from "node:assert/strict";
import {
  createConfirmationToken,
  verifyAndConsumeConfirmationToken,
  resetConfirmationStore,
} from "./confirmation.js";

test("confirmation token lifecycle", () => {
  resetConfirmationStore();

  const target = "com.example.app";
  const action = "listings_delete";
  const params = { packageName: target, language: "en-US" };

  const created = createConfirmationToken({ action, target, params, ttlMs: 60000 });
  assert.ok(created.confirmationId.startsWith("CONF-"));
  assert.ok(created.prompt.includes("CONF-"));
  assert.ok(created.prompt.includes(action));

  // Verifying with wrong params should fail
  const wrongParamsRes = verifyAndConsumeConfirmationToken(
    created.confirmationId,
    action,
    target,
    { packageName: target, language: "fr-FR" },
  );
  assert.equal(wrongParamsRes.valid, false);
  assert.match(wrongParamsRes.reason ?? "", /parameters mismatch/i);

  // Verifying with correct params succeeds
  const validRes = verifyAndConsumeConfirmationToken(
    created.confirmationId,
    action,
    target,
    params,
  );
  assert.equal(validRes.valid, true);

  // Single-use check: cannot consume twice
  const reusedRes = verifyAndConsumeConfirmationToken(
    created.confirmationId,
    action,
    target,
    params,
  );
  assert.equal(reusedRes.valid, false);
  assert.match(reusedRes.reason ?? "", /already.*used/i);
});

test("confirmation token expiration", async () => {
  resetConfirmationStore();

  const created = createConfirmationToken({
    action: "halt_rollout",
    target: "com.example.app",
    ttlMs: 10, // 10ms
  });

  await new Promise((r) => setTimeout(r, 25));

  const res = verifyAndConsumeConfirmationToken(
    created.confirmationId,
    "halt_rollout",
    "com.example.app",
  );
  assert.equal(res.valid, false);
  assert.match(res.reason ?? "", /expired/i);
});
