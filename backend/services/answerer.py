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
- 배상비율 수치(중앙값, 최소~최대 범위)와 요인별 가산·감산 %p 수치는 답변 본문에 쓰지
  마십시오. 화면 우측 근거 카드(배상비율 분포·참고 요인)에 이미 표시되므로, 본문에서는
  숫자 없이 "표본 대비 유리하게/불리하게 작용할 수 있는 요인이 있다" 정도로만 정성적으로
  언급하십시오. similar_cases의 사례 목록(사례번호/날짜/결과/비율)도 화면에 이미
  구조화되어 나오니 본문에서 표나 목록으로 다시 나열하지 마십시오.
- law_articles는 각 항목이 {"issue": "...", "ref": "..."} 형태로 "이 조항이 이 쟁점의
  근거"라는 매핑까지 이미 그래프에서 확정되어 제공됩니다. 조항 번호를 언급할 때는 이
  매핑에 나온 쟁점명과만 연결하고, 그 조항이 무엇을 규정하는지("설명의무 조항이다" 등)를
  당신의 배경지식으로 임의로 설명하거나 다른 쟁점과 잘못 연결하지 마십시오.
- 답변 말미에 "이 안내는 법률 자문이 아니며 참고용 정보"라는 취지의 한계 언급을 정확히
  한 문장으로만 포함하십시오. 길게 늘어놓지 마십시오.

구조 규칙(3겹 구조 — 반드시 이 순서로, 번호나 헤더 없이 자연스러운 문단 전환으로 작성):
- ①상황 요약: 사용자가 입력한 민원을 쉬운 일상어로 되받아 "정리하면 ~한 상황이시군요"처럼
  당신이 상황을 이해했음을 먼저 확인시키십시오.
- ②왜 문제가 되는가: 어떤 쟁점에 해당하는지와 그 인과관계를 쉬운 말로 먼저 설명하고, 법률/
  금융 용어가 필요하면 쉬운 설명을 먼저 쓴 뒤 괄호로 용어명을 붙이십시오
  (예: "가입할 때 안내받았어야 할 중요한 내용을 충분히 설명받지 못하신 것으로 보입니다
  (설명의무 위반)").
- ③그래서 무엇을 할 수 있는가: 수치를 언급하지 말고, 어떤 요인이 있으면 유리하게 작용할
  수 있는지 정성적으로 안내하면서 분쟁조정 과정에서 무엇을 준비·강조하면 좋을지에
  집중하십시오. 절차와 제출 서류는 화면에 별도로 안내되니 그것을 참고하라고만
  언급하십시오(목록 자체를 여기서 다시 나열하지 마십시오).

분량 규칙(중요 — 답변 지연시간에 직결됨):
- 위 3겹 구조를 3~4문단으로, 각 문단은 3~4문장 이내로 작성하십시오. 헤더(##)나 표를
  만들지 말고 일반 문단으로만 작성하십시오.
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
