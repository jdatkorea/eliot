/**
 * Place 태그 컨트롤드 보캐뷸러리 — SEED 전용.
 * vibe/preference 축만 허용. 운영 토큰·가족 편의 토큰은 이 목록에 없다.
 */

/** 허용된 vibe/preference 태그 집합 */
export const ALLOWED_VIBE_TAGS = new Set([
  "뷰맛집",
  "포토존",
  "조용한",
  "핫플",
  "피크닉",
  "야경",
  "주차편리",
  "아이와함께",
  "반려동물동반",
  "로컬맛집",
  "힐링",
  "걷기좋은",
  "역사문화",
  "체험",
  "실내놀이",
]);

/**
 * 태그 셀에서 stroller_friendly를 파생하는 토큰 목록.
 * 대소문자·공백 정규화 후 비교한다.
 */
export const STROLLER_FRIENDLY_TOKENS = new Set([
  "유모차친화",
  "유모차가능",
  "stroller_friendly",
  "strollerfriendly",
]);

/**
 * 태그 셀에서 has_nursing_room을 파생하는 토큰 목록.
 */
export const NURSING_ROOM_TOKENS = new Set([
  "수유실완비",
  "수유실있음",
  "has_nursing_room",
  "nursingroom",
]);

/** 운영 정보 토큰 — 태그 셀에서 삭제하고 DB에 저장하지 않는다 */
export const OPERATIONAL_TAGS_TO_DROP = new Set([
  "웨이팅",
  "웨이팅있음",
  "예약필수",
  "현금만",
  "포장가능",
  "배달가능",
  "주차무료",
  "주차유료",
]);

export type TagClassification = {
  tags: string[];
  stroller_friendly: boolean;
  has_nursing_room: boolean;
  dropped: string[];
  unknown: string[];
};

/**
 * 태그 배열을 분류한다.
 * - family-constraint 토큰 → boolean 필드로 매핑 후 tags에서 제거
 * - operational 토큰 → dropped 목록으로 제거
 * - 화이트리스트 외 나머지 → unknown 목록으로 분리 (tags에서 제거)
 */
export function classifyTags(rawTags: string[]): TagClassification {
  const tags: string[] = [];
  const dropped: string[] = [];
  const unknown: string[] = [];
  let stroller_friendly = false;
  let has_nursing_room = false;

  for (const tag of rawTags) {
    const normalized = tag.trim().toLowerCase().replace(/[\s_-]/g, "");

    if (STROLLER_FRIENDLY_TOKENS.has(normalized)) {
      stroller_friendly = true;
      continue;
    }
    if (NURSING_ROOM_TOKENS.has(normalized)) {
      has_nursing_room = true;
      continue;
    }
    if (OPERATIONAL_TAGS_TO_DROP.has(normalized) || OPERATIONAL_TAGS_TO_DROP.has(tag.trim())) {
      dropped.push(tag);
      continue;
    }
    if (ALLOWED_VIBE_TAGS.has(tag.trim())) {
      tags.push(tag.trim());
      continue;
    }
    unknown.push(tag);
  }

  return { tags, stroller_friendly, has_nursing_room, dropped, unknown };
}
