import { describe, expect, it } from "vitest";
import { parseImportCsv } from "@/scripts/import-tour-data";

const HEADER =
  "id,destination,name,category,is_outdoor,no_kids_zone,tags";

function makeRows(...dataRows: string[]): string[][] {
  return [HEADER.split(","), ...dataRows.map((r) => r.split(","))];
}

describe("parseImportCsv — 기본 파싱", () => {
  it("유효한 단일 행 파싱", () => {
    const rows = makeRows(
      "g001,경주,불국사,activity,true,false,",
    );
    const result = parseImportCsv(rows);
    expect(result.parsed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.places[0]!.id).toBe("g001");
    expect(result.places[0]!.category).toBe("activity");
    expect(result.places[0]!.is_outdoor).toBe(true);
    expect(result.places[0]!.no_kids_zone).toBe(false);
  });

  it("FALSE/TRUE 대문자 boolean 파싱", () => {
    const rows = makeRows(
      "g001,경주,불국사,activity,FALSE,TRUE,",
    );
    const result = parseImportCsv(rows);
    expect(result.places[0]!.is_outdoor).toBe(false);
    expect(result.places[0]!.no_kids_zone).toBe(true);
  });

  it("id 없는 행 → skipped 카운트 증가", () => {
    const rows = makeRows(
      ",경주,이름없는,meal,false,false,",
    );
    const result = parseImportCsv(rows);
    expect(result.parsed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("category 오류 → invalid 카운트 증가", () => {
    const rows = makeRows(
      "g002,경주,오류장소,unknown,false,false,",
    );
    const result = parseImportCsv(rows);
    expect(result.invalid).toBe(1);
    expect(result.errors[0]!.reason).toMatch(/category/);
  });

  it("헤더에 필수 컬럼 누락 → throw", () => {
    const badRows = [["id", "name"], ["g001", "테스트"]];
    expect(() => parseImportCsv(badRows)).toThrow(/필수 컬럼/);
  });

  it("행 수 < 2 → 빈 결과", () => {
    const result = parseImportCsv([]);
    expect(result.parsed).toBe(0);
  });
});

describe("parseImportCsv — 태그 분류 통합", () => {
  it("유모차친화 태그 → stroller_friendly=true, tags에서 제거", () => {
    const rows = makeRows(
      "g010,경주,테스트,activity,true,false,유모차친화",
    );
    const { places } = parseImportCsv(rows);
    expect(places[0]!.stroller_friendly).toBe(true);
    expect(places[0]!.tags).not.toContain("유모차친화");
  });

  it("수유실완비 태그 → has_nursing_room=true", () => {
    const rows = makeRows(
      "g011,경주,테스트,kids,false,false,수유실완비",
    );
    expect(parseImportCsv(rows).places[0]!.has_nursing_room).toBe(true);
  });

  it("웨이팅 태그 → dropped, tags 비움", () => {
    const rows = makeRows(
      "g012,경주,테스트,meal,false,false,웨이팅",
    );
    const { places } = parseImportCsv(rows);
    expect(places[0]!.tags).toEqual([]);
  });

  it("뷰맛집 태그 → tags에 포함", () => {
    const rows = makeRows(
      "g013,경주,테스트,view,true,false,뷰맛집",
    );
    expect(parseImportCsv(rows).places[0]!.tags).toContain("뷰맛집");
  });
});

describe("parseImportCsv — 복수 행", () => {
  it("유효 2건 + 스킵 1건 + 오류 1건", () => {
    const rows = makeRows(
      "g020,경주,유효A,meal,false,false,",
      "g021,경주,유효B,cafe,false,false,뷰맛집",
      ",경주,스킵,view,false,false,",
      "g022,경주,오류카테고리,bad_cat,false,false,",
    );
    const result = parseImportCsv(rows);
    expect(result.parsed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.invalid).toBe(1);
  });
});
