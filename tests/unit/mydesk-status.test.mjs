import test from 'node:test';
import assert from 'node:assert/strict';
import { mydeskEndpoint, forwardToMyDesk } from '../../hooks/mydesk-status.mjs';

test('MyDesk endpoint: Windows endpoint.cmd with set lines', () => {
  const read = () => '@echo off\r\nset PIXEL_AGENT_DESK_HOOK_PORT=47821\r\nset PIXEL_AGENT_DESK_HOOK_TOKEN=abc123\r\n';
  assert.deepEqual(mydeskEndpoint({ home: 'C:/u', platform: 'win32', read }), { port: 47821, token: 'abc123' });
});

test('MyDesk endpoint: no file or no port means no MyDesk', () => {
  assert.equal(mydeskEndpoint({ home: '/h', platform: 'linux', read: () => { throw new Error('ENOENT'); } }), null);
  assert.equal(mydeskEndpoint({ home: '/h', platform: 'linux', read: () => 'PIXEL_AGENT_DESK_HOOK_TOKEN=x\n' }), null);
});

test('forwardToMyDesk posts to /status/claude with the token, and never throws', async () => {
  const calls = [];
  await forwardToMyDesk('{"a":1}', { endpoint: { port: 47821, token: 't' }, fetchImpl: async (url, init) => { calls.push([url, init.headers]); } });
  assert.equal(calls[0][0], 'http://127.0.0.1:47821/status/claude');
  assert.equal(calls[0][1]['x-pixel-agent-desk-hook-token'], 't');
  await forwardToMyDesk('{}', { endpoint: { port: 1, token: '' }, fetchImpl: async () => { throw new Error('refused'); } });
  await forwardToMyDesk('{}', { endpoint: null, fetchImpl: async () => { throw new Error('must not be called'); } });
});
