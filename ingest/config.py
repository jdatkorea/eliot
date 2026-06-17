"""
ingest 파이프라인 설정.

[1단계 실행 순서]
  python pipeline.py --step inspect
  → raw JSON 구조 확인 후 NAVER_FIELD_MAP 아래 TODO 값 채우기
  → python pipeline.py  (전체 실행)
"""

# ── 기준 좌표 (거리 계산 원점) ──────────────────────────────────────────────
SONGDO_LAT = 37.382
SONGDO_LNG = 126.657

# ── 거리 밴드 정의 ─────────────────────────────────────────────────────────
# (km 상한, 레이블) — 오름차순, 마지막은 float("inf")
DISTANCE_BANDS = [
    (40,           "근교"),
    (120,          "당일"),
    (float("inf"), "원거리"),
]

# ── match-QC 기준 ──────────────────────────────────────────────────────────
MATCH_THRESHOLD_M = 100  # 100m 미만 → APPROVED

# ── 네이버 폴더 목록 ────────────────────────────────────────────────────────
# folder_id  : DevTools에서 확인한 폴더 ID
# name       : 폴더 한국어 이름 (Sheet 표시용)
# source_folder: 영문 태그 (Sheet source_folder 컬럼)
TARGET_FOLDERS = [
    # 예시 — 실제 folder_id로 교체
    # {"folder_id": "123456", "name": "카페",     "source_folder": "cafe"},
    # {"folder_id": "234567", "name": "맛집",     "source_folder": "restaurant"},
    # {"folder_id": "345678", "name": "공원",     "source_folder": "park"},
    # {"folder_id": "456789", "name": "키즈카페", "source_folder": "kids_cafe"},
    # {"folder_id": "567890", "name": "박물관",   "source_folder": "museum"},
    # {"folder_id": "678901", "name": "해변",     "source_folder": "beach"},
    # {"folder_id": "789012", "name": "드라이브", "source_folder": "drive"},
    # {"folder_id": "890123", "name": "쇼핑",     "source_folder": "shopping"},
    # {"folder_id": "901234", "name": "기타",     "source_folder": "etc"},
]

# ── 네이버 응답 필드 매핑 ──────────────────────────────────────────────────
# 값이 "TODO"인 상태에서 파이프라인 실행 시 오류 발생.
# `python pipeline.py --step inspect` 실행 후 raw JSON 구조 보고 채울 것.
#
# 점 표기법으로 중첩 경로 지원: "result.items" → response["result"]["items"]
# 배열 인덱스 지원: "data[0].list"
NAVER_FIELD_MAP = {
    # 스팟 목록 배열 경로 (응답 최상위부터)
    "items_path":  "TODO",   # 예: "result.items" 또는 "bookmarks"
    # 페이지 총 건수 경로
    "total_path":  "TODO",   # 예: "result.pagingModel.totalCount"
    # 스팟 개별 필드
    "id":          "TODO",   # 예: "id" 또는 "bookmarkId"
    "name":        "TODO",   # 예: "name" 또는 "title"
    "lat":         "TODO",   # 예: "y" 또는 "lat" (위도, float)
    "lng":         "TODO",   # 예: "x" 또는 "lng" (경도, float)
    "address":     "TODO",   # 예: "address" 또는 "roadAddress"
    "category":    "TODO",   # 예: "category" 또는 "businessCategory" (없으면 "")
}

# ── Google Sheets 컬럼 순서 (변경 시 s4_sheets_upsert.py 와 동기) ──────────
SHEET_COLUMNS = [
    "google_place_id",
    "name",
    "source_folder",
    "folder_tags",
    "address",
    "naver_lat",
    "naver_lng",
    "google_lat",
    "google_lng",
    "match_dist_m",
    "distance_km",
    "distance_band",
    "google_types",
    "rating",
    "review_count",
    "mood",
    "indoor_outdoor",
    "toddler_fit",
    "est_dwell_min",
    "one_liner",
    "status",
    "approved",
    "synced_at",
]
