import { describe, expect, it } from "vitest";
import {
  SheetPlaceSchema,
  parsePlacesFromSheet,
  buildHeaderIndex,
  rowToRawInput,
  PLACE_SHEET_HEADERS,
} from "@/lib/seed/validate-places";

// PLACE_SHEET_HEADERS 순서:
// id(0) destination(1) name(2) category(3) is_outdoor(4) no_kids_zone(5) tags(6)

const HEADER_ROW = [...PLACE_SHEET_HEADERS];

function makeRow(overrides: Partial<Record<(typeof PLACE_SHEET_HEADERS)[number], string>> = {}): string[] {
  const defaults: Record<string, string> = {
    id: "test-001",
    destination: "경주",
    name: "불국사",
    category: "activity",
    is_outdoor: "true",
    no_kids_zone: "false",
    tags: "",
  };
  const merged = { ...defaults, ...overrides };
  return HEADER_ROW.map((h) => merged[h] ?? "");
}

const HEADER_INDEX = buildHeaderIndex(HEADER_ROW);

function rawInput(overrides: Partial<Record<(typeof PLACE_SHEET_HEADERS)[number], string>> = {}) {
  return rowToRawInput(HEADER_INDEX, makeRow(overrides));
}

describe("SheetPlaceSchema — 기본 파싱", () => {
  it("유효한 행 → Place 반환", () => {
    const result = SheetPlaceSchema.safeParse(rawInput());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.id).toBe("test-001");
    expect(result.data.destination).toBe("경주");
    expect(result.data.category).toBe("activity");
    expect(result.data.is_outdoor).toBe(true);
    expect(result.data.no_kids_zone).toBe(false);
    expect(result.data.tags).toEqual([]);
    expect(result.data.stroller_friendly).toBe(false);
    expect(result.data.has_nursing_room).toBe(false);
  });

  it("FALSE/TRUE 대문자 boolean 파싱", () => {
    const result = SheetPlaceSchema.safeParse(
      rawInput({ is_outdoor: "FALSE", no_kids_zone: "TRUE" }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.is_outdoor).toBe(false);
    expect(result.data.no_kids_zone).toBe(true);
  });
});

describe("SheetPlaceSchema — 필수 필드 오류", () => {
  it("id 없음 → fail", () => {
    expect(SheetPlaceSchema.safeParse(rawInput({ id: "" })).success).toBe(false);
  });

  it("category 잘못된 값 → fail", () => {
    expect(SheetPlaceSchema.safeParse(rawInput({ category: "unknown" })).success).toBe(false);
  });

  it("name 없음 → fail", () => {
    expect(SheetPlaceSchema.safeParse(rawInput({ name: "" })).success).toBe(false);
  });
});

describe("SheetPlaceSchema — boolean 파싱", () => {
  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["yes", true],
    ["y", true],
    ["false", false],
    ["FALSE", false],
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

  it("유효 + 스킵 + 오류 혼합 → 각 카운트 정확", () => {
    const rows = [
      HEADER_ROW,
      makeRow({ id: "v1", name: "유효A" }),
      makeRow({ id: "v2", name: "유효B" }),
      makeRow({ id: "", name: "스킵" }),
      makeRow({ id: "bad", category: "nope" }),
    ];
    const result = parsePlacesFromSheet(rows, { logErrors: false });
    expect(result.places).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.invalid).toHaveLength(1);
  });
});

describe("buildHeaderIndex", () => {
  it("헤더 소문자 정규화", () => {
    const idx = buildHeaderIndex(["ID", "Name", "CATEGORY"]);
    expect(idx.get("id")).toBe(0);
    expect(idx.get("name")).toBe(1);
    expect(idx.get("category")).toBe(2);
  });

  it("공백 포함 헤더 trim 처리", () => {
    const idx = buildHeaderIndex([" id ", " name "]);
    expect(idx.get("id")).toBe(0);
    expect(idx.get("name")).toBe(1);
  });
});

describe("PLACE_SHEET_HEADERS 순서 불변식", () => {
  it("tags는 G열 (index 6)", () => {
    expect(PLACE_SHEET_HEADERS[6]).toBe("tags");
  });

  it("전체 컬럼 수는 7 (A~G)", () => {
    expect(PLACE_SHEET_HEADERS).toHaveLength(7);
  });
});
