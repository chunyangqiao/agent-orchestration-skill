import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { SKILL_ROOT } from '../skills/agent-orchestration/scripts/lib/config.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SCRIPT = path.join(SKILL_ROOT, 'scripts/configure.mjs');
export function copySkill(destination) {
  fs.cpSync(SKILL_ROOT, destination, { recursive: true });
  return path.join(destination, 'scripts/configure.mjs');
}
export function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
export function cli(root, args, expected = 0, script = SCRIPT, extra = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    ...extra,
  });
  assert.equal(
    result.status,
    expected,
    `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`,
  );
  return result;
}
export function snapshot(root, timestamps = false) {
  const result = {};
  if (!fs.existsSync(root)) return result;
  function visit(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const info = fs.lstatSync(file, { bigint: true });
      if (info.isDirectory()) visit(file);
      else
        result[path.relative(root, file)] = info.isSymbolicLink()
          ? { link: fs.readlinkSync(file) }
          : {
              content: fs.readFileSync(file).toString('base64'),
              ...(timestamps ? { mtime: info.mtimeNs.toString() } : {}),
            };
    }
  }
  visit(root);
  return result;
}
