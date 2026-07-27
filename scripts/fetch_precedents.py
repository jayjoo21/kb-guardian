"""
law.go.kr(국가법령정보 Open API)로 그래프의 Precedent 노드(ref 문자열만 있고 본문 없음,
2026-07-27 기준 240건)에 실제 판례 본문을 채워 넣는다.

동작 2단계 (fetch와 graph 적재를 분리 — load_graph.py와 같은 관례):
    python scripts/fetch_precedents.py --sample        # 5건만 조회 + 응답 구조 출력, 그래프 미적재
    python scripts/fetch_precedents.py                 # 전체 조회 (이미 받은 사건번호는 스킵)
    python scripts/fetch_precedents.py --load-graph     # data/parsed/precedents/*.json → Neo4j 적재

사건번호 파싱:
    Precedent.ref는 LLM이 원문에서 그대로 뽑은 문자열이라 "대법원 2012. 12. 26. 선고
    2010다86815 판결" / "대법원 2010다86815"(선고 생략) / "헌법재판소 2017.5.25. 자
    2014헌바459" 등 형태가 제각각이다. 그래서 ref 문자열 자체를 검색 쿼리로 쓰지 않고,
    "숫자+한글(1~3자)+숫자" 패턴(사건번호 고유 형식, 예: 2010다76368, 2014헌바459,
    98가단25470)만 정규식으로 뽑아 그것만 검색어로 쓴다.

law.go.kr 검색 API(target=prec)는 query를 사건명/사건번호 양쪽에 대해 부분 키워드
매칭한다 — 즉 사건번호로 검색해도 결과 목록에 사건번호가 다른 판례들이 섞여 나온다.
그래서 검색 결과 중 사건번호가 파싱값과 정확히 일치하는 것만 채택한다(법원명이 ref에서
파싱되면 동점 후보 중 법원명까지 일치하는 쪽을 우선한다). 정확히 일치하는 항목이
없으면 실패로 기록하고 넘어간다 — 억지로 가장 비슷한 것을 채택하지 않는다(환각 방지
원칙과 동일).

과도한 호출 제한: 요청(검색 1회 + 상세 1회) 사이 1초 이상 딜레이, 재시도 3회 제한.
"""

import argparse
import json
import logging
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from dotenv import load_dotenv
from neo4j import GraphDatabase, RoutingControl

load_dotenv()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

LAW_API_KEY = os.environ["LAW_API_KEY"]
NEO4J_URI = os.environ["NEO4J_URI"]
NEO4J_USERNAME = os.environ["NEO4J_USERNAME"]
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE") or None

SEARCH_URL = "https://www.law.go.kr/DRF/lawSearch.do"
DETAIL_URL = "https://www.law.go.kr/DRF/lawService.do"

REQUEST_DELAY_SEC = 1.0
MAX_RETRIES = 3
REQUEST_TIMEOUT = 20

RAW_DIR = Path("data/raw/precedents")
PARSED_DIR = Path("data/parsed/precedents")
FAILURES_LOG = Path("data/failed/precedent_failures.log")

CASE_NO_RE = re.compile(r"\d{2,4}[가-힣]{1,3}\d+")
COURT_RE = re.compile(r"^([가-힣]+지방법원|[가-힣]+고등법원|[가-힣]+지법|대법원|헌법재판소)")
BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
FS_UNSAFE_RE = re.compile(r'[\\/:*?"<>|]')

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logging.getLogger("neo4j").setLevel(logging.WARNING)
logger = logging.getLogger("fetch_precedents")


def log_failure(ref: str, case_no: str | None, reason: str) -> None:
    FAILURES_LOG.parent.mkdir(parents=True, exist_ok=True)
    with FAILURES_LOG.open("a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{ref}\t{case_no}\t{reason}\n")


def parse_case_no(ref: str) -> str | None:
    m = CASE_NO_RE.search(ref)
    return m.group(0) if m else None


def parse_court(ref: str) -> str | None:
    m = COURT_RE.match(ref.strip())
    return m.group(1) if m else None


def clean_text(raw: str | None) -> str | None:
    if raw is None:
        return None
    text = BR_RE.sub("\n", raw).strip()
    return text or None


def safe_filename(case_no: str) -> str:
    return FS_UNSAFE_RE.sub("_", case_no)


def _get_with_retry(url: str, params: dict) -> requests.Response | None:
    last_err = "unknown error"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            return resp
        except requests.exceptions.RequestException as exc:
            last_err = str(exc)
            logger.warning("GET 실패 (%d/%d) url=%s: %s", attempt, MAX_RETRIES, url, exc)
            if attempt < MAX_RETRIES:
                time.sleep(REQUEST_DELAY_SEC * attempt)
        finally:
            time.sleep(REQUEST_DELAY_SEC)
    logger.error("GET 최종 실패 url=%s: %s", url, last_err)
    return None


def search_precedent(case_no: str, court: str | None) -> str | None:
    """사건번호로 검색해 판례일련번호를 반환한다. 정확히 일치하는 사건번호가 없으면 None."""
    resp = _get_with_retry(SEARCH_URL, {
        "OC": LAW_API_KEY, "target": "prec", "type": "XML",
        "query": case_no, "display": 100,
    })
    if resp is None:
        return None

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as exc:
        log_failure(case_no, case_no, f"search XML 파싱 실패: {exc}")
        return None

    candidates = []
    for prec in root.findall("prec"):
        found_no = (prec.findtext("사건번호") or "").strip()
        if found_no.replace(" ", "") == case_no.replace(" ", ""):
            candidates.append(prec)

    if not candidates:
        return None
    if court:
        for c in candidates:
            if (c.findtext("법원명") or "").strip() == court:
                return c.findtext("판례일련번호")
    return candidates[0].findtext("판례일련번호")


def fetch_detail(prec_seq: str, case_no: str) -> tuple[str, dict] | None:
    """상세 조회. (raw_xml_text, parsed_dict) 반환, 실패 시 None."""
    resp = _get_with_retry(DETAIL_URL, {
        "OC": LAW_API_KEY, "target": "prec", "ID": prec_seq, "type": "XML",
    })
    if resp is None:
        return None

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as exc:
        log_failure(case_no, case_no, f"detail XML 파싱 실패: {exc}")
        return None

    raw_date = root.findtext("선고일자") or ""
    date = f"{raw_date[0:4]}-{raw_date[4:6]}-{raw_date[6:8]}" if len(raw_date) == 8 else raw_date or None

    parts = [clean_text(root.findtext("판시사항")), clean_text(root.findtext("판결요지"))]
    summary = "\n\n".join(p for p in parts if p) or None

    parsed = {
        "case_no": root.findtext("사건번호") or case_no,
        "court": root.findtext("법원명"),
        "date": date,
        "title": clean_text(root.findtext("사건명")),
        "summary": summary,
        "text": clean_text(root.findtext("판례내용")),
    }
    return resp.text, parsed


def get_all_precedent_refs() -> list[str]:
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    try:
        records, _, _ = driver.execute_query(
            "MATCH (p:Precedent) RETURN DISTINCT p.ref AS ref ORDER BY ref",
            database_=NEO4J_DATABASE, routing_=RoutingControl.READ,
        )
        return [r["ref"] for r in records]
    finally:
        driver.close()


def process_one(ref: str) -> str:
    """반환값: 'ok' | 'skipped' | 'no_case_no' | 'no_match' | 'fetch_failed'"""
    case_no = parse_case_no(ref)
    if not case_no:
        log_failure(ref, None, "사건번호 패턴을 ref에서 추출 실패")
        return "no_case_no"

    parsed_path = PARSED_DIR / f"{safe_filename(case_no)}.json"
    if parsed_path.exists():
        return "skipped"

    court = parse_court(ref)
    prec_seq = search_precedent(case_no, court)
    if not prec_seq:
        log_failure(ref, case_no, "검색 결과에 정확히 일치하는 사건번호 없음")
        return "no_match"

    result = fetch_detail(prec_seq, case_no)
    if result is None:
        log_failure(ref, case_no, "상세 조회 실패")
        return "fetch_failed"

    raw_xml, parsed = result
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PARSED_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / f"{safe_filename(case_no)}.xml").write_text(raw_xml, encoding="utf-8")
    parsed_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("완료: ref=%s case_no=%s -> %s", ref, case_no, parsed_path)
    return "ok"


LOAD_GRAPH_QUERY = """
MATCH (p:Precedent {ref: $ref})
SET p.title = $title, p.summary = $summary, p.court = $court, p.date = $date
"""


def load_graph() -> None:
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    refs = get_all_precedent_refs()
    updated, missing = 0, 0
    try:
        for ref in refs:
            case_no = parse_case_no(ref)
            if not case_no:
                missing += 1
                continue
            parsed_path = PARSED_DIR / f"{safe_filename(case_no)}.json"
            if not parsed_path.exists():
                missing += 1
                continue
            parsed = json.loads(parsed_path.read_text(encoding="utf-8"))
            driver.execute_query(
                LOAD_GRAPH_QUERY,
                {"ref": ref, "title": parsed["title"], "summary": parsed["summary"],
                 "court": parsed["court"], "date": parsed["date"]},
                database_=NEO4J_DATABASE,
            )
            updated += 1
    finally:
        driver.close()
    logger.info("그래프 적재 완료: %d건 갱신, %d건 본문 없음(스킵)", updated, missing)


def main() -> None:
    parser = argparse.ArgumentParser(description="law.go.kr 판례 본문 수집")
    parser.add_argument("--sample", type=int, nargs="?", const=5, default=None,
                         help="처음 N건만 조회하고 응답 구조를 출력한 뒤 종료 (기본 5)")
    parser.add_argument("--load-graph", action="store_true",
                         help="fetch 없이 data/parsed/precedents/*.json을 Neo4j Precedent 노드에 적재")
    args = parser.parse_args()

    if args.load_graph:
        load_graph()
        return

    refs = get_all_precedent_refs()
    logger.info("Precedent 노드 %d건 확인", len(refs))

    if args.sample:
        refs = refs[: args.sample]
        logger.info("--sample 모드: %d건만 처리", len(refs))

    counts: dict[str, int] = {}
    for ref in refs:
        status = process_one(ref)
        counts[status] = counts.get(status, 0) + 1

        if args.sample and status == "ok":
            case_no = parse_case_no(ref)
            parsed = json.loads((PARSED_DIR / f"{safe_filename(case_no)}.json").read_text(encoding="utf-8"))
            print(f"\n=== {ref} (case_no={case_no}) ===")
            print(json.dumps({**parsed, "text": (parsed["text"] or "")[:300] + "..."}, ensure_ascii=False, indent=2))

    logger.info("처리 결과: %s", counts)


if __name__ == "__main__":
    main()
