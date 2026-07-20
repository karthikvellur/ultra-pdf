#!/usr/bin/env node
// Fails loudly if package-lock.json (or .npmrc) resolves against a private/
// internal npm registry instead of the public one.
//
// Why this exists: this repo is built by third-party CI (Cloudflare Pages,
// Render), which cannot reach an internal corporate registry. If a
// contributor's machine has a global ~/.npmrc pointing at one (e.g. Intuit's
// Artifactory mirror) and runs `npm install` without this repo's .npmrc
// taking effect, package-lock.json silently gets rewritten with internal
// "resolved" URLs — the build then hangs on CI for ~8 minutes before crashing
// with npm's own "Exit handler never called!" bug. See git history around
// commit d230f34 for the full incident.
//
// This check runs in three places so it can't be silently skipped:
//   1. `npm run check:registry` — manual / explicit CI step.
//   2. `pretest`/`prebuild` hook in package.json — runs on every build.
//   3. the repo's `.githooks/pre-push` — runs before any push leaves the machine.
import { readFileSync, existsSync } from 'node:fs';

const PUBLIC_REGISTRY = 'https://registry.npmjs.org/';
// Add any other internal/private registry hostnames here if they show up.
const BLOCKED_HOST_PATTERNS = [/registry\.npmjs\.intuit\.com/i, /artifactory/i];

let failed = false;

function fail(message) {
  failed = true;
  console.error(`\n✖ ${message}`);
}

// --- Check .npmrc ---
if (existsSync('.npmrc')) {
  const npmrc = readFileSync('.npmrc', 'utf8');
  const registryLine = npmrc
    .split('\n')
    .find((l) => /^\s*registry\s*=/.test(l));
  if (!registryLine) {
    fail('.npmrc has no `registry=` line — it must pin the public registry explicitly.');
  } else if (!registryLine.includes(PUBLIC_REGISTRY)) {
    fail(`.npmrc registry is not the public npm registry: "${registryLine.trim()}"`);
  }
} else {
  fail('.npmrc is missing. It must pin `registry=https://registry.npmjs.org/`.');
}

// --- Check package-lock.json for any resolved URL pointing at a blocked host ---
if (existsSync('package-lock.json')) {
  const lock = readFileSync('package-lock.json', 'utf8');
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(lock)) {
      const sample = lock.match(new RegExp(`"resolved":\\s*"[^"]*${pattern.source}[^"]*"`, 'i'));
      fail(
        `package-lock.json contains a private-registry URL matching ${pattern}.\n` +
          `  ${sample ? sample[0] : '(see file)'}\n` +
          '  Fix: rm -rf node_modules package-lock.json && npm install ' +
          '(with this repo\'s .npmrc in effect), then commit the regenerated lockfile.',
      );
      break;
    }
  }
} else {
  fail('package-lock.json is missing — cannot verify registry provenance.');
}

if (failed) {
  console.error(
    '\nRegistry check failed — see https://registry.npmjs.org must be used ' +
      '(third-party CI like Cloudflare Pages / Render cannot reach internal ' +
      'registries). Aborting.\n',
  );
  process.exit(1);
}

console.log('✓ Registry check passed (public npm registry only).');
