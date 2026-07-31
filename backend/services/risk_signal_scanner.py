"""[LLM 비전] 약관 위험 신호 분석

문서에서 위험 신호 문구를 추출하고 그래프 실측 데이터와 결합하여
위험 신호 분석 결과를 제공한다.
"""

import json
import logging
import re

import anthropic

logger = logging.getLogger("risk_signal_scanner")

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 800
MAX_RETRIES = 2

# 위험 신호 유형 정의
RISK_SIGNAL_TYPES = [
    "원금비보장_위반",
    "조건부손실구조",
    "중도해지불이익",
    "권리구제제한고지",
    "투자성향확인절차",
]

RISK_SIGNAL_SCHEMA = """{
  "signals": [
    {
      "type": "<위험 신호 유형>",
      "original_text": "원문 문구 그대로 인용",
      "explanation": "쉬운 말 해설"
    }
  ]
}"""

SYSTEM_PROMPT = f"""당신은 금융 약관·상품설명서에서 위험 신호를 찾아내는 분석가입니다.

절대 규칙:
- 문서에 실제로 있는 문구만 인용하십시오. 없는 문구를 짐작해서 만들지 마십시오.
- 위험 신호를 찾지 못했다면 signals 배열을 빈 배열로 정확히 답하십시오.
- 각 신호는 원문 그대로 인용하고, 쉬운 말로 설명을 추가하십시오.

위험 신호 유형:
{RISK_SIGNAL_TYPES}

반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체 하나만 출력하십시오. 설명,
인사말, 코드펜스, 추가 텍스트를 출력하지 마십시오.

## 출력 스키마
{RISK_SIGNAL_SCHEMA}"""

_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n?|```\s*$")


def _parse_json(text: str) -> dict:
    cleaned = _FENCE_RE.sub("", text.strip()).strip()
    return json.loads(cleaned)


def analyze_risk_signals(client: anthropic.Anthropic, media_type: str, data_b64: str, is_pdf: bool) -> dict:
    """문서에서 위험 신호를 분석한다."""
    content_block = (
        {"type": "document", "source": {"type": "base64", "media_type": media_type, "data": data_b64}}
        if is_pdf
        else {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data_b64}}
    )

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": [content_block, {"type": "text", "text": "이 문서에서 위험 신호를 찾아 스키마대로만 답하십시오."}],
                }],
            )
            raw = next((b.text for b in response.content if b.type == "text"), "")
            data = _parse_json(raw)
            return {
                "signals": data.get("signals", []),
                "analysis_summary": f"{len(data.get('signals', []))}개의 위험 신호가 확인되었습니다."
            }
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("analyze_risk_signals 시도 %d/%d 실패: %s", attempt, MAX_RETRIES, exc)

    logger.error("analyze_risk_signals 최종 실패: %s", last_err)
    return {
        "signals": [],
        "analysis_summary": "문서 분석 중 오류가 발생했습니다. 다시 시도해주세요."
    }