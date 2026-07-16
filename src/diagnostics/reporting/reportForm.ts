import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs, renderDisabledControlExplainer } from '../../ui/controlExplainer';

export const reportSeverities = ['low', 'medium', 'high', 'critical'] as const;

export type ReportSeverity = typeof reportSeverities[number];

export interface ReportFormState {
  description: string;
  whatHappened: string;
  severity: ReportSeverity;
  expectedBehavior: string;
  actualBehavior: string;
  submitting?: boolean;
}

export interface ReportScreenshotAttachmentView {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ReportFormOptions {
  issueId: string;
  adminTokenAvailable: boolean;
  screenshotAttachments: ReportScreenshotAttachmentView[];
  screenshotErrors: string[];
  draftStatus: string;
  copyMessage: string;
}

export type ReportFormAction =
  | { type: 'description'; value: string }
  | { type: 'whatHappened'; value: string }
  | { type: 'severity'; value: ReportSeverity }
  | { type: 'expectedBehavior'; value: string }
  | { type: 'actualBehavior'; value: string }
  | { type: 'screenshots'; files: File[] }
  | { type: 'flushDraft' }
  | { type: 'copyIssueId' }
  | { type: 'submit' }
  | { type: 'close' }
  | { type: 'discardDraft' };

export type ReportFormDispatch = (action: ReportFormAction) => void;

function readInputValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    ? target.value
    : '';
}

function normalizeSeverity(value: string): ReportSeverity {
  return reportSeverities.includes(value as ReportSeverity) ? value as ReportSeverity : 'medium';
}

function readInputFiles(event: Event): File[] {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.files) return [];
  return Array.from(target.files);
}

function renderScreenshotControls(options: ReportFormOptions, dispatch: ReportFormDispatch): VNode {
  return h('section.report-form__screenshots', [
    h('div.report-form__section-header', [
      h('div', [
        h('span.report-form__label', 'Screenshots'),
        h('span.report-form__hint', options.adminTokenAvailable ? 'Optional admin attachments - max 10' : 'Admin token required'),
      ]),
      options.screenshotAttachments.length > 0
        ? h('button.report-form__link-button', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Clear screenshots',
            description: 'Removes every screenshot attachment from this report draft.',
          }) },
          on: { click: () => dispatch({ type: 'screenshots', files: [] }) },
        }, 'Clear screenshots')
        : null,
    ]),
    options.adminTokenAvailable
      ? h('label.report-form__dropzone', [
        h('span.report-form__dropzone-title', 'Add screenshots'),
        h('span.report-form__dropzone-hint', 'PNG, JPEG, or WebP. Saved locally with this draft until submit or discard.'),
        h('input.report-form__file-input', {
          attrs: {
            type: 'file',
            accept: 'image/png,image/jpeg,image/webp',
            multiple: true,
            'aria-label': 'Add report screenshots',
            ...controlExplainerAttrs({
              label: 'Add report screenshots',
              description: 'Adds image attachments to this local report draft for optional upload on submit.',
            }),
          },
          on: {
            change: (event: Event) => dispatch({ type: 'screenshots', files: readInputFiles(event) }),
          },
        }),
      ])
      : h('p.report-form__muted', 'Save an admin token to attach screenshots to this report.'),
    options.screenshotAttachments.length > 0
      ? h('ul.report-form__attachment-list', options.screenshotAttachments.map(attachment => (
        h('li', [
          h('span.report-form__attachment-name', attachment.fileName),
          h('span.report-form__attachment-meta', `${attachment.mimeType}, ${Math.round(attachment.sizeBytes / 1024)} KB`),
        ])
      )))
      : h('p.report-form__muted', 'No screenshots attached.'),
    ...options.screenshotErrors.map(error => h('p.report-form__error', error)),
  ]);
}

function renderIssueMeta(options: ReportFormOptions, dispatch: ReportFormDispatch): VNode {
  return h('div.report-form__issue-panel', [
    h('div.report-form__issue-id', [
      h('span.report-form__issue-label', 'Issue ID'),
      h('code', options.issueId),
      h('button.report-form__copy-id.admin-btn.admin-btn--muted', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Copy issue ID',
          description: 'Copies this report session identifier to the clipboard.',
        }) },
        on: { click: () => dispatch({ type: 'copyIssueId' }) },
      }, 'Copy ID'),
    ]),
    h('div.report-form__draft-state', [
      h('span.report-form__draft-label', 'Draft'),
      h('span.report-form__draft-value', options.draftStatus),
      options.copyMessage ? h('span.report-form__copy-message', options.copyMessage) : null,
    ]),
  ]);
}

function textAreaField(
  label: string,
  value: string,
  rows: string,
  placeholder: string,
  inputType: ReportFormAction['type'],
  dispatch: ReportFormDispatch,
  extraClass = '',
): VNode {
  return h('label.report-form__field', [
    h('span.report-form__label', label),
    h(`textarea.report-form__textarea.admin-token-input${extraClass}`, {
      attrs: {
        rows,
        placeholder,
        'aria-label': label,
        ...controlExplainerAttrs({ label }),
      },
      props: {
        value,
      },
      on: {
        input: (event: Event) => dispatch({ type: inputType, value: readInputValue(event) } as ReportFormAction),
        blur: () => dispatch({ type: 'flushDraft' }),
      },
    }),
  ]);
}

export function renderReportForm(state: ReportFormState, dispatch: ReportFormDispatch, options: ReportFormOptions): VNode {
  const canSubmit = !state.submitting && options.screenshotErrors.length === 0;
  const submitLabel = state.submitting ? 'Submitting report' : 'Review report';
  const submitExplainer = {
    label: submitLabel,
    description: state.submitting
      ? 'This report is already being prepared for submission.'
      : options.screenshotErrors.length > 0
        ? 'Fix or remove invalid screenshot attachments before reviewing the report.'
        : 'Opens the final redacted preview before the report can be saved or uploaded.',
  };
  const submitButton = h('button.report-form__submit.admin-btn.admin-btn--primary', {
    attrs: {
      type: 'submit',
      disabled: !canSubmit,
      ...controlExplainerAttrs(submitExplainer),
    },
  }, state.submitting ? 'Submitting...' : 'Submit');

  return h('form.report-form', {
    on: {
      submit: (event: Event) => {
        event.preventDefault();
        if (canSubmit) dispatch({ type: 'submit' });
      },
    },
  }, [
    renderIssueMeta(options, dispatch),
    textAreaField(
      'What happened?',
      state.description,
      '5',
      'Optional short summary of the issue.',
      'description',
      dispatch,
      '.report-form__textarea--description',
    ),
    textAreaField(
      'What were you doing?',
      state.whatHappened,
      '4',
      'Optional action or workflow that led to the issue.',
      'whatHappened',
      dispatch,
    ),
    h('label.report-form__field', [
      h('span.report-form__label', 'Severity'),
      h('select.report-form__select.admin-token-input', {
        attrs: { 'aria-label': 'Report severity', ...controlExplainerAttrs({
          label: 'Report severity',
          description: 'Classifies how seriously this issue affected the current workflow.',
        }) },
        props: {
          value: state.severity,
        },
        on: {
          change: (event: Event) => dispatch({ type: 'severity', value: normalizeSeverity(readInputValue(event)) }),
          blur: () => dispatch({ type: 'flushDraft' }),
        },
      }, reportSeverities.map(severity =>
        h('option', {
          attrs: { value: severity },
          props: { selected: state.severity === severity },
        }, severity),
      )),
    ]),
    textAreaField('Expected behavior', state.expectedBehavior, '4', 'Optional', 'expectedBehavior', dispatch),
    textAreaField('Actual behavior', state.actualBehavior, '4', 'Optional', 'actualBehavior', dispatch),
    renderScreenshotControls(options, dispatch),
    h('div.report-form__actions', [
      h('button.report-form__discard.admin-btn.admin-btn--danger', {
        attrs: {
          type: 'button',
          ...controlExplainerAttrs({
            label: 'Discard report draft',
            description: 'Permanently removes the saved draft and its local screenshot attachments.',
          }),
        },
        on: {
          click: () => dispatch({ type: 'discardDraft' }),
        },
      }, 'Discard draft'),
      h('button.report-form__close.admin-btn.admin-btn--muted', {
        attrs: {
          type: 'button',
          ...controlExplainerAttrs({ label: 'Close report form' }),
        },
        on: {
          click: () => dispatch({ type: 'close' }),
        },
      }, 'Close'),
      canSubmit ? submitButton : renderDisabledControlExplainer(submitExplainer, submitButton),
    ]),
  ]);
}
