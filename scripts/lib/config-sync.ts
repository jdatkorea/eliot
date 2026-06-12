import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  assembleAppConfigFromRows,
  parseConfigValueSafe,
  REQUIRED_CONFIG_KEYS,
  validateRequiredConfigKeys,
  type AppConfigRow,
} from "@/lib/config/app-config";

const CONFIG_HEADERS = ["key", "value", "scope", "updated_at"] as const;

export type ConfigSheetParseError = {
  rowNumber: number;
  key: string;
  reason: string;
};

export type ParseConfigResult = {
  rows: AppConfigRow[];
  skipped: number;
  invalid: ConfigSheetParseError[];
  warnings: ConfigSheetParseError[];
  missingKeys: string[];
};

export type UpsertConfigResult = {
  upserted: number;
  keys: string[];
};

function buildHeaderIndex(headerRow: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const key = cell.trim().toLowerCase();
    if (key) index.set(key, i);
  });
  return index;
}

function cellAt(row: string[], index: Map<string, number>, col: string): string {
  const i = index.get(col);
  if (i === undefined) return "";
  return (row[i] ?? "").trim();
}

export function logConfigParseError(error: ConfigSheetParseError): void {
  console.error(
    `[config JSON 오류] 행 ${error.rowNumber} / ${error.key} / ${error.reason}`,
  );
}

export function logConfigWarning(error: ConfigSheetParseError): void {
  console.warn(
    `[config 경고] 행 ${error.rowNumber} / ${error.key} / ${error.reason}`,
  );
}

/**
 * config 시트 2D 배열 → 행 단위 검증된 AppConfigRow[].
 * JSON 구문 오류 행은 즉시 스킵하고, 유효 행만 upsert 대상으로 반환한다.
 */
export function parseConfigFromSheet(
  rows: string[][],
  options?: { logErrors?: boolean },
): ParseConfigResult {
  if (rows.length === 0) {
    return {
      rows: [],
      skipped: 0,
      invalid: [],
      warnings: [],
      missingKeys: [...REQUIRED_CONFIG_KEYS],
    };
  }

  const headerIndex = buildHeaderIndex(rows[0]);
  const dataRows = rows.slice(1);
  const parsed: AppConfigRow[] = [];
  const invalid: ConfigSheetParseError[] = [];
  const warnings: ConfigSheetParseError[] = [];
  let skipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2;
    const key = cellAt(dataRows[i], headerIndex, "key");
    const rawValue = cellAt(dataRows[i], headerIndex, "value");
    const scope = cellAt(dataRows[i], headerIndex, "scope") || "global";
    const updatedAt =
      cellAt(dataRows[i], headerIndex, "updated_at") ||
      new Date().toISOString().slice(0, 10);

    if (!key) {
      skipped += 1;
      continue;
    }

    if (scope !== "global") {
      skipped += 1;
      continue;
    }

    const parseResult = parseConfigValueSafe(rawValue);
    if (!parseResult.ok) {
      const error: ConfigSheetParseError = {
        rowNumber,
        key,
        reason: parseResult.reason,
      };
      invalid.push(error);
      if (options?.logErrors !== false) {
        logConfigParseError(error);
      }
      continue;
    }

    parsed.push({
      key,
      value: parseResult.value,
      scope,
      updated_at: updatedAt,
    });
  }

  const keySet = new Set(parsed.map((row) => row.key));
  const missingKeys = validateRequiredConfigKeys(keySet);

  if (missingKeys.length > 0) {
    for (const key of missingKeys) {
      const warning: ConfigSheetParseError = {
        rowNumber: 0,
        key,
        reason: "필수 config key 누락 (유효 행만 upsert, 런타임은 DEFAULT fail-over)",
      };
      warnings.push(warning);
      if (options?.logErrors !== false) {
        logConfigWarning(warning);
      }
    }
  } else {
    const rowMap = Object.fromEntries(parsed.map((row) => [row.key, row.value]));
    try {
      assembleAppConfigFromRows(rowMap);
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? error.issues.map((issue) => issue.message).join("; ")
          : error instanceof Error
            ? error.message
            : "AppConfig 검증 실패";
      const warning: ConfigSheetParseError = {
        rowNumber: 0,
        key: "(assembled)",
        reason: message,
      };
      warnings.push(warning);
      if (options?.logErrors !== false) {
        logConfigWarning(warning);
      }
    }
  }

  return { rows: parsed, skipped, invalid, warnings, missingKeys };
}

export async function upsertAppConfig(
  supabase: SupabaseClient,
  configRows: AppConfigRow[],
): Promise<UpsertConfigResult> {
  if (configRows.length === 0) {
    return { upserted: 0, keys: [] };
  }

  const dbRows = configRows.map((row) => ({
    key: row.key,
    value: row.value,
    scope: row.scope,
    updated_at: row.updated_at,
  }));

  const { data, error } = await supabase
    .from("app_config")
    .upsert(dbRows, { onConflict: "key" })
    .select("key");

  if (error) {
    throw error;
  }

  return {
    upserted: data?.length ?? 0,
    keys: (data ?? []).map((row) => row.key as string),
  };
}

export function expectedConfigHeaders(): readonly string[] {
  return CONFIG_HEADERS;
}
