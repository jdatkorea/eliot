import { describe, expect, it } from "vitest";
import {
  classifyTags,
  ALLOWED_VIBE_TAGS,
  STROLLER_FRIENDLY_TOKENS,
  NURSING_ROOM_TOKENS,
  OPERATIONAL_TAGS_TO_DROP,
} from "@/lib/config/tag-vocabulary";

describe("classifyTags — 빈 입력", () => {
  it("빈 배열 → 모든 필드 기본값", () => {
    const result = classifyTags([]);
    expect(result.tags).toEqual([]);
    expect(result.stroller_friendly).toBe(false);
    expect(result.has_nursing_room).toBe(false);
    expect(result.dropped).toEqual([]);
    expect(result.unknown).toEqual([]);
  });
});

describe("classifyTags — family-constraint 토큰 → boolean 매핑", () => {
  it("유모차친화 → stroller_friendly=true, tags에서 제거", () => {
    const result = classifyTags(["유모차친화"]);
    expect(result.stroller_friendly).toBe(true);
    expect(result.tags).not.toContain("유모차친화");
  });

  it("유모차가능 → stroller_friendly=true", () => {
    expect(classifyTags(["유모차가능"]).stroller_friendly).toBe(true);
  });

  it("수유실완비 → has_nursing_room=true, tags에서 제거", () => {
    const result = classifyTags(["수유실완비"]);
    expect(result.has_nursing_room).toBe(true);
    expect(result.tags).not.toContain("수유실완비");
  });

  it("수유실있음 → has_nursing_room=true", () => {
    expect(classifyTags(["수유실있음"]).has_nursing_room).toBe(true);
  });

  it("복수 family-constraint → 양쪽 모두 true", () => {
    const result = classifyTags(["유모차친화", "수유실완비", "뷰맛집"]);
    expect(result.stroller_friendly).toBe(true);
    expect(result.has_nursing_room).toBe(true);
    expect(result.tags).toEqual(["뷰맛집"]);
  });
});

describe("classifyTags — 운영 토큰 drop", () => {
  it("웨이팅 → dropped, tags/boolean 모두 영향 없음", () => {
    const result = classifyTags(["웨이팅", "뷰맛집"]);
    expect(result.dropped).toContain("웨이팅");
    expect(result.tags).toEqual(["뷰맛집"]);
    expect(result.stroller_friendly).toBe(false);
  });

  it("예약필수·현금만 → dropped", () => {
    const result = classifyTags(["예약필수", "현금만"]);
    expect(result.dropped).toHaveLength(2);
    expect(result.tags).toEqual([]);
  });
});

describe("classifyTags — 화이트리스트 외 unknown 분리", () => {
  it("알 수 없는 태그 → unknown, tags에서 제거", () => {
    const result = classifyTags(["미등록태그", "뷰맛집"]);
    expect(result.unknown).toContain("미등록태그");
    expect(result.tags).toEqual(["뷰맛집"]);
  });
});

describe("classifyTags — 허용 vibe 태그 통과", () => {
  for (const tag of ALLOWED_VIBE_TAGS) {
    it(`"${tag}" → tags에 포함`, () => {
      const result = classifyTags([tag]);
      expect(result.tags).toContain(tag);
      expect(result.stroller_friendly).toBe(false);
      expect(result.has_nursing_room).toBe(false);
      expect(result.dropped).toEqual([]);
      expect(result.unknown).toEqual([]);
    });
  }
});

describe("classifyTags — 조합 시나리오", () => {
  it("family-constraint + operational + vibe + unknown 혼합 처리", () => {
    const result = classifyTags([
      "유모차친화",
      "수유실완비",
      "웨이팅",
      "뷰맛집",
      "역사문화",
      "???미등록",
    ]);
    expect(result.stroller_friendly).toBe(true);
    expect(result.has_nursing_room).toBe(true);
    expect(result.dropped).toContain("웨이팅");
    expect(result.tags).toContain("뷰맛집");
    expect(result.tags).toContain("역사문화");
    expect(result.unknown).toContain("???미등록");
    expect(result.tags).not.toContain("유모차친화");
    expect(result.tags).not.toContain("수유실완비");
    expect(result.tags).not.toContain("웨이팅");
  });
});

describe("태그 상수 집합 무결성", () => {
  it("STROLLER·NURSING·OPERATIONAL 집합은 ALLOWED_VIBE_TAGS와 교집합 없음", () => {
    for (const token of STROLLER_FRIENDLY_TOKENS) {
      expect(ALLOWED_VIBE_TAGS.has(token)).toBe(false);
    }
    for (const token of NURSING_ROOM_TOKENS) {
      expect(ALLOWED_VIBE_TAGS.has(token)).toBe(false);
    }
    for (const token of OPERATIONAL_TAGS_TO_DROP) {
      expect(ALLOWED_VIBE_TAGS.has(token)).toBe(false);
    }
  });
});
