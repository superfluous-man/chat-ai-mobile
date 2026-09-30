import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  passwordMatches,
  verifySessionToken,
} from "../src/auth.js";

const secret = "a-test-secret-that-is-at-least-32-characters";

test("password comparison handles matching and non-matching values", () => {
  assert.equal(passwordMatches("correct horse", "correct horse"), true);
  assert.equal(passwordMatches("wrong", "correct horse"), false);
  assert.equal(passwordMatches(undefined, "correct horse"), false);
});

test("session tokens are signed and expire", () => {
  const now = Date.UTC(2026, 0, 1);
  const token = createSessionToken(secret, false, now);
  assert.equal(verifySessionToken(token, secret, now), true);
  assert.equal(verifySessionToken(`${token}tampered`, secret, now), false);
  assert.equal(verifySessionToken(token, secret, now + 25 * 60 * 60 * 1000), false);
});
