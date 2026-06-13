import { describe, expect, it } from "vitest";
import {
  SheetPlaceSchema,
  parsePlacesFromSheet,
  buildHeaderIndex,
  rowToRawInput,
  PLACE_SHEET_HEADERS,
} from "@/lib/seed/validate-places";

// PLACE_SHEET_HEADERS 순서:
// id(0) destination(1) name(2) category(3) lat(4) lng(5) curtail_count(6)
// is_outdoor(7) no_kids_zone(8) break_time(9) naver_url(10) backup_place_id(11)
// last_verified(12) notes(13) tags(14) status(15)

const HEADER_ROW = [...PLACE_SHEET_HEADERS];

function makeRow(overrides: Partial<Record<(typeof PLACE_SHEET_HEADERS)[number], string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: "test-001",
    destination: "경주",
    name: "불국사",
    category: "activity",
    lat: "35.789",
    lng: "129.331",
    curtail_count: "3",
    is_outdoor: "true",
    no_kids_zone: "false",
    break_time: "",
    naver_url: "https://map.naver.com/test",
    backup_place_id: "",
    last_verified: "2026-06-01",
    notes: "",
    tags: "",
    status: "active",
  };
  const merged = { ...defaults, ...overrides };
  return HEADER_ROW.map((h) => merged[h] ?? "");
}

// rawInput helpers
const HEADER_INDEX = buildHeaderIndex(HEADER_ROW);

function rawInput(overrides: Partial<Record<(typeof PLACE_SHEET_HEADERS)[number], string>> = {}) {
  return rowToRawInput(HEADER_INDEX, makeRow(overrides));
}

// ─── SheetPlaceSchema ──────────────────────────────────────────────────────

describe("SheetPlaceSchema — 기본 파싱", () => {
  it("유효한 행 → Place 반환", () => {
    const result = SheetPlaceSchema.safeParse(rawInput());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.id).toBe("test-001");
    expect(result.data.destination).toBe("경주");
    expect(result.data.category).toBe("activity");
    expect(result.data.lat).toBeCloseTo(35.789);
    expect(result.data.is_outdoor).toBe(true);
    expect(result.data.no_kids_zone).toBe(false);
    expect(result.data.tags).toEqual([]);
    expect(result.data.stroller_friendly).toBe(false);
    expect(result.data.has_nursing_room).toBe(false);
  });

  it("notes 빈 셀 → null", () => {
    const result = SheetPlaceSchema.safeParse(rawInput({ notes: "" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.notes).toBeNull();
  });

  it("backup_place_id 빈 셀 → null", () => {
    const result = SheetPlaceSchema.safeParse(rawInput({ backup_place_id: "" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.backup_place_id).toBeNull();
  });

  it("curtail_count 빈 셀 → 0", () => {
    const result = SheetPlaceSchema.safeParse(rawInput({ curtail_count: "" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.curtail_count).toBe(0);
  });
});

describe("SheetPlaceSchema — 필수 필드 오류", () => {
  it("id 없음 → fail", () => {
    expect(SheetPlaceSchema.safeParse(rawInput({ id: "" })).success).toBe(false);
  });

  it("category 잘못된 값 → fail", () => {
    expect(SheetPlaceSchema.safeParse(rawInput({ category: "unknown" })).success).toBe(false);
  });

  it("lat 숫자 아님 → fail", () => {
    expect(SheetPlaceSchema.safeParse(rawInput({ lat: "abc" })).success).toBe(false);
  });

  it("last_verified 없음 → fail", () => {
    expect(SheetPlaceSchema.safeParse(rawInput({ last_verified: "" })).success).toBe(false);
  });
});

describe("SheetPlaceSchema — boolean 파싱", () => {
  it.each([
    ["true", true],
    ["1", true],
    ["yes", true],
    ["y", true],
    ["false", false],
    ["0", false],
    ["", false],
    ["no", false],
  ])("is_outdoor=%s → %s", (raw, expected) => {
    const result = SheetPlaceSchema.safeParse(rawInput({ is_outdoor: raw }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.is_outdoor).toBe(expected);
  });
});

// ─── 태그 분류 통합 (STEP 3) ───────────────────────────────────────────────

describe("SheetPlaceSchema — 태그 분류 통합", () => {
  it("유모차친화 → stroller_friendly=true, tags에서 제거", () => {
    const result = SheetPlaceSchema.safeParse(rawInput({ tags: "유모차친화" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.stroller_friendly).toBe(true);
    expect(result.data.tags).not.toContain("유모차친화");
  });

  it("수유실완비 → has_nursing_room=true, tags에서 제거", () => {
    const result = SheetPlaceSchema.safeParse(rawInput({ tags: "수유실완비" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.has_nursing_room).toBe(true);
    expect(result.data.tags).not.toContain("수유실완비");
  });

  it("웨이팅 → operational drop, tags 비움", () => {
    const result = SheetPlaceSchema.safeParse(rawInput({ tags: "웨이팅" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.tags).toEqual([]);
    expect(result.data.stroller_friendly).toBe(false);
  });

  it("뷰맛집 → tags에 포함", () => {
    const result = SheetPlaceSchema.safeParse(rawInput({ tags: "뷰맛집" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.tags).toContain("뷰맛집");
  });

  it("복합 태그: family-constraint + vibe + operational", () => {
    const result = SheetPlaceSchema.safeParse(
      rawInput({ tags: "유모차친화, 수유실완비, 뷰맛집, 웨이팅" }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.stroller_friendly).toBe(true);
    expect(result.data.has_nursing_room).toBe(true);
    expect(result.data.tags).toContain("뷰맛집");
    expect(result.data.tags).not.toContain("유모차친화");
    expect(result.data.tags).not.toContain("수유실완비");
    expect(result.data.tags).not.toContain("웨이팅");
  });
});

// ─── parsePlacesFromSheet ──────────────────────────────────────────────────

describe("parsePlacesFromSheet — 행 처리", () => {
  it("빈 rows → places 0건", () => {
    const result = parsePlacesFromSheet([]);
    expect(result.places).toHaveLength(0);
    expect(result.skipped).toBe(0);
    expect(result.invalid).toHaveLength(0);
  });

  it("헤더 1행만 → places 0건, skipped 0", () => {
    const result = parsePlacesFromSheet([HEADER_ROW]);
    expect(result.places).toHaveLength(0);
  });

  it("유효한 단일 데이터 행 → places 1건", () => {
    const result = parsePlacesFromSheet([HEADER_ROW, makeRow()]);
    expect(result.places).toHaveLength(1);
    expect(result.places[0]!.id).toBe("test-001");
  });

  it("status=archived 행 → skipped 카운트 증가, places에 미포함", () => {
    const result = parsePlacesFromSheet([
      HEADER_ROW,
      makeRow({ status: "archived" }),
    ]);
    expect(result.places).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("id 없는 행 → skipped 카운트 증가", () => {
    const result = parsePlacesFromSheet([
      HEADER_ROW,
      makeRow({ id: "" }),
    ]);
    expect(result.places).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("category 오류 행 → invalid 목록에 추가", () => {
    const result = parsePlacesFromSheet([
      HEADER_ROW,
      makeRow({ category: "bad_cat" }),
    ], { logErrors: false });
    expect(result.places).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]!.name).toBe("불국사");
  });

  it("유효 + 아카이브 + 오류 혼합 → 각 카운트 정확", () => {
    const rows = [
      HEADER_ROW,
      makeRow({ id: "v1", name: "유효A" }),
      makeRow({ id: "v2", name: "유효B" }),
      makeRow({ id: "arc", status: "archived" }),
      makeRow({ id: "", name: "스킵" }),
      makeRow({ id: "bad", category: "nope" }),
    ];
    const result = parsePlacesFromSheet(rows, { logErrors: false });
    expect(result.places).toHaveLength(2);
    expect(result.skipped).toBe(2);
    expect(result.invalid).toHaveLength(1);
  });
});

// ─── buildHeaderIndex / rowToRawInput ─────────────────────────────────────

describe("buildHeaderIndex", () => {
  it("헤더 소문자 정규화", () => {
    const idx = buildHeaderIndex(["ID", "Name", "LAT"]);
    expect(idx.get("id")).toBe(0);
    expect(idx.get("name")).toBe(1);
    expect(idx.get("lat")).toBe(2);
  });

  it("공백 포함 헤더 trim 처리", () => {
    const idx = buildHeaderIndex([" id ", " name "]);
    expect(idx.get("id")).toBe(0);
    expect(idx.get("name")).toBe(1);
  });
});

describe("PLACE_SHEET_HEADERS 순서 불변식", () => {
  it("notes는 N열 (index 13), tags는 O열 (index 14), status는 P열 (index 15)", () => {
    expect(PLACE_SHEET_HEADERS[13]).toBe("notes");
    expect(PLACE_SHEET_HEADERS[14]).toBe("tags");
    expect(PLACE_SHEET_HEADERS[15]).toBe("status");
  });

  it("전체 컬럼 수는 16 (A~P)", () => {
    expect(PLACE_SHEET_HEADERS).toHaveLength(16);
  });
});
