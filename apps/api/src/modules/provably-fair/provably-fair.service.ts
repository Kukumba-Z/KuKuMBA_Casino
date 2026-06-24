import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  floatFromSeeds,
  genClientSeed,
  genServerSeed,
  hashServerSeed,
  rouletteResult,
} from './provably-fair.crypto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class ProvablyFairService {
  constructor(private prisma: PrismaService) {}

  /** The active seed for a user, creating one on first use. Never reveals serverSeed. */
  async ensureActiveSeed(userId: string) {
    let seed = await this.prisma.provablyFairSeed.findFirst({ where: { userId, active: true } });
    if (!seed) {
      const serverSeed = genServerSeed();
      seed = await this.prisma.provablyFairSeed.create({
        data: {
          userId,
          serverSeed,
          serverSeedHash: hashServerSeed(serverSeed),
          clientSeed: genClientSeed(),
          nonce: 0,
        },
      });
    }
    return seed;
  }

  /** Public-safe view (hash only, seed stays secret until rotation). */
  async publicState(userId: string) {
    const seed = await this.ensureActiveSeed(userId);
    return {
      serverSeedHash: seed.serverSeedHash,
      clientSeed: seed.clientSeed,
      nonce: seed.nonce,
    };
  }

  /** Set the next client seed (takes effect immediately on the active seed). */
  async setClientSeed(userId: string, clientSeed: string) {
    const seed = await this.ensureActiveSeed(userId);
    await this.prisma.provablyFairSeed.update({
      where: { id: seed.id },
      data: { clientSeed: clientSeed.slice(0, 64) },
    });
    return this.publicState(userId);
  }

  /**
   * Rotate: reveal the current serverSeed and start a fresh chain. Returns the
   * revealed seed so the player can verify their entire history.
   */
  async rotate(userId: string, nextClientSeed?: string) {
    const current = await this.ensureActiveSeed(userId);
    await this.prisma.provablyFairSeed.update({
      where: { id: current.id },
      data: { active: false, revealedAt: new Date() },
    });
    const serverSeed = genServerSeed();
    const next = await this.prisma.provablyFairSeed.create({
      data: {
        userId,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        clientSeed: nextClientSeed?.slice(0, 64) || genClientSeed(),
        nonce: 0,
      },
    });
    return {
      revealed: {
        serverSeed: current.serverSeed,
        serverSeedHash: current.serverSeedHash,
        clientSeed: current.clientSeed,
        finalNonce: current.nonce,
      },
      next: {
        serverSeedHash: next.serverSeedHash,
        clientSeed: next.clientSeed,
        nonce: next.nonce,
      },
    };
  }

  /**
   * Atomically consume the next nonce inside a transaction (locks the seed row).
   * Returns the seed snapshot to compute this round's outcome.
   */
  async consume(tx: Tx, userId: string) {
    let seed = await tx.provablyFairSeed.findFirst({ where: { userId, active: true } });
    if (!seed) {
      const serverSeed = genServerSeed();
      seed = await tx.provablyFairSeed.create({
        data: {
          userId,
          serverSeed,
          serverSeedHash: hashServerSeed(serverSeed),
          clientSeed: genClientSeed(),
          nonce: 0,
        },
      });
    }
    await tx.$queryRawUnsafe('SELECT 1 FROM "ProvablyFairSeed" WHERE id = $1 FOR UPDATE', seed.id);
    const updated = await tx.provablyFairSeed.update({
      where: { id: seed.id },
      data: { nonce: { increment: 1 } },
    });
    return updated; // updated.nonce is the value for this round
  }

  /** Stateless verification used by the public verifier endpoint. */
  verify(serverSeed: string, clientSeed: string, nonce: number) {
    return {
      serverSeedHash: hashServerSeed(serverSeed),
      float: floatFromSeeds(serverSeed, clientSeed, nonce),
      outcome: rouletteResult(serverSeed, clientSeed, nonce),
    };
  }
}
