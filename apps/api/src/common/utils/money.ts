import { Prisma } from '@prisma/client';

/**
 * Money helpers. We use Prisma.Decimal everywhere money is involved to keep
 * arbitrary precision (crypto needs up to 18 decimals) and avoid float drift.
 */
export type Decimal = Prisma.Decimal;
export const Dec = Prisma.Decimal;

export const D = (v: Prisma.Decimal.Value): Prisma.Decimal => new Prisma.Decimal(v);
export const ZERO = new Prisma.Decimal(0);

export const toNumber = (v: Prisma.Decimal.Value): number => new Prisma.Decimal(v).toNumber();
export const toStr = (v: Prisma.Decimal.Value): string => new Prisma.Decimal(v).toFixed();

/** Round a decimal to `dp` places (half-up) and return a Decimal. */
export const roundTo = (v: Prisma.Decimal.Value, dp = 8): Prisma.Decimal =>
  new Prisma.Decimal(v).toDecimalPlaces(dp, Prisma.Decimal.ROUND_HALF_UP);

export const isPositive = (v: Prisma.Decimal.Value): boolean => new Prisma.Decimal(v).gt(0);
