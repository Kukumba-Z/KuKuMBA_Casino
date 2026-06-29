/**
 * A game is a KuKuMBA Original when we author it in-house (provider defaults to
 * "KuKuMBA Originals"), as opposed to a third-party provider title. Demo play is
 * restricted to Originals — demo coins are only for trying our own games. Kept
 * as one shared predicate so every game module enforces the rule identically
 * (mirrors the web `isOriginal()`).
 */
export function isOriginalGame(provider?: string | null): boolean {
  return /kukumba/i.test(provider ?? '');
}
