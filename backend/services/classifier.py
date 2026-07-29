"""[LLM 1차] 사용자 민원 서술 텍스트 -> 쟁점/상품/요인 추출.

scripts/extract_graph.py와 동일한 enum(common/enums.py)을 사용해야 graph_search의
Issue/Product 노드 매칭이 성립한다. 여기서는 결정문 전체가 아니라 짧은 사용자
서술을 대상으로 하므로 스키마를 issues/products/factors 셋으로 단순화했다.
"""

import json
import logging
import re
import sys
from pathlib import Path

import anthropic

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from common.enums import ISSUE_ENUM, PRODUCT_ENUM, FACTOR_ENUM  # noqa: E402

logger = logging.getLogger("classifier")

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2000
MAX_RETRIES = 2  # 최초 시도 + 재시도 1회

SCHEMA_JSON = (
    """{"issues": [{"name": "<enum>", "confidence": <0.0-1.0>}], """
    """"products": ["<enum>"], "factors": ["<enum>"]}"""
)

SYSTEM_PROMPT = f"""당신은 금융 소비자의 민원 서술을 분류하는 분류기입니다.
반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체 하나만 출력하십시오. 설명, 인사말,
코드펜스, 추가 텍스트를 출력하지 마십시오. 첫 글자는 '{{', 마지막 글자는 '}}' 이어야 합니다.

## 출력 스키마
{SCHEMA_JSON}

- issues: 해당하는 쟁점을 0개 이상 선택. 다음 enum 중에서만: {ISSUE_ENUM}
  - confidence: 이 텍스트가 그 쟁점에 해당한다는 확신도(0.0~1.0). 서술이 그 쟁점을 명확하고
    구체적으로 뒷받침하면 1.0에 가깝게, 여러 쟁점 중 하나일 수 있어 애매하면 0.5 안팎으로,
    가능성은 있지만 근거가 약하면 0.3 이하로 매기십시오. 확신도를 부풀리지 마십시오 —
    이 값으로 사용자에게 되물을지 여부를 실제로 판단합니다.
- products: 언급된 금융상품을 0개 이상 선택. 다음 enum 중에서만: {PRODUCT_ENUM}
- factors: 판단에 영향을 줄 수 있는 요인을 0개 이상 선택. 다음 enum 중에서만: {FACTOR_ENUM}
- 확신이 없으면 해당 항목은 비워두거나 "기타"만 넣을 것. enum에 없는 값을 만들어내지 말 것.
- issues/products/factors 각각 최대 3개까지만 선택(가장 관련성 높은 것 우선)."""

_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n?|```\s*$")


def _parse_json(text: str) -> dict:
    cleaned = _FENCE_RE.sub("", text.strip()).strip()
    return json.loads(cleaned)


def _valid(name: str, enum: list) -> bool:
    return name in enum


def _parse_issue_candidates(raw_issues) -> list:
    """{"name":<enum>, "confidence":0.0~1.0} 항목만 걸러 confidence 내림차순으로 정렬한다.
    이 리스트가 오케스트레이터의 "분류 모호 → 되묻기" 판단(명시적 임계값 비교)의
    유일한 입력값이다 — LLM이 되물을지 말지를 직접 정하지 않고, 확신도 수치만 낸다."""
    candidates = []
    for item in raw_issues or []:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not _valid(name, ISSUE_ENUM):
            continue
        try:
            confidence = float(item.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        candidates.append({"name": name, "confidence": confidence})
    candidates.sort(key=lambda c: c["confidence"], reverse=True)
    return candidates[:3]


def classify(client: anthropic.Anthropic, text: str) -> dict:
    """사용자 민원 텍스트를 분류한다. 반환값:
    {"issues": [...] (하위호환용 이름만, confidence 내림차순, 최대 3개),
     "issue_candidates": [{"name","confidence"}, ...] (분류 모호 판단용 원본 점수),
     "products": [...], "factors": [...]}
    enum 밖 값이 섞여 나오면 걸러내고, 2회 시도 모두 실패하면 빈 분류를 반환한다."""
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": text}],
            )
            raw = next((b.text for b in response.content if b.type == "text"), "")
            data = _parse_json(raw)
            issue_candidates = _parse_issue_candidates(data.get("issues", []))
            return {
                "issues": [c["name"] for c in issue_candidates],
                "issue_candidates": issue_candidates,
                "products": [x for x in data.get("products", []) if _valid(x, PRODUCT_ENUM)][:3],
                "factors": [x for x in data.get("factors", []) if _valid(x, FACTOR_ENUM)][:3],
            }
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("classify 시도 %d/%d 실패: %s", attempt, MAX_RETRIES, exc)

    logger.error("classify 최종 실패, 빈 분류 반환: %s", last_err)
    return {"issues": [], "issue_candidates": [], "products": [], "factors": []}
