import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { changedConversations } from '../../server/antigravity-runs.mjs';

test('linked to MyDesk, the watcher adds nobody: MyDesk already shows its Antigravity agents', async () => {
  const src = await fs.readFile(new URL('../../server/index.mjs', import.meta.url), 'utf8');
  const at = src.indexOf('watchAntigravity({');
  assert.ok(at > 0, 'the server starts the Antigravity watcher');
  // the first statement of onActive, past its comment lines
  const body = src.slice(src.indexOf('onActive:', at)).split(/\r?\n/).slice(1).map((l) => l.trim());
  assert.equal(body.find((l) => l && !l.startsWith('//')), 'if (mydeskGuards()) return;');
});

test('reports only .db conversation files changed after the cutoff', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-runs-'));
  try {
    await fs.writeFile(path.join(dir, 'old.db'), '');
    await fs.writeFile(path.join(dir, 'new.db'), '');
    await fs.writeFile(path.join(dir, 'notes.txt'), '');
    const past = new Date(Date.now() - 60_000);
    await fs.utimes(path.join(dir, 'old.db'), past, past);
    const hits = await changedConversations([dir, path.join(dir, 'missing')], Date.now() - 30_000);
    assert.deepEqual(hits.map((h) => h.id), ['new']);
    assert.equal(hits[0].dir, dir);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
