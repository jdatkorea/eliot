/**
 * 부산 7-field CSV → Supabase places 직접 시딩
 *
 * 실행:
 *   npx tsx scripts/seed-busan.ts
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import type { Place, PlaceCategory } from "@/lib/engine/types";
import {
  createServiceRoleClient,
  toPlaceUuid,
} from "./lib/place-sync";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

const BUSAN_CSV = `slug,destination,name,category,is_outdoor,no_kids_zone,tags
hinyeoul-culture-village,부산,부산 흰여울문화마을,view,true,false,"자연경관, 바다전망"
jeonpo-cafe-street,부산,부산 전포카페거리,view,true,false,"도심산책, 감성카페"
lee-jae-mo-pizza,부산,부산 이재모피자,meal,false,false,"유명맛집, 대기시간길음"
haeridan-gil,부산,부산 해리단길,view,true,false,"골목길, 쇼핑"
haeundae-beach,부산,부산 해운대해수욕장,view,true,false,"stroller_friendly, 바다경관"
dalmaji-gil,부산,부산 달맞이길,view,true,false,"자연경관, 산책로"
moontan-road,부산,부산 문탠로드,activity,true,false,"산책로, 자연경관"
millak-waterside-park,부산,부산 민락수변공원,view,true,false,"야경, 축제"
gwanganri-beach,부산,부산 광안리해수욕장,view,true,false,"stroller_friendly, 야경"
cafe-duplit,부산,부산 카페 듀플릿,cafe,false,false,"크리스마스장식, 디저트"
taejongdae,부산,부산 태종대,view,true,false,"stroller_friendly, 해안절경"
jagalchi-market,부산,부산 자갈치시장,meal,false,false,"전통시장, 해산물"
gukje-market,부산,부산 국제시장,view,true,false,"전통시장, 쇼핑"
bupyeong-kkangtong-market,부산,부산 부평깡통시장,meal,false,false,"전통시장, 길거리음식"
yongdusan-park,부산,부산 용두산공원,view,true,false,"야경, 전망대"
gamcheon-culture-village,부산,부산 감천문화마을,view,true,false,"역사문화, 벽화"
songdo-marine-cable-car,부산_송도,부산 송도해상케이블카,activity,true,false,"바다경관, 체험"
songdo-yonggung-suspension-bridge,부산_송도,부산 송도용궁구름다리,view,true,false,"바다경관, 산책로"
middle-notes,부산,부산 미들노츠,cafe,false,false,"디저트, 분위기"
magellan,부산,부산 마젤란,cafe,false,false,"베이글, 디저트"
noyer,부산,부산 누아예,cafe,false,false,"브런치, 분위기"
f1963-library,부산,부산 F1963 도서관,activity,false,false,"독서, 복합문화공간"
sacheon-pork-soup,부산,부산 사천돼지국밥,meal,false,false,"로컬맛집, 시장"
mulmangcho,부산,부산 물망초,meal,false,false,"파스타, 시그니처"
seoheewa-bakery,부산,부산 서희와제과,cafe,false,false,"베이커리, 디저트"
jijeu-gwangan,부산,부산 지즈 광안점,meal,false,false,"돈카츠, 유명맛집"
millac-the-market,부산,부산 밀락더마켓,view,false,false,"복합문화공간, 야경"
haeundae-beef-ribs,부산,부산 해운대암소갈비집,meal,false,false,"유명맛집, 대기시간길음"
goraesa-fishcake-haeundae,부산,부산 고래사어묵 해운대점,meal,false,false,"간식, 로컬음식"
spaland-centum-city,부산,부산 스파랜드 센텀시티,activity,false,false,"찜질방, 휴식"
sealife-busan-aquarium,부산,부산 씨라이프 부산아쿠아리움,kids,false,false,"stroller_friendly, 해양생물"
dongbaek-island,부산,부산 동백섬,view,true,false,"자연경관, 산책로"
oryukdo-skywalk,부산,부산 오륙도 스카이워크,view,true,false,"바다경관, 산책로"
haedong-yonggungsa,부산,부산 해동용궁사,view,true,false,"역사문화, 바다전망"
tongdosa,부산_근교,양산 통도사,view,true,false,"역사문화, 사찰"
daeseongdong-tombs,부산_근교,김해 대성동 고분군,view,true,false,"stroller_friendly, 유네스코"
sinbalwon,부산,부산 신발원,meal,false,false,"만두, 유명맛집"
choryang-milmyeon,부산,부산 초량밀면,meal,false,false,"향토음식, 맛집"
bibibidang,부산,부산 비비비당,cafe,false,false,"전통차, 오션뷰"
horangi-gelatteok,부산,부산 호랑이 젤라떡,cafe,false,false,"디저트, 아이스크림"
sanggukine,부산,부산 상국이네,meal,false,false,"분식, 길거리음식"
haemok,부산,부산 해목,meal,false,false,"장어덮밥, 유명맛집"
momos-coffee-main,부산,부산 모모스커피 본점,cafe,false,false,"핸드드립, 유명카페"
heosimcheong,부산,부산 허심청,activity,false,false,"온천, 찜질방"
gijang-handmade-noodles,부산,부산 기장손칼국수,meal,false,false,"로컬맛집, 시장"
baekhwa-yang-gopchang,부산,부산 백화양곱창,meal,false,false,"로컬맛집, 양곱창"
haeundae-blueline-park,부산,부산 해운대 블루라인파크,activity,true,false,"해변열차, 스카이캡슐"
x-the-sky,부산,부산 엑스더스카이,view,false,false,"전망대, 야경"
bosudong-book-street,부산,부산 보수동 책방골목,view,true,false,"헌책방, 레트로"
busan-museum-of-movies,부산,부산 영화체험박물관,kids,false,false,"stroller_friendly, 실내체험"`;

const VALID_CATEGORIES = new Set<string>([
  "meal",
  "cafe",
  "activity",
  "view",
  "kids",
]);

function parseCsvSync<T extends Record<string, string>>(
  text: string,
): T[] {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length < 2) {
    return [];
  }

  const parseLine = (line: string): string[] => {
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
    return fields.map((field) => field.trim());
  };

  const headers = parseLine(lines[0]!);
  const rows: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) {
      continue;
    }
    const values = parseLine(line);
    const row = {} as T;
    for (let j = 0; j < headers.length; j++) {
      row[headers[j] as keyof T] = (values[j] ?? "") as T[keyof T];
    }
    rows.push(row);
  }

  return rows;
}

type CsvRow = {
  slug: string;
  destination: string;
  name: string;
  category: string;
  is_outdoor: string;
  no_kids_zone: string;
  tags: string;
};

function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

/** 구형 DB(lat/lng NOT NULL) 호환 — 좌표 매핑 없이 부산 중심 플레이스홀더 */
const BUSAN_CENTER = { lat: 35.1796, lng: 129.0756 };

function parseTagsWithDerived(rawTags: string[]): {
  tags: string[];
  stroller_friendly: boolean;
} {
  let stroller_friendly = false;
  const tags: string[] = [];

  for (const tag of rawTags) {
    const normalized = tag.trim().toLowerCase().replace(/[\s_-]/g, "");
    if (normalized === "strollerfriendly") {
      stroller_friendly = true;
      continue;
    }
    tags.push(tag.trim());
  }

  return { tags, stroller_friendly };
}

function mapBusanRow(place: Place, idCache: Map<string, string>) {
  return {
    id: toPlaceUuid(place.id, idCache),
    destination: place.destination,
    name: place.name,
    category: place.category,
    lat: BUSAN_CENTER.lat,
    lng: BUSAN_CENTER.lng,
    curtail_count: 0,
    is_outdoor: place.is_outdoor,
    no_kids_zone: place.no_kids_zone,
    tags: place.tags,
    stroller_friendly: place.stroller_friendly ?? false,
    has_nursing_room: place.has_nursing_room ?? false,
  };
}

async function upsertBusanPlaces(places: Place[]) {
  const supabase = createServiceRoleClient();
  const idCache = new Map<string, string>();
  const rows = places.map((place) => mapBusanRow(place, idCache));

  const { data, error } = await supabase
    .from("places")
    .upsert(rows, { onConflict: "id" })
    .select("id, name");

  if (error) {
    throw error;
  }

  return data ?? [];
}

function csvRowsToPlaces(rows: CsvRow[]): Place[] {
  const places: Place[] = [];

  for (const row of rows) {
    const category = row.category.trim();
    if (!VALID_CATEGORIES.has(category)) {
      throw new Error(
        `slug=${row.slug}: category 값 오류 "${category}"`,
      );
    }

    const rawTags = row.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    const { tags, stroller_friendly } = parseTagsWithDerived(rawTags);

    places.push({
      id: row.slug.trim(),
      destination: row.destination.trim(),
      name: row.name.trim(),
      category: category as PlaceCategory,
      is_outdoor: parseBoolean(row.is_outdoor),
      no_kids_zone: parseBoolean(row.no_kids_zone),
      tags,
      stroller_friendly,
    });
  }

  return places;
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 .env 또는 .env.local에 없습니다.",
    );
  }

  const rows = parseCsvSync<CsvRow>(BUSAN_CSV);

  const places = csvRowsToPlaces(rows);
  console.log(`[seed-busan] 파싱 완료: ${places.length}건`);

  const data = await upsertBusanPlaces(places);

  console.log(`부산 권역 ${data.length}개 장소 시딩 완료`);
  for (const row of data) {
    console.log(`  - ${row.name} (${row.id})`);
  }
}

main().catch((error) => {
  console.error(
    "seed-busan failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
