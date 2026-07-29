"""Neo4j 그래프 탐색. LLM 호출 없음 — classifier가 뽑은 issues/products로
scripts/load_graph.py가 적재한 스키마(Case/Issue/Product/Factor/LawArticle/
Precedent/Respondent/Criteria, HAS_ISSUE/INVOLVES/CITES/CITES_PRECEDENT/
HAS_FACTOR/HAS_OUTCOME/REFERS_TO/GOVERNED_BY/APPLIES_TO)와, scripts/load_arguments.py가
적재한 스키마(Argument/ArgumentBasis/Evidence/EvidenceType, RESPONDENT_ARGUED/
HAS_BASIS/HAS_EVIDENCE/OF_TYPE)를 그대로 조회한다.
"""

import logging
import re
from collections import Counter, defaultdict
from datetime import date

from neo4j import RoutingControl

logger = logging.getLogger("graph_search")

# Case.date는 원본 크롤링 시점에 따라 "YYYY-MM-DD"와 "YYYY. M. D." 두 형식이 섞여
# 있어(196건 확인 결과 이 두 패턴으로 100% 커버됨), Cypher의 문자열 min()/max()로는
# 사전식 정렬 오류가 난다(예: "2026. 4. 8."이 "2004-03-17"보다 문자열상 크게 나옴).
# 그래서 코퍼스 기간(데이터 출처 카드용)은 Python에서 파싱 후 실제 날짜로 비교한다.
_CASE_DATE_PATTERNS = [
    re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$"),
    re.compile(r"^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$"),
]


def _parse_case_date(raw):
    if not raw:
        return None
    s = raw.strip()
    for pat in _CASE_DATE_PATTERNS:
        m = pat.match(s)
        if m:
            y, mo, d = (int(x) for x in m.groups())
            try:
                return date(y, mo, d)
            except ValueError:
                return None
    return None

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
       max(ho.ratio) AS max, avg(ho.ratio) AS avg, count(ho.ratio) AS n
"""

# 요인별 가산/감산 기여도: HAS_FACTOR.value_pp는 결측이 많고(예: 최초투자 15건 중 0건에 값 있음)
# 일부는 의미 자체가 다르다(신청인_주의소홀의 값 5건을 실제 outcome.ratio와 대조하면 "감산 pp"가
# 아니라 그 사례의 소비자 과실비율 자체였음 - 예: ratio=30인 사례에 value_pp=70).
# 그래서 value_pp를 신뢰하는 대신, 쟁점 내에서 해당 요인이 "있는 사례군"과 "없는 사례군"의
# 실측 배상비율 평균 차이를 pp로 쓴다. 표본이 거의 없는 요인(n_with=0)은 이 쟁점에서 아예
# 근거가 없다는 뜻이므로 제외한다(억지 매칭 금지 원칙과 동일).
_QUERY_FACTOR_STATS = """
MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue {name: $issue})
MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent) WHERE ho.ratio IS NOT NULL
WITH c, ho.ratio AS ratio
OPTIONAL MATCH (c)-[:HAS_FACTOR]->(f:Factor)
WITH c, ratio, collect(DISTINCT f.name) AS present
UNWIND $factor_names AS factor
WITH factor, ratio, (factor IN present) AS has_it
WITH factor,
     sum(CASE WHEN has_it THEN 1 ELSE 0 END) AS n_with,
     avg(CASE WHEN has_it THEN ratio END) AS avg_with,
     sum(CASE WHEN NOT has_it THEN 1 ELSE 0 END) AS n_without,
     avg(CASE WHEN NOT has_it THEN ratio END) AS avg_without
WHERE n_with > 0
RETURN factor, n_with, avg_with, n_without, avg_without
ORDER BY factor
"""

_QUERY_RATIO_DISTRIBUTION = """
MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue {name: $issue})
MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent) WHERE ho.ratio IS NOT NULL
WITH ho.ratio AS ratio
RETURN collect(ratio) AS values, min(ratio) AS min, max(ratio) AS max, avg(ratio) AS avg,
       percentileDisc(ratio, 0.25) AS p25, percentileDisc(ratio, 0.5) AS median,
       percentileDisc(ratio, 0.75) AS p75, count(ratio) AS n
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
        return {"min": None, "median": None, "max": None, "avg": None, "n": 0}
    records, _, _ = driver.execute_query(
        _QUERY_RATIO_STATS, {"issues": issues}, database_=database, routing_=RoutingControl.READ,
    )
    r = records[0]
    return {"min": r["min"], "median": r["median"], "max": r["max"], "avg": r["avg"], "n": r["n"]}


# 쟁점 판단이 사안마다 얼마나 들쭉날쭉한지의 기준. n<5는 판단 자체를 유보(표본 부족),
# IQR(25~75%p 폭)이 20%p 이하면 "일관", 넘으면 "편차 큼". 실측 분포로 캘리브레이션한 값
# (n>=19인 쟁점 5개 중 IQR 16~35 분포, 20을 경계로 좁은 쪽/넓은 쪽이 자연스럽게 갈림).
_CONSISTENCY_MIN_N = 5
_CONSISTENCY_IQR_THRESHOLD = 20


def ratio_distribution_for_issue(driver, database: str, issue: str) -> dict:
    """단일 쟁점의 배상비율 분포(중앙값/범위/사분위/개별값)와 일관성 라벨을 반환한다.
    values는 히스토그램 렌더링용 실측 배상비율 목록이며, 그래프에서 조회한 값 그대로다."""
    records, _, _ = driver.execute_query(
        _QUERY_RATIO_DISTRIBUTION, {"issue": issue}, database_=database, routing_=RoutingControl.READ,
    )
    r = records[0]
    n = r["n"]
    if n == 0:
        return {
            "min": None, "median": None, "max": None, "avg": None,
            "p25": None, "p75": None, "n": 0, "values": [], "consistency": "데이터_부족",
        }

    if n < _CONSISTENCY_MIN_N:
        consistency = "데이터_부족"
    else:
        iqr = r["p75"] - r["p25"]
        consistency = "일관" if iqr <= _CONSISTENCY_IQR_THRESHOLD else "편차_큼"

    return {
        "min": r["min"], "median": r["median"], "max": r["max"], "avg": r["avg"],
        "p25": r["p25"], "p75": r["p75"], "n": n,
        "values": sorted(r["values"]), "consistency": consistency,
    }


def factor_stats_for_issue(driver, database: str, issue: str, factor_names: list) -> dict:
    """단일 쟁점의 기본 배상비율 통계 + 요인별(있음 vs 없음) 실측 평균 차이(pp)를 반환한다.
    이 쟁점에 해당하는 사례가 없으면 base.n=0, factors=[]로 빈 결과를 반환한다."""
    base = ratio_stats_for_issues(driver, database, [issue])
    if base["n"] == 0:
        return {"base": base, "factors": []}

    records, _, _ = driver.execute_query(
        _QUERY_FACTOR_STATS,
        {"issue": issue, "factor_names": factor_names},
        database_=database, routing_=RoutingControl.READ,
    )
    factors = []
    for r in records:
        avg_with, avg_without = r["avg_with"], r["avg_without"]
        pp = round(avg_with - avg_without, 1) + 0.0 if avg_with is not None and avg_without is not None else None
        direction = "중립" if pp is None or pp == 0 else ("가산" if pp > 0 else "감산")
        factors.append({
            "name": r["factor"], "direction": direction, "pp": pp,
            "n_with": r["n_with"], "n_without": r["n_without"],
        })
    return {"base": base, "factors": factors}


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


# ---------------------------------------------------------------------------
# "은행은 이렇게 반박합니다" / "증거 강도 진단" — scripts/load_arguments.py 스키마 조회
# ---------------------------------------------------------------------------

# 해당 쟁점이 "인정"된 Case에서만 피신청인이 실제로 편 반박을 모은다(쟁점 자체가
# 배척된 사례의 반박까지 섞으면 "이 쟁점이 인정될 때 은행이 대는 논리"라는 질문에
# 답이 안 됨). basis별 집계(표본 최소치·샘플 선정)는 Python에서 처리한다 — Cypher
# 집계문 안에서 "중복 없는 첫 N개" 로직을 짜는 것보다 명확하고, 표본 규모(전체
# 450건)에서 성능 문제도 없다.
_QUERY_RESPONDENT_ARGUMENTS = """
MATCH (c:Case)-[hi:HAS_ISSUE]->(i:Issue)
WHERE i.name IN $issues AND hi.result = '인정'
MATCH (c)-[:RESPONDENT_ARGUED]->(a:Argument)
RETURN c.id AS case_id, c.case_no AS case_no, a.basis AS basis, a.accepted AS accepted,
       a.text AS text, a.accepted_quote AS quote, a.accepted_basis AS accepted_basis
"""

_MIN_ARGUMENT_BASIS_COUNT = 5


def respondent_arguments_for_issues(driver, database: str, issues: list) -> list:
    """쟁점이 인정된 사례들의 피신청인 반박을 basis별로 묶어 반환한다.

    rejected_rate는 accepted가 정확히 "배척"인 비율만 쓰고, "일부인정"은 절반
    가중치로 섞지 않고 partial_count로 별도 집계한다(요구사항 명시). count<5인
    basis는 표본 부족으로 제외한다. rejected_rate가 낮을수록(=위원회가 잘 안 받아준
    반박일수록) 은행 입장에서 강한 논리이므로 오름차순으로 정렬한다.

    samples는 (case_id, case_no, 주장, 위원회 인용문|null) 튜플 — "은행 주장 vs 위원회
    판단"을 같은 사건 안에서 짝지어 보여주기 위해 case_id/case_no를 함께 넘긴다
    (case_no는 "금감원 분쟁조정 제○○호" 표시용, 6건은 결측이라 null일 수 있음).
    인용문이 있는 샘플을 우선 채우고 부족하면 인용문 없는 샘플로 채운다(인용문 없는
    항목은 화면에서 통계만 표시하고 인용은 생략)."""
    if not issues:
        return []
    records, _, _ = driver.execute_query(
        _QUERY_RESPONDENT_ARGUMENTS, {"issues": issues}, database_=database, routing_=RoutingControl.READ,
    )

    by_basis: dict = defaultdict(lambda: {
        "total": 0, "rejected": 0, "partial": 0, "samples": [], "seen": set(),
    })
    for r in records:
        agg = by_basis[r["basis"]]
        agg["total"] += 1
        if r["accepted"] == "배척":
            agg["rejected"] += 1
        elif r["accepted"] == "일부인정":
            agg["partial"] += 1
        key = (r["case_id"], r["text"])
        if r["text"] and key not in agg["seen"]:
            agg["seen"].add(key)
            has_direct_quote = r["accepted_basis"] == "직접" and bool(r["quote"])
            agg["samples"].append({
                "case_id": r["case_id"],
                "case_no": r["case_no"],
                "argument": r["text"],
                "quote": r["quote"] if has_direct_quote else None,
            })

    results = []
    for basis, agg in by_basis.items():
        total = agg["total"]
        if total < _MIN_ARGUMENT_BASIS_COUNT:
            continue
        with_quote = [s for s in agg["samples"] if s["quote"]]
        without_quote = [s for s in agg["samples"] if not s["quote"]]
        results.append({
            "basis": basis,
            "count": total,
            "rejected_count": agg["rejected"],
            "rejected_rate": round(agg["rejected"] / total, 3),
            "partial_count": agg["partial"],
            "samples": (with_quote + without_quote)[:2],
        })
    results.sort(key=lambda x: x["rejected_rate"])
    return results


# evidence_patterns는 (respondent_arguments와 달리) 쟁점 인정 여부로 필터링하지
# 않는다 — "이런 자료가 있으면 유리한가"는 결과 인정/배척과 무관하게 그 쟁점의
# 사례 전체에서 나타난 자료의 패턴이기 때문.
_QUERY_EVIDENCE_RAW = """
MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue) WHERE i.name IN $issues
MATCH (c)-[:HAS_EVIDENCE]->(e:Evidence)
RETURN e.type AS type, e.source_term AS source_term, e.role AS role
"""

# existed=true/false 각각의 평균 배상비율(ratio) 비교. type+existed로 암묵적 GROUP BY.
# 기존 _QUERY_RATIO_STATS/_QUERY_RATIO_DISTRIBUTION과 동일하게 사례당 outcome이 여러 개면
# (드묾) 별도로 묶지 않고 ho.ratio 행 단위로 집계한다 — 이 프로젝트 전체에서 일관되게
# 쓰는 배상비율 집계 방식.
_QUERY_EVIDENCE_RATIO_COMPARISON = """
MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue) WHERE i.name IN $issues
MATCH (c)-[:HAS_EVIDENCE]->(e:Evidence)
MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent) WHERE ho.ratio IS NOT NULL
RETURN e.type AS type, e.existed AS existed, avg(ho.ratio) AS avg_ratio, count(ho.ratio) AS n
"""

_MIN_EVIDENCE_TYPE_TOTAL = 10
_MIN_EVIDENCE_RATIO_N = 10


def evidence_patterns_for_issues(driver, database: str, issues: list) -> list:
    """쟁점 사례들의 증거를 type별로 묶어 반환한다. total<10인 type은 표본 부족으로
    제외한다. existed=true/false 배상비율 비교는 양쪽 다 n>=10일 때만 채우고,
    그렇지 않으면 ratio_comparison을 null로 둔다(해피콜_녹취처럼 표본이 3~5건인
    유형을 절대 절대비교로 노출하지 않기 위함 — 이전 검증에서 확인된 문제)."""
    if not issues:
        return []
    raw_records, _, _ = driver.execute_query(
        _QUERY_EVIDENCE_RAW, {"issues": issues}, database_=database, routing_=RoutingControl.READ,
    )
    by_type: dict = defaultdict(lambda: {"total": 0, "favorable": 0, "unfavorable": 0, "terms": Counter()})
    for r in raw_records:
        agg = by_type[r["type"]]
        agg["total"] += 1
        if r["role"] == "신청인유리":
            agg["favorable"] += 1
        elif r["role"] == "신청인불리":
            agg["unfavorable"] += 1
        if r["source_term"]:
            agg["terms"][r["source_term"]] += 1

    ratio_records, _, _ = driver.execute_query(
        _QUERY_EVIDENCE_RATIO_COMPARISON, {"issues": issues}, database_=database, routing_=RoutingControl.READ,
    )
    ratio_by_type: dict = defaultdict(dict)
    for r in ratio_records:
        ratio_by_type[r["type"]][r["existed"]] = {"avg": r["avg_ratio"], "n": r["n"]}

    results = []
    for etype, agg in by_type.items():
        total = agg["total"]
        if total < _MIN_EVIDENCE_TYPE_TOTAL:
            continue
        with_stat = ratio_by_type.get(etype, {}).get(True)
        without_stat = ratio_by_type.get(etype, {}).get(False)
        ratio_comparison = None
        if (
            with_stat and without_stat
            and with_stat["n"] >= _MIN_EVIDENCE_RATIO_N and without_stat["n"] >= _MIN_EVIDENCE_RATIO_N
        ):
            ratio_comparison = {
                "with_avg": round(with_stat["avg"], 1), "with_n": with_stat["n"],
                "without_avg": round(without_stat["avg"], 1), "without_n": without_stat["n"],
            }
        results.append({
            "type": etype,
            "source_terms": [term for term, _ in agg["terms"].most_common(3)],
            "total": total,
            "favorable_rate": round(agg["favorable"] / total, 3),
            "unfavorable_rate": round(agg["unfavorable"] / total, 3),
            "ratio_comparison": ratio_comparison,
        })
    results.sort(key=lambda x: x["favorable_rate"], reverse=True)
    return results


# ---------------------------------------------------------------------------
# 통계 탭 — 쟁점 필터 없이 전체 코퍼스를 대상으로 한 집계. respondent_arguments_for_issues/
# evidence_patterns_for_issues와 로직은 같지만 특정 민원(issues)에 매인 것이 아니라
# "이 서비스가 가진 데이터 전체가 얼마나 되는가"를 보여주는 용도라 필터를 걷어낸 버전.
# ---------------------------------------------------------------------------

_QUERY_PRECEDENT_COUNT = "MATCH (p:Precedent) RETURN count(p) AS n"
_QUERY_LAWARTICLE_COUNT = "MATCH (l:LawArticle) RETURN count(l) AS n"
_QUERY_CRITERIA_COUNT = "MATCH (cr:Criteria) RETURN count(cr) AS n"
_QUERY_CASE_DATES = "MATCH (c:Case) WHERE c.date IS NOT NULL RETURN c.date AS d"

_QUERY_OVERALL_RATIO_DISTRIBUTION = """
MATCH (c:Case)-[ho:HAS_OUTCOME]->(:Respondent) WHERE ho.ratio IS NOT NULL
WITH ho.ratio AS ratio
RETURN collect(ratio) AS values, min(ratio) AS min, max(ratio) AS max, avg(ratio) AS avg,
       percentileDisc(ratio, 0.25) AS p25, percentileDisc(ratio, 0.5) AS median,
       percentileDisc(ratio, 0.75) AS p75, count(ratio) AS n
"""

_QUERY_ARGUMENT_BASIS_OVERVIEW = """
MATCH (c:Case)-[:RESPONDENT_ARGUED]->(a:Argument)
RETURN a.basis AS basis, a.accepted AS accepted
"""

_QUERY_EVIDENCE_TYPE_OVERVIEW = """
MATCH (c:Case)-[:HAS_EVIDENCE]->(e:Evidence)
RETURN e.type AS type, e.source_term AS source_term, e.role AS role
"""


def corpus_totals(driver, database: str) -> dict:
    """통계 탭/데이터 출처 카드용 — 판례/법조항/분쟁해결기준 건수 + 결정례 기간
    (전체 그래프 기준, 쟁점 필터 없음)."""
    def _count(query: str) -> int:
        records, _, _ = driver.execute_query(query, database_=database, routing_=RoutingControl.READ)
        return records[0]["n"]

    date_records, _, _ = driver.execute_query(
        _QUERY_CASE_DATES, database_=database, routing_=RoutingControl.READ,
    )
    parsed_dates = [d for d in (_parse_case_date(r["d"]) for r in date_records) if d is not None]
    date_range = None
    if parsed_dates:
        date_range = {"from_year": min(parsed_dates).year, "to_year": max(parsed_dates).year}

    return {
        "precedents": _count(_QUERY_PRECEDENT_COUNT),
        "law_articles": _count(_QUERY_LAWARTICLE_COUNT),
        "criteria": _count(_QUERY_CRITERIA_COUNT),
        "date_range": date_range,
    }


def overall_ratio_distribution(driver, database: str) -> dict:
    """전체 사례 기준(쟁점 필터 없음) 배상비율 분포 — 통계 탭 히스토그램용."""
    records, _, _ = driver.execute_query(
        _QUERY_OVERALL_RATIO_DISTRIBUTION, database_=database, routing_=RoutingControl.READ,
    )
    r = records[0]
    n = r["n"]
    if n == 0:
        return {
            "min": None, "median": None, "max": None, "avg": None,
            "p25": None, "p75": None, "n": 0, "values": [],
        }
    return {
        "min": r["min"], "median": r["median"], "max": r["max"], "avg": r["avg"],
        "p25": r["p25"], "p75": r["p75"], "n": n, "values": sorted(r["values"]),
    }


def argument_basis_overview(driver, database: str) -> list:
    """"은행이 자주 쓰는 반박 논리" 순위용 — 전체 코퍼스 기준(쟁점 필터 없음) basis별 집계.
    건수 많은 순 정렬(자주 쓰이는 논리가 위로). count<5인 basis는 표본 부족으로 제외."""
    records, _, _ = driver.execute_query(
        _QUERY_ARGUMENT_BASIS_OVERVIEW, database_=database, routing_=RoutingControl.READ,
    )
    by_basis: dict = defaultdict(lambda: {"total": 0, "rejected": 0})
    for r in records:
        agg = by_basis[r["basis"]]
        agg["total"] += 1
        if r["accepted"] == "배척":
            agg["rejected"] += 1

    results = []
    for basis, agg in by_basis.items():
        total = agg["total"]
        if total < _MIN_ARGUMENT_BASIS_COUNT:
            continue
        results.append({
            "basis": basis,
            "count": total,
            "rejected_count": agg["rejected"],
            "rejected_rate": round(agg["rejected"] / total, 3),
        })
    results.sort(key=lambda x: -x["count"])
    return results


def evidence_type_overview(driver, database: str) -> list:
    """"결과를 가르는 자료" 카드용 — 전체 코퍼스 기준(쟁점 필터 없음) EvidenceType별 집계."""
    records, _, _ = driver.execute_query(
        _QUERY_EVIDENCE_TYPE_OVERVIEW, database_=database, routing_=RoutingControl.READ,
    )
    by_type: dict = defaultdict(lambda: {"total": 0, "favorable": 0, "unfavorable": 0, "terms": Counter()})
    for r in records:
        agg = by_type[r["type"]]
        agg["total"] += 1
        if r["role"] == "신청인유리":
            agg["favorable"] += 1
        elif r["role"] == "신청인불리":
            agg["unfavorable"] += 1
        if r["source_term"]:
            agg["terms"][r["source_term"]] += 1

    results = []
    for etype, agg in by_type.items():
        total = agg["total"]
        if total < _MIN_EVIDENCE_TYPE_TOTAL:
            continue
        results.append({
            "type": etype,
            "source_terms": [term for term, _ in agg["terms"].most_common(3)],
            "total": total,
            "favorable_rate": round(agg["favorable"] / total, 3),
            "unfavorable_rate": round(agg["unfavorable"] / total, 3),
        })
    results.sort(key=lambda x: x["favorable_rate"], reverse=True)
    return results


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
