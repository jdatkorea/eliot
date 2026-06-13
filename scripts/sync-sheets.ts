/**
 * Google Sheets → Supabase places + app_config 동기화 (SEED 전용)
 *
 * 아키텍처 불변식: 이 스크립트는 개발/운영 SEED 단계에서만 실행한다.
 * 런타임 웹훅·Engine 계층에는 Google API 의존성이 주입되지 않는다.
 *
 * 실행: SYNC_EXECUTE=true npm run cms:sync
 * (기본값 false — 스캐폴딩 단계에서는 읽기·파싱까지만 수행)
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { google } from "googleapis";
import type { Place } from "@/lib/engine/types";
import {
  buildHeaderIndex,
  formatZodIssues,
  rowToRawInput,
  SheetPlaceSchema,
  type SheetPlaceParseError,
} from "@/lib/seed/validate-places";
import {
  parseGoogleServiceAccountCredentials,
  resolveSpreadsheetId,
} from "./lib/google-sheets-auth";
import {
  parseConfigFromSheet,
  upsertAppConfig,
} from "./lib/config-sync";
import {
  createServiceRoleClient,
  upsertPlaces,
} from "./lib/place-sync";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

export type ParsePlacesResult = {
  places: Place[];
  skipped: number;
  invalid: SheetPlaceParseError[];
};

export type SyncConfigResult = {
  fetched: number;
  parsed: number;
  skipped: number;
  invalid: number;
  warnings: number;
  upserted: number;
  keys: string[];
};

export type SyncSheetsResult = {
  places: {
    fetched: number;
    parsed: number;
    skipped: number;
    invalid: number;
    upserted: number;
    places: Place[];
  };
  config: SyncConfigResult;
};

// ---------------------------------------------------------------------------
// Google Sheets client (SEED only)
// ---------------------------------------------------------------------------

export async function fetchSheetValues(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const credentials = parseGoogleServiceAccountCredentials();
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

// ---------------------------------------------------------------------------
// Parsing — 2D array → Zod validation → Place[] (partial sync)
// ---------------------------------------------------------------------------

function logInvalidRows(errors: SheetPlaceParseError[]): void {
  for (const error of errors) {
    console.warn(
      `[skip] 행 ${error.rowNumber} / ${error.name} / ${error.reason}`,
    );
  }
}

/**
 * 시트 2D 배열을 순회하며 Zod 검증 후 유효한 `Place[]`만 반환한다.
 * 컬럼 순서는 헤더 행 기준으로 동적 매핑한다.
 */
export function parsePlacesFromSheet(
  rows: string[][],
  options?: { logErrors?: boolean },
): ParsePlacesResult {
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

  if (options?.logErrors !== false && invalid.length > 0) {
    logInvalidRows(invalid);
  }

  return { places, skipped, invalid };
}

// ---------------------------------------------------------------------------
// Workflow — read → parse → upsert (upsert gated by SYNC_EXECUTE)
// ---------------------------------------------------------------------------

export async function syncSheetsToSupabase(): Promise<SyncSheetsResult> {
  const spreadsheetId = resolveSpreadsheetId();
  const placesRange =
    process.env.GOOGLE_SHEETS_PLACES_RANGE ?? "places!A1:P";
  const configRange =
    process.env.GOOGLE_SHEETS_CONFIG_RANGE ?? "config!A1:D";

  const [placesRows, configRows] = await Promise.all([
    fetchSheetValues(spreadsheetId, placesRange),
    fetchSheetValues(spreadsheetId, configRange),
  ]);

  const { places, skipped, invalid } = parsePlacesFromSheet(placesRows);
  const {
    rows: configParsed,
    skipped: configSkipped,
    invalid: configInvalid,
    warnings: configWarnings,
  } = parseConfigFromSheet(configRows);

  let placesUpserted = 0;
  let configUpserted = 0;
  let configKeys: string[] = [];
  const shouldExecute = process.env.SYNC_EXECUTE === "true";

  if (shouldExecute) {
    if (places.length === 0) {
      throw new Error(
        "시트에서 유효한 places가 0건입니다. 파싱 오류 또는 시트 범위를 확인하세요.",
      );
    }

    const supabase = createServiceRoleClient();

    const { data: destRows } = await supabase
      .from("destinations")
      .select("destination_id");
    const knownDestinations = new Set(
      (destRows ?? []).map((r: { destination_id: string }) => r.destination_id),
    );
    if (knownDestinations.size > 0) {
      const unknownDests = new Set(
        places
          .map((p) => p.destination)
          .filter((d) => !knownDestinations.has(d)),
      );
      for (const dest of unknownDests) {
        console.warn(
          `[warn] places.destination "${dest}"이 destinations 테이블에 없습니다 — 해당 destination 행을 먼저 추가하세요.`,
        );
      }
    }

    if (places.length > 0) {
      const result = await upsertPlaces(supabase, places);
      placesUpserted = result.length;

      console.log(`Upserted ${placesUpserted} places into Supabase.`);
      for (const row of result) {
        console.log(`  - ${row.name} (${row.id})`);
      }
    }

    if (configParsed.length > 0) {
      const configResult = await upsertAppConfig(supabase, configParsed);
      configUpserted = configResult.upserted;
      configKeys = configResult.keys;

      console.log(
        `Upserted ${configUpserted} config keys into Supabase (${configInvalid.length}건 스킵).`,
      );
      for (const key of configKeys) {
        console.log(`  - ${key}`);
      }
    } else if (configInvalid.length > 0) {
      console.warn(
        `[config] upsert 대상 없음 — JSON 오류 ${configInvalid.length}건, 스킵 ${configSkipped}건`,
      );
    }
  } else {
    console.log(
      `[dry-run] places: valid=${places.length} skipped=${skipped} invalid=${invalid.length}`,
    );
    console.log(
      `[dry-run] config: valid=${configParsed.length} skipped=${configSkipped} invalid=${configInvalid.length} warnings=${configWarnings.length}. Set SYNC_EXECUTE=true to upsert valid rows only.`,
    );
  }

  return {
    places: {
      fetched: placesRows.length,
      parsed: places.length,
      skipped,
      invalid: invalid.length,
      upserted: placesUpserted,
      places,
    },
    config: {
      fetched: configRows.length,
      parsed: configParsed.length,
      skipped: configSkipped,
      invalid: configInvalid.length,
      warnings: configWarnings.length,
      upserted: configUpserted,
      keys: configKeys,
    },
  };
}

async function main() {
  const result = await syncSheetsToSupabase();
  console.log(
    `Sync complete: places fetched=${result.places.fetched} parsed=${result.places.parsed} upserted=${result.places.upserted}`,
  );
  console.log(
    `Sync complete: config fetched=${result.config.fetched} parsed=${result.config.parsed} upserted=${result.config.upserted}`,
  );
}

main().catch((error) => {
  console.error(
    "cms:sync failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
