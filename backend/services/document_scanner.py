"""[LLM 비전] 사용자가 업로드한 서류 이미지/PDF를 Claude로 판독한다.

scripts/extract_graph.py·extract_arguments.py와 동일한 환각 방지 원칙을 그대로
적용한다: 이미지에 실제로 보이는 내용만 보고하고, 판독이 안 되면 "판독 불가"라고
정확히 답하도록 강제한다. 이미지에 없는 내용을 일반적인 서류 양식으로 짐작해서
채우지 않는다.
"""

import json
import logging
import re

import anthropic

logger = logging.getLogger("document_scanner")

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 600
MAX_RETRIES = 2

# scripts/extract_arguments.py의 EVIDENCE_TYPE_ENUM과 동일한 값을 그대로 옮겨왔다
# (scripts/는 백엔드가 import하는 대상이 아니라 별도 실행 스크립트라서 mirror 유지 —
# load_arguments.py도 같은 이유로 자체 사본을 둔다). 서류 사진 판독 맥락에 맞는
# 값만 추리지 않고 전체를 유지해 기존 증거 유형 어휘와 그대로 맞춘다.
DOCUMENT_TYPE_ENUM = [
    "상품설명서_교부", "투자자정보확인서_자필", "투자자정보확인서_대필",
    "자필서명", "대리서명", "계약서", "통장거래내역", "문자_메신저",
    "기타", "판독불가",
]

SCHEMA_JSON = """{
  "readable": true 또는 false,
  "document_type": "<enum>",
  "has_signature": true 또는 false 또는 null,
  "signature_note": "서명란에서 실제로 보이는 내용 설명 또는 null",
  "investment_profile_marked": true 또는 false 또는 null,
  "product_name": "이미지에서 실제로 읽힌 상품명 또는 null",
  "notes": "그 외 실제로 확인되는 특이사항 또는 null"
}"""

SYSTEM_PROMPT = f"""당신은 금융 분쟁 상담을 준비하는 소비자가 올린 서류 사진/PDF를
판독하는 도우미입니다.

절대 규칙:
- 이미지·문서에 실제로 보이는 내용만 보고하십시오. 흐릿하거나 잘려서 안 보이는
  부분을 일반적인 서류 양식으로 짐작해서 채우지 마십시오.
- 판독이 불가능하면(글씨가 안 보임, 이미지 품질 문제, 관련 없는 사진 등)
  readable을 false로, document_type을 "판독불가"로 정확히 답하십시오. 추측하지
  마십시오.
- 서명란이 있는지, 서명이 실제로 되어 있는지만 사실대로 보고하고, 서명이
  본인 것인지·진위 여부는 판단하지 마십시오(이미지만으로 알 수 없음).

반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체 하나만 출력하십시오. 설명,
인사말, 코드펜스, 추가 텍스트를 출력하지 마십시오.

## 출력 스키마
{SCHEMA_JSON}

- document_type: 다음 enum 중에서만 선택: {DOCUMENT_TYPE_ENUM}
- has_signature/investment_profile_marked: 해당 항목이 이미지에 없거나 확인할
  수 없으면 반드시 null(추측 금지)."""

_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n?|```\s*$")


def _parse_json(text: str) -> dict:
    cleaned = _FENCE_RE.sub("", text.strip()).strip()
    return json.loads(cleaned)


def _fallback_result(note: str) -> dict:
    return {
        "readable": False,
        "document_type": "판독불가",
        "has_signature": None,
        "signature_note": None,
        "investment_profile_marked": None,
        "product_name": None,
        "notes": note,
    }


def scan_document(client: anthropic.Anthropic, media_type: str, data_b64: str, is_pdf: bool) -> dict:
    """서류 이미지/PDF 1개를 판독한다. media_type은 MIME 타입("image/png",
    "application/pdf" 등), data_b64는 파일 바이트를 base64 인코딩한 문자열."""
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
                    "content": [content_block, {"type": "text", "text": "이 서류를 판독해 스키마대로만 답하십시오."}],
                }],
            )
            raw = next((b.text for b in response.content if b.type == "text"), "")
            data = _parse_json(raw)
            doc_type = data.get("document_type")
            return {
                "readable": bool(data.get("readable", False)),
                "document_type": doc_type if doc_type in DOCUMENT_TYPE_ENUM else "기타",
                "has_signature": data.get("has_signature"),
                "signature_note": data.get("signature_note"),
                "investment_profile_marked": data.get("investment_profile_marked"),
                "product_name": data.get("product_name"),
                "notes": data.get("notes"),
            }
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("scan_document 시도 %d/%d 실패: %s", attempt, MAX_RETRIES, exc)

    logger.error("scan_document 최종 실패: %s", last_err)
    return _fallback_result("서류 판독 중 오류가 발생했습니다. 다시 시도해주세요.")
