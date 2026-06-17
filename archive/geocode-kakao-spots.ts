/**
 * pending_geocode 전용 지오코딩 스크립트
 *
 * - 입력 CSV에서 lat/lng가 비어있는 행만 카카오 로컬 API로 조회
 * - 성공 시 좌표를 채워 출력 CSV로 저장
 * - 실패 시 원본 행을 unresolved CSV로 분리 저장
 * - 추정 좌표는 절대 사용하지 않음
 *
 * 실행 예시:
 *   npx tsx scripts/geocode-kakao-spots.ts
 *   npx tsx scripts/geocode-kakao-spots.ts docs/eliot_spots.csv docs/eliot_spots.geocoded.csv docs/unresolved_spots.csv
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

type CsvRow = string[];

type SpotRecord = {
  rowIndex: number;
  row: CsvRow;
  id: string;
  name: string;
  destination: string;
  lat: string;
  lng: string;
  notes: string;
};

const MIN_DELAY_MS = 200;
const PROGRESS_EVERY = 50;
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY?.trim();

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  cells.push(current);
  return cells;
}

function toCsvCell(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(rows: CsvRow[]): string {
  return rows.map((row) => row.map((cell) => toCsvCell(cell ?? "")).join(",")).join("\n") + "\n";
}

function normalize(s: string | undefined): string {
  return (s ?? "").trim();
}

function hasCoord(value: string): boolean {
  return normalize(value) !== "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function getHeaderIndex(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    map[normalize(h)] = idx;
  });

  const required = ["id", "destination", "name", "lat", "lng", "notes", "status"];
  for (const key of required) {
    if (map[key] === undefined) {
      throw new Error(`CSV 필수 헤더 누락: ${key}`);
    }
  }
  return map;
}

function buildAddressQuery(spot: SpotRecord): string | null {
  const notes = normalize(spot.notes);
  const fromNote = notes.match(/(?:^|,)\s*주소\s*:\s*([^,]+)/);
  if (fromNote?.[1]) {
    return normalize(fromNote[1]);
  }
  return null;
}

function buildKeywordQueries(spot: SpotRecord): string[] {
  const q1 = `${spot.name} ${spot.destination}`.trim();
  const q2 = spot.name.trim();
  return [q1, q2].filter((q) => q.length > 0);
}

async function callKakaoAddressSearch(query: string): Promise<{ lat: string; lng: string } | null> {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);

  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${KAKAO_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`address API ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    documents?: Array<{ x?: string; y?: string }>;
  };
  const doc = data.documents?.[0];
  if (!doc?.x || !doc?.y) {
    return null;
  }
  return { lat: doc.y, lng: doc.x };
}

async function callKakaoKeywordSearch(query: string): Promise<{ lat: string; lng: string } | null> {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "1");

  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${KAKAO_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`keyword API ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    documents?: Array<{ x?: string; y?: string }>;
  };
  const doc = data.documents?.[0];
  if (!doc?.x || !doc?.y) {
    return null;
  }
  return { lat: doc.y, lng: doc.x };
}

async function geocodeSpot(spot: SpotRecord): Promise<{ lat: string; lng: string } | null> {
  const addressQuery = buildAddressQuery(spot);
  if (addressQuery) {
    const fromAddress = await callKakaoAddressSearch(addressQuery);
    if (fromAddress) {
      return fromAddress;
    }
  }

  for (const keyword of buildKeywordQueries(spot)) {
    const fromKeyword = await callKakaoKeywordSearch(keyword);
    if (fromKeyword) {
      return fromKeyword;
    }
  }

  return null;
}

async function main() {
  if (!KAKAO_KEY) {
    throw new Error("KAKAO_REST_API_KEY가 없습니다. .env.local을 확인하세요.");
  }

  const inputPath = resolve(process.cwd(), process.argv[2] ?? "docs/eliot_spots.csv");
  const outputPath = resolve(process.cwd(), process.argv[3] ?? "docs/eliot_spots.geocoded.csv");
  const unresolvedPath = resolve(process.cwd(), process.argv[4] ?? "docs/unresolved_spots.csv");

  const raw = await readFile(inputPath, "utf8");
  const lines = raw.replace(/\r\n/g, "\n").split("\n").filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error("CSV 데이터가 비어 있습니다.");
  }

  const rows = lines.map(splitCsvLine);
  const headers = rows[0];
  const headerIndex = getHeaderIndex(headers);

  const allRows = rows.slice(1);
  const unresolvedRows: CsvRow[] = [headers];

  let targetCount = 0;
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let processed = 0;

  for (let i = 0; i < allRows.length; i += 1) {
    const row = allRows[i];
    const lat = normalize(row[headerIndex.lat]);
    const lng = normalize(row[headerIndex.lng]);
    const status = normalize(row[headerIndex.status]).toLowerCase();

    if (hasCoord(lat) && hasCoord(lng)) {
      continue;
    }
    if (status !== "pending_geocode") {
      continue;
    }

    targetCount += 1;
    processed += 1;

    const spot: SpotRecord = {
      rowIndex: i + 2,
      row,
      id: normalize(row[headerIndex.id]),
      destination: normalize(row[headerIndex.destination]),
      name: normalize(row[headerIndex.name]),
      lat,
      lng,
      notes: normalize(row[headerIndex.notes]),
    };

    try {
      const point = await geocodeSpot(spot);
      if (point) {
        row[headerIndex.lat] = point.lat;
        row[headerIndex.lng] = point.lng;
        row[headerIndex.status] = "active";
        resolvedCount += 1;
      } else {
        unresolvedRows.push([...row]);
        unresolvedCount += 1;
      }
    } catch (error) {
      unresolvedRows.push([...row]);
      unresolvedCount += 1;
      console.warn(
        `[warn] row=${spot.rowIndex} id=${spot.id} name=${spot.name} geocode 실패: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (processed % PROGRESS_EVERY === 0) {
      console.log(
        `[progress] ${processed}/${targetCount} attempted | resolved=${resolvedCount} unresolved=${unresolvedCount}`,
      );
    }

    await sleep(MIN_DELAY_MS);
  }

  const outputRows: CsvRow[] = [headers, ...allRows];
  await writeFile(outputPath, rowsToCsv(outputRows), "utf8");
  await writeFile(unresolvedPath, rowsToCsv(unresolvedRows), "utf8");

  console.log("[done] geocoding finished");
  console.log(`- input: ${inputPath}`);
  console.log(`- output: ${outputPath}`);
  console.log(`- unresolved: ${unresolvedPath}`);
  console.log(`- targets(pending_geocode & no coord): ${targetCount}`);
  console.log(`- resolved: ${resolvedCount}`);
  console.log(`- unresolved: ${unresolvedCount}`);
}

main().catch((error) => {
  console.error(
    "[geocode] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
