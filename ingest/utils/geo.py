"""지리 계산 유틸리티 (LLM 미사용, 결정적 계산)."""

from config import DISTANCE_BANDS


def distance_band(km: float) -> str:
    """distance_km → distance_band 레이블."""
    for limit, label in DISTANCE_BANDS:
        if km <= limit:
            return label
    return DISTANCE_BANDS[-1][1]
