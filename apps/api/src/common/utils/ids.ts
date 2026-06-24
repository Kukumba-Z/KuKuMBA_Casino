import { customAlphabet } from 'nanoid';

// Unambiguous uppercase alphabet (no 0/O, 1/I confusion avoided where helpful).
const REF_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const PROMO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Personal referral code shown to every user (e.g. "KUK7F3Q2"). */
export const genReferralCode = (): string => 'KUK' + customAlphabet(REF_ALPHABET, 6)();

/** Generic short code (promo, etc.). */
export const genPromoCode = (len = 10): string => customAlphabet(PROMO_ALPHABET, len)();

/** Opaque token / address-like string for the mock payment provider. */
export const genToken = (len = 32): string => customAlphabet(REF_ALPHABET, len)();
