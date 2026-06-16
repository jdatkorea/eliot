/**
 * 오프라인 상가 CSV 매칭 스크립트
 *
 * - docs/eliot_spots.csv 의 좌표(lat/lng) 빈 행을 sanga/*.csv 와 매칭
 * - 소상공인시장진흥공단 스키마 고정 인덱스(0-based):
 *     1: 상호명, 2: 지점명, 37: 경도, 38: 위도
 * - 대용량: createReadStream + readline 한 줄씩 처리
 * - 인코딩: iconv-lite 디코딩 파이프 (202603 데이터는 UTF-8, BOM 제거)
 *
 * 실행: npx tsx scripts/match-spots.ts
 */
import { createReadStream } from "node:fs";
import { opendir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline";
import iconv from "iconv-lite";

/** 소상공인시장진흥공단 상가정보 CSV 고정 컬럼 인덱스 (0-based) */
const IDX_STORE_NAME = 1;
const IDX_BRANCH_NAME = 2;
const IDX_LNG = 37;
const IDX_LAT = 38;

/** 202603 배포본은 UTF-8 (sanga/[필독]파일열람방법.txt 참고) */
const SANGA_ENCODING = "utf8";

const SCORE_THRESHOLD = 65;

type CsvRow = string[];

type Spot = {
  rowIndex: number;
  id: string;
  name: string;
  normalizedName: string;
};

type CandidateRecord = {
  storeName: string;
  branchName: string;
  nameJoined: string;
  normalizedName: string;
  lat: string;
  lng: string;
};

type MatchResult = {
  spot: Spot;
  score: number;
  record: CandidateRecord;
};

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseForIncludes(value: string): string {
  return value.replace(/\s+/g, "");
}

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

function getRequiredIndex(headers: string[], keys: string[]): number {
  const normalizedHeaders = headers.map((h) => normalizeText(h));
  for (const key of keys) {
    const idx = normalizedHeaders.findIndex((h) => h === normalizeText(key));
    if (idx >= 0) {
      return idx;
    }
  }
  throw new Error(`필수 헤더를 찾을 수 없습니다: ${keys.join(" | ")}`);
}

function makeKeysForName(normalizedName: string): string[] {
  const noSpace = collapseForIncludes(normalizedName);
  const keys = new Set<string>();
  if (noSpace.length >= 2) {
    keys.add(noSpace.slice(0, 2));
    keys.add(noSpace.slice(-2));
  }
  if (noSpace.length >= 3) {
    keys.add(noSpace.slice(0, 3));
  }
  for (const token of normalizedName.split(" ")) {
    if (token.length >= 2) {
      keys.add(token);
    }
  }
  return [...keys];
}

function calculateScore(spotNorm: string, candidateNorm: string): number {
  const s = collapseForIncludes(spotNorm);
  const c = collapseForIncludes(candidateNorm);

  if (!s || !c) {
    return 0;
  }
  if (s === c) {
    return 100;
  }
  if (c.includes(s)) {
    return 90;
  }
  if (s.includes(c)) {
    return 80;
  }

  const spotTokens = new Set(spotNorm.split(" ").filter(Boolean));
  const candTokens = new Set(candidateNorm.split(" ").filter(Boolean));

  let overlap = 0;
  for (const token of spotTokens) {
    if (candTokens.has(token)) {
      overlap += 1;
    }
  }

  const tokenScore = spotTokens.size > 0 ? (overlap / spotTokens.size) * 70 : 0;
  const lenPenalty = Math.min(Math.abs(s.length - c.length), 30);
  return Math.max(0, Math.round(tokenScore + 15 - lenPenalty));
}

function extractSangaFields(row: string[]): CandidateRecord | null {
  const storeName = (row[IDX_STORE_NAME] ?? "").trim();
  const branchName = (row[IDX_BRANCH_NAME] ?? "").trim();
  const lng = (row[IDX_LNG] ?? "").trim();
  const lat = (row[IDX_LAT] ?? "").trim();

  if (!lat || !lng) {
    return null;
  }

  const nameJoined = `${storeName} ${branchName}`.trim();
  const normalizedName = normalizeText(nameJoined);
  if (!normalizedName) {
    return null;
  }

  return { storeName, branchName, nameJoined, normalizedName, lat, lng };
}

async function loadSpots(inputPath: string): Promise<{
  headers: CsvRow;
  allRows: CsvRow[];
  targetSpots: Spot[];
  latIdx: number;
  lngIdx: number;
}> {
  const raw = await readFile(inputPath, "utf8");
  const lines = raw.replace(/\r\n/g, "\n").split("\n").filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error("eliot_spots.csv 데이터가 비어 있습니다.");
  }

  const rows = lines.map(splitCsvLine);
  const headers = rows[0];

  const idIdx = getRequiredIndex(headers, ["id"]);
  const nameIdx = getRequiredIndex(headers, ["name"]);
  const latIdx = getRequiredIndex(headers, ["lat"]);
  const lngIdx = getRequiredIndex(headers, ["lng"]);

  const allRows = rows.slice(1);
  const targetSpots: Spot[] = [];

  allRows.forEach((row, rowIndex) => {
    const lat = (row[latIdx] ?? "").trim();
    const lng = (row[lngIdx] ?? "").trim();
    if (lat !== "" || lng !== "") {
      return;
    }
    const name = (row[nameIdx] ?? "").trim();
    if (!name) {
      return;
    }
    targetSpots.push({
      rowIndex,
      id: (row[idIdx] ?? "").trim(),
      name,
      normalizedName: normalizeText(name),
    });
  });

  return { headers, allRows, targetSpots, latIdx, lngIdx };
}

async function getSangaCsvFiles(sangaDir: string): Promise<string[]> {
  const files: string[] = [];
  const dir = await opendir(sangaDir);
  for await (const entry of dir) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
      files.push(resolve(sangaDir, entry.name));
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function scanSangaFiles(
  files: string[],
  spotById: Map<string, Spot>,
  keyToSpotIds: Map<string, Set<string>>,
): Promise<{ bestMatches: Map<string, MatchResult>; scannedRows: number }> {
  const bestMatches = new Map<string, MatchResult>();
  let scannedRows = 0;

  for (const filePath of files) {
    const sourceFile = filePath.split(/[\\/]/).pop() ?? filePath;
    const stream = createReadStream(filePath);
    const decodedStream = stream.pipe(iconv.decodeStream(SANGA_ENCODING));
    const rl = readline.createInterface({
      input: decodedStream,
      crlfDelay: Infinity,
    });

    let lineIndex = 0;

    try {
      for await (const rawLine of rl) {
        lineIndex += 1;
        const line = stripBom(rawLine);
        if (!line.trim()) {
          continue;
        }

        // 1행은 헤더 — 고정 인덱스 사용으로 파싱만 스킵
        if (lineIndex === 1) {
          continue;
        }

        scannedRows += 1;
        const row = splitCsvLine(line);
        const record = extractSangaFields(row);
        if (!record) {
          continue;
        }

        const candidateSpotIds = new Set<string>();
        for (const key of makeKeysForName(record.normalizedName)) {
          const ids = keyToSpotIds.get(key);
          if (!ids) {
            continue;
          }
          for (const id of ids) {
            candidateSpotIds.add(id);
          }
        }
        if (candidateSpotIds.size === 0) {
          continue;
        }

        for (const spotId of candidateSpotIds) {
          const spot = spotById.get(spotId);
          if (!spot) {
            continue;
          }
          const score = calculateScore(spot.normalizedName, record.normalizedName);
          if (score < SCORE_THRESHOLD) {
            continue;
          }

          const existing = bestMatches.get(spot.id);
          if (!existing || score > existing.score) {
            bestMatches.set(spot.id, { spot, score, record });
          }
        }
      }
    } catch (error) {
      throw new Error(
        `CSV 파싱/인코딩 처리 실패 (file=${sourceFile}, line=${lineIndex}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      rl.close();
      decodedStream.destroy();
      stream.destroy();
    }

    console.log(`[progress] file done: ${sourceFile}`);
  }

  return { bestMatches, scannedRows };
}

async function main() {
  const projectRoot = process.cwd();
  const inputPath = resolve(projectRoot, "docs/eliot_spots.csv");
  const sangaDir = resolve(projectRoot, "sanga");
  const matchedPath = resolve(projectRoot, "docs/matched_spots.csv");

  const { headers, allRows, targetSpots, latIdx, lngIdx } = await loadSpots(inputPath);

  const spotById = new Map<string, Spot>();
  const keyToSpotIds = new Map<string, Set<string>>();
  for (const spot of targetSpots) {
    spotById.set(spot.id, spot);
    for (const key of makeKeysForName(spot.normalizedName)) {
      const bucket = keyToSpotIds.get(key) ?? new Set<string>();
      bucket.add(spot.id);
      keyToSpotIds.set(key, bucket);
    }
  }

  const files = await getSangaCsvFiles(sangaDir);
  if (files.length === 0) {
    throw new Error(`sanga 디렉토리에 CSV 파일이 없습니다: ${sangaDir}`);
  }

  let bestMatches = new Map<string, MatchResult>();
  let scannedRows = 0;

  if (targetSpots.length > 0) {
    const result = await scanSangaFiles(files, spotById, keyToSpotIds);
    bestMatches = result.bestMatches;
    scannedRows = result.scannedRows;
  }

  const outputRows: CsvRow[] = [headers];
  let filledCount = 0;

  for (const spot of targetSpots) {
    const row = [...allRows[spot.rowIndex]];
    const match = bestMatches.get(spot.id);
    if (match) {
      row[latIdx] = match.record.lat;
      row[lngIdx] = match.record.lng;
      filledCount += 1;
    }
    allRows[spot.rowIndex] = row;
  }

  for (const row of allRows) {
    outputRows.push(row);
  }

  await writeFile(matchedPath, rowsToCsv(outputRows), "utf8");

  console.log("[done] 오프라인 매칭 완료");
  console.log(`- input: ${inputPath}`);
  console.log(`- output: ${matchedPath}`);
  console.log(`- sanga files: ${files.length}`);
  console.log(`- scanned rows: ${scannedRows}`);
  console.log(`- total spots: ${allRows.length}`);
  console.log(`- targets (empty coord): ${targetSpots.length}`);
  console.log(`- coords filled: ${filledCount}`);
  console.log(`- still unresolved: ${targetSpots.length - filledCount}`);
}

main().catch((error) => {
  console.error(
    "[match-spots] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
