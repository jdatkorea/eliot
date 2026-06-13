import { z } from "zod";
import type { Place, PlaceCategory } from "@/lib/engine/types";

export const PLACE_CATEGORIES = [
  "meal",
  "cafe",
  "activity",
  "view",
  "kids",
] as const satisfies readonly PlaceCategory[];

/** Google Sheets `places` 탭에서 인식하는 헤더 키 (소문자 정규화 기준) */
export const PLACE_SHEET_HEADERS = [
  "id",
  "destination",
  "name",
  "category",
  "lat",
  "lng",
  "curtail_count",
  "is_outdoor",
  "no_kids_zone",
  "break_time",
  "naver_url",
  "backup_place_id",
  "last_verified",
  "notes",
  "tags",
  "status",
] as const;

export type PlaceSheetHeader = (typeof PLACE_SHEET_HEADERS)[number];

/** 시트 셀 값 — Google Sheets API는 모든 셀을 문자열로 반환한다 */
export type SheetPlaceRawInput = Record<PlaceSheetHeader, string | undefined>;

function normalizeCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function parseSheetBoolean(value: unknown): boolean {
  const normalized = normalizeCell(value).toLowerCase();
  if (
    normalized === "" ||
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "n" ||
    normalized === "아니오" ||
    normalized === "x"
  ) {
    return false;
  }
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "예" ||
    normalized === "o"
  ) {
    return true;
  }
  return false;
}

function parseNullableString(value: unknown): string | null {
  const trimmed = normalizeCell(value);
  return trimmed === "" ? null : trimmed;
}

/** 시트 셀: 쉼표 구분 태그 → `string[]` (빈 셀 → `[]`) */
function parseSheetTags(value: unknown): string[] {
  const trimmed = normalizeCell(value);
  if (trimmed === "") {
    return [];
  }
  return trimmed
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function parseSheetNumber(
  value: unknown,
  fallback?: number,
): number | undefined {
  const trimmed = normalizeCell(value);
  if (trimmed === "") {
    return fallback;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const requiredString = (field: string) =>
  z
    .preprocess(normalizeCell, z.string())
    .refine((value) => value.length > 0, `${field}는 필수입니다`);

const sheetLatLng = (field: string) =>
  z.preprocess(
    normalizeCell,
    z
      .string()
      .min(1, `${field}는 필수입니다`)
      .refine(
        (value) => Number.isFinite(Number(value)),
        `${field}는 유효한 숫자여야 합니다`,
      )
      .transform((value) => Number(value)),
  );

const sheetCurtailCount = z.preprocess(
  (value) => parseSheetNumber(value, 0) ?? 0,
  z.number().int().nonnegative(),
);

const sheetBoolean = z.preprocess(parseSheetBoolean, z.boolean());

const nullableString = z.preprocess(parseNullableString, z.string().nullable());

const sheetTags = z.preprocess(parseSheetTags, z.array(z.string()));

/**
 * 시트 원시 문자열 입력 → Engine `Place` 계약으로 변환·검증.
 * `status`는 sync 단계에서 archived 필터링에만 사용하며 DB에는 저장하지 않는다.
 */
export const SheetPlaceSchema = z
  .object({
    id: requiredString("id"),
    destination: requiredString("destination"),
    name: requiredString("name"),
    category: z.preprocess(
      normalizeCell,
      z
        .string()
        .min(1, "category는 필수입니다")
        .refine(
          (value): value is PlaceCategory =>
            (PLACE_CATEGORIES as readonly string[]).includes(value),
          "category는 meal/cafe/activity/view/kids 중 하나여야 합니다",
        ),
    ),
    lat: sheetLatLng("lat"),
    lng: sheetLatLng("lng"),
    curtail_count: sheetCurtailCount,
    is_outdoor: sheetBoolean,
    no_kids_zone: sheetBoolean,
    break_time: nullableString,
    naver_url: requiredString("naver_url"),
    backup_place_id: nullableString,
    last_verified: requiredString("last_verified"),
    notes: nullableString,
    tags: sheetTags,
    status: z.preprocess(
      (value) => normalizeCell(value) || "active",
      z.enum(["active", "archived"]).optional(),
    ),
  })
  .transform(
    (row): Place => ({
      id: row.id,
      destination: row.destination,
      name: row.name,
      category: row.category,
      lat: row.lat,
      lng: row.lng,
      curtail_count: row.curtail_count,
      is_outdoor: row.is_outdoor,
      no_kids_zone: row.no_kids_zone,
      break_time: row.break_time,
      naver_url: row.naver_url,
      backup_place_id: row.backup_place_id,
      last_verified: row.last_verified,
      notes: row.notes,
      tags: row.tags,
    }),
  );

export type SheetPlaceParseError = {
  rowNumber: number;
  name: string;
  reason: string;
};

export function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path =
        issue.path.length > 0 ? `${String(issue.path[0])}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

export function buildHeaderIndex(headerRow: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((name, i) => {
    index.set(name.trim().toLowerCase(), i);
  });
  return index;
}

export function rowToRawInput(
  headerIndex: Map<string, number>,
  row: string[],
): SheetPlaceRawInput {
  const cell = (key: PlaceSheetHeader): string | undefined => {
    const index = headerIndex.get(key);
    return index === undefined ? undefined : row[index];
  };

  return {
    id: cell("id"),
    destination: cell("destination"),
    name: cell("name"),
    category: cell("category"),
    lat: cell("lat"),
    lng: cell("lng"),
    curtail_count: cell("curtail_count"),
    is_outdoor: cell("is_outdoor"),
    no_kids_zone: cell("no_kids_zone"),
    break_time: cell("break_time"),
    naver_url: cell("naver_url"),
    backup_place_id: cell("backup_place_id"),
    last_verified: cell("last_verified"),
    notes: cell("notes"),
    tags: cell("tags"),
    status: cell("status"),
  };
}
