import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const mobileRequire = createRequire(
  new URL("../../apps/mobile/package.json", import.meta.url),
);
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
const configRequire = createRequire(
  cliRequire.resolve("@expo/config/package.json"),
);
assert.equal(
  configRequire("deepmerge/package.json").version,
  "4.3.1",
  "Update this backport test when Expo changes its deepmerge dependency",
);
const merge = configRequire("deepmerge");
const poisoned = '{"__proto__": {"isAdmin": true}}';

// GHSA-gcqx-w48m-w2h4: no deepmerge release fixes it yet.
test("Expo's deepmerge ignores __proto__ with a null-prototype target", () => {
  const merged = merge(Object.create(null), JSON.parse(poisoned));
  assert.equal(merged.isAdmin, undefined);
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
});

test("Expo's deepmerge ignores __proto__ under a null placeholder", () => {
  const merged = merge(
    { session: null },
    JSON.parse(`{"session": ${poisoned}}`),
  );
  assert.equal(merged.session.isAdmin, undefined);
  assert.equal(Object.getPrototypeOf(merged.session), Object.prototype);
});

test("Expo's deepmerge ignores an own __proto__ key on the target", () => {
  const merged = merge(JSON.parse(poisoned), { name: "Kaneo" });
  assert.equal(merged.isAdmin, undefined);
  assert.equal(merged.name, "Kaneo");
});

test("Expo's deepmerge still merges nested objects and arrays", () => {
  assert.deepEqual(
    merge({ a: 1, b: { c: 1 }, list: [1] }, { b: { d: 2 }, list: [2] }),
    { a: 1, b: { c: 1, d: 2 }, list: [1, 2] },
  );
});
