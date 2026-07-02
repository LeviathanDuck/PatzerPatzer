import { parsePgn } from 'chessops/pgn';

import { pgnGameToTree } from '../tree/pgn';
import type { TreeNode } from '../tree/types';

export interface ParsedRepertoireGame {
  sourceGameIndex: number;
  title: string;
  headers: Record<string, string>;
  tree: TreeNode;
}

function headersToRecord(headers: Map<string, string>): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function header(headers: Map<string, string>, key: string): string | undefined {
  const value = headers.get(key)?.trim();
  return value && value !== '?' ? value : undefined;
}

function repertoireGameTitle(headers: Map<string, string>, sourceGameIndex: number): string {
  const chapterName = header(headers, 'ChapterName');
  if (chapterName) return chapterName;

  const white = header(headers, 'White');
  const black = header(headers, 'Black');
  if (white && black) return `${white} - ${black}`;

  const event = header(headers, 'Event');
  if (event) return event;

  return `Game ${sourceGameIndex + 1}`;
}

export function parseRepertoirePgn(pgn: string): ParsedRepertoireGame[] {
  return parsePgn(pgn).map((game, sourceGameIndex) => ({
    sourceGameIndex,
    title: repertoireGameTitle(game.headers, sourceGameIndex),
    headers: headersToRecord(game.headers),
    tree: pgnGameToTree(game),
  }));
}
