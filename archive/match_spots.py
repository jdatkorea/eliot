#!/usr/bin/env python3
"""
대용량 공공데이터 CSV와 docs/eliot_spots.csv를 오프라인 매칭해 좌표를 보강한다.

요구사항 반영:
- pandas chunksize 기반 스트리밍 처리 (전체 파일 메모리 로드 금지)
- 상호명/지점명 기반 방어적 퍼지 매칭(공백 제거 + 부분 포함 허용)
- 결과 분리 저장:
  - matched_spots.csv
  - unresolved_spots.csv

사용 예:
  python match_spots.py --public-csv "공공데이터.csv"
  python match_spots.py --public-csv "공공데이터.csv" --chunksize 50000 --encoding cp949
"""

from __future__ import annotations

import argparse
import re
import sys
import traceback
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd


def normalize_name(value: str) -> str:
    """비교용 정규화: 소문자 + 공백/특수문자 제거."""
    if value is None:
        return ""
    s = str(value).strip().lower()
    # 한글/영문/숫자만 유지
    s = re.sub(r"[^0-9a-z가-힣]", "", s)
    return s


def pick_column(columns: List[str], candidates: List[str], label: str) -> str:
    """후보 컬럼명 중 실제 존재하는 컬럼을 고른다."""
    colset = set(columns)
    for cand in candidates:
        if cand in colset:
            return cand
    raise KeyError(
        f"[컬럼명 불일치] '{label}' 컬럼을 찾지 못했습니다. "
        f"후보={candidates} / 실제={columns}"
    )


def safe_float(v) -> Optional[float]:
    try:
        if pd.isna(v):
            return None
        return float(v)
    except Exception:
        return None


def run(args: argparse.Namespace) -> None:
    root = Path.cwd()
    spots_path = root / "docs" / "eliot_spots.csv"
    public_path = Path(args.public_csv).resolve()
    matched_path = root / "matched_spots.csv"
    unresolved_path = root / "unresolved_spots.csv"

    if not spots_path.exists():
        raise FileNotFoundError(f"매칭 대상 파일이 없습니다: {spots_path}")
    if not public_path.exists():
        raise FileNotFoundError(f"공공데이터 파일이 없습니다: {public_path}")

    # 1) 대상 데이터(작은 파일) 로드
    spots_df = pd.read_csv(spots_path, dtype=str, keep_default_na=False, encoding=args.encoding)

    required_spot_cols = ["id", "name", "lat", "lng"]
    for c in required_spot_cols:
        if c not in spots_df.columns:
            raise KeyError(f"docs/eliot_spots.csv 필수 컬럼 누락: {c}")

    # 좌표 비어있는 행만 매칭 대상
    target_mask = (spots_df["lat"].astype(str).str.strip() == "") | (
        spots_df["lng"].astype(str).str.strip() == ""
    )
    target_df = spots_df[target_mask].copy()
    if target_df.empty:
        print("[info] 좌표 미기입 대상이 없습니다. 종료합니다.")
        spots_df.iloc[0:0].to_csv(matched_path, index=False, encoding="utf-8-sig")
        spots_df.iloc[0:0].to_csv(unresolved_path, index=False, encoding="utf-8-sig")
        return

    target_df["name_norm"] = target_df["name"].map(normalize_name)
    target_df = target_df[target_df["name_norm"] != ""].copy()

    unresolved: Dict[str, Dict] = {}
    for _, row in target_df.iterrows():
        unresolved[str(row["id"])] = row.to_dict()

    # 2) 공공데이터 헤더 확인
    header_df = pd.read_csv(public_path, nrows=0, encoding=args.encoding)
    public_cols = list(header_df.columns)

    store_col = pick_column(public_cols, ["상호명", "업소명", "가맹점명", "상호"], "상호명")
    branch_col = pick_column(public_cols, ["지점명", "분점명", "지점"], "지점명")
    lat_col = pick_column(public_cols, ["위도", "latitude", "lat", "Y", "Y좌표"], "위도")
    lng_col = pick_column(public_cols, ["경도", "longitude", "lng", "X", "X좌표"], "경도")

    use_cols = [store_col, branch_col, lat_col, lng_col]

    matched_rows: List[Dict] = []
    processed_chunks = 0

    # 3) 대용량 청크 순회
    for chunk in pd.read_csv(
        public_path,
        chunksize=args.chunksize,
        usecols=use_cols,
        dtype=str,
        keep_default_na=False,
        encoding=args.encoding,
    ):
        processed_chunks += 1
        if not unresolved:
            break

        chunk = chunk.copy()
        chunk["full_name"] = (
            chunk[store_col].astype(str).str.strip() + " " + chunk[branch_col].astype(str).str.strip()
        ).str.strip()
        chunk["full_norm"] = chunk["full_name"].map(normalize_name)

        # 빠른 exact 조회 인덱스
        exact_map: Dict[str, Tuple[float, float, str]] = {}
        for _, r in chunk.iterrows():
            norm_name = r["full_norm"]
            if not norm_name:
                continue
            lat = safe_float(r[lat_col])
            lng = safe_float(r[lng_col])
            if lat is None or lng is None:
                continue
            if norm_name not in exact_map:
                exact_map[norm_name] = (lat, lng, r["full_name"])

        # remaining 대상에 대해 exact 먼저 처리
        resolved_ids: List[str] = []
        for sid, rec in unresolved.items():
            q = rec["name_norm"]
            if not q:
                continue
            hit = exact_map.get(q)
            if hit:
                lat, lng, source_name = hit
                out = dict(rec)
                out["lat"] = f"{lat:.7f}"
                out["lng"] = f"{lng:.7f}"
                out["matched_public_name"] = source_name
                out["match_type"] = "exact_norm"
                matched_rows.append(out)
                resolved_ids.append(sid)

        for sid in resolved_ids:
            unresolved.pop(sid, None)

        if not unresolved:
            break

        # 방어적 퍼지 매칭: 부분 포함
        # 비용 절감을 위해 길이 2 prefix 인덱스 사용
        prefix_map: Dict[str, List[Tuple[str, float, float, str]]] = {}
        for _, r in chunk.iterrows():
            norm_name = r["full_norm"]
            if len(norm_name) < 2:
                continue
            lat = safe_float(r[lat_col])
            lng = safe_float(r[lng_col])
            if lat is None or lng is None:
                continue
            key = norm_name[:2]
            prefix_map.setdefault(key, []).append((norm_name, lat, lng, r["full_name"]))

        fuzzy_resolved: List[str] = []
        for sid, rec in unresolved.items():
            q = rec["name_norm"]
            if len(q) < 2:
                continue
            cands = prefix_map.get(q[:2], [])
            if not cands:
                continue

            best = None
            best_len = 10**9
            for cand_name, lat, lng, src in cands:
                if q in cand_name or cand_name in q:
                    # 더 길이 차가 작은 후보 우선
                    score = abs(len(cand_name) - len(q))
                    if score < best_len:
                        best_len = score
                        best = (lat, lng, src)

            if best:
                lat, lng, source_name = best
                out = dict(rec)
                out["lat"] = f"{lat:.7f}"
                out["lng"] = f"{lng:.7f}"
                out["matched_public_name"] = source_name
                out["match_type"] = "contains_fuzzy"
                matched_rows.append(out)
                fuzzy_resolved.append(sid)

        for sid in fuzzy_resolved:
            unresolved.pop(sid, None)

        if processed_chunks % 20 == 0:
            print(
                f"[progress] chunk={processed_chunks}, "
                f"matched={len(matched_rows)}, unresolved={len(unresolved)}"
            )

    # 4) 결과 저장
    matched_df = pd.DataFrame(matched_rows)
    unresolved_df = pd.DataFrame(unresolved.values())

    # 결과 파일 컬럼 정리 (원본 컬럼 우선)
    out_cols = list(spots_df.columns)
    extra_cols = [c for c in ["matched_public_name", "match_type"] if c in matched_df.columns]
    if not matched_df.empty:
        matched_df = matched_df[[c for c in out_cols if c in matched_df.columns] + extra_cols]
    if not unresolved_df.empty:
        unresolved_df = unresolved_df[[c for c in out_cols if c in unresolved_df.columns]]

    matched_df.to_csv(matched_path, index=False, encoding="utf-8-sig")
    unresolved_df.to_csv(unresolved_path, index=False, encoding="utf-8-sig")

    print("[done] 오프라인 매칭 완료")
    print(f"- public_csv: {public_path}")
    print(f"- chunksize: {args.chunksize}")
    print(f"- matched: {len(matched_df)} -> {matched_path}")
    print(f"- unresolved: {len(unresolved_df)} -> {unresolved_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="대용량 공공데이터 기반 오프라인 스팟 좌표 매칭")
    parser.add_argument(
        "--public-csv",
        required=True,
        help="루트 또는 절대경로의 공공데이터 CSV 파일 경로",
    )
    parser.add_argument(
        "--chunksize",
        type=int,
        default=50000,
        help="청크 크기 (기본 50000)",
    )
    parser.add_argument(
        "--encoding",
        default="utf-8",
        help="CSV 인코딩 (기본 utf-8, 필요 시 cp949)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    try:
        run(parse_args())
    except (MemoryError, UnicodeDecodeError, KeyError) as e:
        # Kill-Switch 대상 예외: 즉시 중단 + 원문 로깅
        print("[halt] Kill-Switch 예외 발생, 작업 중단", file=sys.stderr)
        print(f"[error] {repr(e)}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        # 기타 예외도 즉시 중단
        print("[halt] 예외 발생, 작업 중단", file=sys.stderr)
        print(f"[error] {repr(e)}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
