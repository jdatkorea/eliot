/**
 * cms:sync upsert 전 diff 리포트 (SEED 전용, 읽기 전용)
 *
 * 소스: GOOGLE_* 설정 시 Sheets, 없으면 fixtures/places.sample.json + DEFAULT_APP_CONFIG
 * 대상: Supabase places / app_config 스냅샷
 *
 * 실행: npx tsx scripts/sync-diff.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { google } from "googleapis";
import {
  DEFAULT_APP_CONFIG,
  type AppConfigRow,
} from "@/lib/config/app-config";
import type { Place } from "@/lib/engine/types";
import {
  buildHeaderIndex,
  formatZodIssues,
  rowToRawInput,
  SheetPlaceSchema,
  type SheetPlaceParseError,
} from "@/lib/seed/validate-places";
import { parseConfigFromSheet } from "./lib/config-sync";
import { createServiceRoleClient, mapPlaceRow } from "./lib/place-sync";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

type DiffCounts = { added: number; changed: number; removed: number };

type PlaceDbRow = ReturnType<typeof mapPlaceRow>;

type ConfigDbRow = { key: string; value: unknown; scope: string };

const PLACE_COMPARE_FIELDS = [
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
] as const satisfies readonly (keyof Omit<PlaceDbRow, "id">)[];

function hasGoogleSheetsEnv(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim() &&
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim(),
  );
}

function parseServiceAccountKey(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY가 .env.local에 없습니다. 서비스 계정 JSON을 한 줄로 설정하세요.",
    );
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY JSON 파싱에 실패했습니다.");
  }
}

async function fetchSheetValues(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const credentials = parseServiceAccountKey();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (response.data.values ?? []) as string[][];
}

function parsePlacesFromSheet(rows: string[][]): {
  places: Place[];
  skipped: number;
  invalid: SheetPlaceParseError[];
} {
  if (rows.length === 0) {
    return { places: [], skipped: 0, invalid: [] };
  }

  const headerIndex = buildHeaderIndex(rows[0]);
  const dataRows = rows.slice(1);
  const places: Place[] = [];
  const invalid: SheetPlaceParseError[] = [];
  let skipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2;
    const raw = rowToRawInput(headerIndex, dataRows[i]);
    const id = (raw.id ?? "").trim();

    if (!id) {
      skipped += 1;
      continue;
    }

    const status = (raw.status ?? "active").trim().toLowerCase();
    if (status === "archived") {
      skipped += 1;
      continue;
    }

    const result = SheetPlaceSchema.safeParse(raw);
    if (result.success) {
      places.push(result.data);
      continue;
    }

    invalid.push({
      rowNumber,
      name: (raw.name ?? "").trim() || "(이름 없음)",
      reason: formatZodIssues(result.error.issues),
    });
  }

  return { places, skipped, invalid };
}

function loadFixturePlaces(): Place[] {
  const fixturePath = resolve(process.cwd(), "fixtures/places.sample.json");
  return JSON.parse(readFileSync(fixturePath, "utf-8")) as Place[];
}

function defaultConfigRows(): AppConfigRow[] {
  const today = new Date().toISOString().slice(0, 10);
  const entries: [string, unknown][] = [
    ["mood_tags", DEFAULT_APP_CONFIG.mood_tags],
    ["mood_tag_effects", DEFAULT_APP_CONFIG.mood_tag_effects],
    ["templates", DEFAULT_APP_CONFIG.templates],
    ["origin_coords", DEFAULT_APP_CONFIG.origin_coords],
    ["rain_prob_threshold", DEFAULT_APP_CONFIG.rain_prob_threshold],
    ["default_radius_cap_km", DEFAULT_APP_CONFIG.default_radius_cap_km],
    ["extend_radius_cap_km", DEFAULT_APP_CONFIG.extend_radius_cap_km],
    ["baby_tired_radius_cap_km", DEFAULT_APP_CONFIG.baby_tired_radius_cap_km],
    ["transport_thresholds", DEFAULT_APP_CONFIG.transport_thresholds],
  ];

  return entries.map(([key, value]) => ({
    key,
    value,
    scope: "global",
    updated_at: today,
  }));
}

async function loadSourceFromSheets(): Promise<{
  mode: "sheets";
  places: Place[];
  configRows: AppConfigRow[];
  placesMeta: { skipped: number; invalid: number };
  configMeta: { skipped: number; invalid: number };
}> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;
  const placesRange =
    process.env.GOOGLE_SHEETS_PLACES_RANGE ?? "places!A1:O";
  const configRange =
    process.env.GOOGLE_SHEETS_CONFIG_RANGE ?? "config!A1:D";

  const [placesRows, configRows] = await Promise.all([
    fetchSheetValues(spreadsheetId, placesRange),
    fetchSheetValues(spreadsheetId, configRange),
  ]);

  const placesResult = parsePlacesFromSheet(placesRows);
  const configResult = parseConfigFromSheet(configRows, { logErrors: false });

  return {
    mode: "sheets",
    places: placesResult.places,
    configRows: configResult.rows,
    placesMeta: {
      skipped: placesResult.skipped,
      invalid: placesResult.invalid.length,
    },
    configMeta: {
      skipped: configResult.skipped,
      invalid: configResult.invalid.length,
    },
  };
}

function loadSourceFromFixture(): {
  mode: "fixture";
  places: Place[];
  configRows: AppConfigRow[];
} {
  return {
    mode: "fixture",
    places: loadFixturePlaces(),
    configRows: defaultConfigRows(),
  };
}

function normalizePlacesForCompare(places: Place[]): {
  byId: Map<string, PlaceDbRow>;
  slugById: Map<string, string>;
} {
  const idCache = new Map<string, string>();
  const byId = new Map<string, PlaceDbRow>();
  const slugById = new Map<string, string>();

  for (const place of places) {
    const row = mapPlaceRow(place, idCache);
    byId.set(row.id, row);
    slugById.set(row.id, place.id);
  }

  return { byId, slugById };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatBrief(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= 48) {
    return text;
  }
  return `${text.slice(0, 45)}…`;
}

function summarizeFieldChange(field: string, before: unknown, after: unknown): string {
  if (field === "templates" || field === "mood_tag_effects" || field === "origin_coords") {
    if (
      typeof before === "object" &&
      before !== null &&
      typeof after === "object" &&
      after !== null &&
      !Array.isArray(before) &&
      !Array.isArray(after)
    ) {
      const keys = new Set([
        ...Object.keys(before as Record<string, unknown>),
        ...Object.keys(after as Record<string, unknown>),
      ]);
      const changedKeys: string[] = [];
      for (const key of keys) {
        if (
          !valuesEqual(
            (before as Record<string, unknown>)[key],
            (after as Record<string, unknown>)[key],
          )
        ) {
          changedKeys.push(key);
        }
      }
      if (changedKeys.length > 0) {
        const preview = changedKeys.slice(0, 4).join(", ");
        const suffix = changedKeys.length > 4 ? ` 외 ${changedKeys.length - 4}건` : "";
        return `${field}(${preview}${suffix})`;
      }
    }
  }

  if (Array.isArray(before) && Array.isArray(after) && before.length !== after.length) {
    return `${field} ${before.length}→${after.length}항`;
  }

  return `${field} ${formatBrief(before)}→${formatBrief(after)}`;
}

function diffKeyedRows<T extends { id?: string; key?: string }>(
  sourceMap: Map<string, T>,
  snapshotMap: Map<string, T>,
  compareFields: readonly string[],
  labelFor: (row: T, id: string) => string,
): { counts: DiffCounts; changedSummaries: string[]; addedLabels: string[]; removedLabels: string[] } {
  const addedLabels: string[] = [];
  const removedLabels: string[] = [];
  const changedSummaries: string[] = [];

  for (const [id, sourceRow] of sourceMap) {
    if (!snapshotMap.has(id)) {
      addedLabels.push(labelFor(sourceRow, id));
    }
  }

  for (const [id, snapshotRow] of snapshotMap) {
    if (!sourceMap.has(id)) {
      removedLabels.push(labelFor(snapshotRow, id));
    }
  }

  for (const [id, sourceRow] of sourceMap) {
    const snapshotRow = snapshotMap.get(id);
    if (!snapshotRow) {
      continue;
    }

    const fieldChanges: string[] = [];
    for (const field of compareFields) {
      const before = (snapshotRow as Record<string, unknown>)[field];
      const after = (sourceRow as Record<string, unknown>)[field];
      if (!valuesEqual(before, after)) {
        fieldChanges.push(summarizeFieldChange(field, before, after));
      }
    }

    if (fieldChanges.length > 0) {
      changedSummaries.push(`${labelFor(sourceRow, id)}: ${fieldChanges.join(", ")}`);
    }
  }

  return {
    counts: {
      added: addedLabels.length,
      changed: changedSummaries.length,
      removed: removedLabels.length,
    },
    changedSummaries,
    addedLabels,
    removedLabels,
  };
}

function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message?.includes("Could not find the table") ?? false)
  );
}

async function fetchSnapshot(): Promise<{
  places: PlaceDbRow[];
  config: ConfigDbRow[];
  warnings: string[];
}> {
  const supabase = createServiceRoleClient();
  const warnings: string[] = [];

  const [placesResult, configResult] = await Promise.all([
    supabase.from("places").select("*"),
    supabase.from("app_config").select("key, value, scope"),
  ]);

  let places: PlaceDbRow[] = [];
  if (placesResult.error) {
    if (isMissingTableError(placesResult.error)) {
      warnings.push("Supabase places 테이블 없음 — 스냅샷을 빈 집합으로 처리");
    } else {
      throw placesResult.error;
    }
  } else {
    places = (placesResult.data ?? []) as PlaceDbRow[];
  }

  let config: ConfigDbRow[] = [];
  if (configResult.error) {
    if (isMissingTableError(configResult.error)) {
      warnings.push("Supabase app_config 테이블 없음 — 스냅샷을 빈 집합으로 처리");
    } else {
      throw configResult.error;
    }
  } else {
    config = (configResult.data ?? []) as ConfigDbRow[];
  }

  return { places, config, warnings };
}

function printSection(
  title: string,
  sourceLabel: string,
  counts: DiffCounts,
  changedSummaries: string[],
  addedLabels: string[],
  removedLabels: string[],
): void {
  console.log(`\n=== ${title} ===`);
  console.log(`소스: ${sourceLabel}`);
  console.log(`[added ${counts.added} / changed ${counts.changed} / removed ${counts.removed}]`);

  if (addedLabels.length > 0) {
    console.log(`  + ${addedLabels.join(", ")}`);
  }
  if (changedSummaries.length > 0) {
    for (const line of changedSummaries) {
      console.log(`  ~ ${line}`);
    }
  }
  if (removedLabels.length > 0) {
    console.log(`  - ${removedLabels.join(", ")}`);
  }
  if (
    counts.added === 0 &&
    counts.changed === 0 &&
    counts.removed === 0
  ) {
    console.log("  (변경 없음)");
  }
}

async function main() {
  console.log("=== cms:sync diff (read-only) ===\n");

  const source = hasGoogleSheetsEnv()
    ? await loadSourceFromSheets()
    : loadSourceFromFixture();

  console.log(
    `입력 모드: ${source.mode === "sheets" ? "Google Sheets" : "fixture fallback"}`,
  );
  if (source.mode === "sheets") {
    console.log(
      `  places 파싱: valid=${source.places.length} skipped=${source.placesMeta.skipped} invalid=${source.placesMeta.invalid}`,
    );
    console.log(
      `  config 파싱: valid=${source.configRows.length} skipped=${source.configMeta.skipped} invalid=${source.configMeta.invalid}`,
    );
  } else {
    console.log(
      `  places: fixtures/places.sample.json (${source.places.length}건)`,
    );
    console.log(
      `  config: DEFAULT_APP_CONFIG (${source.configRows.length} keys)`,
    );
  }

  const snapshot = await fetchSnapshot();
  for (const warning of snapshot.warnings) {
    console.warn(`  [warn] ${warning}`);
  }

  const { byId: sourcePlaces, slugById } = normalizePlacesForCompare(source.places);
  const snapshotPlaces = new Map(
    snapshot.places.map((row) => [row.id, row]),
  );

  const placeLabel = (row: PlaceDbRow, id: string) => {
    const slug = slugById.get(id);
    return slug ? `${slug} (${row.name})` : `${row.name} [${id.slice(0, 8)}…]`;
  };

  const placesDiff = diffKeyedRows(
    sourcePlaces,
    snapshotPlaces,
    PLACE_COMPARE_FIELDS,
    placeLabel,
  );

  const sourceConfig = new Map(
    source.configRows.map((row) => [
      row.key,
      { key: row.key, value: row.value, scope: row.scope },
    ]),
  );
  const snapshotConfig = new Map(
    snapshot.config
      .filter((row) => row.scope === "global")
      .map((row) => [row.key, row]),
  );

  const configDiff = diffKeyedRows(
    sourceConfig,
    snapshotConfig,
    ["value"],
    (row) => row.key,
  );

  const placesSourceLabel =
    source.mode === "sheets"
      ? "Sheets places (valid rows)"
      : "fixtures/places.sample.json";
  const configSourceLabel =
    source.mode === "sheets"
      ? "Sheets config (valid rows)"
      : "DEFAULT_APP_CONFIG";

  printSection(
    "places",
    placesSourceLabel,
    placesDiff.counts,
    placesDiff.changedSummaries,
    placesDiff.addedLabels,
    placesDiff.removedLabels,
  );

  printSection(
    "app_config",
    configSourceLabel,
    configDiff.counts,
    configDiff.changedSummaries,
    configDiff.addedLabels,
    configDiff.removedLabels,
  );

  const totalChanges =
    placesDiff.counts.added +
    placesDiff.counts.changed +
    placesDiff.counts.removed +
    configDiff.counts.added +
    configDiff.counts.changed +
    configDiff.counts.removed;

  console.log(
    `\n완료: 총 ${totalChanges}건 차이 (upsert 미실행 — SYNC_EXECUTE 무관)`,
  );
}

main().catch((error) => {
  console.error(
    "cms:sync diff failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
