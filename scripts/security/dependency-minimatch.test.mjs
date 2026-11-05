import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

const mobileRequire = createRequire(
  new URL("../../apps/mobile/package.json", import.meta.url),
);
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
const globRequire = createRequire(cliRequire.resolve("glob/package.json"));
assert.equal(
  globRequire("minimatch/package.json").version,
  "10.2.6",
  "Update this backport test when the minimatch override changes",
);
const { Minimatch: CjsMinimatch } = globRequire("minimatch");
const { Minimatch: EsmMinimatch } = await import(
  pathToFileURL(globRequire.resolve("minimatch").replace("/commonjs/", "/esm/"))
);
const optimizationLevel = 2;

// GHSA-g3hv-75wg-m249; upstream fix: isaacs/minimatch 77a0f5c4 (11.0.1).
for (const [format, Minimatch] of [
  ["cjs", CjsMinimatch],
  ["esm", EsmMinimatch],
]) {
  test(`minimatch ${format} stops **/.. splits at braceExpandMax`, () => {
    const pattern = Array(30).fill("**/../a/b").join("/");
    const limited = new Minimatch(pattern, {
      optimizationLevel,
      braceExpandMax: 64,
    });
    assert.equal(limited.set.length, 64);
    assert.equal(
      new Minimatch(pattern, { optimizationLevel }).set.length,
      100_000,
    );
  });

  test(`minimatch ${format} still splits and matches below the max`, () => {
    const mm = new Minimatch("**/../a/b/**/../c/d", { optimizationLevel });
    assert.equal(mm.set.length, 4);
    assert.equal(mm.match("../a/b/../c/d"), true);
    assert.equal(mm.match("x/a/b/y/c/d"), true);
  });

  test(`minimatch ${format} skips dedupe for large pattern sets`, () => {
    const small = new Minimatch("{x,*}/{0..9}", { optimizationLevel });
    assert.equal(small.set.length, 10);
    const large = new Minimatch("{x,*}/{0..999}", { optimizationLevel });
    assert.equal(large.set.length, 2000);
    assert.equal(large.match("x/5"), true);
    assert.equal(large.match("y/999"), true);
    assert.equal(large.match(".y/5"), false);
  });
}
