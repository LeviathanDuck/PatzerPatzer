// ---------------------------------------------------------------------------
// Admin page — login form + sync controls
// Secret route at #/admin. Not linked from main navigation.
// ---------------------------------------------------------------------------

import { h, type VNode } from 'snabbdom';
import {
  checkAuth, logout,
  pushToServer, pullFromServer,
  getLastSyncedAt, getLocalDataCounts,
  type SyncResult, type DataCounts,
} from '../sync/client';

// --- Local state ---

let authState: 'unknown' | 'logged-in' | 'logged-out' = 'unknown';
let authUser: string | null = null;
let syncStatus: 'idle' | 'pushing' | 'pulling' | 'done' | 'error' = 'idle';
let syncMessage = '';
let dataCounts: DataCounts | null = null;

function loadCounts(redraw: () => void): void {
  getLocalDataCounts().then(c => {
    dataCounts = c;
    redraw();
  });
}

function ensureAuthCheck(redraw: () => void): void {
  if (authState !== 'unknown') return;
  authState = 'logged-out'; // prevent duplicate calls
  checkAuth().then(({ authenticated, username }) => {
    authState = authenticated ? 'logged-in' : 'logged-out';
    authUser = username;
    redraw();
  });
}

// --- Render ---

export function renderAdminPage(redraw: () => void): VNode {
  ensureAuthCheck(redraw);
  if (authState === 'unknown') {
    return h('div.admin-page', [h('div.admin-card', [h('p', 'Loading…')])]);
  }
  if (authState === 'logged-in' && dataCounts === null) loadCounts(redraw);
  if (authState !== 'logged-in') return renderLoginForm();
  return renderSyncPanel(redraw);
}

function renderLoginForm(): VNode {
  return h('div.admin-page', [
    h('div.admin-card', [
      h('h2.admin-title', 'Sign in'),
      h('p.admin-desc', 'Sign in with your Lichess account to access sync controls.'),
      h('a.admin-btn.admin-btn--primary', {
        attrs: { href: '/api/lichess/connect' },
      }, 'Login with Lichess'),
    ]),
  ]);
}

function renderSyncPanel(redraw: () => void): VNode {
  const lastSync = getLastSyncedAt();

  return h('div.admin-page', [
    h('div.admin-card', [
      h('div.admin-header', [
        h('h2.admin-title', authUser ? `Sync Controls (${authUser})` : 'Sync Controls'),
        h('button.admin-btn.admin-btn--muted', {
          on: { click: () => {
            logout().then(() => { authState = 'logged-out'; authUser = null; redraw(); });
          }},
        }, 'Logout'),
      ]),

      // Data counts
      dataCounts ? h('div.admin-counts', [
        h('div.admin-count', [h('span.admin-count__num', `${dataCounts.games}`), h('span', 'Games')]),
        h('div.admin-count', [h('span.admin-count__num', `${dataCounts.analysis}`), h('span', 'Analyzed')]),
        h('div.admin-count', [h('span.admin-count__num', `${dataCounts.puzzleDefinitions}`), h('span', 'Puzzles')]),
        h('div.admin-count', [h('span.admin-count__num', `${dataCounts.puzzleAttempts}`), h('span', 'Attempts')]),
        h('div.admin-count', [h('span.admin-count__num', `${dataCounts.puzzleMeta}`), h('span', 'Meta')]),
      ]) : null,

      // Sync status
      h('div.admin-sync-status', [
        lastSync
          ? h('span', `Last synced: ${new Date(lastSync).toLocaleString()}`)
          : h('span', 'Never synced'),
        syncStatus !== 'idle'
          ? h('span.admin-sync-badge', {
              class: {
                'admin-sync-badge--active': syncStatus === 'pushing' || syncStatus === 'pulling',
                'admin-sync-badge--done': syncStatus === 'done',
                'admin-sync-badge--error': syncStatus === 'error',
              },
            }, syncStatus === 'pushing' ? 'Pushing...' : syncStatus === 'pulling' ? 'Pulling...' : syncStatus === 'done' ? 'Done' : 'Error')
          : null,
      ]),

      syncMessage ? h('div.admin-sync-message', syncMessage) : null,

      // Sync buttons
      h('div.admin-actions', [
        h('button.admin-btn.admin-btn--primary', {
          attrs: { disabled: syncStatus === 'pushing' || syncStatus === 'pulling' },
          on: { click: () => doPush(redraw) },
        }, 'Push to Server'),
        h('button.admin-btn.admin-btn--primary', {
          attrs: { disabled: syncStatus === 'pushing' || syncStatus === 'pulling' },
          on: { click: () => doPull(redraw) },
        }, 'Pull from Server'),
      ]),
    ]),
  ]);
}

function doPush(redraw: () => void): void {
  syncStatus = 'pushing';
  syncMessage = '';
  redraw();
  pushToServer().then((result: SyncResult) => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Pushed: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
    loadCounts(redraw);
    redraw();
  });
}

function doPull(redraw: () => void): void {
  syncStatus = 'pulling';
  syncMessage = '';
  redraw();
  pullFromServer().then((result: SyncResult) => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Pulled: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
    loadCounts(redraw);
    redraw();
  });
}

function formatCounts(counts?: Record<string, number>): string {
  if (!counts) return 'no data';
  return Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
}
