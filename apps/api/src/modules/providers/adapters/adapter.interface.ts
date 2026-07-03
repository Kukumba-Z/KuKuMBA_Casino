import { Game, GameProvider, WalletMode } from '@prisma/client';

/**
 * Game-aggregator adapter. Each aggregator protocol (Slotegrator, SoftSwiss,
 * EveryMatrix, …) gets its own adapter keyed by GameProvider.kind; the rest of
 * the platform (launch endpoint, seamless-wallet callbacks, admin CRUD) is
 * protocol-agnostic. MOCK ships by default so the whole loop is testable
 * without a real aggregator contract.
 */
export interface LaunchContext {
  provider: GameProvider;
  game: Game;
  /** Short-lived signed session token the provider echoes back in callbacks. */
  sessionToken: string;
  currency: string;
  mode: WalletMode;
  locale?: string;
  /** Decrypted outbound API key, when configured. */
  apiKey?: string | null;
}

export interface GameProviderAdapter {
  readonly kind: string;
  buildLaunchUrl(ctx: LaunchContext): Promise<string> | string;
}

export const PROVIDER_KINDS = ['MOCK', 'GENERIC_SEAMLESS'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];
