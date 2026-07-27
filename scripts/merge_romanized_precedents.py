"""
Precedent 노드 중 사건번호의 한글 사건유형 음절이 로마자로 잘못 표기된 노드
(예: "2010da76368" — "다"가 "da"로 깨짐)를 정상 한글 표기 노드로 병합한다.

배경: fetch_precedents.py로 law.go.kr 조회 시 이 5건은 사건번호 정규식
(숫자+한글+숫자)에 라틴 문자가 걸려 매칭 자체가 안 됐다(추출 단계 LLM이
간혹 "다"를 "da"로 잘못 옮겨 적은 사례). 같은 사건이 정상 한글 표기로 이미
별도 Precedent 노드로 존재하며, 그쪽은 본문(title/summary 등)이 채워져 있다.

병합 대상은 하드코딩하지 않고 매 실행 시 그래프를 다시 스캔해서 재계산한다
(재실행 안전 — 이미 병합된 건 다음 실행에서 로마자 노드 자체가 없으니 재발견되지
않는다). 병합 방식: 로마자 노드를 인용하는 CITES_PRECEDENT 엣지를 정상 노드로
재연결한 뒤 로마자 노드를 삭제한다. data/graph/extracted/*.json 원본은
건드리지 않는다 — 이 정규화는 그래프 레벨에서만 이루어진다.

사용법:
    python scripts/merge_romanized_precedents.py --dry-run   # 계획만 출력
    python scripts/merge_romanized_precedents.py             # 실제 병합 실행
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

# Revised Romanization, 기본 자음+ㅏ 14음절. 사건번호 자리(가/나/다/라/마 등)에 흔히
# 쓰이는 음절만 대상 — 이 정도로 "유사 로마자 오기" 전체를 커버한다.
ROMAN_TO_HANGUL = {
    "ga": "가", "na": "나", "da": "다", "ra": "라", "ma": "마", "ba": "바", "sa": "사",
    "a": "아", "ja": "자", "cha": "차", "ka": "카", "ta": "타", "pa": "파", "ha": "하",
}

LATIN_CANDIDATE_RE = re.compile(r"(\d{2,4})([A-Za-z]{1,4})(\d+)")
HANGUL_CASE_RE = re.compile(r"(\d{2,4})([가-힣]{1,3})(\d+)")


def build_plan(driver) -> list[dict]:
    records, _, _ = driver.execute_query(
        "MATCH (p:Precedent) RETURN p.ref AS ref",
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    refs = [r["ref"] for r in records]

    hangul_index: dict[tuple, list[str]] = {}
    for ref in refs:
        for m in HANGUL_CASE_RE.finditer(ref):
            hangul_index.setdefault((m.group(1), m.group(3)), []).append(ref)

    plan = []
    for ref in refs:
        m = LATIN_CANDIDATE_RE.search(ref)
        if not m:
            continue
        prefix, latin, suffix = m.group(1), m.group(2), m.group(3)
        hangul = ROMAN_TO_HANGUL.get(latin.lower())
        if not hangul:
            plan.append({"typo_ref": ref, "target_ref": None, "reason": f"미지원 로마자 조각: {latin}"})
            continue
        reconstructed = ref.replace(latin, hangul, 1)
        siblings = hangul_index.get((prefix, suffix), [])
        if reconstructed in siblings:
            plan.append({"typo_ref": ref, "target_ref": reconstructed, "reason": None})
        else:
            plan.append({
                "typo_ref": ref, "target_ref": None,
                "reason": f"정확히 일치하는 한글 표기 노드를 찾지 못함 (후보: {siblings})",
            })
    return plan


MERGE_QUERY = """
MATCH (typo:Precedent {ref: $typo_ref})
MATCH (target:Precedent {ref: $target_ref})
OPTIONAL MATCH (c:Case)-[:CITES_PRECEDENT]->(typo)
WITH typo, target, collect(DISTINCT c) AS cases
FOREACH (case_node IN cases | MERGE (case_node)-[:CITES_PRECEDENT]->(target))
DETACH DELETE typo
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="로마자 오기 Precedent 노드 병합")
    parser.add_argument("--dry-run", action="store_true", help="병합 없이 계획만 출력")
    args = parser.parse_args()

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    try:
        plan = build_plan(driver)
        if not plan:
            print("로마자 오기로 의심되는 Precedent 노드가 없습니다.")
            return

        mergeable = [p for p in plan if p["target_ref"]]
        unresolved = [p for p in plan if not p["target_ref"]]

        for p in mergeable:
            print(f"[병합 예정] {p['typo_ref']!r} -> {p['target_ref']!r}")
        for p in unresolved:
            print(f"[보류 - 확인 필요] {p['typo_ref']!r}: {p['reason']}")

        if args.dry_run:
            print(f"\n--dry-run: {len(mergeable)}건 병합 예정, {len(unresolved)}건 보류. 실제 실행 안 함.")
            return

        for p in mergeable:
            driver.execute_query(
                MERGE_QUERY, {"typo_ref": p["typo_ref"], "target_ref": p["target_ref"]},
                database_=NEO4J_DATABASE,
            )
            print(f"병합 완료: {p['typo_ref']!r} -> {p['target_ref']!r}")

        print(f"\n총 {len(mergeable)}건 병합, {len(unresolved)}건 보류(수동 확인 필요).")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
