import { h, type VNode } from 'snabbdom';

export const reportSeverities = ['low', 'medium', 'high', 'critical'] as const;

export type ReportSeverity = typeof reportSeverities[number];

export interface ReportFormState {
  description: string;
  severity: ReportSeverity;
  expectedBehavior: string;
  actualBehavior: string;
  submitting?: boolean;
}

export type ReportFormAction =
  | { type: 'description'; value: string }
  | { type: 'severity'; value: ReportSeverity }
  | { type: 'expectedBehavior'; value: string }
  | { type: 'actualBehavior'; value: string }
  | { type: 'submit' }
  | { type: 'cancel' };

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

export function renderReportForm(state: ReportFormState, dispatch: ReportFormDispatch): VNode {
  const canSubmit = state.description.trim().length > 0 && !state.submitting;

  return h('form.report-form', {
    on: {
      submit: (event: Event) => {
        event.preventDefault();
        if (canSubmit) dispatch({ type: 'submit' });
      },
    },
  }, [
    h('label.report-form__field', [
      h('span.report-form__label', 'What happened?'),
      h('textarea.report-form__textarea.report-form__textarea--description', {
        attrs: {
          required: true,
          minlength: '1',
          rows: '5',
          placeholder: 'Describe the issue.',
        },
        props: {
          value: state.description,
        },
        on: {
          input: (event: Event) => dispatch({ type: 'description', value: readInputValue(event) }),
        },
      }),
    ]),
    h('label.report-form__field', [
      h('span.report-form__label', 'Severity'),
      h('select.report-form__select', {
        props: {
          value: state.severity,
        },
        on: {
          change: (event: Event) => dispatch({ type: 'severity', value: normalizeSeverity(readInputValue(event)) }),
        },
      }, reportSeverities.map(severity =>
        h('option', {
          attrs: { value: severity },
          props: { selected: state.severity === severity },
        }, severity),
      )),
    ]),
    h('label.report-form__field', [
      h('span.report-form__label', 'Expected behavior'),
      h('textarea.report-form__textarea', {
        attrs: {
          rows: '4',
          placeholder: 'Optional',
        },
        props: {
          value: state.expectedBehavior,
        },
        on: {
          input: (event: Event) => dispatch({ type: 'expectedBehavior', value: readInputValue(event) }),
        },
      }),
    ]),
    h('label.report-form__field', [
      h('span.report-form__label', 'Actual behavior'),
      h('textarea.report-form__textarea', {
        attrs: {
          rows: '4',
          placeholder: 'Optional',
        },
        props: {
          value: state.actualBehavior,
        },
        on: {
          input: (event: Event) => dispatch({ type: 'actualBehavior', value: readInputValue(event) }),
        },
      }),
    ]),
    h('div.report-form__actions', [
      h('button.report-form__submit', {
        attrs: {
          type: 'submit',
          disabled: !canSubmit,
        },
      }, state.submitting ? 'Submitting...' : 'Submit'),
      h('button.report-form__cancel', {
        attrs: {
          type: 'button',
        },
        on: {
          click: () => dispatch({ type: 'cancel' }),
        },
      }, 'Cancel'),
    ]),
  ]);
}
