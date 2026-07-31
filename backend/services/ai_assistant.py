"""AI 도우미 채팅 서비스

범위 제한형 채팅: 용어 물어보기, 앱 기능 안내, 현재 상담 결과에 대한 후속 질문
"""

import json
import logging
import re

import anthropic

logger = logging.getLogger("ai_assistant")

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 800
MAX_RETRIES = 2

# 앱 기능 맵 (정적 데이터)
APP_FUNCTION_MAP = {
    "서류 진단": "홈 → 퀵메뉴 → 서류 진단",
    "예방 진단": "홈 → 퀵메뉴 → 예방 진단",
    "내 권리": "홈 → 퀵메뉴 → 내 권리",
    "사례 통계": "홈 → 퀵메뉴 → 사례 통계",
    "금융 학습": "홈 → 퀵메뉴 → 금융 학습",
    "분쟁 대응": "홈 → 퀵메뉴 → 분쟁 대응",
    "상담 시작": "홈 → 진단 시작하기 버튼",
    "내 상담": "하단 탭 → 내 상담",
    "통계": "하단 탭 → 통계",
}

SYSTEM_PROMPT = """당신은 금융 소비자 보호 AI 도우미입니다.

절대 규칙:
- 다음 3가지 범위 내에서만 답변하십시오:
  1) 용어 물어보기: 제공된 용어 사전에 있는 용어만 설명
  2) 앱 기능 안내: 제공된 기능 맵에 있는 기능만 안내
  3) 현재 상담 결과에 대한 후속 질문: 제공된 evidence 범위 내에서만 답변

- 위 3개 범위 밖 질문에는 답을 지어내지 말고 다음과 같이 응답하십시오:
  "그 부분은 근거가 없어 답변드리기 어렵습니다. 상황을 입력해 주시면 분쟁 사례로 확인해 드릴게요."

- 답변에 사용한 근거(용어 출처·사건번호·화면명)를 항상 함께 표시하십시오.

- 용어 사전에 없는 용어는 "제가 근거를 갖고 있는 용어가 아닙니다"로 응답하십시오.

- 제공된 사전·맵·evidence 밖의 내용을 생성하지 마십시오.

반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체 하나만 출력하십시오. 설명,
인사말, 코드펜스, 추가 텍스트를 출력하지 마십시오.

## 출력 스키마
{
  "type": "TERMINOLOGY" | "APP_FUNCTION" | "CONSULTATION_FOLLOWUP" | "OUT_OF_SCOPE",
  "answer": "답변 내용",
  "source": "근거 정보 (용어 출처·사건번호·화면명 등)",
  "action": "제안할 액션 (예: 'navigate_to_screen', 'start_consult') 또는 null",
  "action_data": "액션에 필요한 데이터 (예: 화면명, 쟁점명) 또는 null"
}"""

_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n?|```\s*$")


def _parse_json(text: str) -> dict:
    cleaned = _FENCE_RE.sub("", text.strip()).strip()
    return json.loads(cleaned)


def chat_with_assistant(
    client: anthropic.Anthropic,
    user_message: str,
    term_dictionary: list[dict],
    current_evidence: dict | None = None,
) -> dict:
    """AI 도우미와 채팅"""
    
    # 문맥 구성
    context = {
        "term_dictionary": term_dictionary,
        "app_function_map": APP_FUNCTION_MAP,
        "current_evidence": current_evidence,
    }
    
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"""
사용자 질문: {user_message}

문맥 데이터:
{json.dumps(context, ensure_ascii=False, indent=2)}

위 문맥 데이터를 바탕으로 스키마대로만 답하십시오.
""",
                }],
            )
            raw = next((b.text for b in response.content if b.type == "text"), "")
            data = _parse_json(raw)
            return data
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("chat_with_assistant 시도 %d/%d 실패: %s", attempt, MAX_RETRIES, exc)

    logger.error("chat_with_assistant 최종 실패: %s", last_err)
    return {
        "type": "OUT_OF_SCOPE",
        "answer": "죄송합니다. 현재 답변 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
        "source": None,
        "action": None,
        "action_data": None,
    }