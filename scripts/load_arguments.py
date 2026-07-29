"""
data/graph/arguments/*.json (196건: 피신청인 반박논리 + 증거 강도 데이터)를
Neo4j AuraDB에 적재한다. load_graph.py가 이미 적재한 Case 노드를 MATCH로만
참조하며, Case를 비롯한 기존 노드/관계(Issue, Product, Respondent 등)는
전혀 건드리지 않는다 — load_graph.py와 완전히 독립된 증분 스크립트.

신규 노드/관계 용도: "은행은 이렇게 반박합니다"(Argument) / "증거 강도 진단"
(Evidence) 두 신규 기능의 그래프 백엔드.

노드:
  Argument {id, text, basis, accepted, accepted_quote, accepted_basis}
    id = "{case_id}-arg{n}" (n은 해당 사례 내 1-based 순번)
  ArgumentBasis {name}   — basis enum 8종 집계/검색용
  Evidence {id, type, source_term, existed, role}
    id = "{case_id}-ev{n}"
  EvidenceType {name}    — type enum 13종 집계/검색용

관계:
  (Case)-[:RESPONDENT_ARGUED]->(Argument)
  (Argument)-[:HAS_BASIS]->(ArgumentBasis)
  (Case)-[:HAS_EVIDENCE]->(Evidence)
  (Evidence)-[:OF_TYPE]->(EvidenceType)

Case 매칭 실패 처리:
  data/graph/arguments/*.json의 case_id가 그래프에 아직 없는 Case를 가리키면
  (예: load_graph.py 미실행) MATCH가 0행을 반환해 해당 사례의 Argument/Evidence가
  통째로 스킵된다. 이런 사례는 스킵 목록으로 모아 로그와 리포트에 남긴다.

사용법:
    python scripts/load_arguments.py                # 증분 적재 (MERGE, 재실행 안전)
    python scripts/load_arguments.py --reset         # Argument/Evidence/ArgumentBasis/
                                                       # EvidenceType 노드만 삭제 후 재적재
                                                       # (Case 등 기존 노드는 손대지 않음)
    python scripts/load_arguments.py --report-only   # 적재 없이 검증 리포트만 출력
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase, RoutingControl

load_dotenv()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

DATA_ARGUMENTS = Path("data/graph/arguments")

NEO4J_URI = os.environ["NEO4J_URI"]
NEO4J_USERNAME = os.environ["NEO4J_USERNAME"]
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE") or None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logging.getLogger("neo4j").setLevel(logging.WARNING)
logger = logging.getLogger("load_arguments")

# extract_arguments.py의 SYSTEM_PROMPT와 동일한 enum (참고/검증용 — 적재 자체는
# 데이터에 있는 값을 그대로 쓰고, enum 밖 값이 나오면 리포트에서 알 수 있도록
# ArgumentBasis/EvidenceType 노드가 그대로 생성된다).
BASIS_ENUM = [
    "자필_서명", "서면_교부", "녹취_해피콜", "투자성향_확인", "고객_투자경험",
    "시장변동_불가항력", "신청인_과실",
    "환헤지_계약정당성", "착오취소_요건부인", "본인확인_절차이행", "일임_임의매매부인",
    "설명이행_주장", "통지인지_이의부재", "약관법령_해석방어", "제3자_책임전가",
    "손해_인과관계다툼",
    "기타",
]
EVIDENCE_TYPE_ENUM = [
    "상품설명서_교부", "투자자정보확인서_자필", "투자자정보확인서_대필",
    "해피콜_녹취", "상담_녹취", "자필서명", "대리서명", "문자_메신저", "계약서",
    "통장거래내역", "모니터링콜_기록", "광고_홍보물", "진술_증언",
]

CONSTRAINTS = [
    "CREATE CONSTRAINT argument_id_unique IF NOT EXISTS FOR (a:Argument) REQUIRE a.id IS UNIQUE",
    "CREATE CONSTRAINT argumentbasis_name_unique IF NOT EXISTS FOR (b:ArgumentBasis) REQUIRE b.name IS UNIQUE",
    "CREATE CONSTRAINT evidence_id_unique IF NOT EXISTS FOR (e:Evidence) REQUIRE e.id IS UNIQUE",
    "CREATE CONSTRAINT evidencetype_name_unique IF NOT EXISTS FOR (t:EvidenceType) REQUIRE t.name IS UNIQUE",
]

# UNWIND 대상이 빈 배열이면 행 자체가 사라지는 문제(load_graph.py와 동일 이슈)를
# [null] 치환 + FOREACH 가드로 피한다. Case가 MATCH되지 않으면(0행) 이 쿼리는
# 아무 것도 쓰지 않고 조용히 끝난다 — 호출부에서 사전에 존재여부를 확인해 스킵 목록을 만든다.
CASE_ARGUMENTS_UPSERT_QUERY = """
MATCH (c:Case {id: $case_id})
WITH c

UNWIND (CASE WHEN $arguments = [] THEN [null] ELSE $arguments END) AS arg
FOREACH (_ IN CASE WHEN arg IS NULL THEN [] ELSE [1] END |
  MERGE (a:Argument {id: arg.id})
  SET a.text = arg.text,
      a.basis = arg.basis,
      a.accepted = arg.accepted,
      a.accepted_quote = arg.accepted_quote,
      a.accepted_basis = arg.accepted_basis
  MERGE (c)-[:RESPONDENT_ARGUED]->(a)
  MERGE (b:ArgumentBasis {name: arg.basis})
  MERGE (a)-[:HAS_BASIS]->(b)
)
WITH DISTINCT c

UNWIND (CASE WHEN $evidence = [] THEN [null] ELSE $evidence END) AS ev
FOREACH (_ IN CASE WHEN ev IS NULL THEN [] ELSE [1] END |
  MERGE (e:Evidence {id: ev.id})
  SET e.type = ev.type,
      e.source_term = ev.source_term,
      e.existed = ev.existed,
      e.role = ev.role
  MERGE (c)-[:HAS_EVIDENCE]->(e)
  MERGE (t:EvidenceType {name: ev.type})
  MERGE (e)-[:OF_TYPE]->(t)
)
"""


def _sort_key(path: Path):
    parts = path.stem.split("-")
    base = int(parts[0])
    suffix = int(parts[1]) if len(parts) > 1 else 0
    return (base, suffix)


def target_case_ids() -> list:
    return [p.stem for p in sorted(DATA_ARGUMENTS.glob("*.json"), key=_sort_key)]


def build_case_params(case_id: str) -> dict:
    data = json.loads((DATA_ARGUMENTS / f"{case_id}.json").read_text(encoding="utf-8"))
    arguments = []
    for n, a in enumerate(data.get("respondent_arguments") or [], start=1):
        arguments.append({
            "id": f"{case_id}-arg{n}",
            "text": a.get("argument"),
            "basis": a.get("basis"),
            "accepted": a.get("accepted"),
            "accepted_quote": a.get("accepted_quote"),
            "accepted_basis": a.get("accepted_basis"),
        })
    evidence = []
    for n, e in enumerate(data.get("evidence_items") or [], start=1):
        evidence.append({
            "id": f"{case_id}-ev{n}",
            "type": e.get("type"),
            "source_term": e.get("source_term"),
            "existed": e.get("existed"),
            "role": e.get("role"),
        })
    return {"case_id": case_id, "arguments": arguments, "evidence": evidence}


def ensure_constraints(driver) -> None:
    for stmt in CONSTRAINTS:
        driver.execute_query(stmt, database_=NEO4J_DATABASE)
    logger.info("제약조건 %d개 확인/생성 완료", len(CONSTRAINTS))


def reset_argument_nodes(driver) -> None:
    logger.warning("--reset: Argument/Evidence/ArgumentBasis/EvidenceType 노드만 삭제 중 (Case 등은 보존)...")
    driver.execute_query(
        "MATCH (n) WHERE n:Argument OR n:Evidence OR n:ArgumentBasis OR n:EvidenceType DETACH DELETE n",
        database_=NEO4J_DATABASE,
    )


def existing_case_ids(driver, case_ids: list) -> set:
    records, _, _ = driver.execute_query(
        "MATCH (c:Case) WHERE c.id IN $ids RETURN c.id AS id",
        {"ids": case_ids},
        database_=NEO4J_DATABASE,
        routing_=RoutingControl.READ,
    )
    return {r["id"] for r in records}


def load_arguments(driver, case_ids: list) -> tuple:
    present = existing_case_ids(driver, case_ids)
    skipped = [cid for cid in case_ids if cid not in present]
    loaded = 0
    for cid in case_ids:
        if cid not in present:
            continue
        params = build_case_params(cid)
        driver.execute_query(CASE_ARGUMENTS_UPSERT_QUERY, params, database_=NEO4J_DATABASE)
        loaded += 1
    logger.info("Argument/Evidence 적재: %d건 (Case 미존재로 스킵 %d건)", loaded, len(skipped))
    if skipped:
        logger.warning("스킵된 case_id (그래프에 대응 Case 노드 없음): %s", skipped)
    return loaded, skipped


# ---------------------------------------------------------------------------
# 검증 리포트
# ---------------------------------------------------------------------------

def print_report(driver) -> None:
    print("\n" + "=" * 70)
    print("적재 검증 리포트 (Argument / Evidence)")
    print("=" * 70)

    print("\n[1] 노드 타입별 카운트")
    records, _, _ = driver.execute_query(
        """
        MATCH (n) WHERE n:Argument OR n:ArgumentBasis OR n:Evidence OR n:EvidenceType
        RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    for r in records:
        print(f"  {r['label']}: {r['cnt']}")

    print("\n[1] 관계 타입별 카운트")
    records, _, _ = driver.execute_query(
        """
        MATCH ()-[r]->() WHERE type(r) IN ['RESPONDENT_ARGUED', 'HAS_BASIS', 'HAS_EVIDENCE', 'OF_TYPE']
        RETURN type(r) AS rel, count(*) AS cnt ORDER BY cnt DESC
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    for r in records:
        print(f"  {r['rel']}: {r['cnt']}")

    print("\n[2] basis별 Argument 수 및 accepted 분포(인정/배척/일부인정/미판단 비율)")
    records, _, _ = driver.execute_query(
        """
        MATCH (a:Argument)
        WITH a.basis AS basis, a.accepted AS accepted, count(*) AS cnt
        WITH basis, collect({accepted: accepted, cnt: cnt}) AS breakdown, sum(cnt) AS total
        RETURN basis, total, breakdown ORDER BY total DESC
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    for r in records:
        total = r["total"]
        parts = ", ".join(
            f"{b['accepted']} {b['cnt']}건({b['cnt']/total*100:.0f}%)"
            for b in sorted(r["breakdown"], key=lambda x: -x["cnt"])
        )
        print(f"  {r['basis']} (n={total}): {parts}")

    print("\n[3] accepted_basis 직접/간접 비율")
    records, _, _ = driver.execute_query(
        """
        MATCH (a:Argument)
        RETURN a.accepted_basis AS accepted_basis, count(*) AS cnt
        ORDER BY cnt DESC
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    total = sum(r["cnt"] for r in records)
    for r in records:
        pct = r["cnt"] / total * 100 if total else 0
        print(f"  {r['accepted_basis']}: {r['cnt']}건 ({pct:.0f}%)")

    print("\n[4] EvidenceType별 건수 및 role 분포(신청인유리/불리/중립)")
    records, _, _ = driver.execute_query(
        """
        MATCH (e:Evidence)
        WITH e.type AS type, e.role AS role, count(*) AS cnt
        WITH type, collect({role: role, cnt: cnt}) AS breakdown, sum(cnt) AS total
        RETURN type, total, breakdown ORDER BY total DESC
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    for r in records:
        total = r["total"]
        parts = ", ".join(
            f"{b['role']} {b['cnt']}건({b['cnt']/total*100:.0f}%)"
            for b in sorted(r["breakdown"], key=lambda x: -x["cnt"])
        )
        print(f"  {r['type']} (n={total}): {parts}")

    print("\n[5] '설명의무_위반' 인정 사례에서 피신청인 반박논리 — basis별 배척 비율")
    print("    (\"은행은 이렇게 반박합니다\" 화면의 원형 쿼리)")
    records, _, _ = driver.execute_query(
        """
        MATCH (c:Case)-[hi:HAS_ISSUE]->(:Issue {name: '설명의무_위반'})
        WHERE hi.result = '인정'
        MATCH (c)-[:RESPONDENT_ARGUED]->(a:Argument)
        WITH a.basis AS basis, count(*) AS total,
             sum(CASE WHEN a.accepted = '배척' THEN 1 ELSE 0 END) AS rejected
        RETURN basis, total, rejected,
               round(100.0 * rejected / total) AS rejected_pct
        ORDER BY total DESC
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    if not records:
        print("  결과 없음 (HAS_ISSUE 관계가 아직 적재되지 않았을 수 있음 — load_graph.py 선행 필요)")
    for r in records:
        print(f"  {r['basis']}: 총 {r['total']}건 중 배척 {r['rejected']}건 ({r['rejected_pct']}%)")

    print("\n[6] 증거 패턴: 해피콜_녹취 existed=false vs true 사례의 배상비율(ratio) 평균")
    print("    (증거 강도 진단의 원형 쿼리)")
    records, _, _ = driver.execute_query(
        """
        MATCH (e:Evidence {type: '해피콜_녹취'})
        RETURN e.existed AS existed, count(*) AS total_evidence
        ORDER BY existed
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    total_hc = sum(r["total_evidence"] for r in records)
    print(f"  참고: 전체 코퍼스에 해피콜_녹취 타입 증거 자체가 {total_hc}건뿐 (표본이 아니라 전체 모집단)")
    records, _, _ = driver.execute_query(
        """
        MATCH (c:Case)-[:HAS_EVIDENCE]->(e:Evidence {type: '해피콜_녹취'})
        MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent)
        WHERE ho.ratio IS NOT NULL
        RETURN e.existed AS existed, avg(ho.ratio) AS avg_ratio, count(DISTINCT c) AS n_cases
        ORDER BY existed
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    if not records:
        print("  결과 없음 (해피콜_녹취 증거가 있으면서 ratio가 있는 사례가 없음)")
    for r in records:
        label = "있었던 사례(existed=true)" if r["existed"] else "없었던 사례(existed=false)"
        print(f"  {label}: n={r['n_cases']}  평균 배상비율={r['avg_ratio']:.1f}  (표본 매우 작음, 참고용)")

    print("\n[6-1] 전체 EvidenceType별 existed=true/false 배상비율(ratio) 평균 비교")
    print("      (해피콜_녹취처럼 표본이 작은 유형을 다른 유형과 함께 보기 위한 확장 테이블.")
    print("       ratio는 '일부인용' 결과에서만 주로 존재하므로 절대비교보다 유형 간 상대비교용)")
    records, _, _ = driver.execute_query(
        """
        MATCH (c:Case)-[:HAS_EVIDENCE]->(e:Evidence)
        MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent)
        WHERE ho.ratio IS NOT NULL
        WITH e.type AS type, e.existed AS existed, avg(ho.ratio) AS avg_ratio, count(DISTINCT c) AS n
        RETURN type, existed, avg_ratio, n
        ORDER BY type, existed DESC
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    by_type = {}
    for r in records:
        by_type.setdefault(r["type"], {})[r["existed"]] = (r["avg_ratio"], r["n"])
    for t in sorted(by_type):
        parts = []
        for existed_val in (True, False):
            if existed_val in by_type[t]:
                avg_ratio, n = by_type[t][existed_val]
                tag = "true" if existed_val else "false"
                parts.append(f"existed={tag} 평균 {avg_ratio:.1f}(n={n})")
        flag = "  <- 해피콜_녹취(표본 극소)" if t == "해피콜_녹취" else ""
        print(f"  {t}: " + " vs ".join(parts) + flag)

    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="피신청인 반박논리/증거 데이터를 Neo4j AuraDB에 적재")
    parser.add_argument("--reset", action="store_true",
                         help="Argument/Evidence/ArgumentBasis/EvidenceType 노드만 삭제 후 재적재 "
                              "(Case 등 load_graph.py가 만든 노드는 보존)")
    parser.add_argument("--report-only", action="store_true", help="적재 없이 검증 리포트만 출력")
    args = parser.parse_args()

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    driver.verify_connectivity()
    logger.info("Neo4j 연결 확인 완료 (database=%s)", NEO4J_DATABASE)

    try:
        if args.report_only:
            print_report(driver)
            return

        ensure_constraints(driver)
        if args.reset:
            reset_argument_nodes(driver)

        case_ids = target_case_ids()
        logger.info("대상: data/graph/arguments/*.json -> %d건", len(case_ids))
        load_arguments(driver, case_ids)

        print_report(driver)
    finally:
        driver.close()


if __name__ == "__main__":
    main()
