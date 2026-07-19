




















import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs } from '../../ui/controlExplainer';
import type {
  DueReviewSession,
  DueReviewScorecard,
  DueReviewScorecardFolder,
  PracticeSelectedSession,
} from './sessionBuilder';
import type { SrsTraversalPlanEntry } from './srsTypes';

// --- The internal sub-tab set (NOT a StudyToolTabId — D12 consult §3) -------
// Learn / Review / Practice / Progress are an INTERNAL sub-tab set inside the practice panel. They are
// NOT new `StudyToolTabId`s: adding those would edit `navigatorShellView.ts` (a forbidden 4th file).
// The active tab is HOST-PASSED (`props.activeTab` + `props.onSelectTab`) so the view stays pure.
export type PracticePanelTab = 'learn' | 'review' | 'practice' | 'progress';

export const PRACTICE_PANEL_TABS: readonly PracticePanelTab[] = ['learn', 'review', 'practice', 'progress'];

// --- Per-tab data shapes (all host-supplied; the view assembles nothing) ----

/** One not-yet-learned line the Learn entry list offers to start. Neutral language — no due/accuracy. */
export interface LearnEntry {
  readonly id: string;
  readonly label: string;
  readonly onStart?: () => void;
}

/** Learn tab: neutral guided-recall entry. When a Learn session is live the HOST hands us the already
 *  rendered drill body (`active`) — the view never imports `drillView` (host-neutral; keeps it pure). */
export type LearnTabData =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'active'; readonly body: VNode }
  | { readonly status: 'ready'; readonly entries: readonly LearnEntry[] };

/** Review tab (Review due, D10b): SCHEDULE language only. `dueEntries` = `session.plan.entries`;
 *  `upcoming` = `upcomingTargets(plan, progress, n)`. `nowMs` is a host-supplied instant (no clock read
 *  in the view). `ladderLabelFor` maps a target to a P2-ORP-12 ladder stage label (host owns the config
 *  the label derives from); omitted ⇒ no ladder chip. */
export interface ReviewReadyData {
  readonly session: DueReviewSession;
  readonly upcoming: readonly SrsTraversalPlanEntry[];
  readonly nowMs: number;
  readonly ladderLabelFor?: (entry: SrsTraversalPlanEntry) => string | undefined;
  readonly onStart?: () => void;
  readonly onResume?: () => void;
  /** True when a frozen session is resumable rather than freshly started. */
  readonly resumable?: boolean;
}
export type ReviewTabData =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'empty' }
  | ({ readonly status: 'ready' } & ReviewReadyData);

/** Clean-metrics for one Practice-learned target (scorecard language; NEVER a schedule). */
export interface PracticeCleanMetrics {
  readonly attempts: number;
  readonly clean: number;
}

/** Practice tab (Practice selected, D11): the VISIBLE Learn/Practice split. `learnTargetIds` enroll on a
 *  clean recall (routed to D9) — shown WITHOUT a due date (not scheduled yet). `practiceTargetIds` are
 *  SCHEDULE-NEUTRAL (P2-ORP-14) — scored for the scorecard, NEVER handed to the adapter, and rendered
 *  with clean-metrics only. `labelFor` maps an id to its display label; `metricsFor` supplies optional
 *  clean-metrics for a practice id. NO schedule resolver is accepted here — schedule is not expressible
 *  on this tab by construction. */
export interface PracticeReadyData {
  readonly session: PracticeSelectedSession;
  readonly labelFor?: (targetId: string) => string;
  readonly metricsFor?: (targetId: string) => PracticeCleanMetrics | undefined;
  readonly onStart?: () => void;
}
export type PracticeTabData =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'empty' }
  | ({ readonly status: 'ready' } & PracticeReadyData);

/** One persistent success-rate log row (P2-ORP-11 append-only log), host-supplied + read-only. */
export interface SuccessRateLogEntry {
  readonly label: string;
  readonly accuracy: number;
  readonly total: number;
}

/** Progress tab (Progress): SCORECARD language only — per-folder accuracy/clean + session roll-up +
 *  the persistent success-rate log. */
export interface ProgressReadyData {
  readonly scorecard: DueReviewScorecard;
  readonly successRateLog?: readonly SuccessRateLogEntry[];
  /** Optional drill-into a folder row (More-Help). */
  readonly onOpenFolder?: (folder: string) => void;
}

export interface ProgressLessonOption {
  readonly lessonId: string;
  readonly label: string;
}

export type ProgressTabData =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'empty' }
  | ({ readonly status: 'ready' } & ProgressReadyData & { readonly onBack?: () => void })
  /** the private implementation record: the global mount's drill-down — pick a Study, its per-lesson fold loads. */
  | { readonly status: 'picker'; readonly lessons: readonly ProgressLessonOption[]; readonly onSelect: (lessonId: string) => void };

/** The full host-supplied props for the practice panel. Pure inputs + callbacks; no ambient state. */
/** One bounded Recent-drills entry (§13 "Recent drills … live in the Practice panel"). */
export interface PanelDrillEntry {
  readonly label: string;
  readonly sublabel?: string;
  readonly resumable: boolean;

  readonly onOpen: () => void;
}



export interface PanelDrillsSection {
  readonly recent: readonly PanelDrillEntry[];
  readonly onOpenCatalog: () => void;
  /** Study mount only: the per-Study catalog scope (§13 "View all drills from this Study"). */
  readonly onViewAllFromStudy?: () => void;
}

export interface PracticePanelProps {
  readonly activeTab: PracticePanelTab;
  readonly onSelectTab: (tab: PracticePanelTab) => void;
  readonly learn: LearnTabData;
  readonly review: ReviewTabData;
  readonly practice: PracticeTabData;
  readonly progress: ProgressTabData;

  readonly drills?: PanelDrillsSection;
}

// --- Copy, localized in two clearly-named maps so the vocabularies cannot drift (§8 risk #5) ---------

/** SCHEDULE vocabulary — Review tab only. Never referenced by the Practice/Progress renderers. */
const scheduleCopy = {
  dueHeading: 'Due for review',
  upcomingHeading: 'Upcoming',
  due: 'Due',
  overdue: 'Overdue',
  nextReview: 'Next review',
  emptyTitle: 'Nothing due',
  emptyBody: 'No reviews are due right now. Check back later or practice selected lines instead.',
  startLabel: 'Start review',
  startDescription: 'Begins the due-review session for the lines scheduled now.',
  resumeLabel: 'Resume review',
  resumeDescription: 'Continues the frozen due-review session where you left off.',
} as const;

/** SCORECARD vocabulary — Progress + Practice tabs. Never references due/next-review. */
const scorecardCopy = {
  progressHeading: 'Per-folder accuracy',
  rollUpHeading: 'This session',
  successRateHeading: 'Success rate over time',
  accuracy: 'Accuracy',
  clean: 'Clean',
  failed: 'Failed',
  assisted: 'Assisted',
  attempts: 'Attempts',
  emptyTitle: 'No attempts yet',
  emptyBody: 'Finish a Learn or Practice session to build your accuracy scorecard.',
  learningGroup: 'Learning these',
  learningNote: 'A clean recall starts tracking these for review.',
  practiceGroup: 'Already learned — practice only',
  practiceNote: "Practice — won't affect your review schedule.",
  practiceEmptyTitle: 'No lines selected',
  practiceEmptyBody: 'Select lines from the list to practice them.',
  practiceStartLabel: 'Start practice',
  practiceStartDescription: 'Practices the selected lines. Already-learned lines stay schedule-neutral.',
} as const;

const TAB_META: Record<PracticePanelTab, { readonly label: string; readonly description: string }> = {
  learn: { label: 'Learn', description: 'Guided recall for lines you have not learned yet.' },
  review: { label: 'Review', description: 'Spaced reviews that are due now.' },
  practice: { label: 'Practice', description: 'Practice selected lines without changing your schedule.' },
  progress: { label: 'Progress', description: 'Your accuracy per folder.' },
};

// --- Small pure formatters (no clock; `nowMs` is always a passed instant) ---

function formatAccuracy(accuracy: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, accuracy)) * 100);
  return `${pct}%`;
}

/** Pure due/overdue + relative next-review text from a FROZEN dueAt vs a HOST-supplied instant. The
 *  view reads no clock — `nowMs` is passed in (mirrors the sessionBuilder "explicit instant" posture).
 *  SCHEDULE vocabulary; only ever called from `renderReviewTab`. */
function formatSchedule(dueAt: number, nowMs: number): { readonly state: 'due' | 'overdue' | 'scheduled'; readonly text: string } {
  const deltaMs = dueAt - nowMs;
  if (deltaMs <= 0) {
    const overdueBy = Math.floor(-deltaMs / 86_400_000);
    return { state: overdueBy >= 1 ? 'overdue' : 'due', text: overdueBy >= 1 ? `${scheduleCopy.overdue} · ${overdueBy}d` : scheduleCopy.due };
  }
  const inDays = Math.ceil(deltaMs / 86_400_000);
  return { state: 'scheduled', text: `${scheduleCopy.nextReview} · ${inDays}d` };
}

// --- Tab strip (ARIA tablist; roving arrow-key nav; no label-echo tooltips) --

function renderTabStrip(props: PracticePanelProps): VNode {
  return h(
    'div.orp-practice__tabs',
    {
      attrs: { role: 'tablist', 'aria-label': 'Practice activities', ...controlExplainerAttrs({ label: 'Practice activities' }) },
      on: {
        keydown: (event: KeyboardEvent) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
          // Arrow keys move WITHIN the tab strip only; they never reach board arrow-nav (P2-ORP-21:
          // no accidental assistance). Bounded, synchronous.
          event.preventDefault();
          const idx = PRACTICE_PANEL_TABS.indexOf(props.activeTab);
          let next = idx;
          if (event.key === 'ArrowRight') next = (idx + 1) % PRACTICE_PANEL_TABS.length;
          else if (event.key === 'ArrowLeft') next = (idx - 1 + PRACTICE_PANEL_TABS.length) % PRACTICE_PANEL_TABS.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = PRACTICE_PANEL_TABS.length - 1;
          const tab = PRACTICE_PANEL_TABS[next];
          if (tab && tab !== props.activeTab) props.onSelectTab(tab);
        },
      },
    },
    PRACTICE_PANEL_TABS.map((tab) => {
      const meta = TAB_META[tab];
      const selected = props.activeTab === tab;
      return h(
        'button.orp-practice__tab',
        {
          key: tab,
          class: { 'orp-practice__tab--active': selected },
          attrs: {
            type: 'button',
            role: 'tab',
            id: `orp-practice-tab-${tab}`,
            'aria-selected': String(selected),
            'aria-controls': `orp-practice-panel-${tab}`,
            tabindex: selected ? '0' : '-1',
            // More-Help: visible-text tab; describe the destination, never echo the label (§5).
            ...controlExplainerAttrs({ label: meta.label, description: meta.description }),
          },
          on: { click: () => { if (!selected) props.onSelectTab(tab); } },
        },
        meta.label,
      );
    }),
  );
}

// --- State primitives -------------------------------------------------------

function renderLoading(message: string): VNode {
  return h('div.orp-practice__state.orp-practice__state--loading', { attrs: { 'aria-busy': 'true' } }, [
    h('div.orp-practice__skeleton', { attrs: { 'aria-hidden': 'true' } }),
    h('span.orp-practice__state-text', message),
  ]);
}

function renderError(message: string): VNode {
  return h('div.orp-practice__state.orp-practice__state--error', { attrs: { role: 'alert' } }, message);
}

function renderEmpty(title: string, body: string): VNode {
  return h('div.orp-practice__state.orp-practice__state--empty', [
    h('div.orp-practice__state-title', title),
    h('div.orp-practice__state-body', body),
  ]);
}

// --- Learn tab (neutral language — no due/accuracy claims on the entry list) -

function renderLearnTab(data: LearnTabData): VNode {
  if (data.status === 'loading') return renderLoading('Loading lines…');
  if (data.status === 'error') return renderError(data.message);
  if (data.status === 'active') return h('div.orp-practice__learn-active', [data.body]);
  if (data.entries.length === 0) return renderEmpty('No lines to learn', 'Every line here is already learned. Practice or review them instead.');
  return h('ul.orp-practice__learn-list', { attrs: { 'aria-label': 'Lines to learn' } }, data.entries.map((entry) =>
    h('li.orp-practice__learn-row', { key: entry.id }, [
      h('span.orp-practice__learn-label', entry.label),
      entry.onStart
        ? h('button.orp-practice__learn-start', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: `Learn ${entry.label}`, description: 'Starts a guided-recall session for this line.', tier: 'essential' }) },
            on: { click: entry.onStart },
          }, 'Learn')
        : null,
    ]),
  ));
}

// --- Review tab (SCHEDULE vocabulary ONLY) -----------------------------------

function renderScheduleEntry(entry: SrsTraversalPlanEntry, nowMs: number, ladderLabel: string | undefined): VNode {
  const schedule = formatSchedule(entry.frozenSchedule.dueAt, nowMs);
  return h('li.orp-practice__due-row', { key: entry.targetId }, [
    h('span.orp-practice__due-label', entry.frozenSource.label),
    // Color is always paired with text (P2-ORP-21): the state word rides alongside the color class.
    h(`span.orp-practice__due-state.orp-practice__due-state--${schedule.state}`, schedule.text),
    ladderLabel ? h('span.orp-practice__ladder', ladderLabel) : null,
  ]);
}

function renderReviewTab(data: ReviewTabData): VNode {
  if (data.status === 'loading') return renderLoading('Checking your schedule…');
  if (data.status === 'error') return renderError(data.message);
  if (data.status === 'empty') return renderEmpty(scheduleCopy.emptyTitle, scheduleCopy.emptyBody);

  const dueEntries = data.session.plan.entries;
  const startBtn = data.resumable
    ? (data.onResume
        ? h('button.orp-practice__primary', { attrs: { type: 'button', ...controlExplainerAttrs({ label: scheduleCopy.resumeLabel, description: scheduleCopy.resumeDescription, tier: 'essential' }) }, on: { click: data.onResume } }, scheduleCopy.resumeLabel)
        : null)
    : (data.onStart
        ? h('button.orp-practice__primary', { attrs: { type: 'button', ...controlExplainerAttrs({ label: scheduleCopy.startLabel, description: scheduleCopy.startDescription, tier: 'essential' }) }, on: { click: data.onStart } }, scheduleCopy.startLabel)
        : null);

  return h('div.orp-practice__review', [
    h('div.orp-practice__section-head', `${scheduleCopy.dueHeading} · ${dueEntries.length}`),
    dueEntries.length === 0
      ? renderEmpty(scheduleCopy.emptyTitle, scheduleCopy.emptyBody)
      : h('ul.orp-practice__due-list', { attrs: { 'aria-label': scheduleCopy.dueHeading } }, dueEntries.map((entry) =>
          renderScheduleEntry(entry, data.nowMs, data.ladderLabelFor?.(entry)),
        )),
    data.upcoming.length > 0
      ? h('div.orp-practice__upcoming', [
          h('div.orp-practice__section-head', scheduleCopy.upcomingHeading),
          h('ul.orp-practice__due-list.orp-practice__due-list--upcoming', { attrs: { 'aria-label': scheduleCopy.upcomingHeading } }, data.upcoming.map((entry) =>
            renderScheduleEntry(entry, data.nowMs, data.ladderLabelFor?.(entry)),
          )),
        ])
      : null,
    startBtn,
  ]);
}

// --- Practice tab (SCHEDULE-NEUTRAL split — the top-HIGH guard is STRUCTURAL) -

/**
 * Render ONE schedule-neutral practice row. THE GUARD (D12 consult §8 risk #1): this signature accepts
 * ONLY an id, a label, and optional clean-metrics — there is NO `dueAt`/schedule parameter, so a due
 * date / "next review" is NOT EXPRESSIBLE for a `practiceTargetId`. That is what keeps P2-ORP-14
 * ("Practice selected … always schedule-neutral") honest at the view layer.
 */
function renderScheduleNeutralRow(targetId: string, label: string, metrics: PracticeCleanMetrics | undefined): VNode {
  return h('li.orp-practice__split-row', { key: targetId }, [
    h('span.orp-practice__split-label', label),
    metrics
      ? h('span.orp-practice__split-metric', `${scorecardCopy.clean} ${metrics.clean}/${metrics.attempts}`)
      : null,
  ]);
}

/** Render one Learn-selected (enrolling) row. Still NO due date — these are not scheduled until a clean
 *  recall enrolls them; only a neutral "will start tracking" note (via the group heading). */
function renderLearnSelectedRow(targetId: string, label: string): VNode {
  return h('li.orp-practice__split-row', { key: targetId }, [
    h('span.orp-practice__split-label', label),
  ]);
}

function renderPracticeTab(data: PracticeTabData): VNode {
  if (data.status === 'loading') return renderLoading('Preparing selected lines…');
  if (data.status === 'error') return renderError(data.message);
  if (data.status === 'empty') return renderEmpty(scorecardCopy.practiceEmptyTitle, scorecardCopy.practiceEmptyBody);

  const learnIds = [...data.session.learnTargetIds];
  const practiceIds = [...data.session.practiceTargetIds];
  const labelFor = data.labelFor ?? ((id: string) => id);

  if (learnIds.length === 0 && practiceIds.length === 0) {
    return renderEmpty(scorecardCopy.practiceEmptyTitle, scorecardCopy.practiceEmptyBody);
  }

  return h('div.orp-practice__split', [
    learnIds.length > 0
      ? h('div.orp-practice__split-group.orp-practice__split-group--learning', [
          h('div.orp-practice__split-head', scorecardCopy.learningGroup),
          h('div.orp-practice__split-note', scorecardCopy.learningNote),
          h('ul.orp-practice__split-list', { attrs: { 'aria-label': scorecardCopy.learningGroup } },
            learnIds.map((id) => renderLearnSelectedRow(id, labelFor(id)))),
        ])
      : null,
    practiceIds.length > 0
      ? h('div.orp-practice__split-group.orp-practice__split-group--practice', [
          h('div.orp-practice__split-head', scorecardCopy.practiceGroup),
          // The schedule-neutral guarantee, made visible (§2/§5 Essential-tier consequence).
          h('div.orp-practice__split-note.orp-practice__split-note--neutral', scorecardCopy.practiceNote),
          h('ul.orp-practice__split-list', { attrs: { 'aria-label': scorecardCopy.practiceGroup } },
            practiceIds.map((id) => renderScheduleNeutralRow(id, labelFor(id), data.metricsFor?.(id)))),
        ])
      : null,
    data.onStart
      ? h('button.orp-practice__primary', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: scorecardCopy.practiceStartLabel, description: scorecardCopy.practiceStartDescription, tier: 'essential' }) },
          on: { click: data.onStart },
        }, scorecardCopy.practiceStartLabel)
      : null,
  ]);
}

// --- Progress tab (SCORECARD vocabulary ONLY) --------------------------------

function renderScorecardFolder(folder: DueReviewScorecardFolder, onOpenFolder: ((folder: string) => void) | undefined): VNode {
  const cells = [
    h('span.orp-practice__score-name', folder.folder),
    h('span.orp-practice__score-accuracy', `${scorecardCopy.accuracy} ${formatAccuracy(folder.accuracy)}`),
    // Color paired with text/shape (P2-ORP-21): each count carries its word, never color-only.
    h('span.orp-practice__score-clean', `${scorecardCopy.clean} ${folder.clean}`),
    h('span.orp-practice__score-failed', `${scorecardCopy.failed} ${folder.failed}`),
    h('span.orp-practice__score-assisted', `${scorecardCopy.assisted} ${folder.assisted}`),
  ];
  if (onOpenFolder) {
    return h('li.orp-practice__score-row', { key: folder.folder },
      h('button.orp-practice__score-open', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: `Open ${folder.folder}`, description: 'Shows the lines behind this folder’s accuracy.' }) },
        on: { click: () => onOpenFolder(folder.folder) },
      }, cells),
    );
  }
  return h('li.orp-practice__score-row.orp-practice__score-row--static', { key: folder.folder }, cells);
}

function renderProgressTab(data: ProgressTabData): VNode {
  if (data.status === 'loading') return renderLoading('Loading your scorecard…');
  if (data.status === 'error') return renderError(data.message);
  if (data.status === 'empty') return renderEmpty(scorecardCopy.emptyTitle, scorecardCopy.emptyBody);
  if (data.status === 'picker') {
    if (data.lessons.length === 0) return renderEmpty(scorecardCopy.emptyTitle, scorecardCopy.emptyBody);
    return h('div.orp-practice__progress', [
      h('div.orp-practice__section-head', 'Progress by Study'),
      h('ul.orp-practice__score-list', { attrs: { 'aria-label': 'Progress by Study' } },
        data.lessons.map(lesson => h('li.orp-practice__picker-row', { key: lesson.lessonId }, [
          h('button.orp-practice__picker-open', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: `Open progress for ${lesson.label}`,
              description: 'Shows this Study\'s practice scorecard.', tier: 'essential',
            }) },
            on: { click: () => { data.onSelect(lesson.lessonId); } },
          }, lesson.label),
        ]))),
    ]);
  }

  const { scorecard } = data;
  if (scorecard.total === 0) return renderEmpty(scorecardCopy.emptyTitle, scorecardCopy.emptyBody);

  return h('div.orp-practice__progress', [
    data.onBack !== undefined
      ? h('button.orp-practice__picker-back', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Back to all Studies',
            description: 'Returns to the Progress-by-Study list.', tier: 'essential',
          }) },
          on: { click: data.onBack },
        }, '← All Studies')
      : null,
    h('div.orp-practice__section-head', scorecardCopy.progressHeading),
    h('ul.orp-practice__score-list', { attrs: { 'aria-label': scorecardCopy.progressHeading } },
      scorecard.folders.map((folder) => renderScorecardFolder(folder, data.onOpenFolder))),
    h('div.orp-practice__rollup', [
      h('div.orp-practice__section-head', scorecardCopy.rollUpHeading),
      h('div.orp-practice__rollup-grid', [
        h('span.orp-practice__rollup-cell', `${scorecardCopy.accuracy} ${formatAccuracy(scorecard.accuracy)}`),
        h('span.orp-practice__rollup-cell', `${scorecardCopy.clean} ${scorecard.clean}`),
        h('span.orp-practice__rollup-cell', `${scorecardCopy.failed} ${scorecard.failed}`),
        h('span.orp-practice__rollup-cell', `${scorecardCopy.assisted} ${scorecard.assisted}`),
        h('span.orp-practice__rollup-cell', `${scorecardCopy.attempts} ${scorecard.total}`),
      ]),
    ]),
    data.successRateLog && data.successRateLog.length > 0
      ? h('div.orp-practice__success-log', [
          h('div.orp-practice__section-head', scorecardCopy.successRateHeading),
          h('ul.orp-practice__success-list', { attrs: { 'aria-label': scorecardCopy.successRateHeading } },
            data.successRateLog.map((row, i) => h('li.orp-practice__success-row', { key: `${row.label}-${i}` }, [
              h('span.orp-practice__success-name', row.label),
              h('span.orp-practice__success-accuracy', `${scorecardCopy.accuracy} ${formatAccuracy(row.accuracy)}`),
              h('span.orp-practice__success-total', `${scorecardCopy.attempts} ${row.total}`),
            ]))),
        ])
      : null,
  ]);
}

// --- Active tab body + panel root -------------------------------------------


function renderPanelDrills(drills: PanelDrillsSection): VNode {
  return h('div.orp-practice__drills', [
    h('div.orp-practice__split-head', 'Recent drills'),
    drills.recent.length === 0
      ? h('div.orp-practice__split-note', 'No drills yet — start one from the analysis board.')
      : h('ul.orp-practice__split-list', { attrs: { 'aria-label': 'Recent drills' } },
          drills.recent.map((entry, index) =>
            h('li.orp-practice__drill-row', { key: `drill-${index}` }, [
              h('button.orp-practice__drill-open', {
                attrs: { type: 'button', ...controlExplainerAttrs({
                  label: `Open drill: ${entry.label}`,
                  description: entry.resumable
                    ? 'Opens this partial drill on the analysis board. Resume it from the Drill Catalog.'
                    : 'Opens this drill game on the analysis board.',
                }) },
                on: { click: entry.onOpen },
              }, [
                h('span.orp-practice__drill-label', entry.label),
                entry.sublabel !== undefined ? h('span.orp-practice__drill-sub', entry.sublabel) : null,
              ]),
            ]))),
    h('div.orp-practice__drill-links', [
      h('button.orp-practice__drill-link', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Open Drill Catalog',
          description: 'Opens the full Drill Catalog: every saved drill, newest first, with export and promotion.',
        }) },
        on: { click: drills.onOpenCatalog },
      }, 'Drill Catalog'),
      drills.onViewAllFromStudy !== undefined
        ? h('button.orp-practice__drill-link', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'View all drills from this Study',
              description: 'Opens the Drill Catalog scoped to drills launched from this Study.',
            }) },
            on: { click: drills.onViewAllFromStudy },
          }, 'View all from this Study')
        : null,
    ]),
  ]);
}

function renderActiveBody(props: PracticePanelProps): VNode {
  switch (props.activeTab) {
    case 'learn': return renderLearnTab(props.learn);
    case 'review': return renderReviewTab(props.review);
    case 'practice': return h('div', [
      renderPracticeTab(props.practice),
      props.drills !== undefined ? renderPanelDrills(props.drills) : null,
    ]);
    case 'progress': return renderProgressTab(props.progress);
  }
}

/** A short, live-announced summary of the active tab's state — announced WITHOUT stealing board focus
 *  (P2-ORP-21: `aria-live="polite"`, no focus move). Kept terse so it does not spam the announcer. */
function activeTabAnnouncement(props: PracticePanelProps): string {
  switch (props.activeTab) {
    case 'review': {
      const r = props.review;
      if (r.status === 'ready') return `${r.session.plan.entries.length} due for review`;
      if (r.status === 'empty') return scheduleCopy.emptyTitle;
      return '';
    }
    case 'progress': {
      const p = props.progress;
      if (p.status === 'ready') return `${scorecardCopy.accuracy} ${formatAccuracy(p.scorecard.accuracy)}`;
      return '';
    }
    default: return '';
  }
}

/**
 * The practice panel PURE VIEW root: a tab strip + the active tab body. Host-neutral — both the Study
 * and Analysis Practice slots render this exact component with their own data + callbacks. Assembles
 * nothing, mutates nothing (D12 consult §2/§4).
 */
export function renderPracticePanel(props: PracticePanelProps): VNode {
  const announcement = activeTabAnnouncement(props);
  return h('section.orp-practice', { attrs: { 'aria-label': 'Practice' } }, [
    renderTabStrip(props),
    h('div.orp-practice__body', {
      attrs: { role: 'tabpanel', id: `orp-practice-panel-${props.activeTab}`, 'aria-labelledby': `orp-practice-tab-${props.activeTab}` },
    }, [renderActiveBody(props)]),
    // Polite live region for meaningful state — never grabs board focus (P2-ORP-21).
    h('div.orp-practice__announce', { attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } }, announcement),
  ]);
}
