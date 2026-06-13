import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validate as isUuid, v5 as uuidv5 } from "uuid";
import type { Place } from "@/lib/engine/types";

export const PLACE_ID_NAMESPACE = uuidv5("eliot.places", uuidv5.DNS);

export function toPlaceUuid(id: string, cache: Map<string, string>): string {
  if (isUuid(id)) {
    return id;
  }

  const cached = cache.get(id);
  if (cached) {
    return cached;
  }

  const mapped = uuidv5(id, PLACE_ID_NAMESPACE);
  cache.set(id, mapped);
  return mapped;
}

export function mapPlaceRow(place: Place, idCache: Map<string, string>) {
  return {
    id: toPlaceUuid(place.id, idCache),
    destination: place.destination,
    name: place.name,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    curtail_count: place.curtail_count,
    is_outdoor: place.is_outdoor,
    no_kids_zone: place.no_kids_zone,
    break_time: place.break_time,
    naver_url: place.naver_url,
    backup_place_id: place.backup_place_id
      ? toPlaceUuid(place.backup_place_id, idCache)
      : null,
    last_verified: place.last_verified,
    notes: place.notes,
    tags: place.tags,
    stroller_friendly: place.stroller_friendly ?? false,
    has_nursing_room: place.has_nursing_room ?? false,
  };
}

export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없습니다.",
    );
  }

  return createClient(url, serviceRoleKey);
}

export async function upsertPlaces(
  supabase: SupabaseClient,
  places: Place[],
): Promise<{ id: string; name: string }[]> {
  const idCache = new Map<string, string>();
  const rows = places.map((place) => mapPlaceRow(place, idCache));

  const { data, error } = await supabase
    .from("places")
    .upsert(rows, { onConflict: "id" })
    .select("id, name");

  if (error) {
    throw error;
  }

  return data ?? [];
}
