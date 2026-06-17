/**
 * Canonical destination registry — curated independently of any single
 * ingest batch. This is the authority T3's ingest gate checks against,
 * and the source data/destinations.json (T4 static resolver input) is
 * built from.
 *
 * Coordinates are well-known city/county-seat centroids (public
 * administrative knowledge), not live-geocoded. Accurate to a few km —
 * sufficient for nearest-region routing where regions are tens of km
 * apart. Replace with verified geocoding if/when precision matters.
 */

export type DestinationCentroid = {
  center_lat: number;
  center_lng: number;
  default_radius_km: number;
};

const DEFAULT_RADIUS_KM = 40;

function centroid(lat: number, lng: number): DestinationCentroid {
  return { center_lat: lat, center_lng: lng, default_radius_km: DEFAULT_RADIUS_KM };
}

export const DESTINATION_CENTROIDS: Record<string, DestinationCentroid> = {
  가평: centroid(37.8315, 127.5095),
  경주: centroid(35.8562, 129.2247),
  계양: centroid(37.5377, 126.7377),
  고양: centroid(37.6584, 126.832),
  과천: centroid(37.4292, 126.9876),
  관악: centroid(37.4784, 126.9516),
  광명: centroid(37.4795, 126.8646),
  광주: centroid(37.4292, 127.255),
  구로: centroid(37.4954, 126.8874),
  구리: centroid(37.5943, 127.1296),
  구미: centroid(36.1195, 128.3446),
  김포: centroid(37.6152, 126.7159),
  김해: centroid(35.2285, 128.8894),
  남원: centroid(35.4164, 127.3905),
  대구: centroid(35.8714, 128.6014),
  대전: centroid(36.3504, 127.3845),
  보령: centroid(36.3332, 126.6128),
  부산: centroid(35.1796, 129.0756),
  부천: centroid(37.5034, 126.766),
  서울: centroid(37.5665, 126.978),
  서초: centroid(37.4837, 127.0324),
  성남: centroid(37.4201, 127.1262),
  속초: centroid(38.207, 128.5918),
  송도: centroid(37.3894, 126.6557),
  수원: centroid(37.2636, 127.0286),
  시흥: centroid(37.3799, 126.8031),
  안동: centroid(36.5684, 128.7294),
  안산: centroid(37.3219, 126.8309),
  안양: centroid(37.3943, 126.9568),
  양양: centroid(38.0754, 128.619),
  양주: centroid(37.7853, 127.0455),
  양평: centroid(37.4916, 127.4874),
  여수: centroid(34.7604, 127.6622),
  여주: centroid(37.2982, 127.6372),
  영덕: centroid(36.4151, 129.3656),
  영종도: centroid(37.4602, 126.4407),
  용인: centroid(37.2411, 127.1776),
  울산: centroid(35.5384, 129.3114),
  원주: centroid(37.3422, 127.9202),
  의령: centroid(35.3222, 128.2622),
  의성: centroid(36.3528, 128.6972),
  의왕: centroid(37.3447, 126.9683),
  의정부: centroid(37.7381, 127.0337),
  이천: centroid(37.2724, 127.435),
  인덕원: centroid(37.3897, 126.9764),
  인천: centroid(37.4563, 126.7052),
  일산: centroid(37.6584, 126.77),
  전북: centroid(35.8242, 127.148),
  정선: centroid(37.3804, 128.6608),
  제주: centroid(33.4996, 126.5312),
  천안: centroid(36.8151, 127.1139),
  청라: centroid(37.5375, 126.6394),
  춘천: centroid(37.8813, 127.7298),
  충주: centroid(36.991, 127.9259),
  평창: centroid(37.3705, 128.39),
  평택: centroid(36.9921, 127.1129),
  포천: centroid(37.8949, 127.2003),
  포항: centroid(36.019, 129.3435),
  하남: centroid(37.5392, 127.2148),
  화성: centroid(37.1996, 126.8312),
  횡성: centroid(37.4917, 127.9853),
};

export function isCanonicalDestination(canonicalId: string): boolean {
  return canonicalId in DESTINATION_CENTROIDS;
}
