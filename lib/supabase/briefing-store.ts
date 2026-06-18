/**
 * briefing 전달 id-row 저장소 (T1, 2026-06-18) — URL-hash(#data=) 폐기.
 *
 * id 생성·insert는 여기(webhook/route 레이어)에만 존재한다. lib/engine/는
 * 순수 함수만 유지 — 이 모듈은 의도적으로 lib/engine/ 밖에 둔다.
 *
 * 런타임 DB 영향: saveBriefingPayload = insert 1건. loadBriefingPayload =
 * select 1건. 둘 다 anon key 사용(서비스 롤 키는 런타임에 노출하지 않는
 * 기존 아키텍처 유지 — scripts/lib/place-sync.ts만 서비스 롤 사용).
 */
import { randomBytes } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { BriefingLinkPayload } from "@/lib/webhook/briefing-urls";

const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BRIEFING_ID_LENGTH = 12;

/** 짧은 base62 id — uuid 대신 사용해 URL을 짧게 유지한다. */
export function generateBriefingId(): string {
  const bytes = randomBytes(BRIEFING_ID_LENGTH);
  let id = "";
  for (let i = 0; i < BRIEFING_ID_LENGTH; i++) {
    id += BASE62_ALPHABET[bytes[i]! % BASE62_ALPHABET.length];
  }
  return id;
}

export async function saveBriefingPayload(
  payload: BriefingLinkPayload,
): Promise<string> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  const id = generateBriefingId();
  const { error } = await supabase
    .from("briefings")
    .insert({ id, payload });

  if (error) {
    throw error;
  }

  return id;
}

export async function loadBriefingPayload(
  id: string,
): Promise<BriefingLinkPayload | null> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  const { data, error } = await supabase
    .from("briefings")
    .select("payload")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return data.payload as BriefingLinkPayload;
}
