import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const mobileRequire = createRequire(
  new URL("../../apps/mobile/package.json", import.meta.url),
);
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
assert.equal(
  cliRequire("glob/package.json").version,
  "13.0.6",
  "Update this backport test when Expo changes its glob dependency",
);
const { glob } = cliRequire("glob");
const cwd = new URL("../..", import.meta.url).pathname;

function countingFs() {
  const fsOverride = {
    ...fs,
    reads: 0,
    readdir: (...args) => (fsOverride.reads++, fs.readdir(...args)),
    readdirSync: (...args) => (fsOverride.reads++, fs.readdirSync(...args)),
    promises: {
      ...fs.promises,
      readdir: (...args) => (fsOverride.reads++, fs.promises.readdir(...args)),
    },
  };
  return fsOverride;
}

// GHSA-3g3m-2fjr-6pw4: an aborted walk must stop reading directories.
test("Expo's glob stops walking once its signal is aborted", async () => {
  const fsOverride = countingFs();
  await assert.rejects(
    glob("**/*", { cwd, fs: fsOverride, signal: AbortSignal.abort() }),
  );
  await delay(50);
  assert.equal(fsOverride.reads, 0);
});

test("Expo's glob still matches files without a signal", async () => {
  const files = await glob("apps/mobile/*.json", { cwd });
  assert.ok(files.includes("apps/mobile/package.json"));
});
