"""배상비율 시뮬레이터의 순수 계산 로직(그래프 조회 없음). graph_search.factor_stats_for_issue가
반환한 실측 통계(요인별 "있음 vs 없음" 평균 배상비율 차이)에 표본 신뢰 등급을 매긴다.
계산기가 아니라 참고 정보이므로, 여기서는 등급만 매기고 숫자를 합산하지 않는다."""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from common.enums import FACTOR_ENUM  # noqa: E402

logger = logging.getLogger("simulator")

# "기타"는 특정 가능한 요인이 아니라 분류 실패 시의 예비값이라 체크박스 메뉴에서 제외한다.
# "예적금목적_방문"은 data/graph/factor_recall.md 재스캔 결과 회수 후보가 사실상 0건으로
# 확정돼(신호 표현 자체가 상투구/무관 합성어에 걸림) 메뉴에서 제외한다 — 표본이 원래도
# 얇은데(7건) 이 상태로는 늘어날 근거가 없어, 그대로 두면 거의 항상 "판단 유보"로만
# 회색 표시되어 사용자에게 혼란만 준다. data/SCOPE.md 참조.
_MENU_EXCLUDE = {"기타", "예적금목적_방문"}
FACTOR_MENU = [f for f in FACTOR_ENUM if f not in _MENU_EXCLUDE]

# 표본 크기 등급. n_with는 "이 쟁점에서 이 요인이 있었던 사례" 수.
TIER_REFLECTED = "반영"       # n_with >= 10: pp를 예상치 계산에 그대로 반영
TIER_REFERENCE = "참고"       # 5 <= n_with < 10: 화면에는 pp를 보여주되 계산에서는 제외
TIER_DEFERRED = "판단_유보"    # n_with < 5, 또는 부호가 상식과 반대: pp 자체를 숨김

# 통념상 기대되는 방향. 실측 부호가 이와 반대면 표본이 편향됐다는 신호로 보고 등급과
# 무관하게 판단 유보로 강등한다(예: "금융취약계층"인데 -pp가 나오면 그 표본을 신뢰할 수 없음).
EXPECTED_DIRECTION = {
    "고령자": "가산",
    "금융취약계층": "가산",
    "서류_자필미기재": "가산",
    "모니터링콜_부실": "가산",
    "투자경험_다수": "감산",
    "고액투자자": "감산",
    "전문투자자": "감산",
    "최초투자": "감산",
    "신청인_주의소홀": "감산",
}


def _tier_for(n_with: int) -> str:
    if n_with >= 10:
        return TIER_REFLECTED
    if n_with >= 5:
        return TIER_REFERENCE
    return TIER_DEFERRED


def classify_confidence(issue: str, factors: list) -> list:
    """각 요인에 표본 신뢰 등급(confidence)을 매긴다. 기대 방향과 반대 부호가 나오면
    표본 수와 무관하게 판단 유보로 강등하고 경고 로그를 남긴다. 판단 유보로 확정된
    요인은 화면에 구체적인 pp 수치를 보여주지 않도록 pp를 None으로 지운다."""
    result = []
    for f in factors:
        name, pp, n_with = f["name"], f.get("pp"), f["n_with"]
        tier = _tier_for(n_with)

        expected = EXPECTED_DIRECTION.get(name)
        if tier != TIER_DEFERRED and expected is not None and pp:
            actual = "가산" if pp > 0 else "감산"
            if actual != expected:
                logger.warning(
                    "[simulate] 쟁점=%s 요인=%s pp=%.1f(n_with=%d) 부호가 기대 방향(%s)과 반대(%s) "
                    "-> 판단_유보로 강등",
                    issue, name, pp, n_with, expected, actual,
                )
                tier = TIER_DEFERRED

        visible_pp = None if tier == TIER_DEFERRED else pp
        result.append({**f, "pp": visible_pp, "confidence": tier})
    return result
