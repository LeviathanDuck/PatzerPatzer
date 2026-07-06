


























// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/**
 * Minimal shape a save-flow-routed record must satisfy to be read by this lens. A structural
 * subset of UserLibraryPuzzleDefinition (src/puzzles/types.ts) and StudyItem
 * (src/study/types.ts) — both satisfy this today without any adapter.
 */
export interface GeneralLensRecord {
  id: string;
  /** Set true only via the save-flow modal's Quick save escape (P2-SAVE-2). */
  uncategorized?: boolean;
  /** Legacy/base provenance field predating the universal save-flow component. */
  sourceGameId?: string;

  savedFrom?: { gameId: string | null };
}

/**
 * Minimal shape of a linked game record needed to derive Automatic facets. A structural subset of
 * src/idb/index.ts's StoredGameRecord (and src/import/types.ts's ImportedGame) — see the
 * loadGameFacetSourceFromIdb reader added alongside this module's surfacing hook.
 */
export interface GeneralLensGameSource {
  white: string | null;
  black: string | null;
  /** Raw PGN Result header value, e.g. "1-0", "0-1", "1/2-1/2". */
  result: string | null;
  opening: string | null;
  /** Username of the account that imported the game (lowercased comparison), used to determine
   *  which side the user played. Mirrors StoredGameRecord.importedUsername. */
  importedUsername: string | null;
}

/**
 * Synchronous lookup from a linked game id to its facet-derivation source fields. Callers resolve
 * this from whatever storage they use (IDB, an in-memory cache, etc.) — this module never
 * fetches. Returning undefined means "no linked game available (yet)" and resolves to the Unknown
 * bucket for every facet, exactly like a record with no provenance at all.
 */
export type GeneralLensGameLookup = (gameId: string) => GeneralLensGameSource | undefined;

// ---------------------------------------------------------------------------
// Derived facets
// ---------------------------------------------------------------------------

export type GeneralLensResultFacet = 'win' | 'loss' | 'draw' | 'unknown';
export type GeneralLensColourFacet = 'white' | 'black' | 'unknown';

/** Sentinel for any facet dimension with no derivable value ("missing-data -> Unknown bucket"). */
export const GENERAL_LENS_UNKNOWN = 'Unknown';

export interface GeneralLensFacets {
  result: GeneralLensResultFacet;
  colour: GeneralLensColourFacet;
  /** Opening name, or GENERAL_LENS_UNKNOWN when not derivable. */
  opening: string;
}

function unknownFacets(): GeneralLensFacets {
  return { result: 'unknown', colour: 'unknown', opening: GENERAL_LENS_UNKNOWN };
}

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * Which side the game's `importedUsername` played. Mirrors src/games/view.ts's getUserColor
 * (white checked before black), restricted to the fields this module accepts — see the file
 * header on why this is a local duplicate rather than a shared import.
 */
function deriveColour(game: GeneralLensGameSource): GeneralLensColourFacet {
  const me = normalizeName(game.importedUsername);
  if (!me) return 'unknown';
  if (game.white && normalizeName(game.white) === me) return 'white';
  if (game.black && normalizeName(game.black) === me) return 'black';
  return 'unknown';
}

/**
 * Win/loss/draw relative to the importing user. Draws are colour-independent; a decisive result
 * ("1-0"/"0-1") needs a resolved colour to become a win/loss. Unlike src/games/view.ts's
 * gameResult() — which defaults any non-draw result string to a loss once colour is known — this
 * stays strict: an unrecognized result string (e.g. an unfinished "*" game) resolves to 'unknown'
 * rather than being silently misclassified as a loss.
 */
function deriveResult(game: GeneralLensGameSource, colour: GeneralLensColourFacet): GeneralLensResultFacet {
  if (!game.result) return 'unknown';
  if (game.result.includes('1/2')) return 'draw';
  if (colour === 'unknown') return 'unknown';
  if (game.result === '1-0') return colour === 'white' ? 'win' : 'loss';
  if (game.result === '0-1') return colour === 'black' ? 'win' : 'loss';
  return 'unknown';
}

function deriveOpening(game: GeneralLensGameSource): string {
  const opening = game.opening?.trim();
  return opening ? opening : GENERAL_LENS_UNKNOWN;
}





function linkedGameId(record: GeneralLensRecord): string | null {
  return record.savedFrom?.gameId ?? record.sourceGameId ?? null;
}

/**
 * Derives read-time Automatic facets (result/colour/opening) for one record from its linked game,
 * looked up via `lookupGame`. Missing provenance, an unresolved lookup, or missing fields on the
 * found game all resolve to the Unknown bucket per-dimension — this never throws and never omits
 * a record for lack of data.
 */
export function deriveGeneralFacets<T extends GeneralLensRecord>(
  record: T,
  lookupGame: GeneralLensGameLookup,
): GeneralLensFacets {
  const gameId = linkedGameId(record);
  if (gameId === null) return unknownFacets();
  const game = lookupGame(gameId);
  if (!game) return unknownFacets();
  const colour = deriveColour(game);
  return {
    result: deriveResult(game, colour),
    colour,
    opening: deriveOpening(game),
  };
}

// ---------------------------------------------------------------------------
// Manual vs Automatic separation
// ---------------------------------------------------------------------------

/**
 * Records saved through the save-flow modal's Quick save escape (P2-SAVE-2) — the only records
 * this lens ever groups. This is the enforcement point for the resolved strategy round's "never
 * merged with Your categories/tags" rule (quoted in this module's file header): a caller that
 * accidentally passes a mixed array of categorized and uncategorized records cannot leak a
 * categorized (manually-tagged) record into an "Automatic" group, because groupByAutomaticFacets
 * filters through this function before deriving or grouping anything.
 */
export function filterUncategorized<T extends GeneralLensRecord>(records: readonly T[]): T[] {
  return records.filter(record => record.uncategorized === true);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export interface GeneralLensGroup<T extends GeneralLensRecord> {
  facets: GeneralLensFacets;







  label: string;
  items: T[];
}

const RESULT_LABELS: Record<GeneralLensResultFacet, string> = {
  win: 'Won', loss: 'Lost', draw: 'Drawn', unknown: GENERAL_LENS_UNKNOWN,
};
const COLOUR_LABELS: Record<GeneralLensColourFacet, string> = {
  white: 'White', black: 'Black', unknown: GENERAL_LENS_UNKNOWN,
};
const RESULT_ORDER: GeneralLensResultFacet[] = ['win', 'loss', 'draw', 'unknown'];
const COLOUR_ORDER: GeneralLensColourFacet[] = ['white', 'black', 'unknown'];

/** Formats one group's display label from its facets (see GeneralLensGroup.label doc). */
export function formatAutomaticGroupLabel(facets: GeneralLensFacets): string {
  const allUnknown = facets.result === 'unknown' && facets.colour === 'unknown'
    && facets.opening === GENERAL_LENS_UNKNOWN;
  if (allUnknown) return GENERAL_LENS_UNKNOWN;
  const base = `${RESULT_LABELS[facets.result]} as ${COLOUR_LABELS[facets.colour]}`;
  return facets.opening === GENERAL_LENS_UNKNOWN ? base : `${base} · ${facets.opening}`;
}

function facetGroupKey(facets: GeneralLensFacets): string {
  return JSON.stringify([facets.result, facets.colour, facets.opening]);
}

/**
 * Groups every Quick-saved (`uncategorized`) record in `records` by derived Automatic facets.
 * Categorized records are excluded (see filterUncategorized). Groups are ordered win > loss >
 * draw > unknown, then white > black > unknown, then opening name — deterministic, not a ranking
 * of importance.
 */
export function groupByAutomaticFacets<T extends GeneralLensRecord>(
  records: readonly T[],
  lookupGame: GeneralLensGameLookup,
): GeneralLensGroup<T>[] {
  const groups = new Map<string, GeneralLensGroup<T>>();
  for (const record of filterUncategorized(records)) {
    const facets = deriveGeneralFacets(record, lookupGame);
    const key = facetGroupKey(facets);
    let group = groups.get(key);
    if (!group) {
      group = { facets, label: formatAutomaticGroupLabel(facets), items: [] };
      groups.set(key, group);
    }
    group.items.push(record);
  }
  return Array.from(groups.values()).sort((a, b) => {
    const resultDiff = RESULT_ORDER.indexOf(a.facets.result) - RESULT_ORDER.indexOf(b.facets.result);
    if (resultDiff !== 0) return resultDiff;
    const colourDiff = COLOUR_ORDER.indexOf(a.facets.colour) - COLOUR_ORDER.indexOf(b.facets.colour);
    if (colourDiff !== 0) return colourDiff;
    return a.facets.opening.localeCompare(b.facets.opening);
  });
}
