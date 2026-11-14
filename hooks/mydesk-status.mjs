// The status line's JSON for MyDesk too (MyDesk's src/quota/statusLineReport.js): Claude Code hands rate_limits and
// context_window only to the status line, and MyDesk shows the plan's windows and each session's context meter from
// them. MyDesk's hook endpoint file says where it listens and the token it wants; no file, no MyDesk, nothing is sent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** { port, token } from MyDesk's endpoint file (`set KEY=value` lines on Windows, `KEY=value` elsewhere), or null. */
export function mydeskEndpoint({ home = os.homedir(), platform = process.platform, read = fs.readFileSync } = {}) {
  const file = path.join(home, '.pixel-agent-desk', 'agent-hooks', platform === 'win32' ? 'endpoint.cmd' : 'endpoint.env');
  let text;
  try { text = read(file, 'utf8'); } catch { return null; }
  const v = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim().replace(/^set\s+/i, '');
    const i = line.indexOf('=');
    if (i > 0) v[line.slice(0, i)] = line.slice(i + 1);
  }
  const port = Number(v.PIXEL_AGENT_DESK_HOOK_PORT);
  return Number.isInteger(port) && port > 0 ? { port, token: v.PIXEL_AGENT_DESK_HOOK_TOKEN || '' } : null;
}

/** POST the status JSON to MyDesk; resolves either way within 400 ms. */
export function forwardToMyDesk(body, { endpoint = mydeskEndpoint(), fetchImpl = fetch } = {}) {
  if (!endpoint) return Promise.resolve();
  const headers = { 'Content-Type': 'application/json' };
  if (endpoint.token) headers['x-pixel-agent-desk-hook-token'] = endpoint.token;
  return fetchImpl(`http://127.0.0.1:${endpoint.port}/status/claude`, { method: 'POST', headers, body, signal: AbortSignal.timeout(400) })
    .then(() => {}, () => {});
}
