import { createHash } from 'node:crypto';

/**
 * Computes a deterministic SHA-256 hash of an X post ID.
 */
export function hashPostId(postId: string): string {
  const cleanId = postId.trim().toLowerCase();
  return createHash('sha256').update(cleanId).digest('hex');
}

/**
 * Normalizes claim text by removing URLs, handles, punctuation, emojis,
 * and collapsing extra whitespace to enable accurate deduplication.
 */
export function normalizeClaimText(text: string): string {
  if (!text) return '';

  return (
    text
      // Remove URLs (http, https, t.co links)
      .replace(/https?:\/\/\S+/gi, '')
      // Remove user mentions (@username)
      .replace(/@\w+/g, '')
      // Remove hashtag symbols but keep text
      .replace(/#(\w+)/g, '$1')
      // Remove numbers if requested or normalize them (keep digits and letters)
      // Remove emojis and special punctuation
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      // Convert to lowercase
      .toLowerCase()
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Extracts significant tokens (length >= 3, removing trivial English stopwords).
 */
export function extractClaimTokens(text: string): string[] {
  const normalized = normalizeClaimText(text);
  if (!normalized) return [];

  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was',
    'were', 'over', 'into', 'near', 'under', 'has', 'have', 'had', 'been',
    'via', 'check', 'out', 'all', 'new', 'our', 'their', 'about'
  ]);

  return normalized
    .split(' ')
    .filter((w) => w.length > 1 && !stopwords.has(w));
}

/**
 * Computes Jaccard similarity coefficient between the token sets of two texts.
 */
export function tokenJaccardSimilarity(text1: string, text2: string): number {
  const tokens1 = extractClaimTokens(text1);
  const tokens2 = extractClaimTokens(text2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersection = 0;
  for (const token of set1) {
    if (set2.has(token)) intersection++;
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return intersection / union;
}

/**
 * Generates a 64-bit SimHash fingerprint as a hex string for normalized claim text.
 */
export function computeSimHash(text: string): string {
  const normalized = normalizeClaimText(text);
  if (!normalized) return '0000000000000000';

  const tokens = normalized.split(' ').filter((t) => t.length > 0);
  if (tokens.length === 0) return '0000000000000000';

  const v = new Array(64).fill(0);

  for (const token of tokens) {
    const hash = createHash('sha256').update(token).digest();
    for (let i = 0; i < 64; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = 7 - (i % 8);
      const bit = (hash[byteIndex] >> bitIndex) & 1;
      v[i] += bit === 1 ? 1 : -1;
    }
  }

  let fingerprint = 0n;
  for (let i = 0; i < 64; i++) {
    if (v[i] > 0) {
      fingerprint |= 1n << BigInt(63 - i);
    }
  }

  return fingerprint.toString(16).padStart(16, '0');
}

/**
 * Computes Hamming distance between two 64-bit hex SimHash fingerprints.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  const n1 = BigInt(`0x${hash1}`);
  const n2 = BigInt(`0x${hash2}`);
  let xor = n1 ^ n2;
  let dist = 0;
  while (xor > 0n) {
    if (xor & 1n) dist++;
    xor >>= 1n;
  }
  return dist;
}

/**
 * Computes a standardized claim fingerprint using normalized text hash and simhash.
 */
export function computeClaimFingerprint(text: string): string {
  const normalized = normalizeClaimText(text);
  const exactHash = createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  const simHash = computeSimHash(text);
  return `fp_${exactHash}_${simHash}`;
}

/**
 * Tests whether two claim texts are duplicate or near-duplicate based on:
 * 1. Exact normalized text equality
 * 2. Token Jaccard similarity (>= 0.50)
 * 3. SimHash distance (<= maxDistanceThreshold)
 */
export function isClaimDuplicate(
  text1: string,
  text2: string,
  maxDistanceThreshold: number = 6
): boolean {
  const norm1 = normalizeClaimText(text1);
  const norm2 = normalizeClaimText(text2);

  if (norm1 === norm2) return true;
  if (!norm1 || !norm2) return false;

  // Check token Jaccard similarity
  const jaccard = tokenJaccardSimilarity(text1, text2);
  if (jaccard >= 0.5) return true;

  // Check SimHash Hamming distance
  const sim1 = computeSimHash(text1);
  const sim2 = computeSimHash(text2);
  const distance = hammingDistance(sim1, sim2);

  return distance <= maxDistanceThreshold;
}
