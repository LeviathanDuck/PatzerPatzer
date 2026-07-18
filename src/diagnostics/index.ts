export { record, breadcrumb, snapshotBreadcrumbs, tag, getSessionTags } from './record';
export { getSessionId } from './id';
export { Severity } from './types';
export { reportIssue, type ReportContext, type ReportSession } from './reporting/reportAction';
export {
  assembleBugPackage,
  copyBugPackageToClipboard,
  downloadBugPackageAsJson,
  type AssembleBugPackageOptions,
} from './reporting/bugPackage';
export {
  renderReportForm,
  reportSeverities,
  type ReportFormAction,
  type ReportFormDispatch,
  type ReportFormState,
  type ReportSeverity,
} from './reporting/reportForm';

// DiagnosticEvent.sourceTag is the durable producer label used by owner/admin
// diagnostics views. Canonical tags include app, console.warn, console.error,
// engine, idb, sync, review-queue, window.error, and window.unhandledrejection.
// Direct record() callers may pass a custom sourceTag; omitted sourceTag
// defaults to app in the recording API.
export type {
  Breadcrumb,
  DiagnosticEvent,
  DiagnosticSession,
  EventKind,
  RedactionClass,
  BugPackage,
  BugPackagePerformanceSummary,
  BugPackageRouteContext,
  DiagnosticErrorGroup,
} from './types';
