import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GameProvider, Prisma, WalletMode } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { decryptSecret, encryptSecret, maskSecret } from '../../common/utils/secretbox';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { RealtimeService } from '../realtime/realtime.service';
import { WalletService } from '../wallet/wallet.service';
import { GameProviderAdapter } from './adapters/adapter.interface';
import { GenericSeamlessAdapter } from './adapters/generic-seamless.adapter';
import { MockAdapter } from './adapters/mock.adapter';
import {
  BalanceCallbackDto,
  BetCallbackDto,
  LaunchGameDto,
  RollbackCallbackDto,
  UpsertProviderDto,
  WinCallbackDto,
} from './dto/callbacks.dto';

/** Claims carried by the short-lived game-session token. */
interface GameSession {
  sub: string; // userId
  gid: string; // gameId
  pid: string; // providerId
  cur: string;
  mode: WalletMode;
  typ: 'game-session';
}

const SESSION_TTL = '60m';
const CACHE_TTL_MS = 15_000;

/**
 * Slot-aggregator integration core: DB-driven provider registry (secrets
 * encrypted at rest), game launch with a signed session token, and the
 * seamless-wallet callback handlers (balance/bet/win/rollback) with
 * ProviderTransaction-based idempotency — a replayed callback returns the
 * stored response and never touches the wallet twice.
 */
@Injectable()
export class ProvidersService {
  private readonly log = new Logger(ProvidersService.name);
  private readonly adapters = new Map<string, GameProviderAdapter>();
  private cache = new Map<string, GameProvider>();
  private cacheAt = 0;

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private realtime: RealtimeService,
    private leaderboards: LeaderboardsService,
    private jwt: JwtService,
    private config: ConfigService,
    mock: MockAdapter,
    generic: GenericSeamlessAdapter,
  ) {
    for (const a of [mock, generic]) this.adapters.set(a.kind, a);
  }

  // ── Registry ──────────────────────────────────────────────────────────

  /** Enabled provider by callback slug (15s cache — hot path for callbacks). */
  async byKey(key: string): Promise<GameProvider | null> {
    const now = Date.now();
    if (now - this.cacheAt > CACHE_TTL_MS) {
      const rows = await this.prisma.gameProvider.findMany({ where: { enabled: true } });
      this.cache = new Map(rows.map((p) => [p.key, p]));
      this.cacheAt = now;
    }
    return this.cache.get(key) ?? null;
  }

  private invalidate() {
    this.cacheAt = 0;
  }

  webhookSecret(provider: GameProvider): string | null {
    if (!provider.webhookSecretEnc) return null;
    try {
      return decryptSecret(provider.webhookSecretEnc);
    } catch (e) {
      this.log.error(`webhook secret undecryptable for provider ${provider.key}: ${String(e)}`);
      return null;
    }
  }

  private apiKey(provider: GameProvider): string | null {
    if (!provider.apiKeyEnc) return null;
    try {
      return decryptSecret(provider.apiKeyEnc);
    } catch {
      return null;
    }
  }

  /** Admin list: secrets masked, never returned in full. */
  async listProviders() {
    const rows = await this.prisma.gameProvider.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { games: true, transactions: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      enabled: p.enabled,
      apiKeyMasked: this.masked(p.apiKeyEnc),
      webhookSecretMasked: this.masked(p.webhookSecretEnc),
      games: p._count.games,
      transactions: p._count.transactions,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  private masked(enc?: string | null): string | null {
    if (!enc) return null;
    try {
      return maskSecret(decryptSecret(enc));
    } catch {
      return '••••';
    }
  }

  /** Upsert by key. Secrets are write-only: blank/undefined keeps the stored value. */
  async upsertProvider(dto: UpsertProviderDto) {
    if (!this.adapters.has(dto.kind ?? 'MOCK')) throw new BadRequestException('PROVIDER_KIND_UNKNOWN');
    const secretPatch: Prisma.GameProviderUpdateInput = {};
    try {
      if (dto.apiKey) secretPatch.apiKeyEnc = encryptSecret(dto.apiKey);
      if (dto.webhookSecret) secretPatch.webhookSecretEnc = encryptSecret(dto.webhookSecret);
    } catch (e: any) {
      // Fail closed — never store plaintext when the encryption key is absent.
      throw new BadRequestException(String(e?.message ?? 'PROVIDER_SECRETS_KEY_MISSING'));
    }
    const data = {
      name: dto.name,
      kind: dto.kind ?? 'MOCK',
      baseUrl: dto.baseUrl || null,
      enabled: dto.enabled ?? true,
      ...secretPatch,
    };
    const provider = await this.prisma.gameProvider.upsert({
      where: { key: dto.key },
      create: { key: dto.key, ...(data as Prisma.GameProviderCreateInput) },
      update: data,
    });
    this.invalidate();
    return { ...provider, apiKeyEnc: undefined, webhookSecretEnc: undefined };
  }

  /** Delete only when no games reference it — otherwise disable instead. */
  async deleteProvider(key: string) {
    const provider = await this.prisma.gameProvider.findUnique({
      where: { key },
      include: { _count: { select: { games: true } } },
    });
    if (!provider) throw new NotFoundException('PROVIDER_NOT_FOUND');
    if (provider._count.games > 0) throw new BadRequestException('PROVIDER_HAS_GAMES_DISABLE_INSTEAD');
    await this.prisma.gameProvider.delete({ where: { key } });
    this.invalidate();
    return { ok: true };
  }

  // ── Launch ────────────────────────────────────────────────────────────

  async launch(userId: string, dto: LaunchGameDto) {
    const game = await this.prisma.game.findUnique({
      where: { key: dto.gameKey },
      include: { providerRef: true },
    });
    if (!game || !game.enabled || game.status !== 'LIVE') throw new NotFoundException('GAME_NOT_AVAILABLE');
    if (!game.providerRef) throw new BadRequestException('GAME_NOT_EXTERNAL');
    if (!game.providerRef.enabled) throw new BadRequestException('PROVIDER_DISABLED');

    const cur = await this.wallet.assertCurrency(dto.currency, { requireEnabled: true });
    if ((cur.type === 'DEMO') !== (dto.mode === 'DEMO')) throw new BadRequestException('MODE_CURRENCY_MISMATCH');

    const adapter = this.adapters.get(game.providerRef.kind);
    if (!adapter) throw new BadRequestException('PROVIDER_KIND_UNKNOWN');

    const session: GameSession = {
      sub: userId,
      gid: game.id,
      pid: game.providerRef.id,
      cur: dto.currency,
      mode: dto.mode,
      typ: 'game-session',
    };
    const sessionToken = await this.jwt.signAsync(session as any, {
      secret: this.sessionSecret(),
      expiresIn: SESSION_TTL,
    });

    const url = await adapter.buildLaunchUrl({
      provider: game.providerRef,
      game,
      sessionToken,
      currency: dto.currency,
      mode: dto.mode,
      locale: dto.locale,
      apiKey: this.apiKey(game.providerRef),
    });
    return { url, sessionToken, expiresIn: SESSION_TTL };
  }

  private sessionSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET') || 'dev_access_secret_change_me';
  }

  private async verifySession(token: string | undefined, provider: GameProvider): Promise<GameSession> {
    if (!token) throw new UnauthorizedException('SESSION_MISSING');
    let payload: GameSession;
    try {
      payload = await this.jwt.verifyAsync<GameSession>(token, { secret: this.sessionSecret() });
    } catch {
      throw new UnauthorizedException('SESSION_INVALID');
    }
    if (payload.typ !== 'game-session' || payload.pid !== provider.id) {
      throw new UnauthorizedException('SESSION_INVALID');
    }
    return payload;
  }

  // ── Seamless-wallet callbacks ─────────────────────────────────────────

  async balance(provider: GameProvider, dto: BalanceCallbackDto) {
    const s = await this.verifySession(dto.sessionToken, provider);
    const bal = await this.wallet.balanceOf(s.sub, s.cur, s.mode);
    return { ok: true, balance: bal.toFixed(), currency: s.cur };
  }

  async bet(provider: GameProvider, dto: BetCallbackDto) {
    const s = await this.verifySession(dto.sessionToken, provider);
    if (dto.currency !== s.cur) throw new BadRequestException('CURRENCY_MISMATCH');
    const amount = D(dto.amount);
    if (!amount.gt(0)) throw new BadRequestException('BAD_AMOUNT');

    try {
      return await this.wallet.runInTx(async (tx) => {
        // The unique (providerId, externalId) makes this row the idempotency
        // gate: a replay aborts here with P2002 and is answered from storage.
        const pt = await tx.providerTransaction.create({
          data: {
            providerId: provider.id,
            externalId: dto.transactionId,
            action: 'BET',
            userId: s.sub,
            gameId: s.gid,
            externalRoundId: dto.roundId,
            currency: dto.currency,
            amount,
          },
        });
        const ledger = await this.wallet.apply(tx, {
          userId: s.sub,
          type: 'BET',
          currency: dto.currency,
          mode: s.mode,
          amount: amount.neg(),
          refType: 'provider',
          refId: pt.id,
          description: `Provider bet (${provider.name})`,
          meta: { provider: provider.key, externalId: dto.transactionId, roundId: dto.roundId },
        });
        const response = { ok: true, transactionId: dto.transactionId, balance: D(ledger.balanceAfter).toFixed() };
        await tx.providerTransaction.update({
          where: { id: pt.id },
          data: { ledgerTxId: ledger.id, response },
        });
        return response;
      });
    } catch (e) {
      const replayed = await this.replayIfDuplicate(e, provider.id, dto.transactionId);
      if (replayed) return replayed;
      throw e;
    }
  }

  async win(provider: GameProvider, dto: WinCallbackDto) {
    const s = await this.verifySession(dto.sessionToken, provider);
    if (dto.currency !== s.cur) throw new BadRequestException('CURRENCY_MISMATCH');
    const amount = D(dto.amount);
    if (amount.lt(0)) throw new BadRequestException('BAD_AMOUNT');

    let credited = false;
    let response: any;
    try {
      response = await this.wallet.runInTx(async (tx) => {
        const pt = await tx.providerTransaction.create({
          data: {
            providerId: provider.id,
            externalId: dto.transactionId,
            action: 'WIN',
            userId: s.sub,
            gameId: s.gid,
            externalRoundId: dto.roundId,
            currency: dto.currency,
            amount,
          },
        });
        const ledger = await this.wallet.apply(tx, {
          userId: s.sub,
          type: 'WIN',
          currency: dto.currency,
          mode: s.mode,
          amount,
          refType: 'provider',
          refId: pt.id,
          description: `Provider win (${provider.name})`,
          meta: { provider: provider.key, externalId: dto.transactionId, roundId: dto.roundId },
        });
        const res = { ok: true, transactionId: dto.transactionId, balance: D(ledger.balanceAfter).toFixed() };
        await tx.providerTransaction.update({ where: { id: pt.id }, data: { ledgerTxId: ledger.id, response: res } });
        return res;
      });
      credited = true;
    } catch (e) {
      const replayed = await this.replayIfDuplicate(e, provider.id, dto.transactionId);
      if (replayed) return replayed;
      throw e;
    }

    // Post-commit, fire-and-forget: public ticker + leaderboards (REAL wins only).
    if (credited && s.mode === 'REAL' && amount.gt(0)) {
      void this.broadcastWin(provider, s, dto, amount).catch((e) =>
        this.log.warn(`win broadcast failed: ${String(e)}`),
      );
    }
    return response;
  }

  private async broadcastWin(provider: GameProvider, s: GameSession, dto: WinCallbackDto, amount: Prisma.Decimal) {
    const [game, user, cur] = await Promise.all([
      this.prisma.game.findUnique({ where: { id: s.gid } }),
      this.prisma.user.findUnique({ where: { id: s.sub }, select: { username: true, accountId: true } }),
      this.prisma.currency.findUnique({ where: { code: dto.currency } }),
    ]);
    const usd = amount.mul(cur?.usdRate ?? 0).toNumber();
    const roundId = dto.roundId ? `${provider.key}:${dto.roundId}` : `${provider.key}:${dto.transactionId}`;
    this.realtime.liveBet({
      roundId,
      game: game?.name ?? provider.name,
      gameKey: game?.key,
      category: game?.category ?? 'SLOTS',
      username: user?.username,
      accountId: user?.accountId,
      stake: null,
      payout: amount.toFixed(),
      usd,
      currency: dto.currency,
      mode: s.mode,
      at: Date.now(),
    });
    await this.leaderboards.record({
      roundId,
      gameKey: game?.key ?? provider.key,
      gameName: game?.name ?? provider.name,
      category: game?.category ?? 'SLOTS',
      username: user?.username ?? '',
      accountId: user?.accountId ?? 0,
      currency: dto.currency,
      stake: '0',
      payout: amount.toFixed(),
      usd,
      coeff: 0,
      at: new Date(),
    });
  }

  /**
   * Reverse a previous bet/win. Unknown reference → idempotent no-op (recorded
   * as IGNORED) — the standard aggregator contract. A reference can be rolled
   * back exactly once (atomic status flip on the original row).
   */
  async rollback(provider: GameProvider, dto: RollbackCallbackDto) {
    try {
      return await this.wallet.runInTx(async (tx) => {
        const original = await tx.providerTransaction.findUnique({
          where: { providerId_externalId: { providerId: provider.id, externalId: dto.referenceTransactionId } },
        });

        // This rollback's own idempotency row (P2002 on replay).
        const pt = await tx.providerTransaction.create({
          data: {
            providerId: provider.id,
            externalId: dto.transactionId,
            action: 'ROLLBACK',
            userId: original?.userId ?? 'unknown',
            gameId: original?.gameId,
            externalRoundId: original?.externalRoundId,
            currency: original?.currency ?? '—',
            amount: original ? D(original.amount) : D(0),
            status: 'IGNORED',
          },
        });

        if (!original || !['BET', 'WIN'].includes(original.action)) {
          const res = { ok: true, transactionId: dto.transactionId, ignored: true };
          await tx.providerTransaction.update({ where: { id: pt.id }, data: { response: res } });
          return res;
        }

        // Claim the reversal: only the request that flips COMPLETED →
        // ROLLED_BACK applies money — a second rollback of the same reference
        // becomes an idempotent no-op.
        const claimed = await tx.providerTransaction.updateMany({
          where: { id: original.id, status: 'COMPLETED' },
          data: { status: 'ROLLED_BACK' },
        });
        if (claimed.count === 0) {
          const res = { ok: true, transactionId: dto.transactionId, ignored: true };
          await tx.providerTransaction.update({ where: { id: pt.id }, data: { response: res } });
          return res;
        }

        const isBet = original.action === 'BET';
        // Mode follows the currency kind — the same coherence invariant the
        // launch endpoint enforces (demo coins ⇔ DEMO wallet).
        const curRow = await tx.currency.findUnique({ where: { code: original.currency } });
        const mode: WalletMode = curRow?.type === 'DEMO' ? 'DEMO' : 'REAL';
        const ledger = await this.wallet.apply(tx, {
          userId: original.userId,
          type: 'ROLLBACK',
          currency: original.currency,
          mode,
          // Bet rollback returns the stake; win rollback takes the payout back.
          amount: isBet ? D(original.amount) : D(original.amount).neg(),
          allowNegative: !isBet, // a spent win must not block the reversal
          refType: 'provider',
          refId: pt.id,
          description: `Provider rollback (${provider.name})`,
          meta: { provider: provider.key, reference: dto.referenceTransactionId },
        });
        const res = { ok: true, transactionId: dto.transactionId, balance: D(ledger.balanceAfter).toFixed() };
        await tx.providerTransaction.update({
          where: { id: pt.id },
          data: { ledgerTxId: ledger.id, status: 'COMPLETED', response: res },
        });
        return res;
      });
    } catch (e) {
      const replayed = await this.replayIfDuplicate(e, provider.id, dto.transactionId);
      if (replayed) return replayed;
      throw e;
    }
  }

  /** On a (providerId, externalId) unique violation, answer from storage. */
  private async replayIfDuplicate(e: unknown, providerId: string, externalId: string) {
    const isDup =
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002' &&
      String((e.meta as any)?.target ?? '').includes('externalId');
    if (!isDup) return null;
    const existing = await this.prisma.providerTransaction.findUnique({
      where: { providerId_externalId: { providerId, externalId } },
    });
    if (!existing?.response) return null;
    this.log.log(`replayed provider callback ${externalId}`);
    return existing.response as any;
  }
}
