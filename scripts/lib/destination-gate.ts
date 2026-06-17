/**
 * Shared destination-authority gate — used by both scripts/sync-sheets.ts
 * (Sheets SSOT pipeline) and scripts/ingest-spots.ts (local-CSV pipeline)
 * so the two seeding paths apply the same validation policy against the
 * same canonical destination registry.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalizeDestination } from "@/lib/engine/course-generator";
import { DESTINATION_CENTROIDS } from "./destination-centroids";

/**
 * 알려진 canonical destination id 집합 — 정적 등록(DESTINATION_CENTROIDS)과
 * 운영자가 live `destinations` 테이블에 추가한 행을 합친다. 정적 등록은
 * 항상 비어 있지 않으므로(현재 61건), live 테이블이 0행이어도 실효성 있는
 * 검증을 수행한다.
 */
export async function resolveKnownDestinationIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const known = new Set(Object.keys(DESTINATION_CENTROIDS));

  const { data } = await supabase.from("destinations").select("destination_id");
  for (const row of (data ?? []) as { destination_id: string }[]) {
    known.add(canonicalizeDestination(row.destination_id));
  }

  return known;
}

export type DestinationGated = { destination: string };

export function partitionByKnownDestination<T extends DestinationGated>(
  rows: T[],
  knownIds: Set<string>,
): { accepted: T[]; quarantined: T[] } {
  const accepted: T[] = [];
  const quarantined: T[] = [];

  for (const row of rows) {
    if (knownIds.has(canonicalizeDestination(row.destination))) {
      accepted.push(row);
    } else {
      quarantined.push(row);
    }
  }

  return { accepted, quarantined };
}
