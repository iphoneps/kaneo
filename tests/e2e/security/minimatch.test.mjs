import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const sdk = createRequire(
  require.resolve("browserstack-node-sdk/package.json"),
);
const archiver = createRequire(sdk.resolve("archiver/package.json"));
const utils = createRequire(archiver.resolve("archiver-utils/package.json"));
const glob = createRequire(utils.resolve("glob/package.json"));
assert.equal(
  glob("minimatch/package.json").version,
  "9.0.9",
  "Update this backport test when glob changes its minimatch dependency",
);
const { Minimatch: CjsMinimatch } = glob("minimatch");
const { Minimatch: EsmMinimatch } = await import(
  pathToFileURL(glob.resolve("minimatch").replace("/commonjs/", "/esm/"))
);
const optimizationLevel = 2;

// GHSA-g3hv-75wg-m249; minimatch 9 has no braceExpandMax option, so the
// backport uses the 11.0.1 default limit of 100,000 patterns.
for (const [format, Minimatch] of [
  ["cjs", CjsMinimatch],
  ["esm", EsmMinimatch],
]) {
  test(`minimatch ${format} caps **/.. splits`, () => {
    const pattern = Array(30).fill("**/../a/b").join("/");
    const mm = new Minimatch(pattern, { optimizationLevel });
    assert.equal(mm.set.length, 100_000);
  });

  test(`minimatch ${format} still splits and matches below the cap`, () => {
    const mm = new Minimatch("**/../a/b/**/../c/d", { optimizationLevel });
    assert.equal(mm.set.length, 4);
    assert.equal(mm.match("../a/b/../c/d"), true);
    assert.equal(mm.match("x/a/b/y/c/d"), true);
  });

  test(`minimatch ${format} skips dedupe for large pattern sets`, () => {
    const large = new Minimatch("{x,*}/{0..999}", { optimizationLevel });
    assert.equal(large.set.length, 2000);
    assert.equal(large.match("y/999"), true);
    assert.equal(large.match(".y/5"), false);
  });
}
