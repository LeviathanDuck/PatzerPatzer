






















import { h, type VNode } from 'snabbdom';
import type QuestionnaireCtrl from './questionnaireCtrl';
import { findQuestionnaireOption, type QuestionnaireOption } from './model';

const ICON_PATHS: Record<string, string> = {
  'book-open': '<path d="M2 4h5a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2Z"/><path d="M22 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6Z"/>',
  'alert-triangle': '<path d="m21.7 18.4-8.2-14a1.7 1.7 0 0 0-3 0l-8.2 14A1.7 1.7 0 0 0 3.8 21h16.4a1.7 1.7 0 0 0 1.5-2.6Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9 16.2 7.8"/>',
  map: '<path d="M3 6.4v13.2a1 1 0 0 0 1.4.9L9 18l6 2.5 5-2V4.9a1 1 0 0 0-1.4-.9L14 6 9 3.5 3.6 5.5A1 1 0 0 0 3 6.4Z"/><path d="M9 3.5v14.8"/><path d="M15 6v14.5"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  'shield-check': '<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
  'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  'circle-slash': '<circle cx="12" cy="12" r="10"/><line x1="5" y1="19" x2="19" y2="5"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  heart: '<path d="M12 20s-6.5-4.1-9-8.6C1 8.4 2 5 5.4 4.4c2-.4 3.9.6 5.1 2.3 1.2-1.7 3.1-2.7 5.1-2.3C19 5 20 8.4 18 11.4c-2.5 4.5-9 8.6-9 8.6Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z"/><path d="M5 20h14"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
  'eye-off': '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6 0 10 8 10 8a17.5 17.5 0 0 1-2.16 3.19"/><path d="M6.1 6.1C3.6 7.7 2 10 2 10s4 8 10 8a9 9 0 0 0 4.9-1.44"/><path d="M9.5 9.5a3 3 0 0 0 4.24 4.24"/><line x1="2" y1="2" x2="22" y2="22"/>',
  'piece-drop': '<circle cx="10" cy="6" r="2.4"/><path d="M7.5 11c0-1.5 1-2.7 2.5-2.7s2.5 1.2 2.5 2.7l1 6H6.5Z"/><path d="M5.5 20h9"/><path d="M17 5l3 2"/><path d="M18 9l3 1"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 3 1.5 4.5 2.5 6 .5.7.5 1.5.5 2h10c0-.5 0-1.3.5-2 1-1.5 2.5-3 2.5-6a8 8 0 0 0-8-8Z"/><circle cx="9" cy="11" r="1.4"/><circle cx="15" cy="11" r="1.4"/><path d="M9.5 19v2"/><path d="M14.5 19v2"/>',
  'check-circle-2': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H20"/><path d="m17 2 4 4-4 4"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l6.1 8.6c.8 1.1 2 1.7 3.3 1.7H20"/><path d="m17 14 4 4-4 4"/>',
  lightbulb: '<path d="M15 14c.5-.9 1-1.6 1.8-2.4A6 6 0 0 0 6 8c0 1.5.3 2.5 1.7 4 .7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  shrink: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  library: '<path d="M3 21V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v17"/><path d="M9 21V8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v13"/><path d="m16.5 5.5 2.8 1a1 1 0 0 1 .6 1.3l-4.9 14a1 1 0 0 1-1.3.6l-1-.4"/>',
  'thumbs-up': '<path d="M7 22V11"/><path d="M2 13v7a2 2 0 0 0 2 2h1"/><path d="M22 11a2 2 0 0 0-2-2h-6.31l.95-4.57a2 2 0 0 0-2-2.43l-.14.03A2 2 0 0 0 11 3.5V9H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h13a2 2 0 0 0 2-1.7l1-6a2 2 0 0 0 0-.3Z"/>',
  'thumbs-down': '<path d="M17 2v11"/><path d="M22 11V4a2 2 0 0 0-2-2h-1"/><path d="M2 13a2 2 0 0 0 2 2h6.31l-.95 4.57a2 2 0 0 0 2 2.43l.14-.03A2 2 0 0 0 13 20.5V15h7a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 1.7l-1 6a2 2 0 0 0 0 .3Z"/>',
};

function icon(slug: string, size?: 'sm' | 'lg'): VNode {
  const inner = ICON_PATHS[slug] ?? '';
  const cls = size ? `oi oi--${size}` : 'oi';
  return h('span.qnr-icon', {
    props: { innerHTML: `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>` },
  });
}

type Weight = 'win' | 'loss';

function optionTile(
  opt: QuestionnaireOption,
  weight: Weight,
  picked: boolean,
  rank: number | null,
  disabled: boolean,
  onClick: () => void,
): VNode {
  return h('button.qnr-opt-tile', {
    class: {
      [`qnr-opt-tile--fam-${opt.family}`]: true,
      'qnr-opt-tile--win': weight === 'win',
      'qnr-opt-tile--loss': weight === 'loss',
      'qnr-opt-tile--picked': picked,
      'qnr-opt-tile--disabled': disabled,
    },
    attrs: { type: 'button', disabled },
    on: disabled ? {} : { click: onClick },
  }, [
    icon(opt.icon),
    h('span.qnr-opt-tile__label', opt.label),
    rank
      ? h('span.qnr-rank-badge', { class: { 'qnr-rank-badge--primary': rank === 1 } }, String(rank))
      : null,
  ]);
}

function footRow(
  showBack: boolean,
  onBack: () => void,
  onSkip: (() => void) | null,
  skipLabel = 'Skip (optional) ▶',
): VNode {
  return h('div.qnr-wiz__foot', [
    h('button.qnr-wiz__link', {
      class: { 'qnr-wiz__link--hidden': !showBack },
      attrs: { type: 'button' },
      on: { click: onBack },
    }, '◀ Back'),
    onSkip
      ? h('button.qnr-wiz__link', { attrs: { type: 'button' }, on: { click: onSkip } }, skipLabel)
      : null,
  ]);
}

// ---- §06 draw pre-question ----
function renderDrawPathwayStage(ctrl: QuestionnaireCtrl): VNode {
  return h('div', [
    h('div.qnr-wiz__q', 'Did this draw feel like a win or a loss?'),
    h('div.qnr-wiz__sub', `${ctrl.cfg.context.line} · result: draw`),
    h('div.qnr-wiz__yn', [
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickDrawPathway('win') },
      }, [icon('thumbs-up'), ' Felt like a win']),
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickDrawPathway('loss') },
      }, [icon('thumbs-down'), ' Felt like a loss']),
    ]),
  ]);
}

// ---- §02 Game story: single-select, unchanged from v1 apart from tile treatment ----
function renderStoryStage(ctrl: QuestionnaireCtrl): VNode {
  const weight: Weight = ctrl.branch ?? 'win';
  return h('div', [
    h('div.qnr-wiz__q', 'Game story — single-select'),
    h('div.qnr-opt-grid', ctrl.storyOptions.map(opt => optionTile(
      opt, weight, ctrl.story === opt.id, null, false, () => ctrl.pickStory(opt.id),
    ))),
    footRow(ctrl.canGoBack, () => ctrl.back(), null),
  ]);
}

// ---- §03 Decider: ranked multi-select, cap 3, click order = rank, re-tap deselects ----
function renderDeciderStage(ctrl: QuestionnaireCtrl): VNode {
  const weight: Weight = ctrl.branch ?? 'win';
  return h('div', [
    h('div.qnr-wiz__q', 'Decider — up to 3, ranked by pick order'),
    h('div.qnr-wiz__sub', 'What decided the result? Pick your top reasons in order of importance.'),
    h('div.qnr-opt-grid', ctrl.deciderOptions.map(opt => {
      const idx = ctrl.deciders.indexOf(opt.id);
      const picked = idx > -1;
      const disabled = !picked && ctrl.deciderFull;
      return optionTile(opt, weight, picked, picked ? idx + 1 : null, disabled, () => ctrl.toggleDecider(opt.id));
    })),
    h('div.qnr-wiz__status', ctrl.deciderStatusText),
    h('div.qnr-wiz__foot', [
      h('button.qnr-wiz__link', {
        class: { 'qnr-wiz__link--hidden': !ctrl.canGoBack },
        attrs: { type: 'button' },
        on: { click: () => ctrl.back() },
      }, '◀ Back'),
      h('button.qnr-wiz__link', {
        attrs: { type: 'button', disabled: !ctrl.canContinueDecider },
        on: { click: () => ctrl.continueFromDecider() },
      }, 'Continue ▶'),
    ]),
  ]);
}

// ---- §04 Opening Eval: optional, its own verdict branch, unchanged structure from v1 ----
function renderOpeningEvalStage(ctrl: QuestionnaireCtrl): VNode {
  const body: Array<VNode | null> = [h('div.qnr-wiz__q', 'Opening Eval — optional, single-select')];
  if (!ctrl.openingEvalVerdict) {
    body.push(h('div.qnr-wiz__yn', [
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickOpeningVerdict('approved') },
      }, 'Approved'),
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickOpeningVerdict('needswork') },
      }, 'Needs Work'),
    ]));
  } else {
    const weight: Weight = ctrl.openingEvalVerdict === 'approved' ? 'win' : 'loss';
    body.push(h('div.qnr-opt-grid', ctrl.openingEvalOptions.map(opt => optionTile(
      opt, weight, ctrl.openingEvalOption === opt.id, null, false, () => ctrl.pickOpeningOption(opt.id),
    ))));
  }
  body.push(footRow(ctrl.canGoBack, () => ctrl.back(), () => ctrl.skipOpeningEval()));
  return h('div', body);
}

// ---- §05 action wire 1: Repetition Practice ----
function renderRepPracticeStage(ctrl: QuestionnaireCtrl): VNode {
  const body: Array<VNode | null> = [
    h('div.qnr-wiz__q', 'Did this game have lines you want to add to repetition practice?'),
  ];
  if (ctrl.repFlagged === null && !ctrl.repAskingSource) {
    body.push(h('div.qnr-wiz__yn', [
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickRepFlag(true) },
      }, [icon('route'), ' Yes']),
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickRepFlag(false) },
      }, 'No'),
    ]));
  } else if (ctrl.repAskingSource && ctrl.repSource === null) {
    body.push(h('div.qnr-wiz__sub', 'Line from the game, or a variation you explored on the tree?'));
    body.push(h('div.qnr-wiz__yn', ctrl.repPracticeSources.map(({ label, source }) => (
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickRepSource(source) },
      }, label)
    ))));
  } else if (ctrl.repFlagged === false) {
    body.push(h('div.qnr-wiz__confirm', 'No flag set.'));
  } else {
    const sourceLabel = ctrl.repPracticeSources.find(s => s.source === ctrl.repSource)?.label ?? '';
    body.push(h('div.qnr-wiz__confirm', `Queued for the ORP practice queue (P2-ANL-6 / P2-ORP-2): ${sourceLabel}`));
  }
  body.push(footRow(ctrl.canGoBack, () => ctrl.back(), null));
  return h('div', body);
}

// ---- §05 action wire 2: Study material ----
function renderStudyMaterialStage(ctrl: QuestionnaireCtrl): VNode {
  const body: Array<VNode | null> = [
    h('div.qnr-wiz__q', 'Do you need to find study material based off this game?'),
  ];
  if (ctrl.needsStudyMaterial === null) {
    body.push(h('div.qnr-wiz__yn', [
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickNeedsStudyMaterial(true) },
      }, [icon('library'), ' Yes']),
      h('button.qnr-wiz__yn-btn', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickNeedsStudyMaterial(false) },
      }, 'No'),
    ]));
  } else {
    body.push(h('div.qnr-wiz__confirm', ctrl.needsStudyMaterial
      ? 'Flag set: "needs study material" (P2-LIB-9 search facet)'
      : 'No flag set.'));
  }
  body.push(footRow(ctrl.canGoBack, () => ctrl.back(), null));
  return h('div', body);
}

// ---- §07 satisfied state: open-circle→filled cue is reused verbatim (P2-QST-2, approved) ----
function renderChip(opt: QuestionnaireOption, suffix?: string): VNode {
  return h('span.qnr-chip', {
    class: { [`qnr-chip--fam-${opt.family}`]: true },
  }, [
    icon(opt.icon, 'sm'),
    h('span', suffix ? `${opt.label} ${suffix}` : opt.label),
  ]);
}

function renderSummaryStage(ctrl: QuestionnaireCtrl): VNode {
  const completion = ctrl.completion;
  const chips: VNode[] = [];
  if (completion) {
    const storyOpt = findQuestionnaireOption(ctrl.storyOptions, completion.answers.story);
    if (storyOpt) chips.push(renderChip(storyOpt));

    const primaryId = completion.answers.deciders[0];
    const primaryOpt = primaryId ? findQuestionnaireOption(ctrl.deciderOptions, primaryId) : undefined;
    if (primaryOpt) chips.push(renderChip(primaryOpt, '(primary)'));

    // Only the primary (rank 1) Decider surfaces here — ranks 2-3 stay in the left-column
    // record (Phase 2, out of scope), shown as a de-emphasized ghost chip per v2 §03/§08.
    if (completion.answers.deciders.length > 1) {
      chips.push(h('span.qnr-chip.qnr-chip--ghost', `+${completion.answers.deciders.length - 1} contributing (left-column only)`));
    }

    if (completion.answers.openingEval) {
      const evalOpt = findQuestionnaireOption(ctrl.openingEvalOptions, completion.answers.openingEval.option);
      if (evalOpt) chips.push(renderChip(evalOpt));
    }
  }

  return h('div.qnr-module', [
    h('div.qnr-module__title', [
      h('div.qnr-module__title-main', [
        h('span.qnr-pulse.qnr-pulse--satisfied', '✓'),
        h('span', 'Studied'),
      ]),
    ]),
    h('div.qnr-module__body', [
      h('div.qnr-chips', chips),
      h('div.qnr-module__foot', [
        h('button.qnr-wiz__link', {
          attrs: { type: 'button' },
          on: { click: () => ctrl.editRequested() },
        }, 'Edit answers → left column'),
      ]),
    ]),
  ]);
}

function renderStageBody(ctrl: QuestionnaireCtrl): VNode {
  switch (ctrl.stage) {
    case 'draw-pathway': return renderDrawPathwayStage(ctrl);
    case 'story': return renderStoryStage(ctrl);
    case 'decider': return renderDeciderStage(ctrl);
    case 'opening-eval': return renderOpeningEvalStage(ctrl);
    case 'rep-practice': return renderRepPracticeStage(ctrl);
    case 'study-material': return renderStudyMaterialStage(ctrl);
    case 'summary': return renderSummaryStage(ctrl);
  }
}

function renderWizChrome(ctrl: QuestionnaireCtrl, body: VNode): VNode {
  const dots: VNode[] = [];
  for (let i = 0; i < ctrl.stepCount; i++) {
    dots.push(h('span.qnr-wiz__dot', {
      class: {
        'qnr-wiz__dot--active': i === ctrl.stepNumber - 1,
        'qnr-wiz__dot--done': i < ctrl.stepNumber - 1,
      },
    }));
  }
  return h('div.qnr-wiz', [
    h('div.qnr-wiz__top', [
      h('span.qnr-wiz__label', `Step ${ctrl.stepNumber} of ${ctrl.stepCount}`),
      h('div.qnr-wiz__dots', dots),
      h('button.qnr-wiz__restart', {
        attrs: { type: 'button' },
        on: { click: () => ctrl.restart() },
      }, 'restart'),
    ]),
    h('div.qnr-wiz__stage', [body]),
  ]);
}

export default function renderQuestionnaire(ctrl: QuestionnaireCtrl): VNode {
  if (ctrl.stage === 'summary') return renderSummaryStage(ctrl);
  return renderWizChrome(ctrl, renderStageBody(ctrl));
}
