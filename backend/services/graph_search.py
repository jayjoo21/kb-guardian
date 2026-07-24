"""Neo4j 그래프 탐색. LLM 호출 없음 — classifier가 뽑은 issues/products로
scripts/load_graph.py가 적재한 스키마(Case/Issue/Product/Factor/LawArticle/
Precedent/Respondent/Criteria, HAS_ISSUE/INVOLVES/CITES/CITES_PRECEDENT/
HAS_FACTOR/HAS_OUTCOME/REFERS_TO/GOVERNED_BY/APPLIES_TO)를 그대로 조회한다.
"""

import logging

from neo4j import RoutingControl

logger = logging.getLogger("graph_search")

# 유사 사례: 쟁점 일치 건수 우선, 상품 일치 건수 가중, 최신(date desc) 우선.
# 사례 하나에 outcome(피신청인)이 여러 개면 ratio가 있는 것 중 가장 높은 것을 대표값으로 쓴다.
_QUERY_SIMILAR_BY_ISSUE = """
MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue)
WHERE i.name IN $issues
WITH c, count(DISTINCT i) AS issue_matches
OPTIONAL MATCH (c)-[:INVOLVES]->(p:Product)
WHERE p.name IN $products
WITH c, issue_matches, count(DISTINCT p) AS product_matches
OPTIONAL MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent)
WITH c, issue_matches, product_matches, ho
ORDER BY (ho.ratio IS NULL), ho.ratio DESC
WITH c, issue_matches, product_matches, collect(ho)[0] AS top_outcome
RETURN c.id AS case_id, c.title AS title, c.case_no AS case_no, c.date AS date,
       top_outcome.result AS result, top_outcome.ratio AS ratio,
       issue_matches, product_matches
ORDER BY issue_matches DESC, product_matches DESC, c.date DESC
LIMIT $limit
"""

# issues가 비어 분류에 실패했을 때의 대체 경로: product 일치만으로 탐색.
_QUERY_SIMILAR_BY_PRODUCT_ONLY = """
MATCH (c:Case)-[:INVOLVES]->(p:Product)
WHERE p.name IN $products
WITH c, count(DISTINCT p) AS product_matches
RETURN c.id AS case_id, c.title AS title, c.case_no AS case_no, c.date AS date,
       null AS result, null AS ratio, 0 AS issue_matches, product_matches
ORDER BY product_matches DESC, c.date DESC
LIMIT $limit
"""

_QUERY_RATIO_STATS = """
MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue) WHERE i.name IN $issues
MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent) WHERE ho.ratio IS NOT NULL
RETURN min(ho.ratio) AS min, percentileDisc(ho.ratio, 0.5) AS median,
       max(ho.ratio) AS max, count(ho.ratio) AS n
"""

_QUERY_LAW_ARTICLES = """
MATCH (i:Issue)-[:GOVERNED_BY]->(l:LawArticle) WHERE i.name IN $issues
RETURN DISTINCT i.name AS issue, l.ref AS ref
"""

_QUERY_PRECEDENTS_FOR_CASES = """
MATCH (c:Case)-[:CITES_PRECEDENT]->(p:Precedent) WHERE c.id IN $case_ids
RETURN DISTINCT p.ref AS ref
"""

# Criteria는 scripts/load_graph.py의 CRITERIA_ISSUE_MAP으로 사람이 직접 확인한 Issue에만
# (Criteria)-[:APPLIES_TO]->(Issue) 엣지가 있다(20건 중 9번만, 나머지 19건 보험은 도메인이
# 달라 의도적으로 엣지 없음 — data/SCOPE.md 참조). 엣지가 없으면 빈 배열을 반환하고, 텍스트
# 키워드로 억지 매칭하지 않는다.
_QUERY_CRITERIA = """
MATCH (cr:Criteria)-[:APPLIES_TO]->(i:Issue) WHERE i.name IN $issues
RETURN DISTINCT cr.id AS id, cr.title AS title, cr.summary AS summary
LIMIT 5
"""


def find_similar_cases(driver, database: str, issues: list, products: list, limit: int = 5) -> list:
    if issues:
        query, params = _QUERY_SIMILAR_BY_ISSUE, {"issues": issues, "products": products, "limit": limit}
    elif products:
        query, params = _QUERY_SIMILAR_BY_PRODUCT_ONLY, {"products": products, "limit": limit}
    else:
        return []
    records, _, _ = driver.execute_query(
        query, params, database_=database, routing_=RoutingControl.READ,
    )
    return [
        {
            "case_id": r["case_id"], "title": r["title"], "case_no": r["case_no"],
            "date": r["date"], "result": r["result"], "ratio": r["ratio"],
        }
        for r in records
    ]


def ratio_stats_for_issues(driver, database: str, issues: list) -> dict:
    if not issues:
        return {"min": None, "median": None, "max": None, "n": 0}
    records, _, _ = driver.execute_query(
        _QUERY_RATIO_STATS, {"issues": issues}, database_=database, routing_=RoutingControl.READ,
    )
    r = records[0]
    return {"min": r["min"], "median": r["median"], "max": r["max"], "n": r["n"]}


def law_articles_for_issues(driver, database: str, issues: list) -> list:
    """이슈별 GOVERNED_BY 법조항을 {issue, ref} 쌍으로 반환한다. 답변 생성 LLM이
    "제19조가 설명의무 조항"처럼 조항의 의미를 스스로 지어내지 않고, 그래프에 실제로
    연결된 이슈-조항 짝만 그대로 인용하도록 하기 위함(바 문자열만 주면 LLM이 자기 배경
    지식으로 조항 내용을 설명하다가 이슈-조항 매핑을 뒤바꾸는 오류가 관측됨)."""
    if not issues:
        return []
    records, _, _ = driver.execute_query(
        _QUERY_LAW_ARTICLES, {"issues": issues}, database_=database, routing_=RoutingControl.READ,
    )
    return [{"issue": r["issue"], "ref": r["ref"]} for r in records]


def precedents_for_cases(driver, database: str, case_ids: list) -> list:
    if not case_ids:
        return []
    records, _, _ = driver.execute_query(
        _QUERY_PRECEDENTS_FOR_CASES, {"case_ids": case_ids}, database_=database, routing_=RoutingControl.READ,
    )
    return [r["ref"] for r in records]


def criteria_for(driver, database: str, issues: list) -> list:
    if not issues:
        return []
    records, _, _ = driver.execute_query(
        _QUERY_CRITERIA, {"issues": issues}, database_=database, routing_=RoutingControl.READ,
    )
    return [{"id": r["id"], "title": r["title"], "summary": r["summary"]} for r in records]


_QUERY_CASE_DETAIL = """
MATCH (c:Case {id: $id})
OPTIONAL MATCH (c)-[hi:HAS_ISSUE]->(i:Issue)
OPTIONAL MATCH (c)-[:INVOLVES]->(p:Product)
OPTIONAL MATCH (c)-[:CITES]->(l:LawArticle)
OPTIONAL MATCH (c)-[:CITES_PRECEDENT]->(pr:Precedent)
OPTIONAL MATCH (c)-[hf:HAS_FACTOR]->(f:Factor)
OPTIONAL MATCH (c)-[ho:HAS_OUTCOME]->(resp:Respondent)
OPTIONAL MATCH (c)-[:REFERS_TO]->(rt:Case)
OPTIONAL MATCH (rb:Case)-[:REFERS_TO]->(c)
RETURN c,
  [x IN collect(DISTINCT CASE WHEN i IS NULL THEN null ELSE {name: i.name, result: hi.result} END)
   WHERE x IS NOT NULL] AS issues,
  [x IN collect(DISTINCT p.name) WHERE x IS NOT NULL] AS products,
  [x IN collect(DISTINCT l.ref) WHERE x IS NOT NULL] AS law_articles,
  [x IN collect(DISTINCT pr.ref) WHERE x IS NOT NULL] AS precedents,
  [x IN collect(DISTINCT CASE WHEN f IS NULL THEN null
   ELSE {name: f.name, direction: hf.direction, value_pp: hf.value_pp} END)
   WHERE x IS NOT NULL] AS factors,
  [x IN collect(DISTINCT CASE WHEN resp IS NULL THEN null
   ELSE {respondent: resp.label, result: ho.result, ratio: ho.ratio, amount: ho.amount} END)
   WHERE x IS NOT NULL] AS outcomes,
  [x IN collect(DISTINCT rt.id) WHERE x IS NOT NULL] AS refers_to,
  [x IN collect(DISTINCT rb.id) WHERE x IS NOT NULL] AS referred_by
"""


def case_detail(driver, database: str, case_id: str) -> dict | None:
    records, _, _ = driver.execute_query(
        _QUERY_CASE_DETAIL, {"id": case_id}, database_=database, routing_=RoutingControl.READ,
    )
    if not records:
        return None
    r = records[0]
    c = r["c"]
    return {
        "case_id": c["id"], "title": c.get("title", ""), "case_no": c.get("case_no"),
        "date": c.get("date"), "sector": c.get("sector"), "summary": c.get("summary"),
        "recommendation": c.get("recommendation"),
        "issues": r["issues"], "products": r["products"], "law_articles": r["law_articles"],
        "precedents": r["precedents"], "factors": r["factors"], "outcomes": r["outcomes"],
        "refers_to": r["refers_to"], "referred_by": r["referred_by"],
        "unresolved_refs": c.get("unresolved_refs") or [],
    }


def _node_type(labels) -> str:
    return next(iter(labels), "Unknown")


def _node_key(node) -> str:
    t = _node_type(node.labels)
    props = dict(node)
    if t == "Case":
        return f"case:{props.get('id')}"
    if t == "Respondent":
        return f"respondent:{props.get('key')}"
    if t in ("LawArticle", "Precedent"):
        return f"{t.lower()}:{props.get('ref')}"
    if t == "Criteria":
        return f"criteria:{props.get('id')}"
    return f"{t.lower()}:{props.get('name')}"


def _node_display(node) -> str:
    props = dict(node)
    return props.get("title") or props.get("name") or props.get("label") or props.get("ref") or props.get("id") or ""


_QUERY_NEIGHBORHOOD = "MATCH (c:Case {id: $id})-[r]-(n) RETURN c, r, n"


def case_neighborhood(driver, database: str, case_id: str) -> dict:
    records, _, _ = driver.execute_query(
        _QUERY_NEIGHBORHOOD, {"id": case_id}, database_=database, routing_=RoutingControl.READ,
    )
    nodes = {}
    edges = set()
    for r in records:
        c_node, n_node, rel = r["c"], r["n"], r["r"]
        nodes[_node_key(c_node)] = (_node_type(c_node.labels), _node_display(c_node))
        nodes[_node_key(n_node)] = (_node_type(n_node.labels), _node_display(n_node))
        start_key = _node_key(rel.start_node)
        end_key = _node_key(rel.end_node)
        edges.add((start_key, end_key, rel.type))

    return {
        "nodes": [{"id": k, "type": t, "label": lbl} for k, (t, lbl) in nodes.items()],
        "edges": [{"source": s, "target": t, "type": ty} for s, t, ty in edges],
    }


_QUERY_STATS_ISSUES = """
MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue)
OPTIONAL MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent) WHERE ho.ratio IS NOT NULL
RETURN i.name AS issue, count(DISTINCT c) AS case_count,
       min(ho.ratio) AS min, percentileDisc(ho.ratio, 0.5) AS median,
       max(ho.ratio) AS max, count(ho.ratio) AS n
ORDER BY case_count DESC
"""

_QUERY_STATS_TOTAL = "MATCH (c:Case) RETURN count(c) AS n"


def stats_overview(driver, database: str) -> dict:
    total_records, _, _ = driver.execute_query(
        _QUERY_STATS_TOTAL, database_=database, routing_=RoutingControl.READ,
    )
    issue_records, _, _ = driver.execute_query(
        _QUERY_STATS_ISSUES, database_=database, routing_=RoutingControl.READ,
    )
    return {
        "total_cases": total_records[0]["n"],
        "issues": [
            {
                "issue": r["issue"], "case_count": r["case_count"],
                "ratio_stats": {"min": r["min"], "median": r["median"], "max": r["max"], "n": r["n"]},
            }
            for r in issue_records
        ],
    }
