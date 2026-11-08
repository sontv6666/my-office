import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectOf } from '../../src/panel/session-card.js';

// MyDesk's sessions carry Windows folders: the panel showed "D:\Project\..." (the whole path, cut) for the project.
test('a Windows folder gives its last name, like a POSIX one', () => {
  assert.equal(projectOf({ dir: 'D:\\Project\\[1]Personal\\Mydesk' }), 'Mydesk');
  assert.equal(projectOf({ dir: 'D:/Project/Gitlab/tiximax-cms/.worktrees/image-style-page\\' }), 'image-style-page');
  assert.equal(projectOf({ dir: '/home/me/app/' }), 'app');
  assert.equal(projectOf({ dir: 'C:\\x', git: { repo: 'repo' } }), 'repo');
});
