import { generatePlayerName, hashPlayerId, PLAYER_NAME_WORD_COUNTS } from '../src/config/playerNames';

const UUID_A = '3f2a91bc-4d1e-4c7a-9f3b-2b8e5a6c1d90';
const UUID_B = 'a1b2c3d4-5e6f-4708-9a0b-1c2d3e4f5061';

test('the same player always gets the same name', () => {
  const first = generatePlayerName(UUID_A, 'vi', 'Người chơi');
  for (let i = 0; i < 25; i += 1) {
    expect(generatePlayerName(UUID_A, 'vi', 'Người chơi')).toBe(first);
  }
});

test('different players get different names', () => {
  expect(generatePlayerName(UUID_A, 'vi', 'Người chơi'))
    .not.toBe(generatePlayerName(UUID_B, 'vi', 'Người chơi'));
});

test('the name never leaks the underlying id', () => {
  const name = generatePlayerName(UUID_A, 'vi', 'Người chơi');
  expect(name).not.toContain('3f2a91bc');
  expect(name.toLowerCase()).not.toContain('3f2a');
  expect(name).not.toContain('-');
});

test('word order follows the language, not a shared template', () => {
  // Vietnamese qualifies after the noun, English before it. Same player, so
  // any shared token must sit on opposite sides.
  expect(generatePlayerName(UUID_A, 'vi', 'Người chơi')).toMatch(/^\S/);
  expect(generatePlayerName(UUID_A, 'en', 'Player')).toMatch(/^[A-Z][a-z-]+ [A-Z]/);
});

test('switching language changes the rendering but not the identity slot', () => {
  const vi = generatePlayerName(UUID_A, 'vi', 'Người chơi');
  const en = generatePlayerName(UUID_A, 'en', 'Player');
  expect(vi).not.toBe(en);
  // The suffix is derived from the id, so it is language-independent.
  expect(vi.slice(vi.lastIndexOf('#'))).toBe(en.slice(en.lastIndexOf('#')));
});

test('every name ends in a two-digit jersey-style suffix', () => {
  for (const id of [UUID_A, UUID_B, 'x', 'zzzzzzzz']) {
    expect(generatePlayerName(id, 'en', 'Player')).toMatch(/ #\d{2}$/);
  }
});

test('an empty id falls back to the supplied label instead of throwing', () => {
  expect(generatePlayerName('', 'vi', 'Người chơi #unknown')).toBe('Người chơi #unknown');
});

test('the hash is a stable unsigned 32-bit value', () => {
  const hash = hashPlayerId(UUID_A);
  expect(hash).toBe(hashPlayerId(UUID_A));
  expect(Number.isInteger(hash)).toBe(true);
  expect(hash).toBeGreaterThanOrEqual(0);
  expect(hash).toBeLessThanOrEqual(0xffffffff);
});

test('names spread across the word space rather than clustering', () => {
  // A bad hash decomposition (e.g. slicing adjacent bits) collapses onto a few
  // adjectives and is immediately obvious as generated.
  const adjectives = new Set<string>();
  const nouns = new Set<string>();
  for (let i = 0; i < 2000; i += 1) {
    const name = generatePlayerName(`${i}-0000-4000-8000-000000000000`, 'en', 'Player');
    const [adjective, noun] = name.replace(/ #\d{2}$/, '').split(' ');
    adjectives.add(adjective);
    nouns.add(noun);
  }
  expect(adjectives.size).toBe(PLAYER_NAME_WORD_COUNTS.enAdjectives);
  expect(nouns.size).toBe(PLAYER_NAME_WORD_COUNTS.enNouns);
});

test('the vi and en word lists are the same size so neither locale is degraded', () => {
  expect(PLAYER_NAME_WORD_COUNTS.viAdjectives).toBe(PLAYER_NAME_WORD_COUNTS.enAdjectives);
  expect(PLAYER_NAME_WORD_COUNTS.viNouns).toBe(PLAYER_NAME_WORD_COUNTS.enNouns);
});
