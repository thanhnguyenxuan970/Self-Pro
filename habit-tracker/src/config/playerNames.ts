import type { AppLanguage } from './i18n';

/**
 * Pseudonymous ladder names.
 *
 * The leaderboard deliberately never shows another player's real identity (see
 * migrations 022-024). The previous pseudonym was a slice of the row's UUID
 * (`player-3f2a91bc`), which is anonymous but reads as seeded/bot data — the
 * opposite of "I am competing with a real person".
 *
 * These names are generated from the same server-assigned
 * `leaderboard_public_id`, so they are:
 *   - stable: the same player is always the same name, on every device;
 *   - server-anchored: nothing here is typed by a user, so this is a closed
 *     set and NOT user-generated content — no moderation, reporting, or
 *     blocking obligations follow from it;
 *   - reversible to nothing: the name reveals no more than the UUID slice did.
 *
 * ---------------------------------------------------------------------------
 * WORD LIST REVIEW NOTE
 * ---------------------------------------------------------------------------
 * Vietnamese animal words carry insult connotations that do not survive
 * translation, so this list is curated rather than generated. Deliberately
 * excluded: chó, lợn/heo, bò, trâu, gà, vịt, khỉ, chuột, ếch, rắn, lươn, cú
 * — each is either a common insult, a "noob" tag, or carries a bad-omen or
 * dishonesty reading. Only clearly positive or neutral animals are included,
 * and adjectives are limited to effort/persistence traits so no pairing can
 * land on appearance, body, ethnicity, or gender.
 *
 * This list still needs a native-speaker pass before release. Cross-product
 * generation is safe *for this specific list* because every adjective is a
 * neutral effort trait, but any future addition must be re-checked against
 * every noun, not just read in isolation.
 */

/** Effort/persistence traits. Nothing about appearance, body, or identity. */
const VI_ADJECTIVES = [
  'Kiên Trì', 'Bền Bỉ', 'Chăm Chỉ', 'Miệt Mài', 'Cần Mẫn', 'Chuyên Cần',
  'Quyết Tâm', 'Vững Vàng', 'Điềm Tĩnh', 'Bình Thản', 'Ung Dung', 'Thong Dong',
  'Mạnh Mẽ', 'Dũng Cảm', 'Can Trường', 'Bất Khuất', 'Tự Tin', 'Kiêu Hãnh',
  'Nhanh Nhẹn', 'Khéo Léo', 'Sắc Bén', 'Tinh Anh', 'Sáng Suốt', 'Tỉnh Táo',
  'Hăng Hái', 'Nhiệt Huyết', 'Rạng Rỡ', 'Rực Rỡ', 'Thầm Lặng', 'Lặng Lẽ',
] as const;

/** Positive or neutral animals only. See the review note above for exclusions. */
const VI_NOUNS = [
  'Hổ', 'Báo', 'Sư Tử', 'Gấu', 'Sói', 'Linh Miêu',
  'Đại Bàng', 'Chim Ưng', 'Chim Cắt', 'Chim Én', 'Bồ Câu', 'Hạc',
  'Công', 'Phượng Hoàng', 'Rồng', 'Kỳ Lân', 'Ngựa', 'Nai',
  'Hươu', 'Voi', 'Tê Giác', 'Lạc Đà', 'Rùa', 'Thỏ',
  'Mèo', 'Sóc', 'Nhím', 'Cá Heo', 'Cá Voi', 'Rái Cá',
] as const;

const EN_ADJECTIVES = [
  'Persistent', 'Enduring', 'Diligent', 'Tireless', 'Industrious', 'Dedicated',
  'Determined', 'Steady', 'Composed', 'Unhurried', 'Serene', 'Patient',
  'Strong', 'Brave', 'Steadfast', 'Unyielding', 'Confident', 'Proud',
  'Nimble', 'Deft', 'Sharp', 'Astute', 'Clear-Eyed', 'Alert',
  'Eager', 'Ardent', 'Radiant', 'Bright', 'Silent', 'Quiet',
] as const;

const EN_NOUNS = [
  'Tiger', 'Leopard', 'Lion', 'Bear', 'Wolf', 'Lynx',
  'Eagle', 'Hawk', 'Falcon', 'Swallow', 'Dove', 'Crane',
  'Peacock', 'Phoenix', 'Dragon', 'Qilin', 'Horse', 'Deer',
  'Stag', 'Elephant', 'Rhino', 'Camel', 'Turtle', 'Rabbit',
  'Cat', 'Squirrel', 'Hedgehog', 'Dolphin', 'Whale', 'Otter',
] as const;

/**
 * Disambiguating suffix range. 30x30 pairs x 100 = 90,000 distinct names,
 * which keeps collisions rare while reading like a jersey number rather than
 * a database key.
 */
const SUFFIX_RANGE = 100;

/**
 * FNV-1a over the raw id string. Chosen for being tiny, dependency-free, and
 * deterministic across JS engines — the same player must produce the same name
 * on every device and every app launch, so `Math.random`, `Date`, and any
 * locale-sensitive operation are all disqualified.
 */
export function hashPlayerId(playerId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < playerId.length; i += 1) {
    hash ^= playerId.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in range via Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Decomposes one hash into three independent indices (mixed radix) rather than
 * slicing adjacent bits, which would correlate the adjective and the noun.
 */
export function generatePlayerName(playerId: string, lang: AppLanguage, fallbackLabel: string): string {
  if (typeof playerId !== 'string' || playerId.length === 0) {
    return fallbackLabel;
  }
  const adjectives = lang === 'en' ? EN_ADJECTIVES : VI_ADJECTIVES;
  const nouns = lang === 'en' ? EN_NOUNS : VI_NOUNS;

  const hash = hashPlayerId(playerId);
  const adjective = adjectives[hash % adjectives.length];
  const noun = nouns[Math.floor(hash / adjectives.length) % nouns.length];
  const suffix = Math.floor(hash / (adjectives.length * nouns.length)) % SUFFIX_RANGE;
  const paddedSuffix = String(suffix).padStart(2, '0');

  // Vietnamese puts the qualifier after the noun ("Hổ Kiên Trì"); English puts
  // it before ("Persistent Tiger"). Never build this by string-swapping a
  // single template — the orders are genuinely different, not a formatting toggle.
  const name = lang === 'en' ? `${adjective} ${noun}` : `${noun} ${adjective}`;
  return `${name} #${paddedSuffix}`;
}

export const PLAYER_NAME_WORD_COUNTS = {
  viAdjectives: VI_ADJECTIVES.length,
  viNouns: VI_NOUNS.length,
  enAdjectives: EN_ADJECTIVES.length,
  enNouns: EN_NOUNS.length,
  suffixRange: SUFFIX_RANGE,
} as const;
