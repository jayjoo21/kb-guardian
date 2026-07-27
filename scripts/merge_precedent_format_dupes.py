"""
Precedent 노드 중 법원+사건번호는 동일하지만 공백(날짜 "2000.5.12." vs "2000. 5. 12.")
또는 판결/결정 접미사 유무로만 다른 중복 노드를 병합한다.

merge_romanized_precedents.py와 같은 이유로 대상을 하드코딩하지 않고 매 실행 시
그래프를 재스캔한다(재실행 안전). 단, 같은 법원+사건번호인데 실제 선고일자
숫자 자체가 다른 그룹은 포맷팅 차이가 아니라 데이터 불일치이므로 자동 병합하지
않고 "충돌"로 분리해 사람이 판단하게 한다(예: "2003.12.26." vs "2003.12.16.").

정규화 대상 판단(법원+사건번호 동일)과 대표(canonical) 선택 기준:
  1. "판결"/"결정" 접미사가 있는 쪽을 더 완전한 표기로 우선
  2. 날짜에 공백이 있는 표기("2000. 5. 12.")를 공식 인용 스타일로 우선
  3. "선고"/"자" 등 판결유형 표지가 있는 쪽을 날짜 없는 맨몸 표기보다 우선
  4. 위가 같으면 citing_cases(이 판례를 인용하는 Case 수)가 많은 쪽 우선
     (엣지 재연결 수를 최소화)
  5. 그래도 같으면 문자열이 더 긴 쪽(정보량이 더 많다고 간주) 우선

data/graph/extracted/*.json 원본은 건드리지 않는다 — 그래프에서만 정규화한다.

사용법:
    python scripts/merge_precedent_format_dupes.py --dry-run   # 계획만 출력
    python scripts/merge_precedent_format_dupes.py             # 실제 병합 실행
"""

import argparse
import os
import re
import sys

from dotenv import load_dotenv
from neo4j import GraphDatabase, RoutingControl

load_dotenv()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

NEO4J_URI = os.environ["NEO4J_URI"]
NEO4J_USERNAME = os.environ["NEO4J_USERNAME"]
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE") or None

CASE_NO_RE = re.compile(r"\d{2,4}[가-힣]{1,3}\d+(?:,\s*\d+)?")
COURT_RE = re.compile(r"^([가-힣]+지방법원|[가-힣]+고등법원|[가-힣]+지법|대법원|헌법재판소)")
DATE_RE = re.compile(r"(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.")
SPACED_DATE_RE = re.compile(r"\d{4}\.\s+\d{1,2}\.\s+\d{1,2}\.")


def norm_case_no(s: str) -> str:
    return re.sub(r"\s+", "", s)


def score(ref: str, citing_cases: int) -> tuple:
    has_verdict_suffix = ref.rstrip().endswith(("판결", "결정"))
    has_spaced_date = bool(SPACED_DATE_RE.search(ref))
    has_decision_marker = ("선고" in ref) or (" 자 " in ref) or ref.strip().endswith("자")
    return (has_verdict_suffix, has_spaced_date, has_decision_marker, citing_cases, len(ref))


def build_groups(driver) -> dict:
    records, _, _ = driver.execute_query(
        """MATCH (p:Precedent)
           OPTIONAL MATCH (c:Case)-[:CITES_PRECEDENT]->(p)
           RETURN p.ref AS ref, count(c) AS citing_cases""",
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    groups: dict[tuple, list[dict]] = {}
    for r in records:
        ref = r["ref"]
        m_case = CASE_NO_RE.search(ref)
        m_court = COURT_RE.match(ref.strip())
        if not m_case or not m_court:
            continue
        key = (m_court.group(1), norm_case_no(m_case.group(0)))
        groups.setdefault(key, []).append({"ref": ref, "citing_cases": r["citing_cases"]})
    return {k: v for k, v in groups.items() if len(v) > 1}


def classify(groups: dict) -> tuple[list, list]:
    mergeable, conflicts = [], []
    for key, members in groups.items():
        dates = set()
        for m in members:
            dm = DATE_RE.search(m["ref"])
            if dm:
                dates.add((dm.group(1), int(dm.group(2)), int(dm.group(3))))
        if len(dates) > 1:
            conflicts.append({"court": key[0], "case_no": key[1], "members": members, "dates": sorted(dates)})
            continue
        ranked = sorted(members, key=lambda m: score(m["ref"], m["citing_cases"]), reverse=True)
        target = ranked[0]["ref"]
        others = [m["ref"] for m in members if m["ref"] != target]
        mergeable.append({"court": key[0], "case_no": key[1], "target_ref": target, "dupe_refs": others})
    return mergeable, conflicts


MERGE_QUERY = """
MATCH (dupe:Precedent {ref: $dupe_ref})
MATCH (target:Precedent {ref: $target_ref})
OPTIONAL MATCH (c:Case)-[:CITES_PRECEDENT]->(dupe)
WITH dupe, target, collect(DISTINCT c) AS cases
FOREACH (case_node IN cases | MERGE (case_node)-[:CITES_PRECEDENT]->(target))
DETACH DELETE dupe
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Precedent 공백/판결접미사 중복 병합")
    parser.add_argument("--dry-run", action="store_true", help="병합 없이 계획만 출력")
    args = parser.parse_args()

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    try:
        groups = build_groups(driver)
        mergeable, conflicts = classify(groups)

        print(f"중복 그룹 {len(groups)}건 중 병합 가능 {len(mergeable)}건, 날짜 충돌(보류) {len(conflicts)}건\n")

        for c in conflicts:
            print(f"[충돌 - 자동 병합 안 함] {c['court']} {c['case_no']} — 날짜 불일치 {c['dates']}")
            for m in c["members"]:
                print(f"    {m['ref']!r} (citing_cases={m['citing_cases']})")
        print()

        for g in mergeable:
            for d in g["dupe_refs"]:
                print(f"[병합 예정] {d!r} -> {g['target_ref']!r}")

        if args.dry_run:
            print(f"\n--dry-run: 실제 병합 안 함.")
            return

        merged_count = 0
        for g in mergeable:
            for d in g["dupe_refs"]:
                driver.execute_query(
                    MERGE_QUERY, {"dupe_ref": d, "target_ref": g["target_ref"]},
                    database_=NEO4J_DATABASE,
                )
                merged_count += 1

        print(f"\n총 {merged_count}건 병합 완료, {len(conflicts)}건 충돌 보류(수동 확인 필요).")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
