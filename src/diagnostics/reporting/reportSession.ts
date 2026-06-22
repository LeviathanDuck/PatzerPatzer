import { h, type VNode } from 'snabbdom';

export const REPORT_PREVIEW_REQUIRED_MESSAGE = 'Please review your report first.';

export type ReportSubmitAction = 'local-save' | 'remote-submit';

export interface ReportSessionState {
  previewSeen: boolean;
  submitting?: boolean;
}

export type ReportSubmitGateResult =
  | { ok: true }
  | { ok: false; action: ReportSubmitAction; reason: string };

export function createReportSessionState(): ReportSessionState {
  return {
    previewSeen: false,
  };
}

export function markPreviewSeen(state: ReportSessionState): ReportSessionState {
  return {
    ...state,
    previewSeen: true,
  };
}

export function canSubmitReport(state: ReportSessionState): boolean {
  return state.previewSeen && state.submitting !== true;
}

export function getReportSubmitBlockedReason(state: ReportSessionState): string | null {
  if (!state.previewSeen) return REPORT_PREVIEW_REQUIRED_MESSAGE;
  if (state.submitting) return 'Report submission is already in progress.';
  return null;
}

export function checkReportSubmitGate(
  state: ReportSessionState,
  action: ReportSubmitAction,
): ReportSubmitGateResult {
  const reason = getReportSubmitBlockedReason(state);
  return reason ? { ok: false, action, reason } : { ok: true };
}

export function assertReportSubmitAllowed(state: ReportSessionState, action: ReportSubmitAction): void {
  const result = checkReportSubmitGate(state, action);
  if (!result.ok) throw new Error(result.reason);
}

export function renderReportSubmitButton(
  state: ReportSessionState,
  label: string,
  onSubmit: () => void,
): VNode {
  const blockedReason = getReportSubmitBlockedReason(state);
  const disabled = blockedReason !== null;

  return h('div.report-submit-gate', [
    h('button.report-submit-gate__button', {
      attrs: {
        type: 'button',
        disabled,
        title: blockedReason ?? '',
        'aria-disabled': String(disabled),
      },
      on: {
        click: () => {
          if (!canSubmitReport(state)) return;
          onSubmit();
        },
      },
    }, label),
    blockedReason
      ? h('div.report-submit-gate__reason', blockedReason)
      : h('div.report-submit-gate__reason.report-submit-gate__reason--ready', 'Report preview reviewed.'),
  ]);
}
