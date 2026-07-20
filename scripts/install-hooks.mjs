#!/usr/bin/env node
// Points git at this repo's tracked hooks directory (.githooks) so the
// pre-push registry check runs automatically after `npm install`.
//
// Safe to run anywhere, including CI (Cloudflare Pages / Render), where
// there's no .git directory (a shallow/archive checkout) or the filesystem
// may be read-only after the build step — in both cases this silently no-ops
// rather than failing the build. Local `git push` is what actually matters;
// CI builds don't push, so skipping there is harmless.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!existsSync('.git')) {
  // Not a git checkout (e.g. CI pulled a tarball/shallow archive) — nothing to do.
  process.exit(0);
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    stdio: 'ignore',
  });
  console.log('✓ git hooksPath set to .githooks (pre-push registry check enabled)');
} catch {
  // Read-only fs, no git binary, restricted environment, etc. — non-fatal.
  process.exit(0);
}
