"""
data/raw/kb_terms/ 에 있는 KB국민은행 공개 약관·상품설명서(PDF)에서 위험고지·권리구제
관련 문구를 Claude API로 추출해 data/graph/kb_terms.json 으로 저장한다.

배경: Phase 4 스펙 — "KB 공식 약관에는 이렇게 명시돼 있어요"를 결과 화면에 보여주려면
실제 약관 원문에서 발췌한 문구여야 한다(지어내면 안 됨). 그래서 추출 후 Claude가 낸 각
인용문이 PDF 원문에 실제로 등장하는 부분 문자열인지 프로그램으로 재검증하고, 검증에
실패한 인용문은 버린다(환각 방지 원칙).

사용법:
    python scripts/extract_kb_terms.py
        data/raw/kb_terms/*.pdf 전체를 처리해 data/graph/kb_terms.json 에 병합 저장한다.
        재실행 시 이미 처리된 파일(kb_terms.json에 source_file로 존재)은 스킵한다.
        --force 로 전체 재처리.

    파싱/검증 실패는 삭제하지 않고 data/graph/kb_terms_failures.log 에 기록한다.
"""

import argparse
import json
import logging
import re
import sys
import time
from pathlib import Path

import anthropic
import pdfplumber
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common.enums import ISSUE_ENUM, PRODUCT_ENUM  # noqa: E402

load_dotenv()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("extract_kb_terms")

RAW_DIR = Path("data/raw/kb_terms")
OUT_PATH = Path("data/graph/kb_terms.json")
FAILURES_LOG = Path("data/graph/kb_terms_failures.log")

MODEL = "claude-sonnet-4-6"
MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 2
MAX_CHARS = 20000  # 상품설명서 전체를 넘기되 과금·컨텍스트 보호를 위한 상한

# 파일명 -> product 힌트(PRODUCT_ENUM). 못 맞추면 "기타".
PRODUCT_HINTS = [
    ("els", "ELS_DLS"),
    ("fx", "외환"),
    ("starfx", "외환"),
    ("solicitation", "기타"),
]

SCHEMA_JSON = """{
  "quotes": [
    {"text": "<원문에 실제로 있는 문장·구절을 그대로 인용(요약·의역 금지)>", "issues": ["<ISSUE_ENUM 중 0개 이상>"]}
  ]
}"""

SYSTEM_PROMPT = f"""당신은 KB국민은행이 공개한 금융상품 약관·상품설명서·판매준칙 원문에서, 금융
소비자 보호와 직접 관련된 문구(원금 손실 가능성 등 위험고지, 설명의무·서명 관련 권리구제
안내, 청약철회권, 투자자 보호 절차 등)를 있는 그대로 발췌하는 추출기입니다.

반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체 하나만 출력하십시오. JSON 앞뒤에
설명, 인사말, 코드펜스(```), 어떤 추가 텍스트도 출력하지 마십시오. 출력의 첫 글자는 반드시
'{{' 여야 하고 마지막 글자는 반드시 '}}' 여야 합니다.

## 출력 스키마
{SCHEMA_JSON}

- text: 원문에 실제로 존재하는 연속된 문장(또는 짧은 문단)을 한 글자도 바꾸지 않고 그대로
  옮길 것. 여러 곳을 조합하거나 요약하거나 의역하지 말 것 — 이후 프로그램이 원문과 정확히
  일치하는지 검증하며, 일치하지 않으면 버려진다. 문서 서두의 목차·정의 조항처럼 소비자
  보호와 무관한 내용은 제외.
- issues: 그 문구가 실무적으로 관련되는 쟁점을 다음 enum 중에서만 0개 이상 선택:
  {ISSUE_ENUM}. 애매하면 빈 배열로 둘 것(임의로 끼워맞추지 말 것).
- 문서당 최대 8개, 최소 0개(관련 문구가 없으면 quotes를 빈 배열로 출력)."""


def pdf_text(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        pages = [p.extract_text() or "" for p in pdf.pages]
    return "\n".join(pages)


def guess_product(filename: str) -> str:
    lower = filename.lower()
    for key, product in PRODUCT_HINTS:
        if key in lower:
            return product
    return "기타"


_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n?|```\s*$")


def parse_json_response(text: str) -> dict:
    cleaned = _FENCE_RE.sub("", text.strip()).strip()
    return json.loads(cleaned)


def normalize(text: str) -> str:
    return re.sub(r"\s+", "", text)


def call_claude(client: anthropic.Anthropic, text: str) -> dict:
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": text[:MAX_CHARS]}],
    )
    out = next((b.text for b in response.content if b.type == "text"), "")
    return parse_json_response(out)


def log_failure(source_file: str, reason: str) -> None:
    FAILURES_LOG.parent.mkdir(parents=True, exist_ok=True)
    with FAILURES_LOG.open("a", encoding="utf-8") as f:
        f.write(f"{source_file}\t{reason}\n")


def process_file(client: anthropic.Anthropic, path: Path) -> list:
    raw_text = pdf_text(path)
    if not raw_text.strip():
        log_failure(path.name, "빈 텍스트(스캔 이미지일 가능성 — OCR 미지원)")
        return []

    normalized_source = normalize(raw_text)
    product = guess_product(path.name)

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            data = call_claude(client, raw_text)
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("%s: 시도 %d/%d 실패: %s", path.name, attempt, MAX_RETRIES, exc)
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
    else:
        log_failure(path.name, f"API/파싱 실패: {last_err}")
        return []

    kept = []
    dropped = 0
    for q in data.get("quotes", []):
        quote_text = (q.get("text") or "").strip()
        issues = [i for i in q.get("issues", []) if i in ISSUE_ENUM]
        if not quote_text:
            continue
        if normalize(quote_text) not in normalized_source:
            dropped += 1
            continue
        kept.append({
            "source_file": path.name,
            "product": product if product in PRODUCT_ENUM else "기타",
            "text": quote_text,
            "issues": issues,
        })

    if dropped:
        logger.warning("%s: 원문 불일치로 %d건 제외", path.name, dropped)
    logger.info("%s: 인용 %d건 채택", path.name, len(kept))
    return kept


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="이미 처리된 파일도 재추출")
    args = parser.parse_args()

    if not RAW_DIR.exists():
        logger.error("%s 없음 — KB 약관 PDF를 먼저 넣어주세요", RAW_DIR)
        return

    existing: list = []
    if OUT_PATH.exists() and not args.force:
        existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    done_files = {q["source_file"] for q in existing}

    client = anthropic.Anthropic()
    all_quotes = list(existing)

    pdf_files = sorted(RAW_DIR.glob("*.pdf"))
    if not pdf_files:
        logger.warning("%s 에 PDF가 없습니다", RAW_DIR)
        return

    for path in pdf_files:
        if path.name in done_files:
            logger.info("%s: 이미 처리됨, 스킵", path.name)
            continue
        try:
            quotes = process_file(client, path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("%s: 처리 중 예외: %s", path.name, exc)
            log_failure(path.name, str(exc))
            continue
        all_quotes.extend(quotes)
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(all_quotes, ensure_ascii=False, indent=2), encoding="utf-8")

    logger.info("완료: 총 %d건 저장 -> %s", len(all_quotes), OUT_PATH)


if __name__ == "__main__":
    main()
