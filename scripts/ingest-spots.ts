/**
 * 영구 장소 데이터 병합 · 중복 제거 · Supabase 배포 파이프라인
 *
 * 실행:
 *   pnpm run ingest
 */
import {
  createReadStream,
  existsSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { config } from "dotenv";
import type { Place } from "@/lib/engine/types";
import { parseImportCsv } from "./import-tour-data";
import {
  createServiceRoleClient,
  upsertPlaces,
} from "./lib/place-sync";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

const DATA_DIR = resolve(process.cwd(), "data");
const MASTER_PATH = join(DATA_DIR, "master_spots.csv");
const INCOMING_DIR = join(DATA_DIR, "incoming");
const ARCHIVE_DIR = join(DATA_DIR, "archive");

const MASTER_HEADERS = [
  "slug",
  "destination",
  "name",
  "category",
  "is_outdoor",
  "no_kids_zone",
  "tags",
] as const;

type MasterSpot = {
  slug: string;
  destination: string;
  name: string;
  category: Place["category"];
  is_outdoor: boolean;
  no_kids_zone: boolean;
  tags: string[];
  stroller_friendly: boolean;
  has_nursing_room: boolean;
};

function compositeKey(destination: string, slug: string): string {
  return `${destination}_${slug}`;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function readCsvRows(filePath: string): Promise<string[][]> {
  const rows: string[][] = [];
  const rl = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      rows.push(parseCsvLine(line));
    }
  }
  return rows;
}

function normalizeSlugHeader(rows: string[][]): string[][] {
  if (rows.length === 0) {
    return rows;
  }

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const hasId = header.includes("id");
  const hasSlug = header.includes("slug");

  if (!hasId && hasSlug) {
    const slugIndex = header.indexOf("slug");
    const normalized = rows.map((row, rowIndex) => {
      if (rowIndex === 0) {
        const next = [...row];
        next[slugIndex] = "id";
        return next;
      }
      return row;
    });
    return normalized;
  }

  return rows;
}

function placeToMasterSpot(place: Place): MasterSpot {
  return {
    slug: place.id,
    destination: place.destination,
    name: place.name,
    category: place.category,
    is_outdoor: place.is_outdoor,
    no_kids_zone: place.no_kids_zone,
    tags: place.tags,
    stroller_friendly: place.stroller_friendly ?? false,
    has_nursing_room: place.has_nursing_room ?? false,
  };
}

function masterSpotToPlace(spot: MasterSpot): Place {
  const key = compositeKey(spot.destination, spot.slug);
  return {
    id: key,
    destination: spot.destination,
    name: spot.name,
    category: spot.category,
    is_outdoor: spot.is_outdoor,
    no_kids_zone: spot.no_kids_zone,
    tags: spot.tags,
    stroller_friendly: spot.stroller_friendly,
    has_nursing_room: spot.has_nursing_room,
  };
}

function rowsToMasterSpots(rows: string[][]): MasterSpot[] {
  const normalized = normalizeSlugHeader(rows);
  const result = parseImportCsv(normalized);

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.warn(`[Ingest] 파싱 경고 row ${err.row} / ${err.id}: ${err.reason}`);
    }
  }

  return result.places.map(placeToMasterSpot);
}

async function loadMasterMap(): Promise<Map<string, MasterSpot>> {
  const map = new Map<string, MasterSpot>();

  if (!existsSync(MASTER_PATH)) {
    return map;
  }

  const rows = await readCsvRows(MASTER_PATH);
  const spots = rowsToMasterSpots(rows);

  for (const spot of spots) {
    map.set(compositeKey(spot.destination, spot.slug), spot);
  }

  return map;
}

function formatBoolean(value: boolean): string {
  return value ? "true" : "false";
}

function formatMasterCsv(spots: MasterSpot[]): string {
  const lines = [MASTER_HEADERS.join(",")];

  const sorted = [...spots].sort((a, b) => {
    const dest = a.destination.localeCompare(b.destination, "ko");
    if (dest !== 0) {
      return dest;
    }
    return a.slug.localeCompare(b.slug);
  });

  for (const spot of sorted) {
    const tagsField =
      spot.tags.length > 0 ? `"${spot.tags.join(",")}"` : '""';
    lines.push(
      [
        spot.slug,
        spot.destination,
        spot.name,
        spot.category,
        formatBoolean(spot.is_outdoor),
        formatBoolean(spot.no_kids_zone),
        tagsField,
      ].join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

function listIncomingCsvFiles(): string[] {
  if (!existsSync(INCOMING_DIR)) {
    return [];
  }

  return readdirSync(INCOMING_DIR)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => join(INCOMING_DIR, name))
    .sort();
}

function archiveIncomingFile(filePath: string): void {
  const target = join(ARCHIVE_DIR, basename(filePath));
  renameSync(filePath, target);
}

async function main() {
  await mkdir(INCOMING_DIR, { recursive: true });
  await mkdir(ARCHIVE_DIR, { recursive: true });

  const masterMap = await loadMasterMap();
  const existingCount = masterMap.size;

  const incomingFiles = listIncomingCsvFiles();
  let incomingCount = 0;

  for (const filePath of incomingFiles) {
    const rows = await readCsvRows(filePath);
    const spots = rowsToMasterSpots(rows);
    incomingCount += spots.length;

    for (const spot of spots) {
      masterMap.set(compositeKey(spot.destination, spot.slug), spot);
    }
  }

  const totalCount = masterMap.size;

  console.log(`[Ingest] 기존 마스터 데이터: ${existingCount}건`);
  console.log(`[Ingest] 신규 읽어들인 데이터: ${incomingCount}건`);
  console.log(`[Ingest] 중복 제거 및 갱신된 총 마스터 데이터: ${totalCount}건`);

  const masterCsv = formatMasterCsv([...masterMap.values()]);
  await writeFile(MASTER_PATH, masterCsv, "utf-8");

  const places = [...masterMap.values()].map(masterSpotToPlace);
  const supabase = createServiceRoleClient();
  await upsertPlaces(supabase, places);

  for (const filePath of incomingFiles) {
    archiveIncomingFile(filePath);
  }

  console.log("[Ingest] Supabase 동기화 완료 및 파일 아카이빙 완료.");
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}

export { compositeKey, formatMasterCsv, loadMasterMap, MASTER_PATH };
