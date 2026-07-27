"""
data/graph/extracted/*.json (196건, 기존 검증된 구조화 추출 결과)는 건드리지 않고,
같은 사례들에서 새 필드 두 개(respondent_arguments, evidence_items)만 별도로
추출해 data/graph/arguments/{case_id}.json 에 저장한다. extract_graph.py와는
완전히 독립된 스크립트 — 대상 원문은 data/parsed/decisions/{case_id}.json 의 text.

새 필드 용도: "은행은 이렇게 반박합니다"(respondent_arguments) / "증거 강도 진단"
(evidence_items) 두 신규 기능의 근거 데이터.

환각 방지 원칙(이 프로젝트 전체의 핵심 차별화)을 이 스키마에도 그대로 적용:
- respondent_arguments는 결정문에 실제 서술된 피신청인 주장만. 없으면 빈 배열.
- accepted는 "위원회의 판단" 섹션에 실제로 그 주장에 대한 처리가 언급된 경우만
  인정/배척/일부인정으로 채우고, 명시적 언급이 없으면 "미판단".
- evidence_items도 원문에 실제 등장한 것만, role이 불명확하면 "중립".

사용법:
    python scripts/extract_arguments.py --sample
        지정된 5건(129983, 64805-1, 64729, 64559, 64783)만 추출하고 결과와
        실측 비용을 출력한 뒤 종료한다. 전체 실행은 별도로 --all --confirm 필요.

    python scripts/extract_arguments.py --estimate
        전체 대상 중 미추출분에 대해 API 호출 없이 토큰/비용만 추정.

    python scripts/extract_arguments.py --all --confirm
        전체 대상(196건 중 미추출분)에 대해 실제 추출 실행.

    재실행 시 data/graph/arguments/{case_id}.json 이 이미 있으면 스킵.
    --force 로 기존 결과도 덮어쓸 수 있다.
"""

import argparse
import csv
import json
import logging
import re
import sys
import time
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

DATA_PARSED = Path("data/parsed/decisions")
EXTRACTED_DIR = Path("data/graph/extracted")
ARGUMENTS_DIR = Path("data/graph/arguments")
FAILURES_CSV = ARGUMENTS_DIR / "extract_failures.csv"

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 8000

SAMPLE_IDS = ["129983", "64805-1", "64729", "64559", "64783"]

MAX_CHARS = 25_000
HEAD_CHARS = 20_000
TAIL_CHARS = 5_000

MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 3.0

INPUT_PRICE_PER_MTOK = 3.00
OUTPUT_PRICE_PER_MTOK = 15.00
EST_OUTPUT_TOKENS_PER_CASE = 400  # 필드 2개뿐이라 extract_graph.py보다 가벼움

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("extract_arguments")

BASIS_ENUM = [
    "자필_서명", "서면_교부", "녹취_해피콜", "투자성향_확인", "고객_투자경험",
    "시장변동_불가항력", "신청인_과실", "기타",
]
EVIDENCE_TYPE_ENUM = [
    "상품설명서_교부", "투자자정보확인서_자필", "투자자정보확인서_대필",
    "해피콜_녹취", "상담_녹취", "자필서명", "대리서명", "문자_메신저", "계약서",
    "통장거래내역", "모니터링콜_기록", "광고_홍보물", "진술_증언",
]

SCHEMA_JSON = """{
  "case_id": "...",
  "respondent_arguments": [
    {
      "argument": "...",
      "basis": "<enum>",
      "accepted": "인정|배척|일부인정|미판단",
      "accepted_quote": "위원회가 이 주장을 다룬 원문 문장 그대로(최대 200자) 또는 null",
      "accepted_basis": "직접|간접"
    }
  ],
  "evidence_items": [
    {"type": "<enum>", "source_term": "...", "existed": true, "role": "신청인유리|신청인불리|중립"}
  ]
}"""

SYSTEM_PROMPT = f"""당신은 금융감독원 분쟁조정 결정문에서 "피신청인의 반박 논리"와
"이 사건에 실제로 등장한 증거"만 뽑아내는 추출기입니다.
반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체 하나만 출력하십시오. JSON 앞뒤에
설명, 인사말, 코드펜스(```), 어떤 추가 텍스트도 출력하지 마십시오. 출력의 첫 글자는 반드시
'{{' 여야 하고 마지막 글자는 반드시 '}}' 여야 합니다.

## 출력 스키마
{SCHEMA_JSON}

- respondent_arguments: 결정문의 "피신청인 주장" 또는 이에 준하는 섹션(피신청인의
  답변·항변이 서술된 부분)에 실제로 나오는 주장만 포함하십시오. 그런 섹션이 없거나
  피신청인 주장이 서술되어 있지 않으면 반드시 빈 배열로 두십시오. 원문에 없는 주장을
  추론하거나 일반적인 금융회사 반박 논리로 창작하지 마십시오.
  - argument: 피신청인이 실제로 편 주장을 한두 문장으로 요약.
  - basis: 다음 enum 중에서만 선택 (해당 사항 없으면 "기타"): {BASIS_ENUM}
  - accepted: 이 주장이 "위원회의 판단"(또는 이유/결론) 섹션에서 어떻게 다뤄졌는지로만
    판정하십시오. 위원회가 이 주장을 명시적으로 받아들였으면 "인정", 배척했으면 "배척",
    부분적으로만 받아들였으면 "일부인정", 이 주장에 대한 위원회의 언급 자체를 찾을 수
    없으면 반드시 "미판단"으로 두십시오. 추측하지 마십시오.
  - accepted_quote: 위원회의 판단/이유/결론 섹션에서 이 주장을 직접 다룬 문장을
    원문 그대로(최대 200자) 인용하십시오. 이 주장을 콕 집어 언급한 문장이 없고
    전체 결론에서 유추한 것이라면 반드시 null로 두십시오. 요약하거나 새로 문장을
    만들지 말고 원문 그대로 옮길 것.
  - accepted_basis: accepted_quote를 채웠으면 "직접", accepted_quote가 null이라
    전체 결론에서 유추했으면 "간접".
- evidence_items: 결정문 원문에 실제로 등장한 증거·자료만 포함하십시오(사실관계,
  피신청인 주장, 위원회 판단 어디든 언급되면 포함). 언급되지 않은 항목은 절대
  넣지 마십시오. 개수를 채우려 하지 말 것 — 해당하는 것이 없으면 빈 배열이 정답입니다.
  - type: 다음 enum 중에서만 선택하십시오: {EVIDENCE_TYPE_ENUM}
    이 enum에 정확히 맞는 유형이 없으면 그 항목 자체를 만들지 마십시오("기타"로
    임의 분류하지 말 것).
  - source_term: 이 증거를 가리키는 데 원문에서 실제로 쓰인 표현을 그대로
    옮기십시오(예: "간이투자설명서", "금융상품투자확인서", "일반투자자 투자정보
    확인서", "위탁계약", "매매내역"). 요약하거나 표준화하거나 의역하지 말고
    원문 문구를 그대로 복사하십시오.
  - existed: 이 증거가 실제로 존재했다고 원문에서 확인되면 true. (예: "자필 서명이 없다",
    "녹취록이 존재하지 않는다"처럼 부존재가 쟁점인 경우 false로 표기.)
  - role: 이 증거가 위원회 판단에서 신청인에게 유리하게 작용했으면 "신청인유리",
    불리하게 작용했으면 "신청인불리", 판단에 실질적 영향이 없었거나 방향이 불명확하면
    반드시 "중립"으로 두십시오. 추측하지 마십시오.

모든 필드는 스키마에 정의된 키만 사용하고 임의의 키를 추가하지 말 것. 두 배열 모두
근거가 없으면 빈 배열이 정답입니다 — 빈 배열을 채우려고 애쓰지 마십시오."""


def load_parsed(case_id: str) -> dict:
    path = DATA_PARSED / f"{case_id}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def truncate_text(text: str) -> str:
    if len(text) <= MAX_CHARS:
        return text
    return text[:HEAD_CHARS] + "\n\n...(중략)...\n\n" + text[-TAIL_CHARS:]


def build_user_message(case_id: str, parsed: dict) -> str:
    header = (
        f"case_id: {case_id}\n"
        f"제목: {parsed.get('title', '')}\n"
        f"권역: {parsed.get('sector', '')}\n"
        f"유형: {parsed.get('type', '')}\n"
        f"등록일: {parsed.get('date', '')}\n\n"
    )
    return header + truncate_text(parsed.get("text", ""))


def _sort_key(path: Path):
    parts = path.stem.split("-")
    base = int(parts[0])
    suffix = int(parts[1]) if len(parts) > 1 else 0
    return (base, suffix)


def target_case_ids() -> list:
    return [p.stem for p in sorted(EXTRACTED_DIR.glob("*.json"), key=_sort_key)]


_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n?|```\s*$")


def parse_json_response(text: str) -> dict:
    cleaned = _FENCE_RE.sub("", text.strip()).strip()
    return json.loads(cleaned)


def log_failure(case_id: str, reason: str) -> None:
    FAILURES_CSV.parent.mkdir(parents=True, exist_ok=True)
    is_new = not FAILURES_CSV.exists()
    with FAILURES_CSV.open("a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["case_id", "reason"])
        writer.writerow([case_id, reason])


def call_claude(client: anthropic.Anthropic, case_id: str, parsed: dict):
    user_msg = build_user_message(case_id, parsed)
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    return parse_json_response(text), response.usage


def process_case(client: anthropic.Anthropic, case_id: str, force: bool):
    out_path = ARGUMENTS_DIR / f"{case_id}.json"
    if out_path.exists() and not force:
        return "skip", None

    parsed = load_parsed(case_id)
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            data, usage = call_claude(client, case_id, parsed)
            data["case_id"] = case_id
            ARGUMENTS_DIR.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            return "ok", usage
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning("case %s: 시도 %d/%d 실패: %s", case_id, attempt, MAX_RETRIES, exc)
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)

    log_failure(case_id, str(last_err))
    return "fail", None


def estimate_cost(client: anthropic.Anthropic, case_ids: list) -> None:
    total_input_tokens = 0
    counted = 0
    for cid in case_ids:
        parsed = load_parsed(cid)
        msg = build_user_message(cid, parsed)
        count = client.messages.count_tokens(
            model=MODEL, system=SYSTEM_PROMPT, messages=[{"role": "user", "content": msg}],
        )
        total_input_tokens += count.input_tokens
        counted += 1

    total_output_tokens = EST_OUTPUT_TOKENS_PER_CASE * counted
    input_cost = total_input_tokens / 1_000_000 * INPUT_PRICE_PER_MTOK
    output_cost = total_output_tokens / 1_000_000 * OUTPUT_PRICE_PER_MTOK
    total_cost = input_cost + output_cost

    print(f"\n=== 비용 추정 ({MODEL}, {counted}건) ===")
    print(f"입력 토큰 합계 (count_tokens 실측): {total_input_tokens:,}")
    print(f"출력 토큰 추정 (건당 {EST_OUTPUT_TOKENS_PER_CASE} 가정): {total_output_tokens:,}")
    print(f"입력 비용: ${input_cost:.2f}  (${INPUT_PRICE_PER_MTOK}/1M)")
    print(f"출력 비용: ${output_cost:.2f}  (추정, ${OUTPUT_PRICE_PER_MTOK}/1M)")
    print(f"합계 예상 비용: ${total_cost:.2f}\n")


def run_sample(client: anthropic.Anthropic, force: bool) -> None:
    results = {}
    total_input, total_output = 0, 0
    real_calls = 0

    for cid in SAMPLE_IDS:
        out_path = ARGUMENTS_DIR / f"{cid}.json"
        if out_path.exists() and not force:
            logger.info("case %s: 이미 존재, 스킵 (--force로 재실행 가능)", cid)
            results[cid] = json.loads(out_path.read_text(encoding="utf-8"))
            continue
        status, usage = process_case(client, cid, force=True)
        logger.info("case %s -> %s", cid, status)
        if out_path.exists():
            results[cid] = json.loads(out_path.read_text(encoding="utf-8"))
        else:
            results[cid] = None
        if usage:
            total_input += usage.input_tokens
            total_output += usage.output_tokens
            real_calls += 1

    for cid in SAMPLE_IDS:
        print(f"\n=== {cid} ===")
        print(json.dumps(results.get(cid), ensure_ascii=False, indent=2))

    if real_calls:
        input_cost = total_input / 1_000_000 * INPUT_PRICE_PER_MTOK
        output_cost = total_output / 1_000_000 * OUTPUT_PRICE_PER_MTOK
        sample_cost = input_cost + output_cost
        avg_input = total_input / real_calls
        avg_output = total_output / real_calls

        remaining = len(target_case_ids()) - len(SAMPLE_IDS)
        projected_input_cost = remaining * avg_input / 1_000_000 * INPUT_PRICE_PER_MTOK
        projected_output_cost = remaining * avg_output / 1_000_000 * OUTPUT_PRICE_PER_MTOK
        projected_cost = projected_input_cost + projected_output_cost

        print(f"\n=== 샘플 {real_calls}건 실측 비용 ===")
        print(f"입력 토큰 합계: {total_input:,} / 출력 토큰 합계: {total_output:,}")
        print(f"샘플 {real_calls}건 실제 비용: ${sample_cost:.4f}")
        print(f"건당 평균: 입력 {avg_input:.0f} 토큰, 출력 {avg_output:.0f} 토큰")
        print(f"\n전체 미실행분({remaining}건) 예상 비용: ${projected_cost:.2f}")
        print(f"전체({len(target_case_ids())}건) 예상 총비용(샘플 포함): ${sample_cost + projected_cost:.2f}")

    print("\n--sample 실행 종료. 전체 실행은 --all --confirm 으로 별도 실행하십시오.")


def run_batch(client: anthropic.Anthropic, case_ids: list, force: bool) -> None:
    stats = {"ok": 0, "fail": 0, "skip": 0}
    for cid in case_ids:
        status, _ = process_case(client, cid, force)
        stats[status] += 1
        logger.info("case %s -> %s", cid, status)
    logger.info("완료: ok=%d fail=%d skip=%d", stats["ok"], stats["fail"], stats["skip"])


def main() -> None:
    parser = argparse.ArgumentParser(description="피신청인 반박논리/증거 추출기 (Claude API)")
    parser.add_argument("--sample", action="store_true", help="지정 5건만 추출 + 실측비용 출력 후 종료")
    parser.add_argument("--estimate", action="store_true", help="API 호출 없이 전체 대상 토큰/비용 추정만 출력")
    parser.add_argument("--all", action="store_true", help="전체 대상에 대해 추출 실행")
    parser.add_argument("--confirm", action="store_true", help="--all 실행을 위한 명시적 확인 플래그")
    parser.add_argument("--force", action="store_true", help="이미 추출된 case_id도 재실행")
    parser.add_argument("--ids", help="쉼표로 구분된 case_id만 재실행")
    args = parser.parse_args()

    client = anthropic.Anthropic()

    if args.sample:
        run_sample(client, force=args.force)
        return

    if args.ids:
        ids = [x.strip() for x in args.ids.split(",") if x.strip()]
        run_batch(client, ids, force=True)
        return

    case_ids = target_case_ids()
    logger.info("대상: data/graph/extracted/*.json -> %d건", len(case_ids))

    if args.estimate:
        pending = [cid for cid in case_ids if args.force or not (ARGUMENTS_DIR / f"{cid}.json").exists()]
        logger.info("미추출분: %d건 (기추출 스킵)", len(pending))
        estimate_cost(client, pending)
        return

    if args.all:
        if not args.confirm:
            pending = [cid for cid in case_ids if args.force or not (ARGUMENTS_DIR / f"{cid}.json").exists()]
            logger.info("미추출분: %d건", len(pending))
            estimate_cost(client, pending)
            print("--all 은 실제로 실행되지 않았습니다. 실행하려면 --confirm 을 함께 지정하십시오.")
            return
        run_batch(client, case_ids, force=args.force)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
