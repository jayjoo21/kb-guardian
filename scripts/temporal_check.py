"""
Temporal RAG 가능성 점검(별도 조사 — 구현 아님). 쟁점별·연도별 사례 수와 배상비율
평균을 집계해 data/graph/temporal_check.md 로 저장한다. 연도별 표본이 쟁점당 최소
5건 이상 나오는 구간이 있는지만 확인하는 게 목적이라, 부족하면 그 결과를 그대로
보고서에 적고 실제 구현(연도별 가중치 검색 등)은 하지 않는다.
"""

import logging
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase, RoutingControl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

load_dotenv()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("temporal_check")

NEO4J_URI = os.environ["NEO4J_URI"]
NEO4J_USERNAME = os.environ["NEO4J_USERNAME"]
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE") or None

MIN_SAMPLE_PER_ISSUE_YEAR = 5

# graph_search.py와 동일한 두 날짜 포맷("YYYY-MM-DD", "YYYY. M. D.")
_DATE_PATTERNS = [
    re.compile(r"^(\d{4})-\d{1,2}-\d{1,2}$"),
    re.compile(r"^(\d{4})\.\s*\d{1,2}\.\s*\d{1,2}\.?$"),
]


def extract_year(raw: str | None) -> int | None:
    if not raw:
        return None
    s = raw.strip()
    for pat in _DATE_PATTERNS:
        m = pat.match(s)
        if m:
            return int(m.group(1))
    return None


_QUERY = """
MATCH (c:Case)-[:HAS_ISSUE]->(i:Issue)
OPTIONAL MATCH (c)-[ho:HAS_OUTCOME]->(:Respondent)
RETURN i.name AS issue, c.date AS date, ho.ratio AS ratio
"""


def main():
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    driver.verify_connectivity()
    logger.info("Neo4j 연결 확인 완료")

    records, _, _ = driver.execute_query(_QUERY, {}, database_=NEO4J_DATABASE, routing_=RoutingControl.READ)
    driver.close()

    # (issue, year) -> {"n": 사례 수(중복 제거 안함 — 쟁점당 사례 1건이 여러 outcome을
    # 가질 수 있어 ratio는 outcome 단위로 세되, 표본 충분성 판단은 "사례 수"가 아니라
    # "그 (쟁점,연도)에 있는 관측치 수"로 본다 — 어차피 문턱값 비교라 결과는 같음)
    buckets: dict[tuple[str, int], dict] = defaultdict(lambda: {"n": 0, "ratio_sum": 0.0, "ratio_n": 0})
    no_date = 0
    for r in records:
        year = extract_year(r["date"])
        if year is None:
            no_date += 1
            continue
        key = (r["issue"], year)
        buckets[key]["n"] += 1
        if r["ratio"] is not None:
            buckets[key]["ratio_sum"] += r["ratio"]
            buckets[key]["ratio_n"] += 1

    if no_date:
        logger.warning("날짜 파싱 실패(두 포맷 모두 불일치) %d건은 연도 집계에서 제외", no_date)

    issues = sorted({k[0] for k in buckets})
    years = sorted({k[1] for k in buckets})

    lines = [
        "# Temporal RAG 가능성 점검",
        "",
        f"쟁점 {len(issues)}개 x 연도 {len(years)}개(범위 {years[0]}~{years[-1]}) 구간에서, "
        f"쟁점당 표본이 연도별로 최소 {MIN_SAMPLE_PER_ISSUE_YEAR}건 이상 나오는 (쟁점,연도) 조합이 "
        "있는지 확인한 결과입니다. **이 문서는 조사 결과만 기록하며, 실제 구현(연도별 가중치 검색 등)은 "
        "포함하지 않습니다.**",
        "",
        "## 쟁점 x 연도 사례 수 (배상비율 평균)",
        "",
        "| 쟁점 | " + " | ".join(str(y) for y in years) + " |",
        "|---" * (len(years) + 1) + "|",
    ]

    qualifying = []
    for issue in issues:
        row = [issue]
        for year in years:
            b = buckets.get((issue, year))
            if not b or b["n"] == 0:
                row.append("-")
                continue
            avg = b["ratio_sum"] / b["ratio_n"] if b["ratio_n"] > 0 else None
            cell = f"{b['n']}건"
            if avg is not None:
                cell += f" (평균 {avg:.0f}%)"
            if b["n"] >= MIN_SAMPLE_PER_ISSUE_YEAR:
                cell = f"**{cell}**"
                qualifying.append((issue, year, b["n"]))
            row.append(cell)
        lines.append("| " + " | ".join(row) + " |")

    lines += [
        "",
        "## 결론",
        "",
    ]
    if qualifying:
        lines.append(f"쟁점당 연도별 표본이 {MIN_SAMPLE_PER_ISSUE_YEAR}건 이상인 구간이 {len(qualifying)}개 있습니다(굵게 표시):")
        lines.append("")
        for issue, year, n in sorted(qualifying, key=lambda x: -x[2]):
            lines.append(f"- {issue} / {year}년: {n}건")
    else:
        lines.append(
            f"쟁점당 연도별 표본이 {MIN_SAMPLE_PER_ISSUE_YEAR}건 이상인 (쟁점,연도) 구간이 **하나도 없습니다**. "
            "연도별로 데이터를 쪼개면 표본이 너무 희박해져(쟁점 내 사례 수 자체가 적고, 20여 년에 걸쳐 "
            "분산되어 있음) 연도 가중 검색(Temporal RAG)을 구현할 근거가 부족합니다. **구현하지 않습니다.**"
        )

    out_path = Path("data/graph/temporal_check.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info("저장 완료: %s (쟁점 %d개, 연도 %d개, 기준 충족 구간 %d개)", out_path, len(issues), len(years), len(qualifying))


if __name__ == "__main__":
    main()
