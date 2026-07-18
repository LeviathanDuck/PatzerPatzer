// ---------------------------------------------------------------------------
// Token sync dashboard for the static PHP/MySQL beta path.
// #/sync is canonical; #/admin remains a backwards-compatible alias.
// ---------------------------------------------------------------------------

import { h, type VNode } from 'snabbdom';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';
import { clearLichessApiLoginData } from '../auth/lichessBookAuth';
import {
  getLocalDataCounts,
  type DataCounts,
  type SyncResult,
} from '../sync/client';
import {
  REMOTE_SYNC_APPLIED_EVENT,
  REMOTE_SYNC_LOG_EVENT,
  REMOTE_SYNC_PROGRESS_EVENT,
  clearRemoteSyncToken,
  clearRemoteSyncLog,
  discardQuarantinedRemoteSyncWrite,
  downloadRemoteSyncBackup,
  getRemoteSyncDeviceTag,
  getRemoteSyncLastCheckedAt,
  getRemoteSyncLastSyncedAt,
  getRemoteSyncOutboxCount,
  getRemoteSyncGeneration,
  getRemoteSyncLog,
  getRemoteSyncProgressSnapshot,
  getRemoteSyncToken,
  getQuarantinedRemoteSyncWrites,
  hasRemoteSyncToken,
  invalidateOtherRemoteSyncBrowsers,
  isRemoteSyncFullPullRequired,
  logoutRemoteSync as stopAndClearRemoteSync,
  previewRemoteSyncBackupFile,
  pullFromRemoteSync,
  pushToRemoteSync,
  queueLocalLibraryForRemoteSync,
  refreshRemoteSyncProgressSnapshot,
  requeueAllQuarantinedRemoteSyncWrites,
  requeueQuarantinedRemoteSyncWrite,
  restoreRemoteSyncBackup,
  setRemoteSyncToken,
  setRemoteSyncDeviceTag,
  startRemoteSyncAutoSync,
  testRemoteSyncConnection,
  type RemoteSyncBackupPreview,
  type RemoteSyncLogEntry,
  type RemoteSyncOperationKind,
  type RemoteSyncOperationSummary,
} from '../sync/remoteSync';
import type { RemoteSyncIssue, RemoteSyncIssueReason } from '../sync/progress';
import type { DurableQuarantineRecord } from '../sync/versionOutbox';
import { getDiagnosticEvents, getRecentDiagnosticSessions } from '../idb';
import {
  advancedReproductionToolsEnabled,
  assembleBugPackage,
  copyBugPackageToClipboard,
  downloadBugPackageAsJson,
  faultInjection,
  setAdvancedReproductionToolsEnabled,
} from '../diagnostics';
import { Severity, type DiagnosticErrorGroup, type DiagnosticEvent, type DiagnosticSession } from '../diagnostics/types';
import {
  canTransitionReportTriage,
  deleteReport,
  deleteReportsByTriageState,
  getAllReports,
  reportTriageState,
  REPORT_TRIAGE_STATES,
  updateReportAdminNotes,
  updateReportTriageState,
  type DiagnosticReportTriageState,
  type StoredDiagnosticReport,
} from '../diagnostics/reporting/reportStore';
import { renderReportList } from '../diagnostics/reporting/reportListView';
import {
  deleteRemoteDiagnosticReport,
  fetchRemoteDiagnosticReports,
  fetchRemoteDiagnosticTrends,
  remoteReportViewerConfig,
  REMOTE_REPORT_PAGE_SIZE,
  REMOTE_REPORT_STALE_MS,
  type RemoteDiagnosticReportSummary,
  type RemoteDiagnosticTrendResult,
  type RemoteReportSyncStatus,
} from '../diagnostics/reporting/remoteViewer';
import {
  DEFAULT_REMOTE_SUBMISSION_ENDPOINT,
  disableRemoteSubmission,
  drainReportOutboxOnInit,
  readRemoteSubmissionConfig,
  writeRemoteSubmissionConfig,
} from '../diagnostics/reporting/reportOutbox';
import {
  clearPuzzlePgnCache,
  deleteAllGames,
  deleteAllReviewData,
  deleteAccountReviewData,
  deleteGeneratedPuzzleData,
  deleteImportedAccountAndGames,
  getDataManagementSnapshot,
  resetPuzzleProgress,
  resetSettingsGroup,
  type AccountDataSummary,
  type DataManagementResult,
  type DataManagementSnapshot,
  type LibraryDataSummary,
  type SettingsResetGroup,
} from '../sync/dataManagement';
import { reportIssue } from '../diagnostics/reporting/reportAction';

function activateOnKeyboard(event: KeyboardEvent, action: () => void): void {
  if (event.target !== event.currentTarget) {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    return;
  }
  if (event.repeat) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

import { renderDiagnosticTrendsPanel } from '../diagnostics/admin/trendsView';
import { renderPrioritySummaryPanel } from '../diagnostics/admin/priorityView';
import {
  exportReviewErrorPackageJson,
  listReviewErrorPackages,
  type ReviewErrorPackage,
} from '../diagnostics/reviewError';
import {
  loadMobileOnlyIssuesReport,
  loadPostDeployRegressionReport,
  loadTopCrashGroupsReport,
  loadTopSlowRoutesReport,
  type MobileOnlyIssuesReport,
  type PostDeployRegressionReport,
  type TopCrashGroupsReport,
  type TopSlowRoutesReport,
} from '../diagnostics/reports/priorityReports';
import {
  parseDiagnosticsUrlState,
  serializeDiagnosticsUrlState,
  type DiagnosticsUrlState,
} from '../diagnostics/urlState';
import { replaceHashRoute, writeHashRoute } from '../router';

// --- Local state ---

let syncStatus: 'idle' | 'testing' | 'pushing' | 'pulling' | 'exporting' | 'restoring' | 'invalidating' | 'clearing-auth' | 'done' | 'error' = 'idle';
let syncMessage = '';
let dataCounts: DataCounts | null = null;
const REMOTE_SYNC_TOKEN_KEY = 'chesspatzer.remoteSync.adminSyncToken';
const REMOTE_SYNC_TOKEN_EVENT = 'chesspatzer:remoteSync-token-changed';
let tokenInput = '';
let deviceTagInput = getRemoteSyncDeviceTag();
let deviceTagDirty = false;
let syncLogExpanded = false;
let syncLogListenerAttached = false;




let syncProgressEventListenerAttached = false;
let syncProgressMountListenerAttached = false;



let quarantineRecords: DurableQuarantineRecord[] | null = null;
let quarantineActionBusyOpId: string | null = null;
let quarantineBulkBusy = false;
let quarantineMessage = '';
let dataManagementSnapshot: DataManagementSnapshot | null = null;
let dataManagementLoading = false;
let dataManagementBusy = false;
type DataManagementProgressStage = 'blocked' | 'preparing' | 'running' | 'done' | 'error';
interface DataManagementProgressState {
  actionId: string;
  actionLabel: string;
  buttonLabel: string;
  stage: DataManagementProgressStage;
  message: string;
}
type DataManagementActionTone = 'muted' | 'danger';
interface DataManagementActionOptions {
  actionId: string;
  actionLabel: string;
  buttonLabel: string;
  confirmation: string;
  run: () => Promise<DataManagementResult>;
  redraw: () => void;
}
interface DataManagementActionButtonOptions extends DataManagementActionOptions {
  label: string;
  tone: DataManagementActionTone;
  disabled: boolean;
}
let dataManagementProgress: DataManagementProgressState | null = null;
let backupPreview: RemoteSyncBackupPreview | null = null;
let backupRestoreBusy = false;
let lichessAuthClearBusy = false;
let diagnosticReports: StoredDiagnosticReport[] | null = null;
let diagnosticReportsLoading = false;
let reviewErrorPackages: ReviewErrorPackage[] | null = null;
let reviewErrorPackagesLoading = false;
let selectedReviewErrorPackageId: string | null = null;
let reviewErrorPackageMessage = '';
let diagnosticEvents: DiagnosticEvent[] | null = null;
let diagnosticEventsLoading = false;
let diagnosticEventKindFilter = '';
let diagnosticEventSeverityFilter = '';
let diagnosticEventStartDate = '';
let diagnosticEventEndDate = '';
let diagnosticEventPage = 0;
let diagnosticEventDisplayMode: 'flat' | 'grouped' = 'flat';
let selectedDiagnosticEventId: string | null = null;
let expandedDiagnosticGroupKey: string | null = null;
let selectedDiagnosticReportId: string | null = null;
let diagnosticReportBulkDeleteState: DiagnosticReportTriageState = 'archived';
let diagnosticReportRetentionDays = 30;
let remoteDiagnosticReports: RemoteDiagnosticReportSummary[] | null = null;
let remoteDiagnosticReportsLoading = false;
let remoteDiagnosticReportStatus: RemoteReportSyncStatus = 'unavailable';
let remoteDiagnosticReportMessage = '';
let remoteDiagnosticReportLastSyncedAt: number | null = null;
let remoteDiagnosticReportPage = 0;
let remoteDiagnosticTrends: RemoteDiagnosticTrendResult | null = null;
let remoteDiagnosticTrendsLoading = false;
let remoteDiagnosticTrendsMessage = '';
let remoteDiagnosticTrendRangeDays = 7;
let remoteDiagnosticTrendPeriod: 'day' | 'week' = 'day';
let topCrashGroupsReport: TopCrashGroupsReport | null = null;
let topSlowRoutesReport: TopSlowRoutesReport | null = null;
let mobileOnlyIssuesReport: MobileOnlyIssuesReport | null = null;
let postDeployRegressionReport: PostDeployRegressionReport | null = null;
let topCrashGroupsReportLoading = false;
let topCrashGroupsReportMessage = '';
let remoteUploadTokenInput = '';
let remoteUploadEndpointInput = '';
let remoteUploadMessage = '';
let advancedReproductionToolsMessage = '';
let bugPackageBusy = false;
let diagnosticSessions: DiagnosticSession[] | null = null;
let diagnosticSessionsLoading = false;
let diagnosticSessionStatusFilter: 'all' | 'clean' | 'interrupted' = 'all';
const DIAGNOSTIC_EVENT_PAGE_SIZE = 25;
const DIAGNOSTIC_EVENT_SCAN_LIMIT = 2000;
const DIAGNOSTIC_SESSION_SCAN_LIMIT = 200;
const DIAGNOSTIC_REPORT_MIN_RETENTION_DAYS = 1;
const DIAGNOSTIC_REPORT_MAX_RETENTION_DAYS = 365;

// --- URL state tracking ---
// Tracks the last query string that was hydrated into the diagnostics view.
// Null = not yet hydrated (first visit). Changes in the hash query trigger re-hydration.
let diagnosticsHydratedQuery: string | null = null;
// Recovery message shown when a URL-referenced event or report ID is not found locally.
let diagnosticsSelectionRecoveryMessage = '';

interface DiagnosticEventGroupRow {
  key: string;
  label: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  latestEvent: DiagnosticEvent;
  grouped: boolean;
}

function reportAdminIssue(): void {
  const session = reportIssue({ triggeredBy: 'admin-route', route: '/admin' });
  console.info('[diagnostics] report issue session', session);
}

function readRemoteSyncToken(): string {
  const sessionToken = getRemoteSyncToken().trim();
  if (sessionToken) return sessionToken;

  const persistedToken = localStorage.getItem(REMOTE_SYNC_TOKEN_KEY)?.trim() ?? '';
  if (persistedToken) setRemoteSyncToken(persistedToken);
  return persistedToken;
}

function rememberRemoteSyncToken(token: string): void {
  const value = token.trim();
  if (!value) {
    clearStoredRemoteSyncToken();
    return;
  }
  setRemoteSyncToken(value);
  localStorage.setItem(REMOTE_SYNC_TOKEN_KEY, value);
  startRemoteSyncAutoSync();
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_TOKEN_EVENT));
}

function clearStoredRemoteSyncToken(): void {
  stopAndClearRemoteSync();
  localStorage.removeItem(REMOTE_SYNC_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_TOKEN_EVENT));
}

function restoreRemoteSyncToken(sessionToken: string, persistedToken: string | null): void {
  const tokenToRestore = sessionToken.trim() || persistedToken?.trim() || '';
  if (tokenToRestore) setRemoteSyncToken(tokenToRestore);
  else clearRemoteSyncToken();

  if (persistedToken !== null) localStorage.setItem(REMOTE_SYNC_TOKEN_KEY, persistedToken);
  else localStorage.removeItem(REMOTE_SYNC_TOKEN_KEY);
}

function loadCounts(redraw: () => void): void {
  getLocalDataCounts().then(c => {
    dataCounts = c;
    redraw();
  });
}

function loadDataManagement(redraw: () => void): void {
  if (dataManagementLoading) return;
  dataManagementLoading = true;
  getDataManagementSnapshot().then(snapshot => {
    dataManagementSnapshot = snapshot;
  }).catch(error => {
    syncMessage = error instanceof Error ? `Data management load failed: ${error.message}` : 'Data management load failed.';
  }).finally(() => {
    dataManagementLoading = false;
    redraw();
  });
}

function loadDiagnosticReports(redraw: () => void): void {
  if (diagnosticReportsLoading) return;
  diagnosticReportsLoading = true;
  getAllReports().then(reports => {
    diagnosticReports = reports;
    if (selectedDiagnosticReportId && !reports.some(report => report.reportId === selectedDiagnosticReportId)) {
      // Selected report not found locally — recover to list without exposing payloads.
      selectedDiagnosticReportId = null;
      diagnosticsSelectionRecoveryMessage = 'Report not found. Showing report list.';
      const recoveryUrl = serializeDiagnosticsUrlState(currentDiagnosticsUrlState());
      replaceHashRoute(recoveryUrl);
      const qStart = recoveryUrl.indexOf('?');
      diagnosticsHydratedQuery = qStart >= 0 ? recoveryUrl.slice(qStart + 1) : '';
    }
  }).catch(error => {
    syncMessage = error instanceof Error ? `Diagnostic reports load failed: ${error.message}` : 'Diagnostic reports load failed.';
  }).finally(() => {
    diagnosticReportsLoading = false;
    redraw();
  });
}

function loadReviewErrorPackages(redraw: () => void): void {
  if (reviewErrorPackagesLoading) return;
  reviewErrorPackagesLoading = true;
  listReviewErrorPackages<ReviewErrorPackage>(100).then(packages => {
    reviewErrorPackages = packages;
    if (selectedReviewErrorPackageId && !packages.some(pkg => pkg.packageId === selectedReviewErrorPackageId)) {
      selectedReviewErrorPackageId = null;
    }
    if (!selectedReviewErrorPackageId && packages.length > 0) {
      selectedReviewErrorPackageId = packages[0]!.packageId;
    }
  }).catch(error => {
    reviewErrorPackageMessage = error instanceof Error ? `Review error packages load failed: ${error.message}` : 'Review error packages load failed.';
  }).finally(() => {
    reviewErrorPackagesLoading = false;
    redraw();
  });
}

function loadRemoteDiagnosticReports(redraw: () => void): void {
  const config = remoteReportViewerConfig();
  if (!config.enabled || !config.token) {
    remoteDiagnosticReports = [];
    remoteDiagnosticReportsLoading = false;
    remoteDiagnosticReportStatus = 'unavailable';
    remoteDiagnosticReportMessage = !config.enabled
      ? 'Remote diagnostics submission is not enabled.'
      : 'Remote diagnostics need an admin token before reports can be fetched.';
    return;
  }
  if (remoteDiagnosticReportsLoading) return;

  remoteDiagnosticReportsLoading = true;
  remoteDiagnosticReportStatus = 'syncing';
  fetchRemoteDiagnosticReports().then(result => {
    remoteDiagnosticReports = result.reports;
    remoteDiagnosticReportLastSyncedAt = result.fetchedAt;
    remoteDiagnosticReportStatus = 'success';
    remoteDiagnosticReportMessage = `${result.reports.length} remote report${result.reports.length === 1 ? '' : 's'} synced.`;
    remoteDiagnosticReportPage = Math.min(
      remoteDiagnosticReportPage,
      Math.max(0, Math.ceil(result.reports.length / REMOTE_REPORT_PAGE_SIZE) - 1),
    );
  }).catch(error => {
    remoteDiagnosticReportStatus = 'error';
    remoteDiagnosticReportMessage = error instanceof Error ? error.message : 'Remote diagnostics fetch failed.';
  }).finally(() => {
    remoteDiagnosticReportsLoading = false;
    redraw();
  });
}

function loadRemoteDiagnosticTrends(redraw: () => void): void {
  const config = remoteReportViewerConfig();
  if (!config.enabled || !config.token) {
    remoteDiagnosticTrends = null;
    remoteDiagnosticTrendsLoading = false;
    remoteDiagnosticTrendsMessage = 'Remote diagnostics need an admin token before trends can be fetched.';
    return;
  }
  if (remoteDiagnosticTrendsLoading) return;

  remoteDiagnosticTrendsLoading = true;
  fetchRemoteDiagnosticTrends(remoteDiagnosticTrendRangeDays, remoteDiagnosticTrendPeriod).then(result => {
    remoteDiagnosticTrends = result;
    remoteDiagnosticTrendsMessage = `Trends synced for the last ${result.rangeDays} day${result.rangeDays === 1 ? '' : 's'}.`;
  }).catch(error => {
    remoteDiagnosticTrends = null;
    remoteDiagnosticTrendsMessage = error instanceof Error ? error.message : 'Remote diagnostic trends fetch failed.';
  }).finally(() => {
    remoteDiagnosticTrendsLoading = false;
    redraw();
  });
}


function loadPriorityReports(redraw: () => void): void {
  if (topCrashGroupsReportLoading) return;
  topCrashGroupsReportLoading = true;
  Promise.all([
    loadTopCrashGroupsReport(),
    loadTopSlowRoutesReport(),
    loadMobileOnlyIssuesReport(),
    loadPostDeployRegressionReport(),
  ]).then(([topCrashGroups, topSlowRoutes, mobileOnlyIssues, postDeployRegressions]) => {
    topCrashGroupsReport = topCrashGroups;
    topSlowRoutesReport = topSlowRoutes;
    mobileOnlyIssuesReport = mobileOnlyIssues;
    postDeployRegressionReport = postDeployRegressions;
    topCrashGroupsReportMessage = topCrashGroups.entries.length === 0
      ? 'No error-frequency aggregates are available. Run diagnostic aggregation after capturing errors.'
      : `Priority reports refreshed at ${formatDiagnosticTimestamp(topCrashGroups.generatedAt)}.`;
  }).catch(error => {
    topCrashGroupsReport = null;
    topSlowRoutesReport = null;
    mobileOnlyIssuesReport = null;
    postDeployRegressionReport = null;
    topCrashGroupsReportMessage = error instanceof Error ? error.message : 'Priority reports failed.';
  }).finally(() => {
    topCrashGroupsReportLoading = false;
    redraw();
  });
}

function syncRemoteUploadInputs(): void {
  const config = readRemoteSubmissionConfig();
  if (!remoteUploadTokenInput) remoteUploadTokenInput = config.token;
  if (!remoteUploadEndpointInput) remoteUploadEndpointInput = config.endpoint || DEFAULT_REMOTE_SUBMISSION_ENDPOINT;
}

function enableRemoteUpload(redraw: () => void): void {
  const token = remoteUploadTokenInput.trim();
  if (!token) {
    remoteUploadMessage = 'Enter an admin token before enabling remote diagnostics upload.';
    redraw();
    return;
  }

  const config = writeRemoteSubmissionConfig({
    enabled: true,
    endpoint: remoteUploadEndpointInput.trim() || DEFAULT_REMOTE_SUBMISSION_ENDPOINT,
    token,
  });
  if (!config.enabled) {
    remoteUploadMessage = 'Remote diagnostics upload was not enabled.';
    redraw();
    return;
  }

  remoteUploadMessage = 'Remote diagnostics upload enabled for this browser.';
  remoteDiagnosticReports = null;
  remoteDiagnosticTrends = null;
  drainReportOutboxOnInit();
  loadRemoteDiagnosticReports(redraw);
  loadRemoteDiagnosticTrends(redraw);
  redraw();
}

function disableRemoteUpload(redraw: () => void): void {
  disableRemoteSubmission();
  remoteUploadMessage = 'Remote diagnostics upload disabled. Queued outbox entries were not cleared.';
  remoteDiagnosticReports = null;
  remoteDiagnosticTrends = null;
  remoteDiagnosticReportStatus = 'unavailable';
  remoteDiagnosticReportMessage = 'Remote diagnostics submission is disabled for this browser.';
  remoteDiagnosticTrendsMessage = 'Remote diagnostics submission is disabled for this browser.';
  redraw();
}

function hasAdminTokenForAdvancedTools(): boolean {
  return Boolean(readRemoteSyncToken().trim());
}

function toggleAdvancedReproductionTools(redraw: () => void): void {
  const enabled = advancedReproductionToolsEnabled();
  if (enabled) {
    setAdvancedReproductionToolsEnabled(false);
    advancedReproductionToolsMessage = 'Advanced reproduction tools disabled for this browser.';
    redraw();
    return;
  }

  if (!hasAdminTokenForAdvancedTools()) {
    advancedReproductionToolsMessage = 'Save a valid admin token before enabling advanced reproduction tools.';
    redraw();
    return;
  }

  const changed = setAdvancedReproductionToolsEnabled(true);
  advancedReproductionToolsMessage = changed
    ? 'Advanced reproduction tools enabled for this browser.'
    : 'Advanced reproduction tools could not be enabled.';
  redraw();
}

function runFaultInjection(action: () => void | Promise<void>, redraw: () => void): void {
  if (!advancedReproductionToolsEnabled()) {
    advancedReproductionToolsMessage = 'Enable advanced reproduction tools with an admin token before running fault injection.';
    redraw();
    return;
  }

  try {
    void Promise.resolve(action()).then(() => {
      advancedReproductionToolsMessage = 'Fault injection action ran. Refresh diagnostics events to inspect the result.';
      redraw();
    });
  } catch (error) {
    advancedReproductionToolsMessage = error instanceof Error ? error.message : 'Fault injection action failed.';
    redraw();
  }
}

function loadDiagnosticEvents(redraw: () => void): void {
  if (diagnosticEventsLoading) return;
  diagnosticEventsLoading = true;
  getDiagnosticEvents({ limit: DIAGNOSTIC_EVENT_SCAN_LIMIT }).then(events => {
    diagnosticEvents = events.sort((a, b) => b.timestamp - a.timestamp);
    if (selectedDiagnosticEventId && !diagnosticEvents.some(event => event.eventId === selectedDiagnosticEventId)) {
      // Selected event not found locally — recover to list without exposing payloads.
      selectedDiagnosticEventId = null;
      diagnosticsSelectionRecoveryMessage = 'Event not found. Showing event list.';
      const recoveryUrl = serializeDiagnosticsUrlState(currentDiagnosticsUrlState());
      replaceHashRoute(recoveryUrl);
      const qStart = recoveryUrl.indexOf('?');
      diagnosticsHydratedQuery = qStart >= 0 ? recoveryUrl.slice(qStart + 1) : '';
    }
  }).catch(error => {
    syncMessage = error instanceof Error ? `Diagnostic events load failed: ${error.message}` : 'Diagnostic events load failed.';
  }).finally(() => {
    diagnosticEventsLoading = false;
    redraw();
  });
}

function loadDiagnosticSessions(redraw: () => void): void {
  if (diagnosticSessionsLoading) return;
  diagnosticSessionsLoading = true;
  getRecentDiagnosticSessions(DIAGNOSTIC_SESSION_SCAN_LIMIT).then(sessions => {
    diagnosticSessions = sessions;
  }).catch(error => {
    syncMessage = error instanceof Error ? `Diagnostic sessions load failed: ${error.message}` : 'Diagnostic sessions load failed.';
  }).finally(() => {
    diagnosticSessionsLoading = false;
    redraw();
  });
}

let quarantineLoading = false;

function loadQuarantineRecords(redraw: () => void): void {
  if (quarantineLoading) return;
  quarantineLoading = true;
  getQuarantinedRemoteSyncWrites().then(records => {
    quarantineRecords = records;
  }).catch(error => {
    quarantineRecords = [];
    syncMessage = error instanceof Error ? `Quarantined writes load failed: ${error.message}` : 'Quarantined writes load failed.';
  }).finally(() => {
    quarantineLoading = false;
    redraw();
  });
}

function refreshAdminData(redraw: () => void): void {
  dataCounts = null;
  dataManagementSnapshot = null;
  quarantineRecords = null;
  diagnosticReports = null;
  remoteDiagnosticReports = null;
  remoteDiagnosticTrends = null;
  topCrashGroupsReport = null;
  topSlowRoutesReport = null;
  mobileOnlyIssuesReport = null;
  postDeployRegressionReport = null;
  diagnosticEvents = null;
  diagnosticSessions = null;
  reviewErrorPackages = null;
  selectedReviewErrorPackageId = null;
  reviewErrorPackageMessage = '';
  loadCounts(redraw);
  loadDataManagement(redraw);
  loadQuarantineRecords(redraw);
  loadDiagnosticReports(redraw);
  loadReviewErrorPackages(redraw);
  loadRemoteDiagnosticReports(redraw);
  loadRemoteDiagnosticTrends(redraw);
  loadPriorityReports(redraw);
  loadDiagnosticEvents(redraw);
  loadDiagnosticSessions(redraw);
}

function ensureSyncLogListener(redraw: () => void): void {
  if (syncLogListenerAttached) return;
  syncLogListenerAttached = true;
  window.addEventListener(REMOTE_SYNC_LOG_EVENT, () => redraw());
  window.addEventListener(REMOTE_SYNC_APPLIED_EVENT, () => {
    dataCounts = null;
    dataManagementSnapshot = null;
    loadCounts(redraw);
    loadDataManagement(redraw);
    redraw();
  });
}

/** True while the current hash path is the sync panel's own routes (#/sync and its
 * #/admin alias) — used to gate the mount-refresh to real page entries. */
function isSyncDashboardHash(hash: string): boolean {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  return path === 'sync' || path === 'admin';
}







function ensureSyncProgressBannerWiring(redraw: () => void): void {
  if (!syncProgressEventListenerAttached) {
    syncProgressEventListenerAttached = true;
    window.addEventListener(REMOTE_SYNC_PROGRESS_EVENT, () => redraw());
  }
  if (!syncProgressMountListenerAttached) {
    syncProgressMountListenerAttached = true;
    refreshRemoteSyncProgressSnapshot().then(() => redraw()).catch(() => redraw());
    window.addEventListener('hashchange', () => {
      if (isSyncDashboardHash(window.location.hash)) {
        refreshRemoteSyncProgressSnapshot().then(() => redraw()).catch(() => redraw());
      }
    });
  }
}

// --- Render ---

function wrapDisabledAdminControls(vnode: VNode): VNode {
  if (vnode.sel?.includes('control-explainer-disabled')) return vnode;
  const children = vnode.children?.map(child => (
    child && typeof child === 'object' && 'sel' in child ? wrapDisabledAdminControls(child as VNode) : child
  ));
  const next = children ? { ...vnode, children } : vnode;
  const tag = next.sel?.split(/[.#]/, 1)[0];
  if (!tag || !new Set(['button', 'input', 'select', 'textarea']).has(tag)) return next;
  const attrs = next.data?.attrs as Record<string, unknown> | undefined;
  if (attrs?.disabled !== true) return next;
  const label = typeof attrs['data-control-explainer-label'] === 'string'
    ? attrs['data-control-explainer-label']
    : '';
  const description = typeof attrs['data-control-explainer-description'] === 'string'
    ? attrs['data-control-explainer-description']
    : '';
  return label && description
    ? renderDisabledControlExplainer({ label, description }, next)
    : next;
}

export function renderAdminPage(redraw: () => void): VNode {
  ensureSyncLogListener(redraw);
  if (dataCounts === null) loadCounts(redraw);
  if (dataManagementSnapshot === null) loadDataManagement(redraw);
  if (quarantineRecords === null) loadQuarantineRecords(redraw);
  if (diagnosticReports === null) loadDiagnosticReports(redraw);
  return wrapDisabledAdminControls(renderSyncDashboard(redraw));
}

export function renderAdminDiagnosticsPage(redraw: () => void): VNode {
  // Hydrate URL state on first route entry or when the hash query changes externally
  // (Back button navigation, pasted URL, URL-driven navigation). This runs at the top
  // of the render function so the correct state is visible in the same render pass.
  const currentHash = typeof window !== 'undefined' ? (window.location.hash ?? '') : '';
  const qStart = currentHash.indexOf('?');
  const currentQuery = qStart >= 0 ? currentHash.slice(qStart + 1) : '';
  if (diagnosticsHydratedQuery !== currentQuery) {
    diagnosticsHydratedQuery = currentQuery;
    applyDiagnosticsUrlState(currentQuery);
  }

  if (diagnosticEvents === null) loadDiagnosticEvents(redraw);
  if (diagnosticSessions === null) loadDiagnosticSessions(redraw);
  if (diagnosticReports === null) loadDiagnosticReports(redraw);
  if (reviewErrorPackages === null) loadReviewErrorPackages(redraw);
  if (remoteDiagnosticReports === null) loadRemoteDiagnosticReports(redraw);
  if (remoteDiagnosticTrends === null) loadRemoteDiagnosticTrends(redraw);
  if (topCrashGroupsReport === null) loadPriorityReports(redraw);
  return wrapDisabledAdminControls(h('div.admin-page', [
    h('div.admin-page__inner', [
      renderAdminNav('diagnostics'),
      h('div.admin-header', [
        h('div', [
          h('h2.admin-title', 'Diagnostics'),
          h('p.admin-desc', 'Owner diagnostics dashboard for local observability data.'),
        ]),
      ]),
      diagnosticsSelectionRecoveryMessage
        ? h('p.admin-log__empty', diagnosticsSelectionRecoveryMessage)
        : null,
      renderPerformanceSummaryPanel(),
      renderPrioritySummaryPanel({
        topCrashGroups: topCrashGroupsReport,
        topSlowRoutes: topSlowRoutesReport,
        mobileOnlyIssues: mobileOnlyIssuesReport,
        postDeployRegressions: postDeployRegressionReport,
        loading: topCrashGroupsReportLoading,
        message: topCrashGroupsReportMessage,
        onRefresh: () => loadPriorityReports(redraw),
      }),
      renderDiagnosticEventsPanel(redraw),
      renderDiagnosticSessionsPanel(redraw),
      renderDiagnosticReportsPanel(redraw),
      renderReviewErrorPackagesPanel(redraw),
      renderDiagnosticTrendsPanel({
        trends: remoteDiagnosticTrends,
        loading: remoteDiagnosticTrendsLoading,
        message: remoteDiagnosticTrendsMessage,
        rangeDays: remoteDiagnosticTrendRangeDays,
        period: remoteDiagnosticTrendPeriod,
        onRangeDaysChange: (value: number) => {
          remoteDiagnosticTrendRangeDays = value;
          remoteDiagnosticTrends = null;
          loadRemoteDiagnosticTrends(redraw);
          writeDiagnosticsFilterUrl();
          redraw();
        },
        onPeriodChange: (value: 'day' | 'week') => {
          remoteDiagnosticTrendPeriod = value;
          remoteDiagnosticTrends = null;
          loadRemoteDiagnosticTrends(redraw);
          writeDiagnosticsFilterUrl();
          redraw();
        },
        onRefresh: () => loadRemoteDiagnosticTrends(redraw),
      }),
      renderRemoteDiagnosticReportsPanel(redraw),
      renderAdvancedReproductionToolsPanel(redraw),
    ]),
  ]));
}









const SYNC_BANNER_OP_LABELS: Record<RemoteSyncOperationKind, string> = {
  checking: 'Checking',
  pulling: 'Pulling',
  pushing: 'Pushing',
  queueing: 'Queueing',
  reconciling: 'Reconciling',
};

function formatSyncBannerCount(value: number): string {
  return value.toLocaleString();
}

function formatSyncBannerCounts(counts: Record<string, number>): string {
  return Object.entries(counts).map(([key, value]) => `${key} ${formatSyncBannerCount(value)}`).join(' · ');
}

function renderSyncBannerOperation(op: RemoteSyncOperationSummary): VNode {
  const progress = typeof op.total === 'number' && typeof op.done === 'number' && op.total > 0
    ? `${formatSyncBannerCount(op.done)}/${formatSyncBannerCount(op.total)}`
    : null;
  const countsText = formatSyncBannerCounts(op.counts);
  return h('div.admin-sync-banner__op', { key: op.opId }, [
    h('div.admin-sync-banner__op-header', [
      h('span.admin-sync-banner__op-label', SYNC_BANNER_OP_LABELS[op.kind]),
      progress ? h('span.admin-sync-banner__op-progress', progress) : null,
    ]),
    op.phase ? h('div.admin-sync-banner__op-detail', op.phase) : null,
    countsText ? h('div.admin-sync-banner__op-detail', countsText) : null,
  ]);
}

/** Scrolls to and focuses the admin token input in the Token Session panel
 * below the banner — the recommended next action for a `token-required` issue.
 * There is no separate token modal on this page; the field is always present. */
function focusRemoteSyncTokenInput(): void {
  if (typeof document === 'undefined') return;
  const input = document.querySelector<HTMLInputElement>('input.admin-token-input[type="password"]');
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus();
}

interface SyncBannerIssueAction {
  label: string;
  run: (redraw: () => void) => void;
}




function syncBannerIssueAction(reason: RemoteSyncIssueReason): SyncBannerIssueAction | null {
  switch (reason) {
    case 'full-pull-required':
      return { label: 'Pull now', run: doPull };
    case 'untracked-local-items':
      return { label: 'Queue local library for sync', run: doQueueLocalLibrary };
    case 'token-required':
      return { label: 'Enter token', run: () => focusRemoteSyncTokenInput() };
    case 'push-failed':
    case 'durable-enqueue-failed':
      return { label: 'Retry push', run: doPush };
    default:
      return null;
  }
}

function renderSyncBannerIssue(issue: RemoteSyncIssue, redraw: () => void): VNode {


  const severity = issue.severity;
  const countsText = issue.counts ? formatSyncBannerCounts(issue.counts) : '';
  const action = syncBannerIssueAction(issue.reason);
  return h('div.admin-sync-banner__issue', {
    class: {
      'admin-sync-banner__issue--warning': severity === 'warning',
      'admin-sync-banner__issue--error': severity === 'error',
    },
  }, [
    h('div.admin-sync-banner__issue-message', countsText ? `${issue.message} (${countsText})` : issue.message),
    action ? h('button.admin-btn.admin-btn--muted.admin-sync-banner__issue-action', {
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: action.label,
        description: 'Runs the recommended recovery action for this sync issue.',
      }) },
      on: { click: () => action.run(redraw) },
    }, action.label) : null,
  ]);
}




function renderSyncProgressBanner(redraw: () => void, outboxCount: number, lastSync: string | null): VNode {
  ensureSyncProgressBannerWiring(redraw);
  const snapshot = getRemoteSyncProgressSnapshot();
  const identity = snapshot.identity;

  return h('section.admin-panel.admin-sync-banner', {
    class: {
      'sync-severity--active': snapshot.severity === 'active',
      'sync-severity--warning': snapshot.severity === 'warning',
      'sync-severity--error': snapshot.severity === 'error',
    },
  }, [
    h('div.admin-panel__header', [
      h('h3', 'Sync Status'),
      h('span', snapshot.label),
    ]),
    h('div.admin-sync-banner__identity', [
      h('span.admin-sync-banner__identity-line',
        `${identity.identityLabel ?? 'Logged out'} · ${identity.deviceTag} · session ${identity.sessionIdShort} · client ${identity.clientIdShort}`),
      h('span.admin-sync-banner__scope-note', identity.scopeNote),
    ]),

    snapshot.operations.length > 0 ? h('div.admin-sync-banner__ops', [
      h('div.admin-sync-banner__section-title', 'Active'),
      ...snapshot.operations.map(renderSyncBannerOperation),
    ]) : null,

    snapshot.issues.length > 0 ? h('div.admin-sync-banner__issues', [
      h('div.admin-sync-banner__section-title', 'Issues'),
      ...snapshot.issues.map(issue => renderSyncBannerIssue(issue, redraw)),
    ]) : null,

    snapshot.severity === 'ok' ? h('div.admin-sync-banner__idle', [
      h('span.admin-sync-banner__idle-label', 'Synced · up to date'),
      h('span', lastSync ? `Latest synced change: ${new Date(lastSync).toLocaleString()}` : 'No synced database change recorded in this browser.'),
    ]) : null,

    h('div.admin-sync-banner__queued', `Queued for sync: ${formatSyncBannerCount(outboxCount)}`),
  ]);
}

function renderAdminNav(active: 'sync' | 'diagnostics'): VNode {
  return h('nav.admin-actions', [
    h('a.admin-btn', {
      class: { 'admin-btn--primary': active === 'sync', 'admin-btn--muted': active !== 'sync' },
      attrs: { href: '#/sync', ...controlExplainerAttrs({ label: 'Open sync dashboard' }) },
    }, 'Sync'),
  ]);
}

function renderSyncDashboard(redraw: () => void): VNode {
  readRemoteSyncToken();

  const lastSync = getRemoteSyncLastSyncedAt();
  const lastCheck = getRemoteSyncLastCheckedAt();
  const busy = syncStatus === 'testing'
    || syncStatus === 'pushing'
    || syncStatus === 'pulling'
    || syncStatus === 'exporting'
    || syncStatus === 'restoring'
    || syncStatus === 'invalidating'
    || syncStatus === 'clearing-auth'
    || dataManagementBusy
    || backupRestoreBusy;
  const hasToken = hasRemoteSyncToken();
  const outboxCount = getRemoteSyncOutboxCount();
  const logEntries = getRemoteSyncLog();
  const visibleLogEntries = syncLogExpanded ? logEntries : logEntries.slice(0, 6);
  const deviceTag = getRemoteSyncDeviceTag();
  if (!deviceTagDirty && deviceTagInput !== deviceTag) deviceTagInput = deviceTag;

  return h('div.admin-page', [
    h('div.admin-page__inner', [
      renderAdminNav('sync'),
      h('div.admin-header', [
        h('div', [
          h('h2.admin-title', 'Sync Dashboard'),
          h('p.admin-desc', 'Token-authenticated beta sync keeps IndexedDB fast locally while writes are queued and flushed to the database automatically.'),
        ]),
        h('div.admin-header__state', [
          h('button.admin-btn.admin-btn--muted', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Report a sync dashboard issue',
              description: 'Opens a diagnostics report prefilled with this admin surface as context.',
            }) },
            on: { click: reportAdminIssue },
          }, 'Report issue'),
          h('span.admin-sync-badge', {
            class: {
              'admin-sync-badge--done': hasToken,
              'admin-sync-badge--error': !hasToken,
            },
          }, hasToken ? 'Token active' : 'Logged out'),
          h('button.admin-btn.admin-btn--muted', {
            attrs: { type: 'button', disabled: busy || !hasToken, ...controlExplainerAttrs({
              label: 'Log out of sync',
              description: busy ? 'Wait for the current admin operation to finish.' : !hasToken ? 'No sync token is active in this browser.' : 'Clears the token from this browser without deleting local cache data.',
            }) },
            on: { click: () => {
              clearStoredRemoteSyncToken();
              tokenInput = '';
              syncMessage = 'Token cleared for this browser. Local cache was left untouched.';
              redraw();
            } },
          }, 'Logout'),
        ]),
      ]),

      renderSyncProgressBanner(redraw, outboxCount, lastSync),

      h('section.admin-panel', [
        h('div.admin-panel__header', [
          h('h3', 'Token Session'),
          h('span', hasToken ? 'Autosync is active for this browser.' : 'Enter the admin token to enable autosync.'),
        ]),
        h('div.admin-token-row', [
          h('input.admin-token-input', {
            attrs: {
              type: 'password',
              placeholder: 'Admin sync token',
              autocomplete: 'off',
              disabled: busy,
              'aria-label': 'Admin sync token',
              ...controlExplainerAttrs({
                label: 'Admin sync token',
                description: busy ? 'Wait for the current admin operation to finish.' : 'Authenticates this browser to the beta token-sync database.',
              }),
            },
            props: { value: tokenInput },
            on: { input: event => {
              tokenInput = (event.target as HTMLInputElement).value;
              redraw();
            } },
          }),
          h('button.admin-btn.admin-btn--primary', {
            attrs: { disabled: busy || !tokenInput.trim(), type: 'button', ...controlExplainerAttrs({
              label: 'Save sync token',
              description: busy ? 'Wait for the current admin operation to finish.' : !tokenInput.trim() ? 'Enter an admin sync token first.' : 'Stores the token in this browser and enables automatic sync.',
            }) },
            on: { click: () => doSaveToken(redraw) },
          }, 'Save token'),
          h('button.admin-btn.admin-btn--muted', {
            attrs: { disabled: busy || !hasToken, type: 'button', ...controlExplainerAttrs({
              label: 'Test sync connection',
              description: busy ? 'Wait for the current admin operation to finish.' : !hasToken ? 'Save an admin sync token first.' : 'Checks the configured token against the remote sync endpoint.',
            }) },
            on: { click: () => doTestConnection(redraw) },
          }, 'Test connection'),
        ]),
      ]),

      renderBackupRestorePanel(redraw, busy, hasToken),

      renderLichessApiLoginPanel(redraw, busy || lichessAuthClearBusy, hasToken),

      renderDataManagementPanel(redraw, busy || isRemoteSyncFullPullRequired()),

      renderDiagnosticReportsPanel(redraw),

      renderQuarantinedWritesPanel(redraw),

      h('section.admin-panel', [
        h('div.admin-panel__header', [
          h('h3', 'Local Cache'),
          h('span', outboxCount > 0 ? `${outboxCount} queued write${outboxCount === 1 ? '' : 's'}` : 'No queued writes'),
        ]),
        dataCounts ? h('div.admin-counts', [
          h('div.admin-count', [h('span.admin-count__num', `${dataCounts.games}`), h('span', 'Games')]),
          h('div.admin-count', [h('span.admin-count__num', `${dataCounts.analysis}`), h('span', 'Analyzed')]),
          h('div.admin-count', [h('span.admin-count__num', `${dataCounts.puzzleDefinitions}`), h('span', 'Puzzles')]),
          h('div.admin-count', [h('span.admin-count__num', `${dataCounts.puzzleAttempts}`), h('span', 'Attempts')]),
          h('div.admin-count', [h('span.admin-count__num', `${dataCounts.puzzleMeta}`), h('span', 'Meta')]),
          h('div.admin-count', [h('span.admin-count__num', `${outboxCount}`), h('span', 'Queued')]),
        ]) : null,
        h('div.admin-sync-status', [
          lastCheck
            ? h('span', `Last checked: ${new Date(lastCheck).toLocaleString()}`)
            : h('span', 'No database check recorded in this browser.'),
          lastSync
            ? h('span', `Latest synced change: ${new Date(lastSync).toLocaleString()}`)
            : h('span', 'No synced database change recorded in this browser.'),
          syncStatus !== 'idle'
            ? h('span.admin-sync-badge', {
                class: {
                  'admin-sync-badge--active': busy,
                  'admin-sync-badge--done': syncStatus === 'done',
                  'admin-sync-badge--error': syncStatus === 'error',
                },
              }, syncStatusLabel())
            : null,
        ]),
        syncMessage ? h('div.admin-sync-message', syncMessage) : null,
        h('div.admin-actions', [
          h('button.admin-btn.admin-btn--primary', {
            attrs: { disabled: busy || !hasToken, type: 'button', ...controlExplainerAttrs({
              label: 'Pull and push sync now',
              description: busy ? 'Wait for the current admin operation to finish.' : !hasToken ? 'Save an admin sync token first.' : 'Pulls remote changes, then flushes queued local writes.',
            }) },
            on: { click: () => doPush(redraw) },
          }, 'Pull + push now'),
          h('button.admin-btn.admin-btn--primary', {
            attrs: { disabled: busy || !hasToken, type: 'button', ...controlExplainerAttrs({
              label: 'Pull sync now',
              description: busy ? 'Wait for the current admin operation to finish.' : !hasToken ? 'Save an admin sync token first.' : 'Fetches and applies remote changes for the current token.',
            }) },
            on: { click: () => doPull(redraw) },
          }, 'Pull now'),
          h('button.admin-btn', {
            attrs: {
              disabled: busy || !hasToken,
              type: 'button',
              ...controlExplainerAttrs({
                label: 'Queue local library for sync',
                description: busy ? 'Wait for the current admin operation to finish.' : !hasToken ? 'Save an admin sync token first.' : 'Scans for local items the token database has never seen and queues them for upload.',
              }),
            },
            on: { click: () => doQueueLocalLibrary(redraw) },
          }, 'Queue local library for sync'),
        ]),
      ]),

      h('section.admin-panel', [
        h('div.admin-panel__header', [
          h('h3', 'Device'),
          h('span', 'This label appears in the local sync log.'),
        ]),
        h('div.admin-device-row', [
          h('input.admin-token-input', {
            attrs: {
              type: 'text',
              placeholder: 'Device tag',
              autocomplete: 'off',
              maxlength: 48,
              'aria-label': 'Sync device tag',
              ...controlExplainerAttrs({
                label: 'Sync device tag',
                description: 'Names this browser in local sync-log entries.',
              }),
            },
            props: { value: deviceTagInput },
            on: { input: event => {
              deviceTagInput = (event.target as HTMLInputElement).value;
              deviceTagDirty = true;
              redraw();
            } },
          }),
          h('button.admin-btn.admin-btn--muted', {
            attrs: { type: 'button', disabled: !deviceTagDirty || !deviceTagInput.trim(), ...controlExplainerAttrs({
              label: 'Save device tag',
              description: !deviceTagInput.trim() ? 'Enter a device tag first.' : !deviceTagDirty ? 'The device tag has no unsaved changes.' : 'Saves this browser label for future sync-log entries.',
            }) },
            on: { click: () => {
              deviceTagInput = setRemoteSyncDeviceTag(deviceTagInput);
              deviceTagDirty = false;
              syncMessage = `Device tag saved as ${deviceTagInput}.`;
              redraw();
            } },
          }, 'Save device tag'),
        ]),
      ]),

      h('section.admin-panel.admin-panel--log', [
        h('div.admin-panel__header', [
          h('h3', 'Sync Log'),
          h('div.admin-log__tools', [
            h('button.admin-btn.admin-btn--muted', {
              attrs: { type: 'button', disabled: logEntries.length === 0, ...controlExplainerAttrs({
                label: syncLogExpanded ? 'Collapse sync log' : 'Expand sync log',
                description: logEntries.length === 0 ? 'No sync-log entries are available.' : 'Changes how many local sync-log entries are shown.',
              }) },
              on: { click: () => {
                syncLogExpanded = !syncLogExpanded;
                redraw();
              } },
            }, syncLogExpanded ? 'Collapse' : 'Expand'),
            h('button.admin-btn.admin-btn--muted', {
              attrs: { type: 'button', disabled: logEntries.length === 0, ...controlExplainerAttrs({
                label: 'Clear sync log',
                description: logEntries.length === 0 ? 'No sync-log entries are available.' : 'Permanently clears this browser local sync log without changing synced data.',
              }) },
              on: { click: () => {
                clearRemoteSyncLog();
                syncMessage = 'Sync log cleared for this browser.';
                redraw();
              } },
            }, 'Clear log'),
          ]),
        ]),
        logEntries.length > 0
          ? h('div.admin-log', visibleLogEntries.map(renderSyncLogEntry))
          : h('p.admin-log__empty', 'No sync entries recorded yet.'),
      ]),
    ]),
  ]);
}






function formatQuarantineTimestamp(at: number): string {
  return new Date(at).toLocaleString();
}

function doRequeueQuarantineRecord(opId: string, redraw: () => void): void {
  quarantineActionBusyOpId = opId;
  quarantineMessage = '';
  redraw();
  requeueQuarantinedRemoteSyncWrite(opId).then(result => {
    quarantineMessage = result.success ? 'Re-queued for sync.' : `Error: ${result.error}`;
  }).catch(error => {
    quarantineMessage = error instanceof Error ? `Error: ${error.message}` : 'Error: Could not re-queue the quarantined write.';
  }).finally(() => {
    quarantineActionBusyOpId = null;
    loadQuarantineRecords(redraw);
  });
}

function doDiscardQuarantineRecord(opId: string, redraw: () => void): void {
  quarantineActionBusyOpId = opId;
  quarantineMessage = '';
  redraw();
  discardQuarantinedRemoteSyncWrite(opId).then(result => {
    quarantineMessage = result.success ? 'Discarded.' : `Error: ${result.error}`;
  }).catch(error => {
    quarantineMessage = error instanceof Error ? `Error: ${error.message}` : 'Error: Could not discard the quarantined write.';
  }).finally(() => {
    quarantineActionBusyOpId = null;
    loadQuarantineRecords(redraw);
  });
}

function doRequeueAllQuarantineRecords(redraw: () => void): void {
  quarantineBulkBusy = true;
  quarantineMessage = '';
  redraw();
  requeueAllQuarantinedRemoteSyncWrites().then(result => {
    quarantineMessage = result.success
      ? `Re-queued ${result.counts.requeued} write${result.counts.requeued === 1 ? '' : 's'}.`
      : `Re-queued ${result.counts.requeued}, ${result.counts.failed} failed. See the Sync Log for details.`;
  }).catch(error => {
    quarantineMessage = error instanceof Error ? `Error: ${error.message}` : 'Error: Could not re-queue the quarantined writes.';
  }).finally(() => {
    quarantineBulkBusy = false;
    loadQuarantineRecords(redraw);
  });
}

// Reuses the existing `.admin-settings-reset-row` (label/description + trailing action column
// grid) and `.admin-account-row__actions` (flex action-button row) classes rather than adding new
// CSS — this task's scope is limited to src/sync + src/admin/view.ts, no stylesheet changes.
function renderQuarantineRow(record: DurableQuarantineRecord, redraw: () => void): VNode {
  const busy = quarantineActionBusyOpId === record.opId || quarantineBulkBusy;
  return h('div.admin-settings-reset-row', [
    h('div', [
      h('strong', `${record.store} / ${record.itemKey}`),
      h('span', `${record.operation} · ${record.code}`),
      h('span', `Quarantined ${formatQuarantineTimestamp(record.quarantinedAt)}`),
    ]),
    h('div.admin-account-row__actions', [
      h('button.admin-btn.admin-btn--primary', {
        attrs: { type: 'button', disabled: busy, ...controlExplainerAttrs({
          label: 'Re-queue quarantined write',
          description: busy ? 'Another quarantine action is already running.' : 'Queues this dropped write again using current local data when available.',
        }) },
        on: { click: () => doRequeueQuarantineRecord(record.opId, redraw) },
      }, 'Re-queue'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: busy, ...controlExplainerAttrs({
          label: 'Discard quarantined write',
          description: busy ? 'Another quarantine action is already running.' : 'Stops tracking this dropped write without deleting its local data.',
        }) },
        on: { click: () => doDiscardQuarantineRecord(record.opId, redraw) },
      }, 'Discard'),
    ]),
  ]);
}

function renderQuarantinedWritesPanel(redraw: () => void): VNode | null {
  if (!quarantineRecords || quarantineRecords.length === 0) return null;
  const count = quarantineRecords.length;
  return h('section.admin-panel.admin-panel--danger', [
    h('div.admin-panel__header', [
      h('h3', 'Quarantined writes'),
      h('span', `${count} permanently dropped write${count === 1 ? '' : 's'}`),
    ]),
    h('p.admin-danger-copy', 'These writes were removed from the sync outbox without server acceptance (an explicit rejection, or too many failed attempts). Local data was left untouched. Re-queue tries again with the current local data (falling back to the dropped value if the local row is gone); Discard just stops tracking the write.'),
    quarantineMessage ? h('div.admin-sync-message', quarantineMessage) : null,
    h('div.admin-actions', [
      h('button.admin-btn', {
        attrs: { type: 'button', disabled: quarantineBulkBusy, ...controlExplainerAttrs({
          label: 'Re-queue all quarantined writes',
          description: quarantineBulkBusy ? 'Quarantined writes are already being re-queued.' : 'Queues every dropped write again using current local data when available.',
        }) },
        on: { click: () => doRequeueAllQuarantineRecords(redraw) },
      }, 'Re-queue all'),
    ]),
    h('div.admin-settings-reset-list', quarantineRecords.map(record => renderQuarantineRow(record, redraw))),
  ]);
}

function renderDiagnosticEventsPanel(redraw: () => void): VNode {
  const allEvents = diagnosticEvents ?? [];
  const kinds = Array.from(new Set(allEvents.map(event => event.kind))).sort();
  const severities = Object.values(Severity);
  const filteredEvents = filterDiagnosticEvents(allEvents);
  const displayRows = diagnosticEventDisplayMode === 'grouped'
    ? groupDiagnosticEvents(filteredEvents)
    : filteredEvents;
  const pageCount = Math.max(1, Math.ceil(displayRows.length / DIAGNOSTIC_EVENT_PAGE_SIZE));
  if (diagnosticEventPage >= pageCount) diagnosticEventPage = pageCount - 1;
  const pageStart = diagnosticEventPage * DIAGNOSTIC_EVENT_PAGE_SIZE;
  const pageRows = displayRows.slice(pageStart, pageStart + DIAGNOSTIC_EVENT_PAGE_SIZE);

  return h('section.admin-panel.admin-panel--diagnostic-events', [
    h('div.admin-panel__header', [
      h('h3', 'Events'),
      h('span', diagnosticEventsLoading
        ? 'Loading captured events...'
        : `${filteredEvents.length} of ${allEvents.length} event${allEvents.length === 1 ? '' : 's'}`),
    ]),
    h('div.admin-token-row', [
      h('select.admin-token-input', {
        attrs: { 'aria-label': 'Diagnostic event kind', ...controlExplainerAttrs({ label: 'Filter events by kind' }) },
        props: { value: diagnosticEventKindFilter },
        on: { change: event => {
          diagnosticEventKindFilter = (event.target as HTMLSelectElement).value;
          diagnosticEventPage = 0;
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, [
        h('option', { attrs: { value: '' } }, 'All kinds'),
        ...kinds.map(kind => h('option', { attrs: { value: kind } }, kind)),
      ]),
      h('select.admin-token-input', {
        attrs: { 'aria-label': 'Diagnostic event severity', ...controlExplainerAttrs({ label: 'Filter events by severity' }) },
        props: { value: diagnosticEventSeverityFilter },
        on: { change: event => {
          diagnosticEventSeverityFilter = (event.target as HTMLSelectElement).value;
          diagnosticEventPage = 0;
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, [
        h('option', { attrs: { value: '' } }, 'All severities'),
        ...severities.map(severity => h('option', { attrs: { value: severity } }, severity)),
      ]),
      h('input.admin-token-input', {
        attrs: { type: 'date', 'aria-label': 'Diagnostic event start date', ...controlExplainerAttrs({
          label: 'Diagnostic event start date',
          description: 'Shows only captured events on or after this date.',
        }) },
        props: { value: diagnosticEventStartDate },
        on: { input: event => {
          diagnosticEventStartDate = (event.target as HTMLInputElement).value;
          diagnosticEventPage = 0;
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }),
      h('input.admin-token-input', {
        attrs: { type: 'date', 'aria-label': 'Diagnostic event end date', ...controlExplainerAttrs({
          label: 'Diagnostic event end date',
          description: 'Shows only captured events on or before this date.',
        }) },
        props: { value: diagnosticEventEndDate },
        on: { input: event => {
          diagnosticEventEndDate = (event.target as HTMLInputElement).value;
          diagnosticEventPage = 0;
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: !hasDiagnosticEventFilters(), ...controlExplainerAttrs({
          label: 'Clear diagnostic event filters',
          description: hasDiagnosticEventFilters() ? 'Removes all event filters and returns to the first page.' : 'No diagnostic event filters are active.',
        }) },
        on: { click: () => {
          clearDiagnosticEventFilters();
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, 'Clear filters'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: diagnosticEventDisplayMode === 'flat' ? 'Group diagnostic events' : 'Show individual diagnostic events',
          description: 'Switches between individual events and fingerprint-based occurrence groups.',
        }) },
        on: { click: () => {
          diagnosticEventDisplayMode = diagnosticEventDisplayMode === 'flat' ? 'grouped' : 'flat';
          diagnosticEventPage = 0;
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, diagnosticEventDisplayMode === 'flat' ? 'Grouped' : 'Flat'),
    ]),
    diagnosticEventsLoading && diagnosticEvents === null
      ? h('p.admin-log__empty', 'Loading captured events...')
      : pageRows.length === 0
        ? h('p.admin-log__empty', 'No diagnostic events match the current filters.')
        : diagnosticEventDisplayMode === 'grouped'
          ? renderDiagnosticEventGroupTable(pageRows as DiagnosticEventGroupRow[], redraw)
          : renderDiagnosticEventTable(pageRows as DiagnosticEvent[], redraw),
    renderDiagnosticEventPagination(displayRows.length, pageCount, redraw),
    renderExpandedGroupOccurrences(redraw),
    renderSelectedDiagnosticEventDetail(redraw),
  ]);
}

function renderPerformanceSummaryPanel(): VNode {
  const performanceEvents = (diagnosticEvents ?? []).filter(event => event.kind === 'performance');
  const slowRoutes = summarizeSlowRoutes(performanceEvents);
  const vitals = summarizeWebVitals(performanceEvents);

  return h('section.admin-panel.admin-panel--diagnostic-performance', [
    h('div.admin-panel__header', [
      h('h3', 'Performance'),
      h('span', performanceEvents.length === 0
        ? 'No performance events recorded yet.'
        : `${performanceEvents.length} performance event${performanceEvents.length === 1 ? '' : 's'}`),
    ]),
    h('div.admin-data-section', [
      h('div.admin-data-section__header', [
        h('h4', 'Top slow routes'),
        h('span', 'Median duration'),
      ]),
      slowRoutes.length === 0
        ? h('p.admin-log__empty', 'No route duration events are available yet.')
        : h('div.admin-data-grid', slowRoutes.map(route => h('div.admin-data-metric', [
          h('span.admin-data-metric__value', formatDurationMs(route.medianDurationMs)),
          h('span', route.route),
        ]))),
    ]),
    h('div.admin-data-section', [
      h('div.admin-data-section__header', [
        h('h4', 'Recent Web Vitals'),
        h('span', 'Latest reading'),
      ]),
      vitals.length === 0
        ? h('p.admin-log__empty', 'No Web Vitals readings are available yet.')
        : h('table.report-list', [
          h('thead', [
            h('tr', [
              h('th.report-list__heading', 'Metric'),
              h('th.report-list__heading', 'Value'),
              h('th.report-list__heading', 'Rating'),
              h('th.report-list__heading', 'Timestamp'),
            ]),
          ]),
          h('tbody', vitals.map(vital => h('tr.report-list__row', [
            h('td.report-list__cell', vital.metric),
            h('td.report-list__cell', formatVitalValue(vital.metric, vital.value)),
            h('td.report-list__cell', [
              h('span.admin-sync-badge', {
                class: {
                  'admin-sync-badge--done': vital.rating === 'good',
                  'admin-sync-badge--active': vital.rating === 'needs improvement',
                  'admin-sync-badge--error': vital.rating === 'poor',
                },
              }, vital.rating),
            ]),
            h('td.report-list__cell', formatDiagnosticTimestamp(vital.timestamp)),
          ]))),
        ]),
    ]),
  ]);
}

function summarizeSlowRoutes(events: DiagnosticEvent[]): { route: string; medianDurationMs: number }[] {
  const durationsByRoute = new Map<string, number[]>();
  for (const event of events) {
    const durationMs = eventMetadataNumber(event, 'durationMs')
      ?? eventMetadataNumber(event, 'duration')
      ?? eventMetadataNumber(event, 'loadMs')
      ?? eventMetadataNumber(event, 'elapsedMs');
    if (durationMs === undefined) continue;
    const route = event.route || eventMetadataString(event, 'route') || 'unknown';
    const durations = durationsByRoute.get(route) ?? [];
    durations.push(durationMs);
    durationsByRoute.set(route, durations);
  }

  return Array.from(durationsByRoute.entries())
    .map(([route, durations]) => ({ route, medianDurationMs: median(durations) }))
    .filter(item => Number.isFinite(item.medianDurationMs))
    .sort((a, b) => b.medianDurationMs - a.medianDurationMs)
    .slice(0, 5);
}

function summarizeWebVitals(events: DiagnosticEvent[]): { metric: string; value: number; rating: string; timestamp: number }[] {
  const wantedMetrics = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
  const latestByMetric = new Map<string, { metric: string; value: number; rating: string; timestamp: number }>();
  for (const event of events) {
    const metric = normalizeVitalMetric(eventMetadataString(event, 'metric') ?? eventMetadataString(event, 'name') ?? event.message);
    if (!wantedMetrics.includes(metric)) continue;
    const value = eventMetadataNumber(event, 'value')
      ?? eventMetadataNumber(event, 'durationMs')
      ?? eventMetadataNumber(event, 'duration');
    if (value === undefined) continue;
    const rating = normalizeVitalRating(eventMetadataString(event, 'rating') ?? eventMetadataString(event, 'classification'));
    const existing = latestByMetric.get(metric);
    if (!existing || event.timestamp > existing.timestamp) {
      latestByMetric.set(metric, { metric, value, rating, timestamp: event.timestamp });
    }
  }

  return wantedMetrics
    .map(metric => latestByMetric.get(metric))
    .filter((item): item is { metric: string; value: number; rating: string; timestamp: number } => item !== undefined);
}

function eventMetadataString(event: DiagnosticEvent, key: string): string | undefined {
  const value = event.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function eventMetadataNumber(event: DiagnosticEvent, key: string): number | undefined {
  const value = event.metadata?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function normalizeVitalMetric(value: string | undefined): string {
  const upper = (value ?? '').toUpperCase();
  for (const metric of ['LCP', 'INP', 'CLS', 'FCP', 'TTFB']) {
    if (upper.includes(metric)) return metric;
  }
  return upper;
}

function normalizeVitalRating(value: string | undefined): string {
  const normalized = (value ?? '').toLowerCase();
  if (normalized === 'good' || normalized === 'poor') return normalized;
  if (normalized === 'needs-improvement' || normalized === 'needs_improvement' || normalized === 'needs improvement') {
    return 'needs improvement';
  }
  return 'unknown';
}

function formatVitalValue(metric: string, value: number): string {
  if (metric === 'CLS') return value.toFixed(3);
  return formatDurationMs(value);
}

function filterDiagnosticEvents(events: DiagnosticEvent[]): DiagnosticEvent[] {
  const start = dateStartMs(diagnosticEventStartDate);
  const end = dateEndMs(diagnosticEventEndDate);
  return events.filter(event => {
    if (diagnosticEventKindFilter && event.kind !== diagnosticEventKindFilter) return false;
    if (diagnosticEventSeverityFilter && event.severity !== diagnosticEventSeverityFilter) return false;
    if (start !== null && event.timestamp < start) return false;
    if (end !== null && event.timestamp > end) return false;
    return true;
  });
}

function groupDiagnosticEvents(events: DiagnosticEvent[]): DiagnosticEventGroupRow[] {
  const grouped = new Map<string, DiagnosticEvent[]>();
  const ungrouped: DiagnosticEventGroupRow[] = [];

  for (const event of events) {
    const groupingKey = diagnosticGroupingKey(event);
    if (!groupingKey) {
      ungrouped.push(eventGroupRow(event.eventId, event.message || event.kind, [event], false));
      continue;
    }
    const entries = grouped.get(groupingKey) ?? [];
    entries.push(event);
    grouped.set(groupingKey, entries);
  }

  return [
    ...Array.from(grouped.entries()).map(([key, entries]) => eventGroupRow(key, groupLabel(key, entries), entries, true)),
    ...ungrouped,
  ].sort((a, b) => b.lastSeen - a.lastSeen);
}

function eventGroupRow(key: string, label: string, events: DiagnosticEvent[], grouped: boolean): DiagnosticEventGroupRow {
  const sorted = events.slice().sort((a, b) => b.timestamp - a.timestamp);
  const latestEvent = sorted[0]!;
  const timestamps = sorted.map(event => event.timestamp).filter(Number.isFinite);
  return {
    key,
    label,
    count: events.length,
    firstSeen: timestamps.length > 0 ? Math.min(...timestamps) : latestEvent.timestamp,
    lastSeen:  timestamps.length > 0 ? Math.max(...timestamps) : latestEvent.timestamp,
    latestEvent,
    grouped,
  };
}

function groupLabel(key: string, events: DiagnosticEvent[]): string {
  const latest = events.slice().sort((a, b) => b.timestamp - a.timestamp)[0];
  const fallback = latest ? `${latest.kind}: ${latest.message.slice(0, 80)}` : key;
  return key || fallback;
}

function renderDiagnosticEventGroupTable(rows: DiagnosticEventGroupRow[], redraw: () => void): VNode {
  return h('table.report-list', [
    h('thead', [
      h('tr', [
        h('th.report-list__heading', 'Group'),
        h('th.report-list__heading', 'Occurrences'),
        h('th.report-list__heading', 'First seen'),
        h('th.report-list__heading', 'Last seen'),
        h('th.report-list__heading', 'Reports'),
        h('th.report-list__heading', ''),
      ]),
    ]),
    h('tbody', rows.map(row => {
      const linkedReports = linkedReportsForGroupRow(row);
      return h('tr.report-list__row', {
        class: { 'report-list__row--selected': selectedDiagnosticEventId === row.latestEvent.eventId },
        attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
          label: `Open diagnostic group ${row.label}`,
          description: 'Shows details for the latest event in this occurrence group.',
        }) },
        on: { click: () => {
          selectedDiagnosticEventId = row.latestEvent.eventId;
          writeDiagnosticsDetailUrl();
          redraw();
        }, keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => {
          selectedDiagnosticEventId = row.latestEvent.eventId;
          writeDiagnosticsDetailUrl();
          redraw();
        }) },
      }, [
        h('td.report-list__cell', row.grouped ? row.label : `${row.latestEvent.kind}: ${row.label.slice(0, 80)}`),
        h('td.report-list__cell', String(row.count)),
        h('td.report-list__cell', formatDiagnosticTimestamp(row.firstSeen)),
        h('td.report-list__cell', formatDiagnosticTimestamp(row.lastSeen)),
        h('td.report-list__cell', linkedReports.length === 0
          ? h('span.admin-sync-badge', '0')
          : h('button.admin-btn.admin-btn--muted', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Open linked report' }) },
            on: { click: clickEvent => {
              clickEvent.stopPropagation();
              selectedDiagnosticReportId = linkedReports[0]!.reportId;
              writeDiagnosticsDetailUrl();
              redraw();
            } },
          }, `${linkedReports.length} report${linkedReports.length === 1 ? '' : 's'}`)),
        h('td.report-list__cell', [
          h('button.admin-btn.admin-btn--muted', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: 'View latest diagnostic event' }) },
            on: { click: clickEvent => {
              clickEvent.stopPropagation();
              selectedDiagnosticEventId = row.latestEvent.eventId;
              writeDiagnosticsDetailUrl();
              redraw();
            } },
          }, 'View latest'),
          row.grouped ? h('button.admin-btn.admin-btn--muted', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: expandedDiagnosticGroupKey === row.key ? 'Hide event occurrences' : 'Show event occurrences',
              description: 'Shows or hides every captured event in this occurrence group.',
            }) },
            on: { click: clickEvent => {
              clickEvent.stopPropagation();
              expandedDiagnosticGroupKey = expandedDiagnosticGroupKey === row.key ? null : row.key;
              redraw();
            } },
          }, expandedDiagnosticGroupKey === row.key ? 'Hide occurrences' : 'Show occurrences') : null,
        ]),
      ]);
    })),
  ]);
}

function linkedReportsForGroupRow(row: DiagnosticEventGroupRow): StoredDiagnosticReport[] {
  const events = row.grouped
    ? (diagnosticEvents ?? []).filter(event => diagnosticGroupingKey(event) === row.key)
    : [row.latestEvent];
  const reportsById = new Map<string, StoredDiagnosticReport>();
  for (const event of events) {
    for (const report of linkedReportsForEvent(event)) reportsById.set(report.reportId, report);
  }
  return Array.from(reportsById.values());
}

function renderDiagnosticEventTable(events: DiagnosticEvent[], redraw: () => void): VNode {
  return h('div.admin-diagnostic-events-table-scroll', {
    attrs: {
      tabindex: 0,
      role: 'region',
      'aria-label': 'Diagnostic events table',
      ...controlExplainerAttrs({
        label: 'Diagnostic events table',
        description: 'Scrollable diagnostic events table; focus it and use arrow keys to scroll horizontally.',
      }),
    },
  }, [
    h('table.report-list', [
      h('thead', [
        h('tr', [
          h('th.report-list__heading', 'Kind'),
          h('th.report-list__heading', 'Severity'),
          h('th.report-list__heading', 'Timestamp'),
          h('th.report-list__heading', 'Route'),
          h('th.report-list__heading', 'Message'),
          h('th.report-list__heading', ''),
        ]),
      ]),
      h('tbody', events.map(event => h('tr.report-list__row', {
        class: { 'report-list__row--selected': selectedDiagnosticEventId === event.eventId },
        attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: `Open diagnostic event ${event.kind}` }) },
        on: { click: () => {
          selectedDiagnosticEventId = event.eventId;
          writeDiagnosticsDetailUrl();
          redraw();
        }, keydown: (keyEvent: KeyboardEvent) => activateOnKeyboard(keyEvent, () => {
          selectedDiagnosticEventId = event.eventId;
          writeDiagnosticsDetailUrl();
          redraw();
        }) },
      }, [
        h('td.report-list__cell', event.kind),
        h('td.report-list__cell', event.severity),
        h('td.report-list__cell', formatDiagnosticTimestamp(event.timestamp)),
        h('td.report-list__cell', event.route || 'unknown'),
        h('td.report-list__cell', event.message),
        h('td.report-list__cell', [
          h('button.admin-btn.admin-btn--muted', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: 'View diagnostic event' }) },
            on: { click: clickEvent => {
              clickEvent.stopPropagation();
              selectedDiagnosticEventId = event.eventId;
              writeDiagnosticsDetailUrl();
              redraw();
            } },
          }, 'View'),
        ]),
      ]))),
    ]),
  ]);
}

function renderDiagnosticEventPagination(total: number, pageCount: number, redraw: () => void): VNode {
  const pageLabel = total === 0 ? 'Page 0 of 0' : `Page ${diagnosticEventPage + 1} of ${pageCount}`;
  return h('div.admin-actions', [
    h('button.admin-btn.admin-btn--muted', {
      attrs: { type: 'button', disabled: diagnosticEventPage <= 0, ...controlExplainerAttrs({
        label: 'Previous diagnostic event page',
        description: diagnosticEventPage <= 0 ? 'This is the first diagnostic event page.' : 'Shows the previous page of diagnostic events.',
      }) },
      on: { click: () => {
        diagnosticEventPage = Math.max(0, diagnosticEventPage - 1);
        writeDiagnosticsFilterUrl();
        redraw();
      } },
    }, 'Previous'),
    h('span.admin-sync-badge', pageLabel),
    h('button.admin-btn.admin-btn--muted', {
      attrs: { type: 'button', disabled: diagnosticEventPage >= pageCount - 1 || total === 0, ...controlExplainerAttrs({
        label: 'Next diagnostic event page',
        description: total === 0 ? 'No diagnostic events are available.' : diagnosticEventPage >= pageCount - 1 ? 'This is the last diagnostic event page.' : 'Shows the next page of diagnostic events.',
      }) },
      on: { click: () => {
        diagnosticEventPage = Math.min(pageCount - 1, diagnosticEventPage + 1);
        writeDiagnosticsFilterUrl();
        redraw();
      } },
    }, 'Next'),
  ]);
}

function renderExpandedGroupOccurrences(redraw: () => void): VNode | null {
  if (!expandedDiagnosticGroupKey) return null;
  const occurrences = (diagnosticEvents ?? [])
    .filter(event => diagnosticGroupingKey(event) === expandedDiagnosticGroupKey)
    .sort((a, b) => b.timestamp - a.timestamp);
  if (occurrences.length === 0) return null;

  return h('section.admin-panel.admin-panel--diagnostic-occurrences', [
    h('div.admin-panel__header', [
      h('h3', 'Occurrences'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Close event occurrences' }) },
        on: { click: () => {
          expandedDiagnosticGroupKey = null;
          redraw();
        } },
      }, 'Close'),
    ]),
    h('table.report-list', [
      h('thead', [
        h('tr', [
          h('th.report-list__heading', 'Timestamp'),
          h('th.report-list__heading', 'Severity'),
          h('th.report-list__heading', 'Route'),
          h('th.report-list__heading', 'Message'),
          h('th.report-list__heading', ''),
        ]),
      ]),
      h('tbody', occurrences.map(event => h('tr.report-list__row', [
        h('td.report-list__cell', formatDiagnosticTimestamp(event.timestamp)),
        h('td.report-list__cell', event.severity),
        h('td.report-list__cell', event.route || 'unknown'),
        h('td.report-list__cell', event.message),
        h('td.report-list__cell', [
          h('button.admin-btn.admin-btn--muted', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: 'View diagnostic occurrence' }) },
            on: { click: () => {
              selectedDiagnosticEventId = event.eventId;
              writeDiagnosticsDetailUrl();
              redraw();
            } },
          }, 'View'),
        ]),
      ]))),
    ]),
  ]);
}

function renderSelectedDiagnosticEventDetail(redraw: () => void): VNode | null {
  const event = selectedDiagnosticEvent();
  if (!event) return null;
  const stack = eventMetadataString(event, 'stack');
  const breadcrumbs = (event.breadcrumbs ?? []).slice().sort((a, b) => a.timestamp - b.timestamp);
  const viewport = event.metadata?.['viewport'];
  const occurrenceSummary = diagnosticOccurrenceSummary(event);
  const linkedReports = linkedReportsForEvent(event);

  return h('section.admin-panel.admin-panel--diagnostic-event-detail', [
    h('div.admin-panel__header', [
      h('h3', 'Event detail'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Close diagnostic event detail' }) },
        on: { click: () => {
          selectedDiagnosticEventId = null;
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, 'Close'),
    ]),
    h('div.admin-data-grid', [
      renderDiagnosticDetailMetric('Kind', event.kind),
      renderDiagnosticDetailMetric('Severity', event.severity),
      renderDiagnosticDetailMetric('Timestamp', formatDiagnosticTimestamp(event.timestamp)),
      renderDiagnosticDetailMetric('Route', event.route || 'unknown'),
      renderDiagnosticDetailMetric('First seen', formatDiagnosticTimestamp(occurrenceSummary.firstSeen)),
      renderDiagnosticDetailMetric('Last seen', formatDiagnosticTimestamp(occurrenceSummary.lastSeen)),
      renderDiagnosticDetailMetric('Occurrences', String(occurrenceSummary.count)),
      renderDiagnosticDetailMetric('Session', event.sessionId),
      renderDiagnosticDetailMetric('Device class', eventMetadataString(event, 'deviceClass') ?? 'unknown'),
      renderDiagnosticDetailMetric('Viewport', viewport ? diagnosticValueToText(viewport) : 'unknown'),
      renderDiagnosticDetailMetric('Browser', eventMetadataString(event, 'userAgent') ?? eventMetadataString(event, 'browser') ?? 'unknown'),
    ]),
    h('div.admin-data-section', [
      h('div.admin-data-section__header', [
        h('h4', 'Stack trace'),
        h('span', stack ? 'Captured' : 'Unavailable'),
      ]),
      stack
        ? h('pre.admin-log__empty', stack.split('\n').map(frame => frame.trim()).filter(Boolean).join('\n'))
        : h('p.admin-log__empty', 'No stack trace was captured for this event.'),
    ]),
    h('div.admin-data-section', [
      h('div.admin-data-section__header', [
        h('h4', 'Breadcrumbs'),
        h('span', `${breadcrumbs.length} item${breadcrumbs.length === 1 ? '' : 's'}`),
      ]),
      breadcrumbs.length === 0
        ? h('p.admin-log__empty', 'No breadcrumbs were captured for this event.')
        : h('ol.report-preview__list', breadcrumbs.map(breadcrumb => h('li', [
          h('span', `${formatDiagnosticTimestamp(breadcrumb.timestamp)} — ${diagnosticValueToText(breadcrumb)}`),
        ]))),
    ]),
    h('div.admin-data-section', [
      h('div.admin-data-section__header', [
        h('h4', 'Linked reports'),
        h('span', `${linkedReports.length} report${linkedReports.length === 1 ? '' : 's'}`),
      ]),
      linkedReports.length === 0
        ? h('p.admin-log__empty', 'No linked reports.')
        : h('div.admin-account-list', linkedReports.map(report => h('button.admin-btn.admin-btn--muted', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Open linked diagnostic report' }) },
          on: { click: () => {
            selectedDiagnosticReportId = report.reportId;
            writeDiagnosticsDetailUrl();
            redraw();
          } },
        }, `${formatDiagnosticTimestamp(report.timestamp)} — ${report.userInput.severity}: ${report.userInput.description.slice(0, 80) || report.reportId}`))),
    ]),
  ]);
}

function linkedReportsForEvent(event: DiagnosticEvent): StoredDiagnosticReport[] {
  return (diagnosticReports ?? []).filter(report => {
    if (report.sessionId === event.sessionId) return true;
    return report.routeContext.recentErrors.some(error => error.eventId === event.eventId);
  });
}

function renderSelectedDiagnosticReportDetail(redraw: () => void): VNode | null {
  if (!selectedDiagnosticReportId) return null;
  const report = (diagnosticReports ?? []).find(item => item.reportId === selectedDiagnosticReportId);
  if (!report) return null;

  return h('section.admin-panel.admin-panel--diagnostic-report-detail', [
    h('div.admin-panel__header', [
      h('h3', 'Report detail'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Close diagnostic report detail' }) },
        on: { click: () => {
          selectedDiagnosticReportId = null;
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, 'Close'),
    ]),
    h('div.admin-data-grid', [
      renderDiagnosticDetailMetric('Report', report.reportId),
      renderDiagnosticDetailMetric('Captured', formatDiagnosticTimestamp(report.timestamp)),
      renderDiagnosticDetailMetric('Severity', report.userInput.severity),
      renderDiagnosticDetailMetric('Status', report.status),
      renderDiagnosticDetailMetric('Triage', reportTriageState(report)),
      renderDiagnosticDetailMetric('Route', report.route),
      renderDiagnosticDetailMetric('Session', report.sessionId),
    ]),
    renderReportTriageControl(report, redraw),
    renderReportAdminNotes(report, redraw),
    h('div.admin-data-section', [
      h('div.admin-data-section__header', [
        h('h4', 'User report'),
        h('span', report.userInput.severity),
      ]),
      h('p.admin-log__empty', report.userInput.description || 'No description provided.'),
      report.userInput.expectedBehavior ? h('p.admin-log__empty', `Expected: ${report.userInput.expectedBehavior}`) : null,
      report.userInput.actualBehavior ? h('p.admin-log__empty', `Actual: ${report.userInput.actualBehavior}`) : null,
    ]),
    advancedReproductionToolsEnabled() ? renderBugPackageControls(report, redraw) : null,
  ]);
}

function diagnosticErrorGroupFromReport(report: StoredDiagnosticReport): DiagnosticErrorGroup {
  const recentError = report.routeContext.recentErrors[0];
  if (recentError) {
    const group: DiagnosticErrorGroup = {
      errorGroupId: recentError.eventId,
      eventIds: [recentError.eventId],
      kind: recentError.kind,
      severity: recentError.severity,
      route: recentError.route,
      sourceTag: recentError.sourceTag,
      message: recentError.message,
      firstSeenAt: recentError.timestamp,
      lastSeenAt: recentError.timestamp,
      count: 1,
    };
    if (recentError.metadata) group.metadata = recentError.metadata;
    return group;
  }

  return {
    errorGroupId: `report-${report.reportId}`,
    eventIds: [],
    kind: 'user-report',
    severity: Severity.Info,
    route: report.route,
    sourceTag: 'diagnostics.report',
    message: report.userInput.description || 'User report',
    firstSeenAt: report.timestamp,
    lastSeenAt: report.timestamp,
    count: 1,
  };
}

function buildBugPackage(report: StoredDiagnosticReport, action: 'copy' | 'download', redraw: () => void): void {
  if (!advancedReproductionToolsEnabled()) {
    advancedReproductionToolsMessage = 'Enable advanced reproduction tools with an admin token before building a bug package.';
    redraw();
    return;
  }

  bugPackageBusy = true;
  advancedReproductionToolsMessage = 'Building bug package...';
  redraw();

  assembleBugPackage({
    report,
    errorGroup: diagnosticErrorGroupFromReport(report),
    reproNotes: report.adminNotes,
  }).then(async pkg => {
    if (action === 'copy') await copyBugPackageToClipboard(pkg);
    else downloadBugPackageAsJson(pkg);
    advancedReproductionToolsMessage = action === 'copy'
      ? 'Bug package copied to clipboard.'
      : 'Bug package download started.';
  }).catch(error => {
    advancedReproductionToolsMessage = error instanceof Error ? error.message : 'Bug package build failed.';
  }).finally(() => {
    bugPackageBusy = false;
    redraw();
  });
}

function renderBugPackageControls(report: StoredDiagnosticReport, redraw: () => void): VNode {
  return h('div.admin-data-section', [
    h('div.admin-data-section__header', [
      h('h4', 'Bug package'),
      h('span', bugPackageBusy ? 'Building...' : 'Advanced reproduction export'),
    ]),
    h('div.admin-token-row', [
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: bugPackageBusy, ...controlExplainerAttrs({
          label: 'Copy bug package',
          description: bugPackageBusy ? 'A bug package is already being built.' : 'Builds a redacted diagnostics package and copies it to the clipboard.',
        }) },
        on: { click: () => buildBugPackage(report, 'copy', redraw) },
      }, 'Copy package'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: bugPackageBusy, ...controlExplainerAttrs({
          label: 'Download bug package',
          description: bugPackageBusy ? 'A bug package is already being built.' : 'Builds a redacted diagnostics package and downloads it as JSON.',
        }) },
        on: { click: () => buildBugPackage(report, 'download', redraw) },
      }, 'Download package'),
    ]),
    h('p.admin-log__empty', 'Bug packages include redacted report context, breadcrumbs, recent route context, and performance summary only.'),
  ]);
}

function replaceDiagnosticReport(updated: StoredDiagnosticReport): void {
  diagnosticReports = (diagnosticReports ?? []).map(item => item.reportId === updated.reportId ? updated : item);
}

function renderReportAdminNotes(report: StoredDiagnosticReport, redraw: () => void): VNode {
  return h('div.admin-data-section', [
    h('div.admin-data-section__header', [
      h('h4', 'Admin notes'),
      h('span', report.adminNotes.trim() ? 'Saved locally' : 'Empty'),
    ]),
    h('textarea.admin-token-input', {
      attrs: {
        rows: 5,
        placeholder: 'Investigation notes, reproduction details, workaround status, or linked CCP prompts.',
        'aria-label': 'Diagnostic report admin notes',
        ...controlExplainerAttrs({
          label: 'Diagnostic report admin notes',
          description: 'Saves local investigation notes when this field loses focus.',
        }),
      },
      props: { value: report.adminNotes },
      on: { blur: event => {
        const adminNotes = (event.target as HTMLTextAreaElement).value;
        if (adminNotes === report.adminNotes) return;
        void updateReportAdminNotes(report.reportId, adminNotes).then(updated => {
          if (updated) replaceDiagnosticReport(updated);
          redraw();
        });
      } },
    }),
  ]);
}

function renderReportTriageControl(report: StoredDiagnosticReport, redraw: () => void): VNode {
  const currentState = reportTriageState(report);
  return h('div.admin-token-row', [
    h('select.admin-token-input', {
      attrs: { 'aria-label': 'Diagnostic report triage state', ...controlExplainerAttrs({
        label: 'Diagnostic report triage state',
        description: 'Moves this saved report through the local diagnostics triage workflow.',
      }) },
      props: { value: currentState },
      on: { change: event => {
        const nextState = (event.target as HTMLSelectElement).value as DiagnosticReportTriageState;
        void updateReportTriageState(report.reportId, nextState).then(updated => {
          if (updated) replaceDiagnosticReport(updated);
          redraw();
        });
      } },
    }, REPORT_TRIAGE_STATES.map(state => h('option', {
      attrs: {
        value: state,
        disabled: !canTransitionReportTriage(currentState, state),
      },
    }, state))),
  ]);
}

function diagnosticOccurrenceSummary(event: DiagnosticEvent): { firstSeen: number; lastSeen: number; count: number } {
  const groupingKey = diagnosticGroupingKey(event);
  if (!groupingKey) {
    return { firstSeen: event.timestamp, lastSeen: event.timestamp, count: 1 };
  }

  const matchingEvents = (diagnosticEvents ?? []).filter(candidate => diagnosticGroupingKey(candidate) === groupingKey);
  if (matchingEvents.length === 0) {
    return { firstSeen: event.timestamp, lastSeen: event.timestamp, count: 1 };
  }

  const timestamps = matchingEvents.map(candidate => candidate.timestamp).filter(Number.isFinite);
  if (timestamps.length === 0) {
    return { firstSeen: event.timestamp, lastSeen: event.timestamp, count: matchingEvents.length };
  }

  return {
    firstSeen: Math.min(...timestamps),
    lastSeen:  Math.max(...timestamps),
    count:     matchingEvents.length,
  };
}

function diagnosticGroupingKey(event: DiagnosticEvent): string | null {
  const direct = (event as DiagnosticEvent & { groupingKey?: unknown }).groupingKey;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const metadataKey = eventMetadataString(event, 'groupingKey')
    ?? eventMetadataString(event, 'fingerprint')
    ?? eventMetadataString(event, 'errorKey');
  return metadataKey?.trim() || null;
}

function selectedDiagnosticEvent(): DiagnosticEvent | null {
  if (!selectedDiagnosticEventId) return null;
  return (diagnosticEvents ?? []).find(event => event.eventId === selectedDiagnosticEventId) ?? null;
}

function renderDiagnosticDetailMetric(label: string, value: string): VNode {
  return h('div.admin-data-metric', [
    h('span.admin-data-metric__value', value),
    h('span', label),
  ]);
}

function diagnosticValueToText(value: unknown): string {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'unknown';
  }
}

function renderDiagnosticSessionsPanel(redraw: () => void): VNode {
  const sessions = diagnosticSessions ?? [];
  const filteredSessions = sessions.filter(session => {
    if (diagnosticSessionStatusFilter === 'all') return true;
    return diagnosticSessionStatus(session) === diagnosticSessionStatusFilter;
  });

  return h('section.admin-panel.admin-panel--diagnostic-sessions', [
    h('div.admin-panel__header', [
      h('h3', 'Sessions'),
      h('span', diagnosticSessionsLoading
        ? 'Loading sessions...'
        : `${filteredSessions.length} of ${sessions.length} session${sessions.length === 1 ? '' : 's'}`),
    ]),
    h('div.admin-token-row', [
      h('select.admin-token-input', {
        attrs: { 'aria-label': 'Diagnostic session status', ...controlExplainerAttrs({ label: 'Filter diagnostic sessions by status' }) },
        props: { value: diagnosticSessionStatusFilter },
        on: { change: event => {
          diagnosticSessionStatusFilter = (event.target as HTMLSelectElement).value as typeof diagnosticSessionStatusFilter;
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, [
        h('option', { attrs: { value: 'all' } }, 'All sessions'),
        h('option', { attrs: { value: 'clean' } }, 'Clean only'),
        h('option', { attrs: { value: 'interrupted' } }, 'Interrupted only'),
      ]),
    ]),
    diagnosticSessionsLoading && diagnosticSessions === null
      ? h('p.admin-log__empty', 'Loading sessions...')
      : filteredSessions.length === 0
        ? h('p.admin-log__empty', 'No diagnostic sessions match the current filter.')
        : renderDiagnosticSessionTable(filteredSessions),
  ]);
}

function renderDiagnosticSessionTable(sessions: DiagnosticSession[]): VNode {
  return h('table.report-list', [
    h('thead', [
      h('tr', [
        h('th.report-list__heading', 'Start time'),
        h('th.report-list__heading', 'Duration'),
        h('th.report-list__heading', 'Status'),
        h('th.report-list__heading', 'Device class'),
        h('th.report-list__heading', 'Route'),
      ]),
    ]),
    h('tbody', sessions.map(session => h('tr.report-list__row', [
      h('td.report-list__cell', formatDiagnosticTimestamp(session.startedAt)),
      h('td.report-list__cell', formatDiagnosticDuration(session)),
      h('td.report-list__cell', [
        h('span.admin-sync-badge', {
          class: {
            'admin-sync-badge--done': diagnosticSessionStatus(session) === 'clean',
            'admin-sync-badge--error': diagnosticSessionStatus(session) === 'interrupted',
            'admin-sync-badge--active': diagnosticSessionStatus(session) === 'open',
          },
        }, diagnosticSessionStatusLabel(session)),
      ]),
      h('td.report-list__cell', diagnosticSessionDeviceClass(session)),
      h('td.report-list__cell', session.route || 'unknown'),
    ]))),
  ]);
}

function diagnosticSessionStatus(session: DiagnosticSession): 'clean' | 'interrupted' | 'open' {
  if (session.cleanShutdown === true || session.cleanShutdown === 'inferred-closed') return 'clean';
  if (session.interruptedDetectedAt || session.cleanShutdown === false) return 'interrupted';
  return 'open';
}

function diagnosticSessionStatusLabel(session: DiagnosticSession): string {
  const status = diagnosticSessionStatus(session);
  if (status === 'clean') return 'Clean';
  if (status === 'interrupted') return 'Interrupted';
  return 'Open';
}

function diagnosticSessionDeviceClass(session: DiagnosticSession): string {
  const value = session.metadata?.['deviceClass'];
  return typeof value === 'string' && value.trim() ? value : 'unknown';
}

function formatDiagnosticDuration(session: DiagnosticSession): string {
  if (!session.endedAt && diagnosticSessionStatus(session) === 'open') return 'open';
  const end = session.endedAt ?? session.lastSeenAt ?? session.lastHeartbeat;
  if (!Number.isFinite(session.startedAt) || !Number.isFinite(end)) return 'unknown';
  return formatDurationMs(Math.max(0, end - session.startedAt));
}

function formatDurationMs(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function hasDiagnosticEventFilters(): boolean {
  return Boolean(diagnosticEventKindFilter || diagnosticEventSeverityFilter || diagnosticEventStartDate || diagnosticEventEndDate);
}

function clearDiagnosticEventFilters(): void {
  diagnosticEventKindFilter = '';
  diagnosticEventSeverityFilter = '';
  diagnosticEventStartDate = '';
  diagnosticEventEndDate = '';
  diagnosticEventPage = 0;
}

// --- URL state helpers ---

/** Build a DiagnosticsUrlState snapshot from the current module-level variables. */
function currentDiagnosticsUrlState(): DiagnosticsUrlState {
  return {
    kind: diagnosticEventKindFilter,
    severity: diagnosticEventSeverityFilter,
    start: diagnosticEventStartDate,
    end: diagnosticEventEndDate,
    mode: diagnosticEventDisplayMode,
    sessions: diagnosticSessionStatusFilter,
    page: diagnosticEventPage + 1,                           // 0-based → 1-based (URL)
    event: selectedDiagnosticEventId,
    report: selectedDiagnosticReportId,
    rpage: remoteDiagnosticReportPage + 1,                   // 0-based → 1-based (URL)
    range: (remoteDiagnosticTrendRangeDays as 7 | 30 | 90),
    period: remoteDiagnosticTrendPeriod,
  };
}

/**
 * Write a replace-style URL update for filter/page/panel refinements.
 * Also syncs `diagnosticsHydratedQuery` so the next render skips redundant re-hydration.
 */
function writeDiagnosticsFilterUrl(): void {
  const url = serializeDiagnosticsUrlState(currentDiagnosticsUrlState());
  replaceHashRoute(url);
  const qStart = url.indexOf('?');
  diagnosticsHydratedQuery = qStart >= 0 ? url.slice(qStart + 1) : '';
}

/**
 * Write a push-style URL update when navigating into an event or report detail view.
 * Also syncs `diagnosticsHydratedQuery` to match the new URL immediately.
 * This fires a hashchange event which main.ts will handle (re-render, idempotent).
 */
function writeDiagnosticsDetailUrl(): void {
  const url = serializeDiagnosticsUrlState(currentDiagnosticsUrlState());
  writeHashRoute(url);
  const qStart = url.indexOf('?');
  diagnosticsHydratedQuery = qStart >= 0 ? url.slice(qStart + 1) : '';
}

/**
 * Apply a parsed URL query string to the diagnostics view state.
 * Called on first route entry and when the URL query changes externally
 * (e.g. Back button, pasted URL).
 */
function applyDiagnosticsUrlState(query: string): void {
  const { state, needsCleanup, canonicalRoute } = parseDiagnosticsUrlState(query);
  diagnosticEventKindFilter      = state.kind;
  diagnosticEventSeverityFilter  = state.severity;
  diagnosticEventStartDate       = state.start;
  diagnosticEventEndDate         = state.end;
  diagnosticEventDisplayMode     = state.mode;
  diagnosticSessionStatusFilter  = state.sessions;
  diagnosticEventPage            = Math.max(0, state.page - 1);   // 1-based → 0-based
  selectedDiagnosticEventId      = state.event;
  selectedDiagnosticReportId     = state.report;
  remoteDiagnosticReportPage     = Math.max(0, state.rpage - 1);  // 1-based → 0-based
  remoteDiagnosticTrendRangeDays = state.range;
  remoteDiagnosticTrendPeriod    = state.period;
  diagnosticsSelectionRecoveryMessage = '';

  if (needsCleanup) {
    replaceHashRoute(canonicalRoute);
    // Sync hydrated query to the canonical form to avoid redundant re-hydration.
    const qStart = canonicalRoute.indexOf('?');
    diagnosticsHydratedQuery = qStart >= 0 ? canonicalRoute.slice(qStart + 1) : '';
  }
}

function dateStartMs(date: string): number | null {
  if (!date) return null;
  const parsed = Date.parse(`${date}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateEndMs(date: string): number | null {
  if (!date) return null;
  const parsed = Date.parse(`${date}T23:59:59.999`);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDiagnosticTimestamp(timestamp: number): string {
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : 'unknown';
}

function renderDiagnosticReportsPanel(redraw: () => void): VNode {
  const reports = diagnosticReports ?? [];
  const flaggedReports = retentionFlaggedReports(reports);
  const flaggedReportIds = new Set(flaggedReports.map(report => report.reportId));
  const bulkDeleteCount = reports.filter(report => reportTriageState(report) === diagnosticReportBulkDeleteState).length;

  return h('section.admin-panel.admin-panel--diagnostic-reports', [
    h('div.admin-panel__header', [
      h('h3', 'Bug Reports'),
      h('span', diagnosticReportsLoading
        ? 'Loading saved reports...'
        : `${reports.length} saved report${reports.length === 1 ? '' : 's'}`),
    ]),
    renderReportRetentionControls(flaggedReports, redraw),
    h('div.admin-token-row', [
      h('select.admin-token-input', {
        attrs: { 'aria-label': 'Bulk delete report state', ...controlExplainerAttrs({
          label: 'Bulk delete report state',
          description: 'Chooses which local report triage state the bulk delete action targets.',
        }) },
        props: { value: diagnosticReportBulkDeleteState },
        on: { change: event => {
          diagnosticReportBulkDeleteState = (event.target as HTMLSelectElement).value as DiagnosticReportTriageState;
          redraw();
        } },
      }, REPORT_TRIAGE_STATES.map(state => h('option', { attrs: { value: state } }, `Bulk delete ${state}`))),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: bulkDeleteCount === 0, ...controlExplainerAttrs({
          label: `Delete ${diagnosticReportBulkDeleteState} reports`,
          description: bulkDeleteCount === 0 ? `No ${diagnosticReportBulkDeleteState} reports are available to delete.` : `Permanently deletes ${bulkDeleteCount} matching report${bulkDeleteCount === 1 ? '' : 's'} from this browser after confirmation.`,
        }) },
        on: { click: () => {
          const confirmed = window.confirm(`Delete ${bulkDeleteCount} ${diagnosticReportBulkDeleteState} report${bulkDeleteCount === 1 ? '' : 's'} from this browser?`);
          if (!confirmed) return;
          void deleteReportsByTriageState(diagnosticReportBulkDeleteState).then(deletedCount => {
            diagnosticReports = (diagnosticReports ?? []).filter(report => reportTriageState(report) !== diagnosticReportBulkDeleteState);
            if (selectedDiagnosticReportId && !(diagnosticReports ?? []).some(report => report.reportId === selectedDiagnosticReportId)) {
              selectedDiagnosticReportId = null;
              writeDiagnosticsFilterUrl();
            }
            syncMessage = `Deleted ${deletedCount} ${diagnosticReportBulkDeleteState} report${deletedCount === 1 ? '' : 's'}.`;
            redraw();
          });
        } },
      }, `Delete ${bulkDeleteCount}`),
    ]),
    diagnosticReportsLoading && diagnosticReports === null
      ? h('p.admin-log__empty', 'Loading saved reports...')
      : renderReportList(reports, {
        flaggedReportIds,
        onViewReport: reportId => {
          selectedDiagnosticReportId = reportId;
          writeDiagnosticsDetailUrl();
          redraw();
        },
        onTriageChange: (reportId, nextState) => {
          void updateReportTriageState(reportId, nextState).then(updated => {
            if (updated) replaceDiagnosticReport(updated);
            redraw();
          });
        },
        onDeleteReport: reportId => {
          const report = reports.find(item => item.reportId === reportId);
          const label = report?.userInput.description.slice(0, 80) || reportId;
          const confirmed = window.confirm(`Delete report "${label}" from this browser?`);
          if (!confirmed) return;
          void deleteReport(reportId).then(deleted => {
            if (deleted) {
              diagnosticReports = (diagnosticReports ?? []).filter(item => item.reportId !== reportId);
              if (selectedDiagnosticReportId === reportId) {
                selectedDiagnosticReportId = null;
                writeDiagnosticsFilterUrl();
              }
            }
            redraw();
          });
        },
      }),
    renderSelectedDiagnosticReportDetail(redraw),
  ]);
}

function selectedReviewErrorPackage(): ReviewErrorPackage | null {
  const packages = reviewErrorPackages ?? [];
  if (!selectedReviewErrorPackageId) return packages[0] ?? null;
  return packages.find(pkg => pkg.packageId === selectedReviewErrorPackageId) ?? packages[0] ?? null;
}

function safeReviewErrorFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function reviewErrorCreatedDate(pkg: ReviewErrorPackage): string {
  const parsed = Date.parse(pkg.createdAt);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : 'unknown-date';
}

function formatReviewErrorPackageTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value || 'unknown';
}

function reviewErrorGameTitle(pkg: ReviewErrorPackage): string {
  const meta = pkg.game.metadata;
  const players = meta.white && meta.black ? `${meta.white} vs ${meta.black}` : pkg.gameId;
  return meta.result ? `${players}, ${meta.result}` : players;
}

function reviewErrorMoveTitle(pkg: ReviewErrorPackage): string {
  const move = pkg.selectedMove;
  const moveNumber = Math.max(1, Math.ceil(move.ply / 2));
  const prefix = move.ply % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
  return `${prefix} ${move.san ?? move.uci ?? move.path}`;
}

function reviewErrorEngineTitle(pkg: ReviewErrorPackage): string {
  const engine = pkg.analysis.reviewEngine;
  if (engine) return `${engine.engineName}, depth ${engine.reviewDepth}`;
  return `Stored review depth ${pkg.analysis.analysisDepth}`;
}

function downloadReviewErrorPackage(packageId: string, redraw: () => void): void {
  reviewErrorPackageMessage = 'Preparing full review-error package JSON...';
  redraw();

  exportReviewErrorPackageJson(packageId).then(json => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      reviewErrorPackageMessage = 'Download unavailable in this environment.';
      redraw();
      return;
    }
    const pkg = (reviewErrorPackages ?? []).find(item => item.packageId === packageId);
    const filenameDate = pkg ? reviewErrorCreatedDate(pkg) : 'unknown-date';
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('data-ui-explainer-exempt', 'programmatic-download-node');
    link.href = url;
    link.download = `patzer-review-error-${safeReviewErrorFilenamePart(packageId)}-${filenameDate}.json`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    reviewErrorPackageMessage = 'Review error package download started.';
    redraw();
  }).catch(error => {
    reviewErrorPackageMessage = error instanceof Error ? `Review error package export failed: ${error.message}` : 'Review error package export failed.';
    redraw();
  });
}

function renderReviewErrorPackageList(packages: ReviewErrorPackage[], redraw: () => void): VNode {
  if (packages.length === 0) {
    return h('p.admin-log__empty', 'No Review Error Bug packages saved in this browser yet.');
  }

  return h('div.review-error-packages__list', packages.map(pkg => {
    const selected = selectedReviewErrorPackageId === pkg.packageId;
    return h('button.review-error-packages__item', {
      class: { 'review-error-packages__item--selected': selected },
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: `Open review-error package ${pkg.packageId}`,
        description: 'Shows the local package memo and analysis summary.',
      }) },
      on: { click: () => {
        selectedReviewErrorPackageId = pkg.packageId;
        redraw();
      } },
    }, [
      h('strong', reviewErrorMoveTitle(pkg)),
      h('span', reviewErrorGameTitle(pkg)),
      h('small', formatReviewErrorPackageTimestamp(pkg.createdAt)),
    ]);
  }));
}

function renderReviewErrorPackageDetail(pkg: ReviewErrorPackage, redraw: () => void): VNode {
  const nodeCount = Object.keys(pkg.analysis.storedAnalysis.nodes).length;
  return h('div.review-error-packages__detail', [
    h('div.admin-data-grid', [
      renderDiagnosticDetailMetric('Package', pkg.packageId),
      renderDiagnosticDetailMetric('Created', formatReviewErrorPackageTimestamp(pkg.createdAt)),
      renderDiagnosticDetailMetric('Game', pkg.gameId),
      renderDiagnosticDetailMetric('Move', reviewErrorMoveTitle(pkg)),
      renderDiagnosticDetailMetric('Path', pkg.selectedMove.path),
      renderDiagnosticDetailMetric('Engine', reviewErrorEngineTitle(pkg)),
      renderDiagnosticDetailMetric('Stored nodes', String(nodeCount)),
      renderDiagnosticDetailMetric('Build', pkg.app.release),
    ]),
    h('div.admin-data-section', [
      h('div.admin-data-section__header', [
        h('h4', 'Admin memo'),
        h('span', pkg.adminMemo.submittedAt),
      ]),
      h('p.admin-log__empty', pkg.adminMemo.message || 'No memo provided.'),
    ]),
    h('div.admin-data-section', [
      h('div.admin-data-section__header', [
        h('h4', 'Game and review summary'),
        h('span', 'Local package preview'),
      ]),
      h('p.admin-log__empty', `${reviewErrorGameTitle(pkg)}. ${reviewErrorEngineTitle(pkg)}. Selected move ${reviewErrorMoveTitle(pkg)} at path ${pkg.selectedMove.path}.`),
      h('p.admin-log__empty', `Raw PGN length: ${pkg.game.rawPgn.length} characters. Recent safe diagnostic events: ${pkg.diagnostics.recentEvents.length}.`),
    ]),
    h('div.admin-token-row', [
      h('button.admin-btn.admin-btn--primary', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Export full review-error JSON',
          description: 'Downloads raw PGN and full stored analysis from this admin-only package.',
        }) },
        on: { click: () => downloadReviewErrorPackage(pkg.packageId, redraw) },
      }, 'Export full JSON'),
    ]),
  ]);
}

function renderReviewErrorPackagesPanel(redraw: () => void): VNode {
  const packages = reviewErrorPackages ?? [];
  const selected = selectedReviewErrorPackage();

  return h('section.admin-panel.admin-panel--review-error-packages', [
    h('div.admin-panel__header', [
      h('h3', 'Review Error Bugs'),
      h('span', reviewErrorPackagesLoading
        ? 'Loading local packages...'
        : `${packages.length} local package${packages.length === 1 ? '' : 's'}`),
    ]),
    h('p.admin-log__empty', 'Local/admin-only packages may include raw PGN and full Stockfish review analysis. Export individual JSON files only when you intend to share that diagnostic evidence.'),
    h('div.admin-token-row', [
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: reviewErrorPackagesLoading, ...controlExplainerAttrs({
          label: 'Refresh review-error packages',
          description: reviewErrorPackagesLoading ? 'Review-error packages are already loading.' : 'Reloads locally saved review-error packages from this browser.',
        }) },
        on: { click: () => {
          reviewErrorPackages = null;
          reviewErrorPackageMessage = '';
          loadReviewErrorPackages(redraw);
          redraw();
        } },
      }, 'Refresh packages'),
    ]),
    reviewErrorPackageMessage ? h('p.admin-log__empty', reviewErrorPackageMessage) : null,
    reviewErrorPackagesLoading && reviewErrorPackages === null
      ? h('p.admin-log__empty', 'Loading Review Error Bug packages...')
      : h('div.review-error-packages', [
        renderReviewErrorPackageList(packages, redraw),
        selected
          ? renderReviewErrorPackageDetail(selected, redraw)
          : h('p.admin-log__empty', 'Select a package to inspect its memo and review summary.'),
      ]),
  ]);
}

function formatRemoteReportSyncAge(timestamp: number | null): string {
  return timestamp ? formatDiagnosticTimestamp(timestamp) : 'never synced';
}

function renderRemoteDiagnosticReportsPanel(redraw: () => void): VNode {
  syncRemoteUploadInputs();
  const config = remoteReportViewerConfig();
  const reports = remoteDiagnosticReports ?? [];
  const pageCount = Math.max(1, Math.ceil(reports.length / REMOTE_REPORT_PAGE_SIZE));
  const page = Math.min(remoteDiagnosticReportPage, pageCount - 1);
  const start = page * REMOTE_REPORT_PAGE_SIZE;
  const visibleReports = reports.slice(start, start + REMOTE_REPORT_PAGE_SIZE);
  const stale = Boolean(
    remoteDiagnosticReportLastSyncedAt &&
    Date.now() - remoteDiagnosticReportLastSyncedAt > REMOTE_REPORT_STALE_MS,
  );
  const unavailable = !config.enabled || !config.token;

  return h('section.admin-panel.admin-panel--remote-diagnostic-reports', [
    h('div.admin-panel__header', [
      h('h3', 'Remote Bug Reports'),
      h('span', remoteDiagnosticReportsLoading
        ? 'Syncing remote reports...'
        : `${reports.length} remote report${reports.length === 1 ? '' : 's'}`),
    ]),
    renderRemoteUploadControls(config, redraw),
    h('div.admin-token-row', [
      h(`span.report-list__badge.report-list__badge--status-${remoteDiagnosticReportStatus === 'error' ? 'failed' : 'submitted'}`, remoteDiagnosticReportStatus),
      h('span.admin-backup-copy', `Last synced: ${formatRemoteReportSyncAge(remoteDiagnosticReportLastSyncedAt)}`),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: unavailable || remoteDiagnosticReportsLoading, ...controlExplainerAttrs({
          label: 'Refresh remote diagnostic reports',
          description: remoteDiagnosticReportsLoading ? 'Remote diagnostic reports are already loading.' : unavailable ? 'Enable remote diagnostics and configure an admin token first.' : 'Fetches the latest reports from the configured remote diagnostics inbox.',
        }) },
        on: { click: () => loadRemoteDiagnosticReports(redraw) },
      }, 'Refresh'),
    ]),
    stale ? h('p.admin-danger-copy', 'Remote diagnostics are stale. Refresh before acting on report state.') : null,
    remoteDiagnosticReportMessage ? h('p.admin-log__empty', remoteDiagnosticReportMessage) : null,
    unavailable
      ? h('p.admin-log__empty', config.enabled
        ? 'Remote diagnostics are unavailable until an admin token is configured.'
        : 'Remote diagnostics submission is disabled for this browser.')
      : renderRemoteDiagnosticReportList(visibleReports, redraw),
    reports.length > REMOTE_REPORT_PAGE_SIZE ? h('div.admin-token-row', [
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: page === 0, ...controlExplainerAttrs({ label: 'Previous remote report page', description: page === 0 ? 'This is the first remote report page.' : 'Shows the previous remote report page.' }) },
        on: { click: () => {
          remoteDiagnosticReportPage = Math.max(0, page - 1);
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, 'Previous'),
      h('span.admin-backup-copy', `Page ${page + 1} of ${pageCount}`),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: page >= pageCount - 1, ...controlExplainerAttrs({ label: 'Next remote report page', description: page >= pageCount - 1 ? 'This is the last remote report page.' : 'Shows the next remote report page.' }) },
        on: { click: () => {
          remoteDiagnosticReportPage = Math.min(pageCount - 1, page + 1);
          writeDiagnosticsFilterUrl();
          redraw();
        } },
      }, 'Next'),
    ]) : null,
  ]);
}

function renderRemoteUploadControls(config: ReturnType<typeof readRemoteSubmissionConfig>, redraw: () => void): VNode {
  return h('div.admin-data-section', [
    h('div.admin-data-section__header', [
      h('h4', 'Remote Upload'),
      h('span.admin-sync-badge', {
        class: {
          'admin-sync-badge--done': config.enabled,
          'admin-sync-badge--error': !config.enabled,
        },
      }, config.enabled ? 'Enabled' : 'Off'),
    ]),
    h('div.admin-token-row', [
      h('input.admin-token-input', {
        attrs: {
          type: 'password',
          autocomplete: 'off',
          placeholder: 'Admin token',
          'aria-label': 'Remote diagnostics admin token',
          ...controlExplainerAttrs({
            label: 'Remote diagnostics admin token',
            description: 'Authenticates browser-local report uploads and remote inbox reads.',
          }),
        },
        props: { value: remoteUploadTokenInput },
        on: { input: event => {
          remoteUploadTokenInput = (event.target as HTMLInputElement).value;
          remoteUploadMessage = '';
          redraw();
        } },
      }),
      h('input.admin-token-input', {
        attrs: {
          type: 'text',
          placeholder: DEFAULT_REMOTE_SUBMISSION_ENDPOINT,
          'aria-label': 'Remote diagnostics endpoint',
          ...controlExplainerAttrs({
            label: 'Remote diagnostics endpoint',
            description: 'Sets the browser-local endpoint used for remote report submissions.',
          }),
        },
        props: { value: remoteUploadEndpointInput },
        on: { input: event => {
          remoteUploadEndpointInput = (event.target as HTMLInputElement).value;
          remoteUploadMessage = '';
          redraw();
        } },
      }),
      h('button.admin-btn.admin-btn--primary', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: config.enabled ? 'Update remote upload' : 'Enable remote upload',
          description: 'Stores the endpoint and token in this browser and allows queued diagnostic submissions to drain.',
        }) },
        on: { click: () => enableRemoteUpload(redraw) },
      }, config.enabled ? 'Update upload' : 'Enable upload'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: !config.enabled, ...controlExplainerAttrs({
          label: 'Disable remote upload',
          description: config.enabled ? 'Stops this browser from uploading queued diagnostic reports.' : 'Remote diagnostics submission is already disabled in this browser.',
        }) },
        on: { click: () => disableRemoteUpload(redraw) },
      }, 'Disable'),
    ]),
    remoteUploadMessage ? h('p.admin-sync-message', remoteUploadMessage) : null,
    h('p.admin-log__empty', 'Remote upload is browser-local, defaults off, and only drains queued report submissions when enabled with an admin token.'),
  ]);
}


function renderAdvancedReproductionToolsPanel(redraw: () => void): VNode {
  const enabled = advancedReproductionToolsEnabled();
  const hasToken = hasAdminTokenForAdvancedTools();

  return h('section.admin-panel.admin-panel--advanced-reproduction-tools', [
    h('div.admin-panel__header', [
      h('h3', 'Advanced reproduction tools'),
      h('span.admin-sync-badge', {
        class: {
          'admin-sync-badge--done': enabled,
          'admin-sync-badge--error': !enabled,
        },
      }, enabled ? 'Enabled' : 'Off'),
    ]),
    h('p.admin-log__empty', 'These owner-only controls are browser-local and limited to fault injection plus selected-report bug package export. They do not gate all diagnostics capture.'),
    h('div.admin-token-row', [
      h('button.admin-btn', {
        class: {
          'admin-btn--primary': !enabled,
          'admin-btn--muted': enabled,
        },
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: enabled ? 'Disable advanced reproduction tools' : 'Enable advanced reproduction tools',
          description: enabled ? 'Hides owner-only fault injection and package export controls.' : 'Shows owner-only fault injection and package export controls when an admin token is available.',
        }) },
        on: { click: () => toggleAdvancedReproductionTools(redraw) },
      }, enabled ? 'Disable advanced tools' : 'Enable advanced tools'),
      h('span.admin-backup-copy', hasToken
        ? 'Admin token is available for this browser.'
        : 'Save an admin token in Sync before enabling.'),
    ]),
    advancedReproductionToolsMessage ? h('p.admin-sync-message', advancedReproductionToolsMessage) : null,
    enabled ? renderFaultInjectionControls(redraw) : null,
  ]);
}

function renderFaultInjectionControls(redraw: () => void): VNode {
  const buttons: { label: string; action: () => void | Promise<void> }[] = [
    { label: 'Sync failure', action: faultInjection.triggerSyncFailure },
    { label: 'IDB failure', action: faultInjection.triggerIDBFailure },
    { label: 'Render failure', action: faultInjection.triggerRenderFailure },
    { label: 'Engine init failure', action: faultInjection.triggerEngineInitFailure },
    { label: 'Unhandled rejection', action: faultInjection.triggerUnhandledRejection },
    { label: 'Slow route', action: () => faultInjection.triggerSlowRoute(3000) },
    { label: 'Resource failure', action: faultInjection.triggerResourceLoadFailure },
    { label: 'Mobile crash marker', action: faultInjection.triggerMobileCrash },
  ];

  return h('div.admin-data-section', [
    h('div.admin-data-section__header', [
      h('h4', 'Fault injection'),
      h('span', 'Writes synthetic diagnostics for reproduction validation.'),
    ]),
    h('div.admin-token-row', buttons.map(button => h('button.admin-btn.admin-btn--muted', {
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: button.label,
        description: 'Creates a synthetic diagnostic failure for owner-only reproduction validation.',
      }) },
      on: { click: () => runFaultInjection(button.action, redraw) },
    }, button.label))),
  ]);
}

function renderRemoteDiagnosticReportList(reports: RemoteDiagnosticReportSummary[], redraw: () => void): VNode {
  if (reports.length === 0) return h('p.report-list__empty', 'No remote bug reports are available.');

  return h('table.report-list', [
    h('thead.report-list__head', [
      h('tr', [
        h('th.report-list__heading', 'Received'),
        h('th.report-list__heading', 'Severity'),
        h('th.report-list__heading', 'Route'),
        h('th.report-list__heading', 'State'),
        h('th.report-list__heading', 'Summary'),
        h('th.report-list__heading', 'Actions'),
      ]),
    ]),
    h('tbody.report-list__body', reports.map(report => h('tr.report-list__row', [
      h('td.report-list__cell.report-list__cell--date', report.receivedAt),
      h('td.report-list__cell', [
        h(`span.report-list__badge.report-list__badge--severity-${report.severity}`, report.severity),
      ]),
      h('td.report-list__cell.report-list__cell--route', report.route),
      h('td.report-list__cell', [
        h('span.report-list__badge', report.state),
      ]),
      h('td.report-list__cell', report.description.slice(0, 120)),
      h('td.report-list__cell.report-list__cell--actions', [
        h('button.admin-btn.admin-btn--muted.report-list__action', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Delete remote diagnostic report',
            description: 'This permanently deletes the report from the remote diagnostics inbox.',
          }) },
          on: { click: () => {
            const confirmed = window.confirm(`Delete remote report "${report.reportId}"?`);
            if (!confirmed) return;
            void deleteRemoteDiagnosticReport(report.reportId).then(deleted => {
              if (deleted) {
                remoteDiagnosticReports = (remoteDiagnosticReports ?? []).filter(item => item.reportId !== report.reportId);
                remoteDiagnosticReportMessage = `Deleted remote report ${report.reportId}.`;
              } else {
                remoteDiagnosticReportStatus = 'error';
                remoteDiagnosticReportMessage = `Remote delete failed for ${report.reportId}.`;
              }
              redraw();
            }).catch(error => {
              remoteDiagnosticReportStatus = 'error';
              remoteDiagnosticReportMessage = error instanceof Error ? error.message : 'Remote delete failed.';
              redraw();
            });
          } },
        }, 'Delete'),
      ]),
    ]))),
  ]);
}

function renderReportRetentionControls(flaggedReports: StoredDiagnosticReport[], redraw: () => void): VNode {
  return h('div.admin-data-section', [
    h('div.admin-data-section__header', [
      h('h4', 'Retention'),
      h('span', flaggedReports.length === 0
        ? `No reports older than ${diagnosticReportRetentionDays} day${diagnosticReportRetentionDays === 1 ? '' : 's'}`
        : `${flaggedReports.length} old report${flaggedReports.length === 1 ? '' : 's'} need action`),
    ]),
    h('div.admin-token-row', [
      h('input.admin-token-input', {
        attrs: {
          type: 'number',
          min: String(DIAGNOSTIC_REPORT_MIN_RETENTION_DAYS),
          max: String(DIAGNOSTIC_REPORT_MAX_RETENTION_DAYS),
          'aria-label': 'Report retention days',
          ...controlExplainerAttrs({
            label: 'Report retention days',
            description: 'Sets the local age threshold used to flag reports for archive or deletion.',
          }),
        },
        props: { value: String(diagnosticReportRetentionDays) },
        on: { input: event => {
          const parsed = Number((event.target as HTMLInputElement).value);
          if (Number.isFinite(parsed)) {
            diagnosticReportRetentionDays = Math.min(
              DIAGNOSTIC_REPORT_MAX_RETENTION_DAYS,
              Math.max(DIAGNOSTIC_REPORT_MIN_RETENTION_DAYS, Math.round(parsed)),
            );
          }
          redraw();
        } },
      }),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: flaggedReports.length === 0, ...controlExplainerAttrs({
          label: 'Archive old diagnostic reports',
          description: flaggedReports.length === 0 ? 'No reports are older than the current retention threshold.' : 'Moves every flagged old report to the archived triage state after confirmation.',
        }) },
        on: { click: () => {
          const confirmed = window.confirm(`Archive ${flaggedReports.length} old report${flaggedReports.length === 1 ? '' : 's'}?`);
          if (!confirmed) return;
          void Promise.all(flaggedReports.map(report => updateReportTriageState(report.reportId, 'archived'))).then(updatedReports => {
            for (const updated of updatedReports) if (updated) replaceDiagnosticReport(updated);
            redraw();
          });
        } },
      }, 'Archive old'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: flaggedReports.length === 0, ...controlExplainerAttrs({
          label: 'Delete old diagnostic reports',
          description: flaggedReports.length === 0 ? 'No reports are older than the current retention threshold.' : 'Permanently deletes every flagged old report from this browser after confirmation.',
        }) },
        on: { click: () => {
          const confirmed = window.confirm(`Delete ${flaggedReports.length} old report${flaggedReports.length === 1 ? '' : 's'} from this browser?`);
          if (!confirmed) return;
          void Promise.all(flaggedReports.map(report => deleteReport(report.reportId))).then(() => {
            const flaggedIds = new Set(flaggedReports.map(report => report.reportId));
            diagnosticReports = (diagnosticReports ?? []).filter(report => !flaggedIds.has(report.reportId));
            if (selectedDiagnosticReportId && flaggedIds.has(selectedDiagnosticReportId)) selectedDiagnosticReportId = null;
            redraw();
          });
        } },
      }, 'Delete old'),
    ]),
    flaggedReports.length === 0
      ? h('p.admin-log__empty', 'Saved reports are within the current local retention window.')
      : h('p.admin-danger-copy', `Reports older than ${diagnosticReportRetentionDays} day${diagnosticReportRetentionDays === 1 ? '' : 's'} are flagged in the table and should be archived or deleted.`),
  ]);
}

function retentionFlaggedReports(reports: StoredDiagnosticReport[]): StoredDiagnosticReport[] {
  const maxAgeMs = diagnosticReportRetentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  return reports.filter(report => Number.isFinite(report.timestamp) && report.timestamp < cutoff);
}

function setDataManagementProgress(
  options: DataManagementActionOptions,
  stage: DataManagementProgressStage,
  message: string,
  buttonLabel = options.buttonLabel,
): void {
  dataManagementProgress = {
    actionId: options.actionId,
    actionLabel: options.actionLabel,
    buttonLabel,
    stage,
    message,
  };
}

function isDataManagementActionActive(actionId: string): boolean {
  return dataManagementBusy && dataManagementProgress?.actionId === actionId;
}

function renderDataManagementActionButton(options: DataManagementActionButtonOptions): VNode {
  const active = isDataManagementActionActive(options.actionId);
  const classList: Record<string, boolean> = {
    'admin-btn--working': active,
  };
  classList[`admin-btn--${options.tone}`] = true;

  return h('button.admin-btn', {
    class: classList,
    attrs: { type: 'button', disabled: options.disabled || dataManagementBusy, ...controlExplainerAttrs({
      label: options.label,
      description: dataManagementBusy ? 'Another data-management operation is already running.' : options.disabled ? 'This action is unavailable because its selected data scope is empty or sync recovery is required.' : `Runs the confirmed ${options.actionLabel.toLowerCase()} operation on its displayed local data scope.`,
    }) },
    on: { click: () => confirmAndRun(options) },
  }, active ? dataManagementProgress?.buttonLabel ?? options.buttonLabel : options.label);
}

function renderDataManagementProgress(): VNode | null {
  const progress = dataManagementProgress;
  if (!progress) return null;

  const isError = progress.stage === 'blocked' || progress.stage === 'error';
  const isDone = progress.stage === 'done';
  return h('div.admin-data-progress', {
    class: {
      'admin-data-progress--active': progress.stage === 'preparing' || progress.stage === 'running',
      'admin-data-progress--done': isDone,
      'admin-data-progress--error': isError,
    },
  }, [
    h('div.admin-data-progress__header', [
      h('strong', progress.actionLabel),
      h('span.admin-sync-badge', {
        class: {
          'admin-sync-badge--active': progress.stage === 'preparing' || progress.stage === 'running',
          'admin-sync-badge--done': isDone,
          'admin-sync-badge--error': isError,
        },
      }, dataManagementProgressStageLabel(progress.stage)),
    ]),
    h('p.admin-data-progress__message', progress.message),
    h('div.admin-data-progress__steps', [
      renderDataManagementProgressStep('Confirmed', progress.stage !== 'blocked', progress.stage === 'preparing'),
      renderDataManagementProgressStep('Deleting and syncing', progress.stage === 'running' || isDone, progress.stage === 'running'),
      renderDataManagementProgressStep(isError ? 'Needs attention' : 'Complete', isDone || isError, isDone || isError, isError),
    ]),
  ]);
}

function renderDataManagementProgressStep(label: string, reached: boolean, active: boolean, error = false): VNode {
  return h('span.admin-data-progress__step', {
    class: {
      'admin-data-progress__step--complete': reached && !active && !error,
      'admin-data-progress__step--active': active,
      'admin-data-progress__step--error': error,
    },
  }, label);
}

function dataManagementProgressStageLabel(stage: DataManagementProgressStage): string {
  if (stage === 'blocked') return 'Blocked';
  if (stage === 'preparing') return 'Preparing...';
  if (stage === 'running') return 'Working...';
  if (stage === 'done') return 'Done';
  return 'Error';
}

function dataManagementResultMessage(result: DataManagementResult): string {
  const status = result.status ? `${result.status}. ` : '';
  return `${status}${result.message}`;
}

function renderDataManagementPanel(redraw: () => void, busy: boolean): VNode {
  const snapshot = dataManagementSnapshot;
  return h('section.admin-panel.admin-panel--danger', [
    h('div.admin-panel__header', [
      h('h3', 'Data Management'),
      h('span', 'Deletes local data and syncs tombstones to the token database.'),
    ]),
    h('p.admin-danger-copy', 'These controls are destructive. Each action asks for confirmation with the current local counts before deleting anything.'),
    renderDataManagementProgress(),
    !snapshot
      ? h('div.admin-sync-message', dataManagementLoading ? 'Loading saved data inventory...' : 'Saved data inventory is not loaded yet.')
      : h('div.admin-data-management', [
          renderAccountDataSection(snapshot.accounts, snapshot.library, redraw, busy),
          renderPuzzleDataSection(snapshot, redraw, busy),
          renderSettingsResetSection(snapshot.settingsGroups, redraw, busy),
        ]),
  ]);
}

function renderAccountDataSection(
  accounts: AccountDataSummary[],
  library: LibraryDataSummary,
  redraw: () => void,
  busy: boolean,
): VNode {
  const reviewArtifactCount = library.analysis + library.summaries + library.retroResults;
  const generatedCascadeCount = library.generatedPuzzles + library.legacySavedReviewPuzzles;
  return h('div.admin-data-section', [
    h('div.admin-data-section__header', [
      h('h4', 'Imported Accounts'),
      h('span', accounts.length === 0 ? 'No imported accounts found.' : `${accounts.length} account${accounts.length === 1 ? '' : 's'}`),
    ]),
    h('div.admin-library-actions', [
      h('div.admin-library-actions__copy', [
        h('strong', 'Whole game library'),
        h('span', `${library.games} game${library.games === 1 ? '' : 's'} · ${library.reviewGames} reviewed · ${generatedCascadeCount} generated puzzle${generatedCascadeCount === 1 ? '' : 's'}`),
      ]),
      h('div.admin-account-row__actions', [
        renderDataManagementActionButton({
          actionId: 'all-review-data',
          actionLabel: 'Reset all analysis',
          label: 'Reset all analysis',
          buttonLabel: 'Resetting...',
          tone: 'muted',
          disabled: busy || reviewArtifactCount === 0,
          confirmation: `Reset analysis for all games?\n\nThis removes ${library.analysis} analysis record${library.analysis === 1 ? '' : 's'}, ${library.summaries} game summar${library.summaries === 1 ? 'y' : 'ies'}, and ${library.retroResults} LFYM/retro result${library.retroResults === 1 ? '' : 's'}. Games remain in the library.`,
          run: deleteAllReviewData,
          redraw,
        }),
        renderDataManagementActionButton({
          actionId: 'all-game-history',
          actionLabel: 'Delete whole game history',
          label: 'Delete whole game history',
          buttonLabel: 'Deleting...',
          tone: 'danger',
          disabled: busy || library.games === 0,
          confirmation: `Delete the whole game history?\n\nThis removes ${library.games} game${library.games === 1 ? '' : 's'}, ${library.reviewGames} analyzed game${library.reviewGames === 1 ? '' : 's'}, and ${generatedCascadeCount} generated puzzle${generatedCascadeCount === 1 ? '' : 's'} tied to those games. Imported Lichess puzzle definitions and the admin sync token remain.`,
          run: deleteAllGames,
          redraw,
        }),
      ]),
    ]),
    accounts.length === 0
      ? h('p.admin-log__empty', 'No account registry rows or account-tagged games are in this browser cache yet. Log in with the admin token and pull from the token database to list remote imported accounts here.')
      : h('div.admin-account-list', accounts.map(account => renderAccountDataRow(account, redraw, busy))),
  ]);
}

function renderAccountDataRow(summary: AccountDataSummary, redraw: () => void, busy: boolean): VNode {
  const platform = summary.account.platform === 'chesscom' ? 'Chess.com' : 'Lichess';
  const reviewLabel = `${summary.reviewCount} analyzed game${summary.reviewCount === 1 ? '' : 's'}`;
  const puzzleLabel = `${summary.generatedPuzzleCount} generated puzzle${summary.generatedPuzzleCount === 1 ? '' : 's'}`;
  return h('div.admin-account-row', [
    h('div.admin-account-row__main', [
      h('strong', summary.account.displayName),
      h('span', [
        `${platform} · ${summary.account.category}`,
        summary.account.fallback ? ' · fallback label' : '',
      ].join('')),
      h('span', summary.lastSyncedAt ? `Last import: ${new Date(summary.lastSyncedAt).toLocaleString()}` : 'No import sync timestamp'),
    ]),
    h('div.admin-account-row__counts', [
      h('span', `${summary.gameCount} game${summary.gameCount === 1 ? '' : 's'}`),
      h('span', reviewLabel),
      h('span', puzzleLabel),
    ]),
    h('div.admin-account-row__actions', [
      renderDataManagementActionButton({
        actionId: `account-review:${summary.account.id}`,
        actionLabel: `Delete review data for ${summary.account.displayName}`,
        label: 'Delete review data',
        buttonLabel: 'Deleting...',
        tone: 'muted',
        disabled: busy || summary.reviewCount === 0,
        confirmation: `Delete review data for ${summary.account.displayName}?\n\nThis removes ${reviewLabel} but keeps ${summary.gameCount} game${summary.gameCount === 1 ? '' : 's'}.`,
        run: () => deleteAccountReviewData(summary.account.id),
        redraw,
      }),
      renderDataManagementActionButton({
        actionId: `account-games:${summary.account.id}`,
        actionLabel: `Delete imported account and games for ${summary.account.displayName}`,
        label: 'Delete imported account and games',
        buttonLabel: 'Deleting...',
        tone: 'danger',
        disabled: busy,
        confirmation: `Delete imported account and games for ${summary.account.displayName}?\n\nThis removes the imported account record, ${summary.gameCount} game${summary.gameCount === 1 ? '' : 's'}, ${reviewLabel}, and ${puzzleLabel}. Other accounts are left untouched.`,
        run: () => deleteImportedAccountAndGames(summary.account.id),
        redraw,
      }),
    ]),
  ]);
}

function renderPuzzleDataSection(snapshot: DataManagementSnapshot, redraw: () => void, busy: boolean): VNode {
  const puzzles = snapshot.puzzles;
  const progressCount = puzzles.attempts + puzzles.meta + puzzles.ratingHistory + (puzzles.hasPerf ? 1 : 0);
  return h('div.admin-data-section', [
    h('div.admin-data-section__header', [
      h('h4', 'Puzzle Data'),
      h('span', `${puzzles.userDefinitions} generated · ${puzzles.importedDefinitions} imported`),
    ]),
    h('div.admin-data-grid', [
      renderDataMetric('Generated', puzzles.userDefinitions + puzzles.legacySavedReviewPuzzles),
      renderDataMetric('Imported', puzzles.importedDefinitions),
      renderDataMetric('Attempts', puzzles.attempts),
      renderDataMetric('Meta', puzzles.meta),
      renderDataMetric('Rating history', puzzles.ratingHistory),
      renderDataMetric('PGN cache', puzzles.pgnCacheEntries),
    ]),
    h('div.admin-actions', [
      renderDataManagementActionButton({
        actionId: 'generated-puzzles',
        actionLabel: 'Delete generated puzzles',
        label: 'Delete generated puzzles',
        buttonLabel: 'Deleting...',
        tone: 'danger',
        disabled: busy || (puzzles.userDefinitions + puzzles.legacySavedReviewPuzzles) === 0,
        confirmation: `Delete generated puzzle data?\n\nThis removes ${puzzles.userDefinitions} user-library puzzle definition${puzzles.userDefinitions === 1 ? '' : 's'} and ${puzzles.legacySavedReviewPuzzles} legacy saved review puzzle${puzzles.legacySavedReviewPuzzles === 1 ? '' : 's'}. Imported Lichess puzzle definitions remain.`,
        run: deleteGeneratedPuzzleData,
        redraw,
      }),
      renderDataManagementActionButton({
        actionId: 'puzzle-progress',
        actionLabel: 'Reset puzzle progress',
        label: 'Reset puzzle progress',
        buttonLabel: 'Resetting...',
        tone: 'danger',
        disabled: busy || progressCount === 0 && !puzzles.hasActiveSession,
        confirmation: `Reset puzzle progress?\n\nThis removes ${puzzles.attempts} attempt${puzzles.attempts === 1 ? '' : 's'}, ${puzzles.meta} metadata record${puzzles.meta === 1 ? '' : 's'}, ${puzzles.ratingHistory} rating history point${puzzles.ratingHistory === 1 ? '' : 's'}, and active session state. Puzzle definitions remain.`,
        run: resetPuzzleProgress,
        redraw,
      }),
      renderDataManagementActionButton({
        actionId: 'puzzle-pgn-cache',
        actionLabel: 'Clear PGN cache',
        label: 'Clear PGN cache',
        buttonLabel: 'Clearing...',
        tone: 'muted',
        disabled: busy || puzzles.pgnCacheEntries === 0,
        confirmation: `Clear puzzle PGN cache?\n\nThis removes ${puzzles.pgnCacheEntries} cached PGN${puzzles.pgnCacheEntries === 1 ? '' : 's'} used for faster puzzle loading. User progress is not affected.`,
        run: clearPuzzlePgnCache,
        redraw,
      }),
    ]),
  ]);
}

function renderDataMetric(label: string, value: number): VNode {
  return h('div.admin-data-metric', [
    h('span.admin-data-metric__value', String(value)),
    h('span', label),
  ]);
}

function syncStatusLabel(): string {
  if (syncStatus === 'testing') return 'Testing...';
  if (syncStatus === 'pushing') return 'Pushing...';
  if (syncStatus === 'pulling') return 'Pulling...';
  if (syncStatus === 'exporting') return 'Exporting...';
  if (syncStatus === 'restoring') return 'Restoring...';
  if (syncStatus === 'invalidating') return 'Invalidating...';
  if (syncStatus === 'clearing-auth') return 'Clearing auth...';
  if (syncStatus === 'done') return 'Done';
  return 'Error';
}

function renderLichessApiLoginPanel(redraw: () => void, busy: boolean, hasToken: boolean): VNode {
  return h('section.admin-panel.admin-panel--lichess-auth', [
    h('div.admin-panel__header', [
      h('h3', 'Lichess API Login'),
      h('span', hasToken ? 'Book access is saved against the current admin token identity.' : 'Local Lichess auth can be cleared without an admin token.'),
    ]),
    h('p.admin-backup-copy', 'Clears stale browser Lichess OAuth data and, when the admin token is active, removes the saved Lichess book token from the token database. The sync token and synced data stay intact.'),
    h('div.admin-actions', [
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled: busy, ...controlExplainerAttrs({
          label: 'Clear Lichess API login data',
          description: busy ? 'Wait for the current admin operation to finish.' : 'Clears browser Lichess OAuth data and the saved book token without changing Remote sync data.',
        }) },
        on: { click: () => doClearLichessApiLoginData(redraw) },
      }, 'Clear Lichess API login data'),
    ]),
  ]);
}

function renderBackupRestorePanel(redraw: () => void, busy: boolean, hasToken: boolean): VNode {
  const generation = getRemoteSyncGeneration();
  const fullPullRequired = isRemoteSyncFullPullRequired();
  const disabled = busy || !hasToken;
  return h('section.admin-panel.admin-panel--backup', [
    h('div.admin-panel__header', [
      h('h3', 'Backup & Restore'),
      h('span', generation ? `Current generation ${generation}` : 'Exports the remote token database as JSON.'),
    ]),
    h('p.admin-backup-copy', 'Backups contain synced remote rows only: no admin token, token hash, database credentials, or local browser-only secrets. Restore replaces the current token database and logs out stale browsers.'),
    fullPullRequired
      ? h('div.admin-sync-message.admin-sync-message--warning', 'This browser must re-enter the token and full-pull before pushing changes.')
      : null,
    h('div.admin-actions.admin-backup-actions', [
      h('button.admin-btn.admin-btn--primary', {
        attrs: { type: 'button', disabled, ...controlExplainerAttrs({
          label: 'Download token database backup',
          description: busy ? 'Wait for the current admin operation to finish.' : !hasToken ? 'Save an admin sync token first.' : 'Downloads all synced remote rows for this token as a JSON backup.',
        }) },
        on: { click: () => doDownloadBackup(redraw) },
      }, 'Download backup'),
      h('label.admin-btn.admin-btn--muted.admin-file-btn', {
        class: { 'admin-file-btn--disabled': disabled },
      }, [
        'Choose backup file',
        h('input', {
          attrs: { type: 'file', accept: 'application/json,.json', disabled, 'aria-label': 'Choose token database backup file', ...controlExplainerAttrs({
            label: 'Choose token database backup file',
            description: busy ? 'Wait for the current admin operation to finish.' : !hasToken ? 'Save an admin sync token first.' : 'Selects and validates a JSON backup before replacement is allowed.',
          }) },
          on: { change: event => doChooseBackupFile(event, redraw) },
        }),
      ]),
      h('button.admin-btn.admin-btn--danger', {
        attrs: { type: 'button', disabled: disabled || !backupPreview, ...controlExplainerAttrs({
          label: 'Replace token database',
          description: disabled ? busy ? 'Wait for the current admin operation to finish.' : 'Save an admin sync token first.' : !backupPreview ? 'Choose and validate a backup file first.' : 'This replaces every synced row for this token and invalidates other browser sessions.',
        }) },
        on: { click: () => doRestoreBackup(redraw) },
      }, 'Replace token database'),
      h('button.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', disabled, ...controlExplainerAttrs({
          label: 'Invalidate other browsers',
          description: busy ? 'Wait for the current admin operation to finish.' : !hasToken ? 'Save an admin sync token first.' : 'Advances the sync generation so other browser sessions must log in and full-pull again.',
        }) },
        on: { click: () => doInvalidateOtherBrowsers(redraw) },
      }, 'Invalidate other browsers'),
    ]),
    backupPreview ? renderBackupPreview(backupPreview) : null,
  ]);
}

function renderBackupPreview(preview: RemoteSyncBackupPreview): VNode {
  const stores = Object.entries(preview.counts.stores)
    .filter(([, counts]) => counts.items > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return h('div.admin-backup-preview', [
    h('div.admin-backup-preview__header', [
      h('strong', preview.fileName),
      h('span', `Exported ${new Date(preview.exportedAt).toLocaleString()}`),
    ]),
    h('div.admin-data-grid', [
      renderDataMetric('Items', preview.counts.items),
      renderDataMetric('Tombstones', preview.counts.tombstones),
      renderDataMetric('Backup generation', preview.syncGeneration),
      renderDataMetric('Current generation', preview.currentSyncGeneration),
      renderDataMetric('After restore', preview.expectedSyncGeneration),
      renderDataMetric('Stores', stores.length),
    ]),
    h('div.admin-backup-hash', `SHA-256 ${preview.hash.slice(0, 16)}...`),
    stores.length > 0
      ? h('div.admin-backup-store-list', stores.map(([store, counts]) => h('span', `${store}: ${counts.items}${counts.tombstones ? ` (${counts.tombstones} tombstones)` : ''}`)))
      : null,
    preview.warnings.length > 0
      ? h('ul.admin-backup-warnings', preview.warnings.map(warning => h('li', warning)))
      : null,
  ]);
}

function renderSettingsResetSection(groups: SettingsResetGroup[], redraw: () => void, busy: boolean): VNode {
  return h('div.admin-data-section', [
    h('div.admin-data-section__header', [
      h('h4', 'Settings Resets'),
      h('span', `${groups.length} groups`),
    ]),
    h('div.admin-settings-reset-list', groups.map(group => h('div.admin-settings-reset-row', [
      h('div', [
        h('strong', group.title),
        h('span', group.description),
      ]),
      renderDataManagementActionButton({
        actionId: `settings:${group.id}`,
        actionLabel: `Reset ${group.title} settings`,
        label: 'Reset',
        buttonLabel: 'Resetting...',
        tone: 'muted',
        disabled: busy,
        confirmation: `Reset ${group.title.toLowerCase()} settings?\n\nThis removes ${group.keys.length} named setting${group.keys.length === 1 ? '' : 's'}${group.prefixes?.length ? ' plus matching prefix settings' : ''}. The admin sync token is not removed.`,
        run: () => resetSettingsGroup(group.id),
        redraw,
      }),
    ]))),
  ]);
}

function confirmAndRun(options: DataManagementActionOptions): void {
  if (dataManagementBusy) return;

  if (isRemoteSyncFullPullRequired()) {
    syncStatus = 'error';
    syncMessage = 'Pull the token database before running destructive data-management actions from this browser.';
    setDataManagementProgress(options, 'blocked', syncMessage, 'Blocked');
    options.redraw();
    return;
  }
  if (!window.confirm(options.confirmation)) return;

  dataManagementBusy = true;
  syncMessage = `${options.actionLabel}: preparing...`;
  setDataManagementProgress(options, 'preparing', 'Confirmed. Preparing the data-management action...', 'Preparing...');
  options.redraw();

  window.setTimeout(() => {
    if (!dataManagementBusy || dataManagementProgress?.actionId !== options.actionId) return;

    syncMessage = `${options.actionLabel}: deleting local data, writing tombstones, and verifying the result...`;
    setDataManagementProgress(
      options,
      'running',
      'Deleting local rows, writing sync tombstones, and verifying the result...',
    );
    options.redraw();

    options.run().then(result => {
      syncStatus = result.success ? 'done' : 'error';
      syncMessage = result.success ? result.message : `Error: ${result.message}`;
      setDataManagementProgress(
        options,
        result.success ? 'done' : 'error',
        result.success ? dataManagementResultMessage(result) : `Error: ${dataManagementResultMessage(result)}`,
        result.success ? 'Done' : 'Failed',
      );
    }).catch(error => {
      const message = error instanceof Error ? error.message : 'Data-management action failed.';
      syncStatus = 'error';
      syncMessage = `Error: ${message}`;
      setDataManagementProgress(options, 'error', `Error: ${message}`, 'Failed');
    }).finally(() => {
      dataManagementBusy = false;
      refreshAdminData(options.redraw);
      options.redraw();
    });
  }, 0);
}

function doTestConnection(redraw: () => void): void {
  readRemoteSyncToken();
  syncStatus = 'testing';
  syncMessage = '';
  redraw();
  testRemoteSyncConnection().then((result: SyncResult) => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Connected to sync service: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
    redraw();
  });
}

function doSaveToken(redraw: () => void): void {
  const token = tokenInput.trim();
  if (!token) return;

  const previousSessionToken = getRemoteSyncToken();
  const previousPersistedToken = localStorage.getItem(REMOTE_SYNC_TOKEN_KEY);
  setRemoteSyncToken(token);
  syncStatus = 'testing';
  syncMessage = 'Checking admin sync token...';
  redraw();

  testRemoteSyncConnection().then((result: SyncResult) => {
    if (result.success) {
      rememberRemoteSyncToken(token);
      tokenInput = '';
      syncStatus = 'done';
      syncMessage = 'Admin sync token saved and verified.';
    } else {
      restoreRemoteSyncToken(previousSessionToken, previousPersistedToken);
      syncStatus = 'error';
      syncMessage = `Error: ${result.error || 'Invalid admin sync token.'}`;
    }
    redraw();
  });
}

function doPush(redraw: () => void): void {
  syncStatus = 'pushing';
  syncMessage = '';
  redraw();
  pushToRemoteSync().then((result: SyncResult) => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Pushed: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
    refreshAdminData(redraw);
    redraw();
  });
}

function doPull(redraw: () => void): void {
  syncStatus = 'pulling';
  syncMessage = '';
  redraw();
  pullFromRemoteSync().then((result: SyncResult) => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Pulled: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
    refreshAdminData(redraw);
    redraw();
  });
}

function doQueueLocalLibrary(redraw: () => void): void {
  syncStatus = 'pushing';
  syncMessage = 'Scanning local data for items missing from the token database...';
  redraw();
  queueLocalLibraryForRemoteSync().then((result: SyncResult) => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Local library queued: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
    refreshAdminData(redraw);
    redraw();
  });
}

function doDownloadBackup(redraw: () => void): void {
  syncStatus = 'exporting';
  syncMessage = 'Preparing token database backup...';
  backupRestoreBusy = true;
  redraw();
  downloadRemoteSyncBackup().then(result => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Backup downloaded: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
  }).finally(() => {
    backupRestoreBusy = false;
    redraw();
  });
}

function doChooseBackupFile(event: Event, redraw: () => void): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  syncStatus = 'restoring';
  syncMessage = 'Validating backup file...';
  backupRestoreBusy = true;
  backupPreview = null;
  redraw();
  previewRemoteSyncBackupFile(file).then(preview => {
    backupPreview = preview;
    syncStatus = 'done';
    syncMessage = `Backup ready: ${preview.counts.items} item${preview.counts.items === 1 ? '' : 's'}, ${preview.counts.tombstones} tombstone${preview.counts.tombstones === 1 ? '' : 's'}.`;
  }).catch(error => {
    syncStatus = 'error';
    syncMessage = error instanceof Error ? `Error: ${error.message}` : 'Error: Backup preview failed.';
  }).finally(() => {
    backupRestoreBusy = false;
    redraw();
  });
}

function doRestoreBackup(redraw: () => void): void {
  if (!backupPreview) return;
  const message = [
    'Replace the current token database with this backup?',
    '',
    `This will replace ${backupPreview.counts.items} synced row${backupPreview.counts.items === 1 ? '' : 's'} in the current token database.`,
    'Other browsers will be logged out until the admin token is re-entered.',
    'Stale local queued writes from those browsers will not be allowed to upload.',
    '',
    `Backup exported: ${new Date(backupPreview.exportedAt).toLocaleString()}`,
    `Current generation: ${backupPreview.currentSyncGeneration}`,
    `Expected generation after restore: ${backupPreview.expectedSyncGeneration}`,
  ].join('\n');
  if (!window.confirm(message)) return;

  syncStatus = 'restoring';
  syncMessage = 'Replacing token database and pulling restored data...';
  backupRestoreBusy = true;
  redraw();
  restoreRemoteSyncBackup(backupPreview).then(result => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Restore complete: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
    if (result.success) backupPreview = null;
  }).finally(() => {
    backupRestoreBusy = false;
    refreshAdminData(redraw);
    redraw();
  });
}

function doInvalidateOtherBrowsers(redraw: () => void): void {
  const generation = getRemoteSyncGeneration();
  const message = [
    'Invalidate every other browser session for this token?',
    '',
    'Other browsers will be logged out until the admin token is re-entered.',
    'Stale local queued writes from those browsers will not be allowed to upload.',
    generation ? `Current generation: ${generation}` : 'Current generation will be read from the server first.',
  ].join('\n');
  if (!window.confirm(message)) return;

  syncStatus = 'invalidating';
  syncMessage = 'Invalidating other browser sessions...';
  backupRestoreBusy = true;
  redraw();
  invalidateOtherRemoteSyncBrowsers().then(result => {
    syncStatus = result.success ? 'done' : 'error';
    syncMessage = result.success
      ? `Other browsers invalidated: ${formatCounts(result.counts)}`
      : `Error: ${result.error}`;
  }).finally(() => {
    backupRestoreBusy = false;
    redraw();
  });
}

function doClearLichessApiLoginData(redraw: () => void): void {
  const message = [
    'Clear Lichess API login data?',
    '',
    'This removes stale browser-side Lichess OAuth data and the saved Lichess book token for this admin sync identity when the admin token is active.',
    'The sync token, synced settings, and imported games are not removed.',
  ].join('\n');
  if (!window.confirm(message)) return;

  syncStatus = 'clearing-auth';
  syncMessage = 'Clearing Lichess API login data...';
  lichessAuthClearBusy = true;
  redraw();

  clearLichessApiLoginData().then(result => {
    syncStatus = 'done';
    const parts = ['Browser Lichess OAuth state cleared.'];
    if (result.bookAccessDisconnected) parts.push('Saved Lichess book token cleared.');
    if (result.warnings.length) parts.push(result.warnings.join(' '));
    syncMessage = parts.join(' ');
  }).catch(error => {
    syncStatus = 'error';
    syncMessage = error instanceof Error ? `Error: ${error.message}` : 'Error: Failed to clear Lichess API login data.';
  }).finally(() => {
    lichessAuthClearBusy = false;
    redraw();
  });
}

function formatCounts(counts?: Record<string, number>): string {
  if (!counts) return 'no data';
  const entries = Object.entries(counts).filter(([, v]) => v !== 0);
  if (entries.length === 0) return 'no changes';
  return entries.map(([k, v]) => `${v} ${formatCountLabel(k)}`).join(', ');
}

function formatCountLabel(label: string): string {
  return label.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
}

function renderSyncLogEntry(entry: RemoteSyncLogEntry): VNode {
  return h('div.admin-log__entry', {
    class: {
      'admin-log__entry--success': entry.status === 'success',
      'admin-log__entry--error': entry.status === 'error',
      'admin-log__entry--info': entry.status === 'info',
    },
  }, [
    h('div.admin-log__main', [
      h('span.admin-log__action', formatCountLabel(entry.action)),
      h('span.admin-log__message', entry.message),
    ]),
    h('div.admin-log__meta', [
      h('span', new Date(entry.at).toLocaleString()),
      h('span', entry.deviceTag),
      entry.counts ? h('span', formatCounts(entry.counts)) : null,
    ].filter((node): node is VNode => node !== null)),
  ]);
}
