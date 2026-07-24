"""[LLM 2차] graph_search 결과만을 컨텍스트로 사용자에게 보여줄 안내문을 조립한다.
그래프에 없는 사례·조항·수치를 언급하지 못하도록 시스템 프롬프트로 강제한다."""

import json
import logging

import anthropic

logger = logging.getLogger("answerer")

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1200
MAX_RETRIES = 2  # 최초 시도 + 재시도 1회

SYSTEM_PROMPT = """당신은 금융 소비자에게 분쟁조정 관련 참고 정보를 안내하는 도우미입니다.

절대 규칙:
- 아래 사용자 메시지로 제공되는 "그래프 데이터" JSON에 실제로 들어있는 사례·조항·판례·수치
  외의 것을 언급하지 마십시오. 그래프 데이터에 없는 사례번호, 배상비율, 법조항, 판례를
  지어내거나 일반 상식으로 보충하지 마십시오. 그래프 데이터가 비어있으면 "유사 사례를
  찾지 못했다"고 솔직히 말하십시오.
- 답변 말미에 "이 안내는 법률 자문이 아니며 참고용 정보"라는 취지의 문구를 반드시 포함하십시오.
- 배상비율은 항상 범위(min~max)와 대표값(median)으로 제시하고, 특정 수치를 확정적으로
  약속하는 표현("반드시 60% 받을 수 있다" 등)을 쓰지 마십시오.
- law_articles는 각 항목이 {"issue": "...", "ref": "..."} 형태로 "이 조항이 이 쟁점의
  근거"라는 매핑까지 이미 그래프에서 확정되어 제공됩니다. 조항 번호를 언급할 때는 이
  매핑에 나온 쟁점명과만 연결하고, 그 조항이 무엇을 규정하는지("설명의무 조항이다" 등)를
  당신의 배경지식으로 임의로 설명하거나 다른 쟁점과 잘못 연결하지 마십시오.

분량 규칙(중요 — 답변 지연시간에 직결됨):
- 핵심 안내는 3~4문단 이내로 작성하십시오. 헤더(##)나 표를 만들지 말고 일반 문단으로만
  작성하십시오.
- similar_cases의 사례 목록(사례번호/날짜/결과/비율)은 evidence 필드로 이미 구조화되어
  화면에 별도로 렌더링됩니다. 답변 본문에서 이를 표나 불릿 목록으로 다시 나열하지 마십시오.
  꼭 필요하면 가장 대표적인 사례 1건만 문장 속에서 자연스럽게 언급하십시오.
- 존댓말을 사용하고, 불필요한 수사(인사말 확장, 반복 요약)를 넣지 마십시오."""


def build_answer_prompt(user_text: str, evidence: dict) -> str:
    return (
        f"[사용자 민원]\n{user_text}\n\n"
        f"[그래프 데이터 — 이 안에 있는 내용만 근거로 사용할 것]\n"
        f"{json.dumps(evidence, ensure_ascii=False, indent=2)}"
    )


def answer(client: anthropic.Anthropic, user_text: str, evidence: dict) -> str:
    prompt = build_answer_prompt(user_text, evidence)
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            text = next((b.text for b in response.content if b.type == "text"), "")
            if text.strip():
                return text.strip()
            raise ValueError("빈 응답")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("answer 시도 %d/%d 실패: %s", attempt, MAX_RETRIES, exc)

    logger.error("answer 최종 실패: %s", last_err)
    return (
        "죄송합니다. 답변 생성 중 오류가 발생했습니다. 아래 유사 사례와 근거 자료를 "
        "직접 참고해 주시기 바랍니다. 이 안내는 법률 자문이 아니며 참고용 정보입니다."
    )


FALLBACK_TEXT = (
    "죄송합니다. 답변 생성 중 오류가 발생했습니다. 위 유사 사례와 근거 자료를 "
    "직접 참고해 주시기 바랍니다. 이 안내는 법률 자문이 아니며 참고용 정보입니다."
)


async def stream_answer(async_client: anthropic.AsyncAnthropic, user_text: str, evidence: dict):
    """토큰 단위로 answer 텍스트를 yield하는 SSE 전용 스트리밍 버전.
    아직 한 글자도 내보내기 전에 실패하면 처음부터 재시도하지만, 이미 클라이언트로 일부
    텍스트를 내보낸 뒤 스트림이 끊기면 되돌릴 방법이 없으므로 재시도하지 않고 안내
    문구만 덧붙이고 종료한다."""
    prompt = build_answer_prompt(user_text, evidence)
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        yielded_any = False
        try:
            async with async_client.messages.stream(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    yielded_any = True
                    yield text
            return
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("stream_answer 시도 %d/%d 실패: %s", attempt, MAX_RETRIES, exc)
            if yielded_any:
                yield f"\n\n[오류로 답변이 중단되었습니다]\n\n{FALLBACK_TEXT}"
                return

    logger.error("stream_answer 최종 실패: %s", last_err)
    yield FALLBACK_TEXT
