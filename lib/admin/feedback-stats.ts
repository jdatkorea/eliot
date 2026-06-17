import type { PlaceCategory, PriorTripFeedback } from "@/lib/engine/types";

export type CategoryCount = {
  category: PlaceCategory;
  count: number;
};

export type FeedbackStats = {
  totalEntries: number;
  poolExhaustedCount: number;
  poolExhaustedRate: number;
  topExcludedCategories: CategoryCount[];
};

function categoriesForEntry(entry: PriorTripFeedback): PlaceCategory[] {
  if (entry.excluded_categories?.length) {
    return entry.excluded_categories;
  }
  if (entry.place_category) {
    return [entry.place_category];
  }
  return [];
}

export function computeFeedbackStats(
  entries: PriorTripFeedback[],
): FeedbackStats {
  const counts = new Map<PlaceCategory, number>();
  let poolExhaustedCount = 0;

  for (const entry of entries) {
    if (entry.pool_exhausted) {
      poolExhaustedCount += 1;
    }

    for (const category of categoriesForEntry(entry)) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  const topExcludedCategories = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const totalEntries = entries.length;

  return {
    totalEntries,
    poolExhaustedCount,
    poolExhaustedRate:
      totalEntries > 0 ? poolExhaustedCount / totalEntries : 0,
    topExcludedCategories,
  };
}
