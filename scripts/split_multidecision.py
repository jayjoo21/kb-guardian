"""
1단계 스캔(scripts/scan_multidecision.py)에서 확정된 "다중결정 병합" 의심 14건을 결정문
단위로 분리해 새 case_id({nttId}-1, {nttId}-2, ...)로 data/parsed/decisions/에 기록한다.

분리 알고리즘 (14건 전수 사전 검증 완료):
  1. 원문에서 "조정번호" 등장 위치를 찾는다 — 이게 각 결정의 실질적 시작점(그 결정의
     "조정번호 : 제YYYY-N호" 줄)이다.
  2. "주문(과)? 같이 (조정)?결정(함|한다|하였다|하기로)" 종결구 등장 위치를 찾는다 —
     각 결정 본문의 실질적 끝점이다. (문서마다 "이에 주문과 같이 결정함" / "주문과
     같이 결정한다" / "주문 같이 결정한다"(오탈자) 등 표현이 달라 폭넓게 잡는다.)
  3. 부속서(산정기준/배상비율/별지 등)는 게시글마다 맨 앞(첫 "조정번호" 이전) 또는
     맨 뒤(마지막 종결구 이후) 중 한쪽에 통째로 붙어있다 — 14건 전수 확인 결과 중간에
     끼어있는 사례는 없었다. 앞/뒤 중 있는 쪽을 부속서로 떼어내 분리된 모든 결정에
     공통으로 붙인다.
  4. 각 결정 세그먼트 안에서 "안 건 명 :"과 "결정일자 :"를 그 결정 고유의 title/date로
     쓴다(병합 파일 레벨 title/date보다 정확함).
  5. source_files는 "산정기준" 등 부속서 키워드가 없는 첨부 목록이 세그먼트 순서와
     1:1 대응한다고 보고, 세그먼트 i에는 decision_files[i] + appendix_files를 붙인다.
     (사전 검증: 14건 모두 "조정번호" 개수 == 비부속서 첨부 개수 == 종결구 개수로 정확히
     일치함을 확인했다. 하나라도 안 맞으면 그 건은 자동 분리를 보류하고 SKIP으로 보고한다.)

주의: "조정번호" 위치를 세그먼트 시작점으로 쓰기 때문에, 그 직전의 "금융분쟁조정위원회
/조 정 결 정 서/결정일자" 같은 반복 boilerplate 헤더 몇 줄이 앞 결정의 꼬리 또는 부속서
쪽에 섞여 들어갈 수 있다. 법적 실질 내용(사실관계/당사자주장/위원회판단/주문)에는
영향이 없음을 217925 등 표본으로 확인했으므로 감수한다.

분리 후: 원본 병합 파일(data/parsed/decisions/{nttId}.json,
data/graph/extracted/{nttId}.json)은 삭제하지 않고 data/reserve/decisions/,
data/reserve/extracted/ 로 옮겨 보존한다(감사 추적용).

사용법:
    python scripts/split_multidecision.py --dry-run   # 분리 결과 검증만, 파일 안 씀
    python scripts/split_multidecision.py              # 실제 분리 + 원본 아카이브
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

DATA_DECISIONS = Path("data/parsed/decisions")
DATA_EXTRACTED = Path("data/graph/extracted")
RESERVE_DECISIONS = Path("data/reserve/decisions")
RESERVE_EXTRACTED = Path("data/reserve/extracted")

TARGET_IDS = [
    "217925", "217926", "217927",
    "127565", "127566", "127577",
    "64793", "64794", "64797", "64798", "64803", "64805", "64806", "64818",
]

APPENDIX_KEYWORDS = ["산정기준", "배상비율", "별지", "참고", "붙임"]
CASE_NO_HEADER_RE = re.compile(r"조정번호")
CLOSING_RE = re.compile(r"주문\s*(?:과)?\s*같이\s*(?:조정)?결정(?:함|한다|하였다|하기로)")
ANKUNMYEONG_RE = re.compile(r"안\s*건\s*명\s*[:：]?\s*([^\n]+)")
DATE_RE = re.compile(r"(?:결정일자|조정일자)\s*[:：]\s*([^\n]+)")


def is_appendix(name: str) -> bool:
    return any(kw in name for kw in APPENDIX_KEYWORDS)


def split_one(ntt_id: str) -> dict:
    parsed_path = DATA_DECISIONS / f"{ntt_id}.json"
    parsed = json.loads(parsed_path.read_text(encoding="utf-8"))
    text = parsed["text"]
    source_files = parsed.get("source_files", [])

    decision_files = [f for f in source_files if not is_appendix(f)]
    appendix_files = [f for f in source_files if is_appendix(f)]

    starts = [m.start() for m in CASE_NO_HEADER_RE.finditer(text)]
    closings = [m.end() for m in CLOSING_RE.finditer(text)]

    # "조정일자/결정일자" 라벨은 "조정번호" 바로 앞줄에 오는데, 세그먼트 시작을
    # "조정번호" 위치로 잡으면 이 날짜 줄이 앞 결정 쪽으로 잘려나가 버린다. 각
    # "조정번호" 위치 바로 앞(200자 이내)에 그 라벨이 있으면 세그먼트 시작을
    # 그 라벨 위치까지 당긴다.
    for i, pos in enumerate(starts):
        window_start = max(0, pos - 200)
        window = text[window_start:pos]
        label_positions = [window.rfind("조정일자"), window.rfind("결정일자")]
        label_positions = [p for p in label_positions if p != -1]
        if label_positions:
            starts[i] = window_start + max(label_positions)

    problems = []
    if len(starts) != len(decision_files):
        problems.append(f"조정번호 개수({len(starts)}) != 비부속서 첨부 개수({len(decision_files)})")
    if len(closings) != len(starts):
        problems.append(f"종결구 개수({len(closings)}) != 조정번호 개수({len(starts)})")

    if problems:
        return {"ntt_id": ntt_id, "ok": False, "problems": problems}

    n = len(starts)
    decision_segments = []
    for i in range(n):
        seg_end = starts[i + 1] if i + 1 < n else len(text)
        decision_segments.append(text[starts[i]:seg_end])

    leading_appendix = text[:starts[0]].strip()
    last_seg = decision_segments[-1]
    last_closing_end_in_seg = closings[-1] - starts[-1]
    trailing_appendix = last_seg[last_closing_end_in_seg:].strip()
    decision_segments[-1] = last_seg[:last_closing_end_in_seg]

    appendix_text = "\n\n".join(x for x in [leading_appendix, trailing_appendix] if x)

    subcases = []
    for i, seg in enumerate(decision_segments):
        title_m = ANKUNMYEONG_RE.search(seg)
        date_m = DATE_RE.search(seg)
        title = title_m.group(1).strip() if title_m else parsed.get("title", "")
        date = date_m.group(1).strip() if date_m else parsed.get("date", "")
        full_text = seg.strip()
        if appendix_text:
            full_text = full_text + "\n\n" + appendix_text
        subcases.append({
            "id": f"{ntt_id}-{i + 1}",
            "title": title,
            "sector": parsed.get("sector", ""),
            "type": parsed.get("type", ""),
            "date": date,
            "source_files": [decision_files[i]] + appendix_files,
            "text": full_text,
        })

    return {
        "ntt_id": ntt_id,
        "ok": True,
        "problems": [],
        "n": n,
        "subcases": subcases,
        "leading_appendix_len": len(leading_appendix),
        "trailing_appendix_len": len(trailing_appendix),
    }


def print_result(result: dict) -> None:
    if not result["ok"]:
        print(f"[SKIP] {result['ntt_id']}: {'; '.join(result['problems'])}")
        return
    print(
        f"[OK] {result['ntt_id']}: {result['n']}건으로 분리, "
        f"부속서 앞={result['leading_appendix_len']}자 뒤={result['trailing_appendix_len']}자"
    )
    for sc in result["subcases"]:
        print(
            f"   - {sc['id']}: title={sc['title']!r} date={sc['date']!r} "
            f"source_files={sc['source_files']} text_len={len(sc['text'])}"
        )


def write_subcases(result: dict) -> None:
    for sc in result["subcases"]:
        out_path = DATA_DECISIONS / f"{sc['id']}.json"
        out_path.write_text(json.dumps(sc, ensure_ascii=False, indent=2), encoding="utf-8")


def archive_original(ntt_id: str) -> None:
    RESERVE_DECISIONS.mkdir(parents=True, exist_ok=True)
    RESERVE_EXTRACTED.mkdir(parents=True, exist_ok=True)
    src_parsed = DATA_DECISIONS / f"{ntt_id}.json"
    src_extracted = DATA_EXTRACTED / f"{ntt_id}.json"
    if src_parsed.exists():
        shutil.move(str(src_parsed), str(RESERVE_DECISIONS / f"{ntt_id}.json"))
    if src_extracted.exists():
        shutil.move(str(src_extracted), str(RESERVE_EXTRACTED / f"{ntt_id}.json"))


def main() -> None:
    parser = argparse.ArgumentParser(description="다중결정 병합 파일을 결정 단위로 분리")
    parser.add_argument("--dry-run", action="store_true", help="분리 결과만 출력, 파일 안 씀")
    args = parser.parse_args()

    results = [split_one(ntt_id) for ntt_id in TARGET_IDS]
    ok_results = [r for r in results if r["ok"]]
    bad_results = [r for r in results if not r["ok"]]

    for r in results:
        print_result(r)

    print()
    print(f"분리 가능: {len(ok_results)}/{len(TARGET_IDS)}건, 총 sub-case {sum(r['n'] for r in ok_results)}건")
    if bad_results:
        print(f"분리 보류(수동 확인 필요): {[r['ntt_id'] for r in bad_results]}")

    if args.dry_run:
        return

    for r in ok_results:
        write_subcases(r)
        archive_original(r["ntt_id"])
    print(f"\n분리 완료: {len(ok_results)}건 원본을 data/reserve/로 아카이브, sub-case를 data/parsed/decisions/에 기록함")


if __name__ == "__main__":
    main()
