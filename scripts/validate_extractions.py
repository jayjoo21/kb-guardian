"""
data/graph/extracted/*.json 전체를 대상으로 한 상시 품질 게이트. 새 배치를 추출할
때마다(즉 scripts/extract_graph.py 실행 후) 재실행해서 data/graph/validation_report.md를
갱신하는 용도로 유지한다.

검증 항목:
  1) ratio·amount 정합성: outcomes[].ratio와 amount가 둘 다 있으면
     기준액 = amount / (ratio/100) 을 역산하고, 원문(data/parsed/decisions/{id}.json)에서
     그 기준액이 ±1% 오차 내로 등장하는지 확인한다. 등장하지 않으면 FLAG.
     (217925 스팟체크에서 발견한 "ratio가 다른 결정에서 섞여 들어간" 오류가 바로 이
     패턴 — amount는 맞는데 ratio만 틀리면 역산한 기준액이 원문 어디에도 없다.)
     주의: 기준액이 원문에 명시적으로 등장하지 않는 경우도 있을 수 있으므로(위원회가
     중간 산출값을 안 밝히는 경우), 이 FLAG는 "확정 오류"가 아니라 "사람 확인 필요"로
     간주한다.
  2) 기본 무결성: ratio가 0~100 범위 밖이거나 amount가 음수이면 FLAG.
  3) issues-outcomes 모순: issues가 비어있는데 outcomes 중 인용/일부인용이 있으면 FLAG
     (근거 쟁점 없이 배상이 인정된 것처럼 보이는 모순).

사용법:
    python scripts/validate_extractions.py
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
OUT_PATH = Path("data/graph/validation_report.md")

AMOUNT_RE = re.compile(r"(\d{1,3}(?:,\d{3})+|\d{4,})\s*원")
# "10억6,200만원"처럼 억/만 단위를 섞어 쓰는 한국어 금액 표기 — 콤마 표기와 별도로 파싱해야
# 한다(순수 정규식 콤마 매칭만으로는 이 표기를 놓쳐 실제로는 맞는 ratio·amount를 오탐 FLAG함).
EOK_MAN_RE = re.compile(r"(\d+)\s*억\s*(\d{1,3}(?:,\d{3})*|\d+)\s*만\s*원")
EOK_ONLY_RE = re.compile(r"(\d+)\s*억\s*원")
MAN_ONLY_RE = re.compile(r"(\d{1,3}(?:,\d{3})*|\d+)\s*만\s*원")
TOLERANCE = 0.01
UPHELD_RESULTS = {"인용", "일부인용"}


def extract_amounts(text: str) -> set:
    text = text or ""
    amounts = set()
    for m in AMOUNT_RE.finditer(text):
        try:
            amounts.add(int(m.group(1).replace(",", "")))
        except ValueError:
            pass
    for m in EOK_MAN_RE.finditer(text):
        try:
            eok = int(m.group(1))
            man = int(m.group(2).replace(",", ""))
            amounts.add(eok * 100_000_000 + man * 10_000)
        except ValueError:
            pass
    for m in EOK_ONLY_RE.finditer(text):
        try:
            amounts.add(int(m.group(1)) * 100_000_000)
        except ValueError:
            pass
    for m in MAN_ONLY_RE.finditer(text):
        try:
            amounts.add(int(m.group(1).replace(",", "")) * 10_000)
        except ValueError:
            pass
    return {a for a in amounts if a > 0}


def check_ratio_amount(text: str, ratio, amount):
    """반환: (checked: bool, matched: bool, base: float|None)"""
    if ratio is None or amount is None:
        return False, None, None
    if not isinstance(ratio, (int, float)) or ratio == 0:
        return False, None, None
    base = amount / (ratio / 100.0)
    amounts = extract_amounts(text)
    matched = any(abs(a - base) / base <= TOLERANCE for a in amounts)
    return True, matched, base


def validate_case(case_id: str) -> dict:
    extracted = json.loads((DATA_EXTRACTED / f"{case_id}.json").read_text(encoding="utf-8"))
    parsed_path = DATA_DECISIONS / f"{case_id}.json"
    text = json.loads(parsed_path.read_text(encoding="utf-8")).get("text", "") if parsed_path.exists() else ""

    flags = []

    issues = extracted.get("issues") or []
    outcomes = extracted.get("outcomes") or []

    for idx, o in enumerate(outcomes):
        ratio = o.get("ratio")
        amount = o.get("amount")

        if ratio is not None and (not isinstance(ratio, (int, float)) or ratio < 0 or ratio > 100):
            flags.append({
                "type": "ratio_out_of_range",
                "detail": f"outcomes[{idx}] respondent={o.get('respondent')} ratio={ratio}",
            })

        if amount is not None and (not isinstance(amount, (int, float)) or amount < 0):
            flags.append({
                "type": "negative_amount",
                "detail": f"outcomes[{idx}] respondent={o.get('respondent')} amount={amount}",
            })

        checked, matched, base = check_ratio_amount(text, ratio, amount)
        if checked and not matched:
            flags.append({
                "type": "ratio_amount_base_not_found",
                "detail": (
                    f"outcomes[{idx}] respondent={o.get('respondent')} ratio={ratio} amount={amount} "
                    f"-> 역산 기준액={base:,.0f}원, 원문에서 ±1% 이내로 발견 안 됨"
                ),
            })

    if not issues and any((o.get("result") in UPHELD_RESULTS) for o in outcomes):
        flags.append({
            "type": "issues_empty_but_outcome_upheld",
            "detail": f"issues=[] 인데 outcomes에 인용/일부인용 있음: {[o.get('result') for o in outcomes]}",
        })

    return {"case_id": case_id, "title": extracted.get("case_no"), "flags": flags}


# 사람이 원문을 직접 대조해 확인한 상태 메모. 재실행할 때마다 리포트가 새로 생성되므로
# 미결 항목이 문서에서 사라지지 않도록 여기 박아두고 build_report에서 이어붙인다.
# (2026-07-23) 217925/64805는 다중결정 병합 분리(scripts/split_multidecision.py) 이후
# 217925는 이 플래그 목록에서 아예 사라졌고(정합성 확인됨), 64805-1/64805-2는 분리로
# 병합 문제와는 무관함이 확인되어 아래처럼 별도 원인(복합 공제 계산)으로 재분류됐다.
KNOWN_ISSUES = {
    "64238": "확인됨(오탐) — 과실상계 후 추가 공제가 있는 복합 계산이라 기준액이 원문에 "
             "단일 숫자로 안 나옴(±1% 검사 한계). '4. 결론' 대조 결과 ratio=40·amount 모두 정확.",
    "64805-1": "확인됨(오탐) — (300,000,000원-35,498,490원)×64% 복합 계산. "
               "'4. 결론' 원문과 정확히 일치. 다중결정 병합 문제와는 무관(분리 후에도 남은 플래그).",
    "64805-2": "확인됨(오탐) — (200,000,000원-59,740,257원)×60% 복합 계산. "
               "'4. 결론' 원문과 정확히 일치. 다중결정 병합 문제와는 무관(분리 후에도 남은 플래그).",
    "64473": "미확인 — 64238/64805와 같은 복합 공제 패턴의 오탐으로 추정되나 직접 대조는 아직 안 함. "
             "분리 재추출과 무관한 별개 건이므로 후속 확인 필요.",
    "64553": "미확인 — 64238/64805와 같은 복합 공제 패턴의 오탐으로 추정되나 직접 대조는 아직 안 함. "
             "분리 재추출과 무관한 별개 건이므로 후속 확인 필요.",
    "64808": "미확인 — 64238/64805와 같은 복합 공제 패턴의 오탐으로 추정되나 직접 대조는 아직 안 함. "
             "분리 재추출과 무관한 별개 건이므로 후속 확인 필요.",
}


def build_report(results: list) -> str:
    lines = ["# 추출 결과 정합성 검증 리포트", ""]
    lines.append(
        "> data/graph/extracted/ 전체를 대상으로 한 상시 품질 게이트. 새 배치 추출 후 "
        "`python scripts/validate_extractions.py`로 재실행할 것."
    )
    lines.append("")

    total = len(results)
    flagged = [r for r in results if r["flags"]]
    total_flags = sum(len(r["flags"]) for r in results)
    lines.append(f"전체 {total}건 중 **플래그 있는 건: {len(flagged)}건** (플래그 총 {total_flags}개)")
    lines.append("")

    by_type = {}
    for r in results:
        for f in r["flags"]:
            by_type.setdefault(f["type"], []).append((r["case_id"], f["detail"]))

    type_names = {
        "ratio_amount_base_not_found": "ratio·amount 기준액 불일치(확인 필요)",
        "ratio_out_of_range": "ratio 범위 밖(0~100 초과/미만)",
        "negative_amount": "amount 음수",
        "issues_empty_but_outcome_upheld": "issues 비었는데 outcomes 인용/일부인용",
    }

    for t, name in type_names.items():
        lines.append(f"- {name}: {len(by_type.get(t, []))}건")
    lines.append("")

    for t, name in type_names.items():
        items = by_type.get(t, [])
        lines.append(f"## {name} ({len(items)}건)")
        if not items:
            lines.append("없음")
            lines.append("")
            continue
        for case_id, detail in items:
            note = KNOWN_ISSUES.get(case_id)
            line = f"- **{case_id}**: {detail}"
            if note:
                line += f"\n  - 상태: {note}"
            lines.append(line)
        lines.append("")

    return "\n".join(lines)


def _sort_key(case_id: str):
    parts = case_id.split("-")
    base = int(parts[0])
    suffix = int(parts[1]) if len(parts) > 1 else 0
    return (base, suffix)


def main() -> None:
    case_ids = sorted((p.stem for p in DATA_EXTRACTED.glob("*.json")), key=_sort_key)
    results = [validate_case(cid) for cid in case_ids]

    report = build_report(results)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(report, encoding="utf-8")

    flagged = [r for r in results if r["flags"]]
    print(f"전체 {len(results)}건 중 플래그 있음: {len(flagged)}건")
    print(f"리포트 저장: {OUT_PATH}")


if __name__ == "__main__":
    main()
