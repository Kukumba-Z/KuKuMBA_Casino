/**
 * European single-zero roulette: 37 pockets (0..36).
 * Each bet type knows how many pockets win — that's all we need to derive a
 * payout that yields an EXACT target RTP (see roulette.engine.ts).
 */
export const POCKETS = 37;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColor = 'green' | 'red' | 'black';

export function colorOf(n: number): PocketColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export type RouletteBetType =
  | 'STRAIGHT'
  | 'RED'
  | 'BLACK'
  | 'EVEN'
  | 'ODD'
  | 'LOW'
  | 'HIGH'
  | 'DOZEN_1'
  | 'DOZEN_2'
  | 'DOZEN_3'
  | 'COLUMN_1'
  | 'COLUMN_2'
  | 'COLUMN_3';

export interface BetDef {
  /** How many of the 37 pockets win this bet (drives probability & payout). */
  winningCount: number;
  wins: (outcome: number, selection?: any) => boolean;
  /** Human labels (i18n done on the client; these are fallbacks). */
  labelRu: string;
  labelEn: string;
}

export const BETS: Record<RouletteBetType, BetDef> = {
  STRAIGHT: {
    winningCount: 1,
    wins: (o, s) => o === Number(s?.number),
    labelRu: 'Число',
    labelEn: 'Straight',
  },
  RED: { winningCount: 18, wins: (o) => colorOf(o) === 'red', labelRu: 'Красное', labelEn: 'Red' },
  BLACK: { winningCount: 18, wins: (o) => colorOf(o) === 'black', labelRu: 'Чёрное', labelEn: 'Black' },
  EVEN: { winningCount: 18, wins: (o) => o !== 0 && o % 2 === 0, labelRu: 'Чёт', labelEn: 'Even' },
  ODD: { winningCount: 18, wins: (o) => o % 2 === 1, labelRu: 'Нечёт', labelEn: 'Odd' },
  LOW: { winningCount: 18, wins: (o) => o >= 1 && o <= 18, labelRu: '1–18', labelEn: '1–18' },
  HIGH: { winningCount: 18, wins: (o) => o >= 19 && o <= 36, labelRu: '19–36', labelEn: '19–36' },
  DOZEN_1: { winningCount: 12, wins: (o) => o >= 1 && o <= 12, labelRu: '1-я дюжина', labelEn: '1st dozen' },
  DOZEN_2: { winningCount: 12, wins: (o) => o >= 13 && o <= 24, labelRu: '2-я дюжина', labelEn: '2nd dozen' },
  DOZEN_3: { winningCount: 12, wins: (o) => o >= 25 && o <= 36, labelRu: '3-я дюжина', labelEn: '3rd dozen' },
  COLUMN_1: { winningCount: 12, wins: (o) => o >= 1 && o % 3 === 1, labelRu: '1-я колонка', labelEn: '1st column' },
  COLUMN_2: { winningCount: 12, wins: (o) => o >= 2 && o % 3 === 2, labelRu: '2-я колонка', labelEn: '2nd column' },
  COLUMN_3: { winningCount: 12, wins: (o) => o >= 3 && o % 3 === 0, labelRu: '3-я колонка', labelEn: '3rd column' },
};

export const BET_TYPES = Object.keys(BETS) as RouletteBetType[];
