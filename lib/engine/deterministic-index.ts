/** 동일 seed → 동일 인덱스 (A4 결정론 불변식) */
export function deterministicIndex(seed: string, max: number): number {
  if (max <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % max;
}

export function buildSwapSeed(tripId: string, attemptIndex: number): string {
  return `${tripId}|${attemptIndex}`;
}
