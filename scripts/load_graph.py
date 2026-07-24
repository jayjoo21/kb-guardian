"""
data/graph/extracted/*.json (분쟁조정 결정례 구조화 데이터) + data/parsed/criteria/*.json
(분쟁해결기준 20건)을 Neo4j AuraDB에 적재한다. 접속 정보는 .env의
NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE 를 사용한다.

Respondent 노드 주의사항:
  분쟁조정 결정문의 "C은행", "피신청인(1)" 같은 표기는 사례 내 익명 라벨일 뿐
  사례를 넘어 동일인임을 보장하지 않는다(예: A사례의 "C은행"과 B사례의 "C은행"이
  실제로 다른 은행일 수 있음). 그래서 Respondent는 case_id+label을 합친
  key(예: "64720::피신청인 C은행")를 유니크 키로 사용해 사례 간 병합을 막는다.
  (Neo4j Aura는 다중 프로퍼티 "IS UNIQUE" 제약을 지원하지만, 여기서는 호환성과
  단순함을 위해 단일 문자열 key 프로퍼티에 제약을 건다.)

REFERS_TO 해석:
  referenced_cases(예: "제2003-12호")를 다른 Case의 case_no와 매칭한다. 일부
  Case의 case_no는 "제2025-3호, 제2025-4호"처럼 여러 사건번호를 한 문자열에
  담고 있어, 정규식으로 "제N-M호" 패턴을 모두 추출해 토큰 단위로 매칭한다.
  매칭되지 않는 인용(예: "제1차 금융분쟁조정위원회 의결(2023. 5. 9.)")은
  Case.unresolved_refs 배열 프로퍼티로 원문 그대로 보존한다.

Criteria summary 관련:
  criteria는 이번 파이프라인에서 LLM 추출 대상이 아니므로(scripts/extract_graph.py는
  decisions만 처리) summary는 원문 앞부분을 정리해 truncate한 값을 사용한다.

사용법:
    python scripts/load_graph.py                # 증분 적재 (MERGE, 재실행 안전)
    python scripts/load_graph.py --reset         # 전체 삭제 후 재적재
    python scripts/load_graph.py --report-only   # 적재 없이 검증 리포트만 출력
"""

import argparse
import json
import logging
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase, RoutingControl

load_dotenv()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

DATA_EXTRACTED = Path("data/graph/extracted")
DATA_DECISIONS = Path("data/parsed/decisions")
DATA_CRITERIA = Path("data/parsed/criteria")

NEO4J_URI = os.environ["NEO4J_URI"]
NEO4J_USERNAME = os.environ["NEO4J_USERNAME"]
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE") or None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logging.getLogger("neo4j").setLevel(logging.WARNING)
logger = logging.getLogger("load_graph")

# 스코프 밖으로 확정된 case_id (data/SCOPE.md 참조) — data/graph/extracted/에 다시
# 나타나더라도 적재하지 않고, 이미 그래프에 남아있다면 매 실행마다 자동으로 제거한다.
#   64767: 「금융분쟁조정사례집 제2권」 전권(165만자) — 개별 결정례가 아님
EXCLUDED_IDS = {"64767"}


def _sort_key(path: Path):
    parts = path.stem.split("-")
    base = int(parts[0])
    suffix = int(parts[1]) if len(parts) > 1 else 0
    return (base, suffix)


# 쟁점 -> 근거법조 하드코딩 사전 (요구사항 명시분만, 나머지는 매핑 생략)
ISSUE_LAW_MAP = {
    "설명의무_위반": "금융소비자보호법 제19조",
    "적합성원칙_위반": "금융소비자보호법 제17조",
    "적정성원칙_위반": "금융소비자보호법 제18조",
    "부당권유": "금융소비자보호법 제21조",
}

# Criteria(분쟁해결기준) -> Issue 사람이 직접 확인한 매핑. data/parsed/criteria/{id}.json 의
# id 기준. 20건 중 9번(금융투자/손실보전약정을 통한 부당권유행위)만 1차 스코프(은행·금투)
# Issue enum과 명확히 매칭되어 매핑한다. 나머지 19건은 보험 상품의 보험금 지급/면책약관
# 해석 분쟁이라 현재 ISSUE_ENUM(설명의무_위반 등 은행·금투 불완전판매 체계)과 억지로
# 매칭하면 오히려 오탐 근거가 되므로 의도적으로 비워둔다(data/SCOPE.md 참조, 보험 코퍼스
# 확장 시 재검토).
CRITERIA_ISSUE_MAP = {
    9: ["부당권유"],
}

CASE_NO_TOKEN_RE = re.compile(r"제\s*\d+\s*-\s*\d+\s*호")


def extract_case_no_tokens(s: str) -> list:
    if not s:
        return []
    return [re.sub(r"\s+", "", tok) for tok in CASE_NO_TOKEN_RE.findall(s)]


CONSTRAINTS = [
    "CREATE CONSTRAINT case_id_unique IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT issue_name_unique IF NOT EXISTS FOR (i:Issue) REQUIRE i.name IS UNIQUE",
    "CREATE CONSTRAINT product_name_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.name IS UNIQUE",
    "CREATE CONSTRAINT factor_name_unique IF NOT EXISTS FOR (f:Factor) REQUIRE f.name IS UNIQUE",
    "CREATE CONSTRAINT lawarticle_ref_unique IF NOT EXISTS FOR (l:LawArticle) REQUIRE l.ref IS UNIQUE",
    "CREATE CONSTRAINT precedent_ref_unique IF NOT EXISTS FOR (p:Precedent) REQUIRE p.ref IS UNIQUE",
    "CREATE CONSTRAINT respondent_key_unique IF NOT EXISTS FOR (r:Respondent) REQUIRE r.key IS UNIQUE",
    "CREATE CONSTRAINT criteria_id_unique IF NOT EXISTS FOR (c:Criteria) REQUIRE c.id IS UNIQUE",
]

# UNWIND 대상 리스트가 빈 배열이면 행 자체가 사라져 뒤의 MERGE(c)가 끊기므로,
# [null] 로 치환한 뒤 FOREACH 가드로 실제 쓰기를 조건부 실행하는 패턴을 사용한다.
CASE_UPSERT_QUERY = """
MERGE (c:Case {id: $id})
SET c.case_no = $case_no,
    c.title = $title,
    c.date = $date,
    c.sector = $sector,
    c.summary = $summary,
    c.recommendation = $recommendation
WITH c

UNWIND (CASE WHEN $issues = [] THEN [null] ELSE $issues END) AS issue
FOREACH (_ IN CASE WHEN issue IS NULL THEN [] ELSE [1] END |
  MERGE (i:Issue {name: issue.name})
  MERGE (c)-[r:HAS_ISSUE]->(i)
  SET r.result = issue.result
)
WITH DISTINCT c

UNWIND (CASE WHEN $products = [] THEN [null] ELSE $products END) AS prod
FOREACH (_ IN CASE WHEN prod IS NULL THEN [] ELSE [1] END |
  MERGE (p:Product {name: prod})
  MERGE (c)-[:INVOLVES]->(p)
)
WITH DISTINCT c

UNWIND (CASE WHEN $law_articles = [] THEN [null] ELSE $law_articles END) AS law
FOREACH (_ IN CASE WHEN law IS NULL THEN [] ELSE [1] END |
  MERGE (l:LawArticle {ref: law})
  MERGE (c)-[:CITES]->(l)
)
WITH DISTINCT c

UNWIND (CASE WHEN $precedents = [] THEN [null] ELSE $precedents END) AS prec
FOREACH (_ IN CASE WHEN prec IS NULL THEN [] ELSE [1] END |
  MERGE (pr:Precedent {ref: prec})
  MERGE (c)-[:CITES_PRECEDENT]->(pr)
)
WITH DISTINCT c

UNWIND (CASE WHEN $factors = [] THEN [null] ELSE $factors END) AS factor
FOREACH (_ IN CASE WHEN factor IS NULL THEN [] ELSE [1] END |
  MERGE (f:Factor {name: factor.name})
  MERGE (c)-[r:HAS_FACTOR]->(f)
  SET r.direction = factor.direction, r.value_pp = factor.value_pp
)
WITH DISTINCT c

UNWIND (CASE WHEN $outcomes = [] THEN [null] ELSE $outcomes END) AS outcome
FOREACH (_ IN CASE WHEN outcome IS NULL THEN [] ELSE [1] END |
  MERGE (resp:Respondent {key: $id + '::' + outcome.respondent})
  ON CREATE SET resp.case_id = $id, resp.label = outcome.respondent
  MERGE (c)-[r:HAS_OUTCOME]->(resp)
  SET r.result = outcome.result, r.ratio = outcome.ratio, r.amount = outcome.amount
)
"""

CRITERIA_UPSERT_QUERY = """
MERGE (c:Criteria {id: $id})
SET c.title = $title, c.sector = $sector, c.type = $type, c.summary = $summary
"""


def load_case_props(case_id: str) -> dict:
    extracted = json.loads((DATA_EXTRACTED / f"{case_id}.json").read_text(encoding="utf-8"))
    parsed_path = DATA_DECISIONS / f"{case_id}.json"
    parsed = json.loads(parsed_path.read_text(encoding="utf-8")) if parsed_path.exists() else {}
    return {
        "id": case_id,
        "case_no": extracted.get("case_no"),
        "title": parsed.get("title", ""),
        "date": parsed.get("date", ""),
        "sector": parsed.get("sector", ""),
        "summary": extracted.get("summary"),
        "recommendation": extracted.get("recommendation"),
        "issues": extracted.get("issues") or [],
        "products": extracted.get("products") or [],
        "law_articles": extracted.get("law_articles") or [],
        "precedents": extracted.get("precedents") or [],
        "factors": extracted.get("factors") or [],
        "outcomes": extracted.get("outcomes") or [],
        "referenced_cases": extracted.get("referenced_cases") or [],
    }


def load_criteria_props(path: Path) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    text = re.sub(r"</?표>", " ", d.get("text", ""))
    text = re.sub(r"\s+", " ", text).strip()
    summary = text[:300] + ("..." if len(text) > 300 else "")
    return {
        "id": d["id"],
        "title": d.get("title", ""),
        "sector": d.get("sector", ""),
        "type": d.get("type", ""),
        "summary": summary,
    }


def ensure_constraints(driver) -> None:
    for stmt in CONSTRAINTS:
        driver.execute_query(stmt, database_=NEO4J_DATABASE)
    logger.info("제약조건 %d개 확인/생성 완료", len(CONSTRAINTS))


def reset_database(driver) -> None:
    logger.warning("--reset: 그래프 전체 삭제 중...")
    driver.execute_query("MATCH (n) DETACH DELETE n", database_=NEO4J_DATABASE)


def purge_cases(driver, case_ids) -> int:
    """지정한 case_id의 Case 노드와 그에 걸린 모든 관계를 삭제한다.
    스코프 제외(EXCLUDED_IDS) 정리, 다중결정 분리 후 원본 병합 Case 제거 등에 쓴다."""
    case_ids = list(case_ids)
    if not case_ids:
        return 0
    records, _, _ = driver.execute_query(
        "MATCH (c:Case) WHERE c.id IN $ids DETACH DELETE c RETURN count(c) AS cnt",
        {"ids": case_ids},
        database_=NEO4J_DATABASE,
    )
    return records[0]["cnt"]


def load_criteria(driver) -> int:
    paths = sorted(DATA_CRITERIA.glob("*.json"), key=lambda p: int(p.stem))
    for p in paths:
        props = load_criteria_props(p)
        driver.execute_query(CRITERIA_UPSERT_QUERY, props, database_=NEO4J_DATABASE)
    logger.info("Criteria 적재: %d건", len(paths))
    return len(paths)


def load_cases(driver) -> dict:
    paths = sorted(DATA_EXTRACTED.glob("*.json"), key=_sort_key)
    referenced_map = {}
    for p in paths:
        case_id = p.stem
        if case_id in EXCLUDED_IDS:
            logger.warning("case %s: EXCLUDED_IDS에 등록된 스코프 밖 문서라 건너뜀", case_id)
            continue
        props = load_case_props(case_id)
        referenced_map[case_id] = props.pop("referenced_cases")
        driver.execute_query(CASE_UPSERT_QUERY, props, database_=NEO4J_DATABASE)
    logger.info("Case 적재: %d건", len(paths))
    return referenced_map


def build_case_no_index(driver) -> dict:
    records, _, _ = driver.execute_query(
        "MATCH (c:Case) WHERE c.case_no IS NOT NULL RETURN c.id AS id, c.case_no AS case_no",
        database_=NEO4J_DATABASE,
        routing_=RoutingControl.READ,
    )
    index = {}
    for rec in records:
        for tok in extract_case_no_tokens(rec["case_no"]):
            index[tok] = rec["id"]
    return index


def resolve_refers_to(driver, referenced_map: dict) -> tuple:
    index = build_case_no_index(driver)
    resolved = 0
    unresolved = 0
    for case_id, refs in referenced_map.items():
        target_ids = set()
        leftovers = []
        for ref in refs:
            toks = extract_case_no_tokens(ref)
            hits = {index[t] for t in toks if t in index and index[t] != case_id}
            if hits:
                target_ids |= hits
            else:
                leftovers.append(ref)
        for target_id in target_ids:
            driver.execute_query(
                "MATCH (a:Case {id: $from_id}), (b:Case {id: $to_id}) MERGE (a)-[:REFERS_TO]->(b)",
                {"from_id": case_id, "to_id": target_id},
                database_=NEO4J_DATABASE,
            )
            resolved += 1
        unresolved += len(leftovers)
        driver.execute_query(
            "MATCH (c:Case {id: $id}) SET c.unresolved_refs = $refs",
            {"id": case_id, "refs": leftovers},
            database_=NEO4J_DATABASE,
        )
    return resolved, unresolved


def apply_governed_by(driver) -> None:
    mappings = [{"issue": k, "law": v} for k, v in ISSUE_LAW_MAP.items()]
    driver.execute_query(
        """
        UNWIND $mappings AS m
        MERGE (i:Issue {name: m.issue})
        MERGE (l:LawArticle {ref: m.law})
        MERGE (i)-[:GOVERNED_BY]->(l)
        """,
        {"mappings": mappings},
        database_=NEO4J_DATABASE,
    )
    logger.info("GOVERNED_BY 정적 매핑 %d건 적용", len(mappings))


def apply_criteria_applies_to(driver) -> int:
    """CRITERIA_ISSUE_MAP 기준으로 (Criteria)-[:APPLIES_TO]->(Issue) 엣지를 만든다.
    매핑에 없는 Criteria(현재 19건, 보험)는 노드로만 남고 엣지가 생기지 않는다."""
    mappings = [
        {"criteria_id": str(cid), "issue": issue}
        for cid, issues in CRITERIA_ISSUE_MAP.items()
        for issue in issues
    ]
    if not mappings:
        return 0
    driver.execute_query(
        """
        UNWIND $mappings AS m
        MATCH (c:Criteria {id: m.criteria_id})
        MERGE (i:Issue {name: m.issue})
        MERGE (c)-[:APPLIES_TO]->(i)
        """,
        {"mappings": mappings},
        database_=NEO4J_DATABASE,
    )
    logger.info("APPLIES_TO 매핑 %d건 적용", len(mappings))
    return len(mappings)


# ---------------------------------------------------------------------------
# 검증 리포트
# ---------------------------------------------------------------------------

def print_report(driver) -> None:
    print("\n" + "=" * 70)
    print("적재 검증 리포트")
    print("=" * 70)

    print("\n[1] 노드 타입별 카운트")
    records, _, _ = driver.execute_query(
        "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC",
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    for r in records:
        print(f"  {r['label']}: {r['cnt']}")

    print("\n[1] 관계 타입별 카운트")
    records, _, _ = driver.execute_query(
        "MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS cnt ORDER BY cnt DESC",
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    for r in records:
        print(f"  {r['rel']}: {r['cnt']}")

    print("\n[2] 고아 Case (관계 0개)")
    records, _, _ = driver.execute_query(
        "MATCH (c:Case) WHERE NOT (c)--() RETURN c.id AS id, c.title AS title",
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    if records:
        for r in records:
            print(f"  {r['id']}: {r['title']}")
    else:
        print("  없음")

    print("\n[3] REFERS_TO 매칭 결과")
    records, _, _ = driver.execute_query(
        "MATCH ()-[r:REFERS_TO]->() RETURN count(r) AS cnt",
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    resolved_db = records[0]["cnt"]
    records, _, _ = driver.execute_query(
        "MATCH (c:Case) WHERE c.unresolved_refs IS NOT NULL RETURN sum(size(c.unresolved_refs)) AS cnt",
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    unresolved_db = records[0]["cnt"] or 0
    print(f"  매칭 성공(REFERS_TO 엣지 수): {resolved_db}")
    print(f"  매칭 실패(unresolved_refs로 보존된 인용 수): {unresolved_db}")

    print("\n[4] 쟁점별 사례 수 Top 10")
    records, _, _ = driver.execute_query(
        """
        MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue)
        RETURN i.name AS issue, count(DISTINCT c) AS case_count
        ORDER BY case_count DESC LIMIT 10
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    for r in records:
        print(f"  {r['issue']}: {r['case_count']}건")

    print("\n[4] 배상비율(ratio) 분포 (있는 사례만)")
    records, _, _ = driver.execute_query(
        """
        MATCH (:Case)-[r:HAS_OUTCOME]->(:Respondent)
        WHERE r.ratio IS NOT NULL
        RETURN min(r.ratio) AS min, percentileDisc(r.ratio, 0.5) AS median,
               max(r.ratio) AS max, count(r.ratio) AS n
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    r = records[0]
    print(f"  n={r['n']}  min={r['min']}  median={r['median']}  max={r['max']}")

    print("\n[5] 샘플 쿼리: '설명의무_위반' 인정 + ratio 있는 사례 5건")
    records, _, _ = driver.execute_query(
        """
        MATCH (c:Case)-[hi:HAS_ISSUE]->(:Issue {name: '설명의무_위반'})
        WHERE hi.result = '인정'
        MATCH (c)-[ho:HAS_OUTCOME]->(resp:Respondent)
        WHERE ho.ratio IS NOT NULL
        OPTIONAL MATCH (c)-[:CITES_PRECEDENT]->(pr:Precedent)
        WITH c, resp, ho.ratio AS ratio, collect(DISTINCT pr.ref) AS precedents
        RETURN c.title AS title, resp.label AS respondent, ratio, precedents
        ORDER BY ratio DESC
        LIMIT 5
        """,
        database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
    )
    if not records:
        print("  결과 없음")
    for r in records:
        print(f"  - {r['title']}")
        print(f"    respondent={r['respondent']}  ratio={r['ratio']}  판례={r['precedents'] or '없음'}")

    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="분쟁조정 결정문 구조화 데이터를 Neo4j AuraDB에 적재")
    parser.add_argument("--reset", action="store_true", help="전체 삭제 후 재적재 (기본은 증분 MERGE)")
    parser.add_argument("--report-only", action="store_true", help="적재 없이 검증 리포트만 출력")
    parser.add_argument(
        "--purge-ids",
        help="쉼표로 구분된 case_id의 Case 노드와 관계만 삭제하고 종료 (예: 다중결정 분리 후 "
        "원본 병합 Case 제거, 스코프 제외건 수동 정리)",
    )
    args = parser.parse_args()

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    driver.verify_connectivity()
    logger.info("Neo4j 연결 확인 완료 (database=%s)", NEO4J_DATABASE)

    try:
        if args.purge_ids:
            ids = [x.strip() for x in args.purge_ids.split(",") if x.strip()]
            deleted = purge_cases(driver, ids)
            logger.info("purge: 대상 %d건 중 %d건 삭제됨", len(ids), deleted)
            return

        if args.report_only:
            print_report(driver)
            return

        ensure_constraints(driver)
        if args.reset:
            reset_database(driver)

        purged = purge_cases(driver, EXCLUDED_IDS)
        if purged:
            logger.info("EXCLUDED_IDS 자동 정리: %d건 삭제됨", purged)

        load_criteria(driver)
        referenced_map = load_cases(driver)
        resolved, unresolved = resolve_refers_to(driver, referenced_map)
        apply_governed_by(driver)
        apply_criteria_applies_to(driver)
        logger.info("REFERS_TO 매칭: 성공 %d / 실패(unresolved) %d", resolved, unresolved)

        print_report(driver)
    finally:
        driver.close()


if __name__ == "__main__":
    main()
