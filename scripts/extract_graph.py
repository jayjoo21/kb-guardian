"""
data/parsed/decisions/ 중 sector가 "은행ㆍ중소서민" 또는 "금융투자"인 180건에서
Claude API(claude-sonnet-4-6)로 쟁점/배상비율/근거법조 등 구조화 데이터를 추출해
data/graph/extracted/{case_id}.json 으로 저장한다.

배경: data/graph/sample_review.md 에서 5건을 사람이 직접 검수한 결과, 다음이
확인됨 — (1) ratio는 피신청인 단위로 분리되어야 하고 배상 판단이 없는 사례는
반드시 null이어야 함(임의 추정 금지), (2) 사실관계상의 무관한 과실비율(교통사고
과실 20% 등)을 배상비율로 오추출할 위험이 있음, (3) law_articles를 법령/약관으로만
좁히면 판례 인용이 통째로 누락됨. 이 스크립트의 프롬프트/스키마는 그 검수 결과를
반영한 것이다.

사용법:
    python scripts/extract_graph.py --sample
        검수용 5건(64070, 64077, 129983, 64720, 64499)만 추출하고
        data/graph/sample_review.md의 사람 검수 기대값과 자동 대조한 리포트를
        data/graph/sample_extract_report.md 에 저장한다. 이후 자동으로 멈춘다.

    python scripts/extract_graph.py --estimate
        전체 대상(은행ㆍ중소서민+금융투자 180건) 중 미추출분에 대해 API를
        호출하지 않고 토큰 수만 세어 예상 비용을 출력한다.

    python scripts/extract_graph.py --all --confirm
        전체 대상에 대해 실제로 추출을 실행한다. --confirm 없이는 실행되지
        않고 비용 추정만 출력한다(안전장치).

    재실행 시 data/graph/extracted/{case_id}.json 이 이미 있으면 스킵한다.
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

# Windows 콘솔(cp949 등)에서 이모지/특수문자 출력 시 UnicodeEncodeError 방지
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

DATA_PARSED = Path("data/parsed/decisions")
DATA_GRAPH = Path("data/graph")
EXTRACTED_DIR = DATA_GRAPH / "extracted"
FAILURES_CSV = DATA_GRAPH / "extract_failures.csv"
SAMPLE_REVIEW_MD = DATA_GRAPH / "sample_review.md"
SAMPLE_REPORT_MD = DATA_GRAPH / "sample_extract_report.md"

MODEL = "claude-sonnet-4-6"
TARGET_SECTORS = {"은행ㆍ중소서민", "금융투자"}
SAMPLE_IDS = ["64070", "64077", "129983", "64720", "64499"]

# 스코프 밖으로 확정된 case_id (data/SCOPE.md 참조). data/parsed/decisions/에서 이미
# data/reserve/decisions/로 옮겨졌지만, 크롤링/파싱이 재실행되어 다시 생겨나더라도
# 추출 단계에서 원천 차단하기 위한 방어용 목록.
#   64767: 「금융분쟁조정사례집 제2권」 전권(165만자) — 개별 결정례가 아님
EXCLUDED_IDS = {"64767"}

MAX_CHARS = 25_000
HEAD_CHARS = 20_000
TAIL_CHARS = 5_000

MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 3.0

# claude-sonnet-4-6 가격 ($/1M 토큰) - 비용 추정용
INPUT_PRICE_PER_MTOK = 3.00
OUTPUT_PRICE_PER_MTOK = 15.00
# 실측 없이 잡는 러프한 출력 토큰 추정치 (스키마 상 필드 수 기준)
EST_OUTPUT_TOKENS_PER_CASE = 700

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("extract_graph")

ISSUE_ENUM = [
    "설명의무_위반", "적합성원칙_위반", "적정성원칙_위반", "부당권유",
    "불완전판매_기타", "우대금리_미적용", "중도해지_불이익", "금리인하요구권",
    "임의처리_무단거래", "착오송금", "전산장애", "보이스피싱_피해보상",
    "담보_보증분쟁", "예금지급_분쟁", "수수료_비용분쟁", "약관해석_분쟁", "기타",
]
PRODUCT_ENUM = [
    "예적금", "대출", "펀드", "ELS_DLS", "신탁",
    "방카슈랑스", "카드", "외환", "퇴직연금", "CP_채권", "기타",
]
FACTOR_ENUM = [
    "고령자", "금융취약계층", "예적금목적_방문", "최초투자", "투자경험_다수",
    "고액투자자", "전문투자자", "서류_자필미기재", "모니터링콜_부실", "신청인_주의소홀", "기타",
]

SCHEMA_JSON = """{
  "case_id": "...",
  "case_no": "...",
  "issues": [{"name": "<enum>", "result": "인정|불인정|각하|판단없음"}],
  "products": [],
  "law_articles": [],
  "precedents": [],
  "referenced_cases": [],
  "factors": [{"name": "<enum>", "direction": "가산|감산", "value_pp": 5}],
  "outcomes": [{"respondent": "...", "result": "인용|일부인용|기각|각하|조정성립", "ratio": 60, "amount": 8760000}],
  "recommendation": null,
  "summary": "...",
  "keywords": []
}"""

SYSTEM_PROMPT = f"""당신은 금융감독원 분쟁조정 결정문에서 구조화 데이터를 추출하는 추출기입니다.
반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체 하나만 출력하십시오. JSON 앞뒤에
설명, 인사말, 코드펜스(```), 어떤 추가 텍스트도 출력하지 마십시오. 출력의 첫 글자는 반드시
'{{' 여야 하고 마지막 글자는 반드시 '}}' 여야 합니다.

## 출력 스키마
{SCHEMA_JSON}

- case_no: 사건번호(예: "제2023-1호", "2005-74"). 원문에 없으면 null.
- issues[].name: 다음 enum 중에서만 선택 (해당 사항 없으면 "기타"): {ISSUE_ENUM}
- issues[].result: 그 쟁점 하나에 대한 개별 결론. 문서 전체의 최종 결론을 모든 쟁점에
  그대로 복사하지 말 것. 쟁점이 여러 개이고 결과가 다르면(예: 하나는 인정, 하나는 각하)
  각각 따로 표기할 것.
- products[]: 다음 enum 중에서만 선택: {PRODUCT_ENUM}
- law_articles[]: 법령·시행령·감독규정·약관 조항만 포함. "금융소비자보호법 제19조"처럼
  법령명+조 번호로 정규화. 舊법이면 "舊자본시장법 제47조"처럼 舊 접두를 유지. 판례는
  여기 넣지 말 것(precedents로).
- precedents[]: 법원 판례만. "대법원 2002.3.15. 선고 2000다9086"처럼 정규화. 원문에
  등장하는 모든 판례 인용을 빠짐없이 포함할 것(법리의 직접 근거로 인용된 대법원 판례를
  놓치지 말 것). 동일 판례가 문서 내 여러 곳에서 인용되어도 한 번만 기재.
- referenced_cases[]: 인용된 다른 분쟁조정 사례(예: "제2003-12호", "조정번호 제2001-30호").
  "제2003-12호"처럼 정규화.
- factors[].name: 다음 enum 중에서만 선택: {FACTOR_ENUM}
- factors[].value_pp: 원문에 ±N%p 수치가 명시적으로 나오는 경우만 숫자로 채우고, 없으면 null.
  절대 임의로 추정하지 말 것.
- outcomes[]: 피신청인(또는 청구) 단위로 분리. 피신청인이 여러 명이면 각각 별도 항목으로
  작성할 것 (예: 한 피신청인은 60% 배상, 다른 피신청인은 기각인 경우 outcomes를 2개로
  나눌 것 — 하나의 배상비율로 뭉뚱그리지 말 것). 단일 피신청인이면 respondent를 "피신청인"
  으로 표기.
- outcomes[].ratio: 배상비율(%) 숫자. **반드시 "위원회의 판단" 또는 "주문/결정" 섹션의
  결론 문장에서만 추출**. 사실관계·당사자 주장 섹션에 나오는 배상비율처럼 보이는 숫자
  (예: 교통사고 자체의 민사 과실비율 20% 등)는 이 사건의 배상비율이 아니므로 절대
  ratio로 추출하지 말 것. 확신이 없으면 null.
- outcomes[].amount: 지급액(원 단위) 숫자. 없으면 null.
- 배상/책임 판단 없이 "책임이 있음을 확인한다"는 식으로만 끝나는 사례, 청구 기각 사례는
  ratio를 반드시 null로 둘 것. 절대 임의로 숫자를 만들어내지 말 것.
- recommendation: 위원회가 제도나 약관 개선을 권고하는 문장이 있으면 1문장으로 요약,
  없으면 null.
- summary: 사실관계와 판단을 3문장 이내로 요약.
- keywords: 자유 키워드 최대 5개.

모든 필드는 스키마에 정의된 키만 사용하고 임의의 키를 추가하지 말 것."""


def load_case(case_id: str) -> dict:
    path = DATA_PARSED / f"{case_id}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def truncate_text(text: str) -> str:
    if len(text) <= MAX_CHARS:
        return text
    return text[:HEAD_CHARS] + "\n\n...(중략)...\n\n" + text[-TAIL_CHARS:]


def build_user_message(case: dict) -> str:
    header = (
        f"case_id: {case.get('id', '')}\n"
        f"제목: {case.get('title', '')}\n"
        f"권역: {case.get('sector', '')}\n"
        f"유형: {case.get('type', '')}\n"
        f"등록일: {case.get('date', '')}\n\n"
    )
    return header + truncate_text(case.get("text", ""))


def _sort_key(path: Path):
    parts = path.stem.split("-")
    base = int(parts[0])
    suffix = int(parts[1]) if len(parts) > 1 else 0
    return (base, suffix)


def target_case_ids() -> list:
    ids = []
    for path in sorted(DATA_PARSED.glob("*.json"), key=_sort_key):
        if path.stem in EXCLUDED_IDS:
            continue
        rec = json.loads(path.read_text(encoding="utf-8"))
        if rec.get("sector") in TARGET_SECTORS:
            ids.append(rec["id"])
    return ids


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


def call_claude(client: anthropic.Anthropic, case: dict) -> dict:
    user_msg = build_user_message(case)
    response = client.messages.create(
        model=MODEL,
        max_tokens=12000,
        system=SYSTEM_PROMPT,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        messages=[{"role": "user", "content": user_msg}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    return parse_json_response(text)


def process_case(client: anthropic.Anthropic, case_id: str, force: bool) -> str:
    if case_id in EXCLUDED_IDS:
        logger.warning("case %s: EXCLUDED_IDS에 등록된 스코프 밖 문서라 건너뜀", case_id)
        return "skip"

    out_path = EXTRACTED_DIR / f"{case_id}.json"
    if out_path.exists() and not force:
        return "skip"

    case = load_case(case_id)
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            data = call_claude(client, case)
            data["case_id"] = case_id
            EXTRACTED_DIR.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            return "ok"
        except Exception as exc:  # noqa: BLE001 - retry any failure (API error, JSON parse error, ...)
            last_err = exc
            logger.warning("case %s: 시도 %d/%d 실패: %s", case_id, attempt, MAX_RETRIES, exc)
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)

    log_failure(case_id, str(last_err))
    return "fail"


def estimate_cost(client: anthropic.Anthropic, case_ids: list) -> None:
    total_input_tokens = 0
    counted = 0
    for cid in case_ids:
        case = load_case(cid)
        msg = build_user_message(case)
        count = client.messages.count_tokens(
            model=MODEL,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": msg}],
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
    print(f"합계 예상 비용: ${total_cost:.2f}")
    print("(출력 비용은 실측이 아닌 추정치이며, thinking 토큰이 포함되어 실제로는 더 높을 수 있음)\n")


# ---------------------------------------------------------------------------
# --sample 전용: 사람 검수 기대값과의 자동 대조
# ---------------------------------------------------------------------------

def _find_outcome_ratio(outcomes: list, respondent_substr: str):
    for o in outcomes or []:
        if respondent_substr in (o.get("respondent") or ""):
            return o.get("ratio")
    return None


def build_sample_report(results: dict) -> str:
    lines = ["# 샘플 5건 자동 추출 vs 사람 검수 대조 리포트", ""]
    lines.append(
        "> data/graph/sample_review.md 의 사람 검수 기대값과 "
        f"scripts/extract_graph.py --sample ({MODEL}) 실제 추출 결과를 자동 대조한다."
    )
    lines.append("")

    all_pass = True

    def check(name: str, ok: bool, detail: str):
        nonlocal all_pass
        mark = "✅ PASS" if ok else "❌ FAIL"
        if not ok:
            all_pass = False
        lines.append(f"- **{name}**: {mark} — {detail}")

    # 64070: ratio가 null인지
    d = results.get("64070")
    if d is None:
        check("64070 ratio == null", False, "추출 실패 또는 결과 없음")
    else:
        ratios = [o.get("ratio") for o in d.get("outcomes", [])]
        ok = all(r is None for r in ratios) if ratios else True
        check("64070 ratio == null", ok, f"outcomes ratio 값: {ratios}")

    # 64499: ratio가 null인지 (20% 오추출 안 했는지)
    d = results.get("64499")
    if d is None:
        check("64499 ratio == null (20% 오추출 방지)", False, "추출 실패 또는 결과 없음")
    else:
        ratios = [o.get("ratio") for o in d.get("outcomes", [])]
        has_20 = any(r == 20 for r in ratios)
        ok = all(r is None for r in ratios) if ratios else True
        detail = f"outcomes ratio 값: {ratios}"
        if has_20:
            detail += "  ⚠️ 20%가 잡혔다면 교통사고 과실비율을 배상비율로 오추출했을 가능성"
        check("64499 ratio == null (20% 오추출 방지)", ok and not has_20, detail)

    # 64720: C은행 60% / D은행 기각으로 outcomes 분리
    d = results.get("64720")
    if d is None:
        check("64720 outcomes 분리 (C은행 60% / D은행 기각)", False, "추출 실패 또는 결과 없음")
    else:
        outcomes = d.get("outcomes", [])
        c_ratio = _find_outcome_ratio(outcomes, "C")
        d_ratio = _find_outcome_ratio(outcomes, "D")
        ok = len(outcomes) >= 2 and c_ratio == 60 and (d_ratio is None)
        check(
            "64720 outcomes 분리 (C은행 60% / D은행 기각)",
            ok,
            f"outcomes: {outcomes}",
        )

    # 64077: 과실상계 50%가 특정 피신청인에게만 걸렸는지
    d = results.get("64077")
    if d is None:
        check("64077 과실상계 50%가 특정 피신청인에만 적용", False, "추출 실패 또는 결과 없음")
    else:
        outcomes = d.get("outcomes", [])
        ratios = [o.get("ratio") for o in outcomes]
        fifty_count = sum(1 for r in ratios if r == 50)
        ok = fifty_count >= 1 and fifty_count < len(outcomes) if len(outcomes) > 1 else fifty_count == 1
        check(
            "64077 과실상계 50%가 특정 피신청인에만 적용",
            ok,
            f"outcomes: {outcomes}",
        )

    # 129983: precedents 캡처 여부 (sample_review.md는 "5건"으로 기재했으나
    # 실제 원문 인용은 4건이 중복 인용되어 5회 등장 - 고유 판례 수 기준으로 확인)
    d = results.get("129983")
    if d is None:
        check("129983 precedents 캡처", False, "추출 실패 또는 결과 없음")
    else:
        precedents = d.get("precedents", [])
        ok = len(precedents) >= 4
        detail = (
            f"추출된 precedents({len(precedents)}건): {precedents}. "
            "원문 내 대법원 판례 인용은 2010다55699, 2014다17220, 2010다86815, 2010다76368 "
            "총 4건(2010다55699와 2010다76368은 문서 내에서 각각 2회씩 인용)이므로 "
            "고유 판례 수 4건 이상이면 통과로 판단."
        )
        check("129983 precedents 캡처 (고유 4건 이상)", ok, detail)

    lines.append("")
    lines.append(f"## 종합: {'전체 PASS' if all_pass else '일부 FAIL — 프롬프트/스키마 보완 필요'}")
    lines.append("")
    lines.append("## 추출 원본 (참고)")
    for cid in SAMPLE_IDS:
        lines.append(f"\n### {cid}\n```json")
        lines.append(json.dumps(results.get(cid), ensure_ascii=False, indent=2))
        lines.append("```")

    return "\n".join(lines)


def run_sample(client: anthropic.Anthropic, force: bool) -> None:
    results = {}
    for cid in SAMPLE_IDS:
        out_path = EXTRACTED_DIR / f"{cid}.json"
        if out_path.exists() and not force:
            logger.info("case %s: 이미 존재, 스킵 (--force로 재실행 가능)", cid)
            results[cid] = json.loads(out_path.read_text(encoding="utf-8"))
            continue
        status = process_case(client, cid, force=True)
        logger.info("case %s -> %s", cid, status)
        if out_path.exists():
            results[cid] = json.loads(out_path.read_text(encoding="utf-8"))
        else:
            results[cid] = None

    report = build_sample_report(results)
    DATA_GRAPH.mkdir(parents=True, exist_ok=True)
    SAMPLE_REPORT_MD.write_text(report, encoding="utf-8")
    print(report)
    print(f"\n리포트 저장 위치: {SAMPLE_REPORT_MD}")


def run_batch(client: anthropic.Anthropic, case_ids: list, force: bool) -> None:
    stats = {"ok": 0, "fail": 0, "skip": 0}
    for cid in case_ids:
        status = process_case(client, cid, force)
        stats[status] += 1
        logger.info("case %s -> %s", cid, status)
    logger.info("완료: ok=%d fail=%d skip=%d", stats["ok"], stats["fail"], stats["skip"])


def main() -> None:
    parser = argparse.ArgumentParser(description="분쟁조정 결정문 구조화 데이터 추출기 (Claude API)")
    parser.add_argument("--sample", action="store_true", help="검수용 5건만 추출 + 대조 리포트 생성 후 종료")
    parser.add_argument("--estimate", action="store_true", help="API 호출 없이 전체 대상 토큰/비용 추정만 출력")
    parser.add_argument("--all", action="store_true", help="전체 대상(180건)에 대해 추출 실행")
    parser.add_argument("--confirm", action="store_true", help="--all 실행을 위한 명시적 확인 플래그")
    parser.add_argument("--force", action="store_true", help="이미 추출된 case_id도 재실행")
    parser.add_argument("--ids", help="쉼표로 구분된 case_id만 재실행 (실패건 재시도 등 소규모 재실행용)")
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
    logger.info("대상: sector in %s -> %d건", TARGET_SECTORS, len(case_ids))

    if args.estimate:
        pending = [cid for cid in case_ids if args.force or not (EXTRACTED_DIR / f"{cid}.json").exists()]
        logger.info("미추출분: %d건 (기추출 스킵)", len(pending))
        estimate_cost(client, pending)
        return

    if args.all:
        if not args.confirm:
            pending = [cid for cid in case_ids if args.force or not (EXTRACTED_DIR / f"{cid}.json").exists()]
            logger.info("미추출분: %d건", len(pending))
            estimate_cost(client, pending)
            print("--all 은 실제로 실행되지 않았습니다. 실행하려면 --confirm 을 함께 지정하십시오.")
            return
        run_batch(client, case_ids, force=args.force)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
