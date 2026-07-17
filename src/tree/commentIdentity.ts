// Durable identity for the single locally authored Analysis comment on a tree node.
//
// PGN has no standard author-id field. Patzer therefore stores local ownership as a readable
// prefix inside an otherwise ordinary PGN comment, keeping P2-PORT-3's position-data contract
// (standard comments; no new %-command). Other chess tools display the harmless prefix; Patzer
// strips it on import and restores the editable `user` identity.

export const LOCAL_COMMENT_ID = 'user';
export const LOCAL_COMMENT_BY = 'user';
export const LOCAL_PGN_COMMENT_PREFIX = 'Patzer user comment:';

/** PGN comment bodies cannot contain braces; match lila's dump sanitizer. */
export function sanitizePgnCommentText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

export function encodeLocalPgnComment(text: string): string {
  return `${LOCAL_PGN_COMMENT_PREFIX} ${text}`;
}

export function decodeLocalPgnComment(raw: string): string | null {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith(LOCAL_PGN_COMMENT_PREFIX)) return null;
  return trimmed.slice(LOCAL_PGN_COMMENT_PREFIX.length).trimStart();
}
