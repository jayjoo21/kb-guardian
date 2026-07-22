"""
data/graph/extracted/*.json (및 대응하는 data/parsed/decisions/{id}.json 원문)을 스캔해
"한 case_id 파일에 서로 다른 결정문이 여러 건 병합되어 있을 가능성"을 신호별로 탐지한다.

배경: data/graph/spotcheck.md에서 217925 사례를 검수하다가, 원본 크롤러/파서가 게시글
단위로 첨부파일을 전부 이어붙이는 구조(scripts/parse_docs.py) 때문에 한 게시글에 여러
조정번호(제2025-1호, 제2025-2호)의 결정문이 함께 첨부된 경우 그 둘이 하나의
data/parsed/decisions/{id}.json으로 합쳐지고, 이후 scripts/extract_graph.py가
"입력 파일 1개 = Case 레코드 1개"를 전제하다 보니 LLM이 두 결정의 필드(특히 ratio)를
섞어버리는 문제를 발견했다. 이 스크립트는 그 문제가 217925 외에 또 있는지 찾는
읽기 전용 진단 스캔이다 — 아무것도 수정하지 않는다.

탐지 신호 (각각 독립적으로 판정하고, 걸린 신호를 모두 기록한다 — OR 조건이 아니라
신호별 목록 + 신호 개수 합산):

  A) case_no 콤마 병기      추출된 case_no 문자열에 쉼표가 있으면(예: "제2025-3호, 제2025-4호")
  B) 첨부파일 2개 이상       source_files 중 "산정기준/배상비율/별지/참고/붙임" 등 부속서성
                            키워드가 없는 hwp/pdf 첨부가 2개 이상
  C) 사건번호 중복 등장      원문 텍스트에 서로 다른 "제YYYY-N호" 패턴이 2개 이상 등장
  D) 섹션 헤더 반복          원문에 "N.  주   문"(글자 사이 간격이 있는 헤딩 스타일) 또는
                            "신청인 :" 당사자 라벨이 2회 이상 등장 (본문 중 "이에 주문과
                            같이 결정함" 같은 조밀한 표기는 걸리지 않도록 간격 조건을 둠)

사용법:
    python scripts/scan_multidecision.py
"""

import json
import re
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

DATA_EXTRACTED = Path("data/graph/extracted")
DATA_DECISIONS = Path("data/parsed/decisions")
OUT_PATH = Path("data/graph/multidecision_scan.md")

# 부속서(다른 결정문이 아니라 공통 참고자료)로 보는 첨부파일명 키워드
APPENDIX_KEYWORDS = ["산정기준", "배상비율", "별지", "참고", "붙임", "기준(안)"]
ATTACHMENT_EXTS = {".hwp", ".hwpx", ".pdf"}

CASE_NO_YEAR_RE = re.compile(r"제\s*(\d{4})\s*-\s*(\d+)\s*호")
HEADING_JUMUN_RE = re.compile(r"\d\s*\.\s*주\s{2,}문")
PARTY_SINCHEONGIN_RE = re.compile(r"(?<!피)신\s*청\s*인\s*[:：]")


def is_appendix_filename(name: str) -> bool:
    return any(kw in name for kw in APPENDIX_KEYWORDS)


def signal_a_case_no_comma(case_no: str) -> dict:
    if case_no and "," in case_no:
        return {"hit": True, "detail": case_no}
    return {"hit": False, "detail": None}


def signal_b_multiple_attachments(source_files: list) -> dict:
    decision_files = [
        f for f in (source_files or [])
        if Path(f).suffix.lower() in ATTACHMENT_EXTS and not is_appendix_filename(f)
    ]
    if len(decision_files) >= 2:
        return {"hit": True, "detail": decision_files}
    return {"hit": False, "detail": decision_files}


def signal_c_multiple_case_no_in_text(text: str) -> dict:
    tokens = {(y, n) for y, n in CASE_NO_YEAR_RE.findall(text or "")}
    if len(tokens) >= 2:
        return {"hit": True, "detail": sorted(f"제{y}-{n}호" for y, n in tokens)}
    return {"hit": False, "detail": sorted(f"제{y}-{n}호" for y, n in tokens)}


def signal_d_repeated_headers(text: str) -> dict:
    jumun_count = len(HEADING_JUMUN_RE.findall(text or ""))
    party_count = len(PARTY_SINCHEONGIN_RE.findall(text or ""))
    hit = jumun_count >= 2 or party_count >= 2
    return {"hit": hit, "detail": {"주문_헤딩": jumun_count, "신청인_라벨": party_count}}


def scan_case(case_id: str) -> dict:
    extracted_path = DATA_EXTRACTED / f"{case_id}.json"
    parsed_path = DATA_DECISIONS / f"{case_id}.json"

    extracted = json.loads(extracted_path.read_text(encoding="utf-8"))
    parsed = json.loads(parsed_path.read_text(encoding="utf-8")) if parsed_path.exists() else {}

    text = parsed.get("text", "")
    a = signal_a_case_no_comma(extracted.get("case_no"))
    b = signal_b_multiple_attachments(parsed.get("source_files"))
    c = signal_c_multiple_case_no_in_text(text)
    d = signal_d_repeated_headers(text)

    signals = {"A": a, "B": b, "C": c, "D": d}
    return {
        "case_id": case_id,
        "title": parsed.get("title", ""),
        "case_no": extracted.get("case_no"),
        "signals": signals,
        "hit_count": sum(1 for s in signals.values() if s["hit"]),
    }


def build_report(results: list) -> str:
    lines = ["# 다중결정 병합 의심 스캔 리포트", ""]
    lines.append(
        "> data/graph/extracted/ 181건 전수를 대상으로, 한 case_id 파일에 서로 다른 "
        "결정문이 여러 건 병합되어 있을 가능성을 신호 4종으로 탐지한다. 읽기 전용 진단이며 "
        "아무것도 수정하지 않았다."
    )
    lines.append("")

    total = len(results)
    any_hit = [r for r in results if r["hit_count"] > 0]
    lines.append(f"전체 {total}건 중 **신호가 하나라도 걸린 건: {len(any_hit)}건**")
    lines.append("")

    for label, name in [("A", "case_no 콤마 병기"), ("B", "첨부파일 2개 이상"),
                         ("C", "사건번호 중복 등장"), ("D", "섹션 헤더 반복")]:
        hits = [r for r in results if r["signals"][label]["hit"]]
        lines.append(f"- 신호 {label} ({name}): {len(hits)}건")
    lines.append("")

    lines.append("## 종합 순위 (신호 개수 내림차순 — 3단계 분리 재추출 우선순위 후보)")
    lines.append("")
    lines.append("| case_id | 제목 | case_no | A | B | C | D | 신호 수 |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for r in sorted(any_hit, key=lambda x: (-x["hit_count"], x["case_id"])):
        s = r["signals"]
        mark = lambda k: "✓" if s[k]["hit"] else ""
        lines.append(
            f"| {r['case_id']} | {r['title']} | {r['case_no']} | "
            f"{mark('A')} | {mark('B')} | {mark('C')} | {mark('D')} | {r['hit_count']} |"
        )
    lines.append("")

    for label, name in [("A", "case_no 콤마 병기"), ("B", "첨부파일 2개 이상 (부속서 제외)"),
                         ("C", "사건번호 중복 등장"), ("D", "섹션 헤더 반복")]:
        lines.append(f"## 신호 {label} 상세: {name}")
        hits = [r for r in results if r["signals"][label]["hit"]]
        if not hits:
            lines.append("없음")
            lines.append("")
            continue
        for r in hits:
            detail = r["signals"][label]["detail"]
            lines.append(f"- **{r['case_id']}** ({r['title']}, case_no={r['case_no']}): {detail}")
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    case_ids = sorted((p.stem for p in DATA_EXTRACTED.glob("*.json")), key=int)
    results = [scan_case(cid) for cid in case_ids]

    report = build_report(results)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(report, encoding="utf-8")

    any_hit = [r for r in results if r["hit_count"] > 0]
    print(f"전체 {len(results)}건 중 신호 있음: {len(any_hit)}건")
    print(f"리포트 저장: {OUT_PATH}")


if __name__ == "__main__":
    main()
