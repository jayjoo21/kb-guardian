"""FastAPI 앱. 민원 텍스트를 받아 (분류 -> 그래프 탐색 -> 근거 기반 답변) 파이프라인을
실행하고, 그래프 상세/시각화/통계 조회 엔드포인트를 제공한다.
"""

import asyncio
import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from neo4j import GraphDatabase

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.schemas import (  # noqa: E402
    Classified, ConsultRequest, ConsultResponse, CriteriaRef, Evidence,
    GraphNeighborhood, CaseDetail, LawArticleRef, RatioStats, SimilarCase, StatsResponse,
)
from backend.services import answerer, classifier, graph_search  # noqa: E402

load_dotenv()

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logging.getLogger("neo4j").setLevel(logging.WARNING)
logger = logging.getLogger("main")

NEO4J_URI = os.environ["NEO4J_URI"]
NEO4J_USERNAME = os.environ["NEO4J_USERNAME"]
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE") or None

# 은행 민원 접수 -> 금융감독원 분쟁조정 절차. 그래프에 없는 일반 절차 안내이므로 정적 데이터로 시작.
PROCEDURE_STEPS = [
    "1. 금융회사 고객센터/민원 접수 채널에 먼저 이의를 제기합니다.",
    "2. 금융회사 자체 민원 처리 절차를 거칩니다(통상 접수 후 약 30일 이내 답변).",
    "3. 금융회사 답변에 동의하지 않으면 금융감독원 금융소비자보호처에 분쟁조정을 신청합니다"
    "(금융소비자정보포털 파인, 전화 국번없이 1332, 우편/방문 접수).",
    "4. 금감원이 양 당사자의 사실관계와 자료를 조사합니다.",
    "5. 조사 결과를 토대로 금융분쟁조정위원회에 회부해 심의합니다.",
    "6. 위원회가 조정안을 제시하고, 양 당사자가 이를 수락하면 재판상 화해와 동일한 효력을 가집니다.",
    "7. 조정이 성립하지 않으면 소송 등 별도 법적 절차를 검토할 수 있습니다.",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    app.state.driver.verify_connectivity()
    app.state.anthropic = anthropic.Anthropic()
    app.state.anthropic_async = anthropic.AsyncAnthropic()  # /api/consult 스트리밍 전용
    logger.info("Neo4j 연결 확인 완료 (database=%s)", NEO4J_DATABASE)
    yield
    app.state.driver.close()
    await app.state.anthropic_async.close()


app = FastAPI(title="KB Guardian API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _gather_evidence(driver, issues: list, products: list) -> dict:
    # find_similar_cases 결과(case_ids)가 precedents 조회에 필요하므로 그것만 먼저 실행하고,
    # 나머지 4개(ratio_stats/law_articles/precedents/criteria)는 서로 독립적이므로 병렬 실행한다.
    similar = await asyncio.to_thread(graph_search.find_similar_cases, driver, NEO4J_DATABASE, issues, products)
    case_ids = [c["case_id"] for c in similar]

    ratio_stats, law_articles, precedents, criteria = await asyncio.gather(
        asyncio.to_thread(graph_search.ratio_stats_for_issues, driver, NEO4J_DATABASE, issues),
        asyncio.to_thread(graph_search.law_articles_for_issues, driver, NEO4J_DATABASE, issues),
        asyncio.to_thread(graph_search.precedents_for_cases, driver, NEO4J_DATABASE, case_ids),
        asyncio.to_thread(graph_search.criteria_for, driver, NEO4J_DATABASE, issues),
    )
    return {
        "similar_cases": similar, "ratio_stats": ratio_stats,
        "law_articles": law_articles, "precedents": precedents, "criteria": criteria,
    }


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _consult_stream(req: ConsultRequest, driver, sync_client, async_client):
    t0 = time.perf_counter()
    classified = await asyncio.to_thread(classifier.classify, sync_client, req.text)
    yield _sse("classified", classified)
    t1 = time.perf_counter()

    evidence = await _gather_evidence(driver, classified["issues"], classified["products"])
    yield _sse("evidence", evidence)
    yield _sse("procedure", PROCEDURE_STEPS)
    t2 = time.perf_counter()

    chunks = []
    async for delta in answerer.stream_answer(async_client, req.text, evidence):
        chunks.append(delta)
        yield _sse("answer_chunk", {"delta": delta})
    t3 = time.perf_counter()

    yield _sse("done", {"answer": "".join(chunks)})
    logger.info(
        "consult(stream) 단계별 소요: classify=%.2fs graph=%.2fs answer=%.2fs total=%.2fs",
        t1 - t0, t2 - t1, t3 - t2, t3 - t0,
    )


@app.post("/api/consult")
async def consult(req: ConsultRequest):
    """SSE 스트리밍 응답. EventSource는 POST 바디를 지원하지 않으므로 프론트에서는
    fetch()로 요청한 뒤 response.body의 ReadableStream을 직접 읽어 파싱해야 한다.

    이벤트 순서: classified -> evidence -> procedure -> answer_chunk(N회) -> done
    각 이벤트는 `event: <name>\\ndata: <json>\\n\\n` 형식(표준 SSE)이다.
    """
    driver = app.state.driver
    sync_client = app.state.anthropic
    async_client = app.state.anthropic_async
    return StreamingResponse(
        _consult_stream(req, driver, sync_client, async_client),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/consult/sync", response_model=ConsultResponse)
async def consult_sync(req: ConsultRequest):
    """비스트리밍 버전. 테스트·폴백용으로 유지(전체 응답을 한 번에 반환)."""
    driver = app.state.driver
    client = app.state.anthropic

    t0 = time.perf_counter()
    classified = await asyncio.to_thread(classifier.classify, client, req.text)
    t1 = time.perf_counter()

    evidence = await _gather_evidence(driver, classified["issues"], classified["products"])
    t2 = time.perf_counter()

    answer_text = await asyncio.to_thread(answerer.answer, client, req.text, evidence)
    t3 = time.perf_counter()

    logger.info(
        "consult/sync 단계별 소요: classify=%.2fs graph=%.2fs answer=%.2fs total=%.2fs",
        t1 - t0, t2 - t1, t3 - t2, t3 - t0,
    )

    return ConsultResponse(
        classified=Classified(**classified),
        answer=answer_text,
        evidence=Evidence(
            similar_cases=[SimilarCase(**c) for c in evidence["similar_cases"]],
            law_articles=[LawArticleRef(**la) for la in evidence["law_articles"]],
            precedents=evidence["precedents"],
            ratio_stats=RatioStats(**evidence["ratio_stats"]),
            criteria=[CriteriaRef(**c) for c in evidence["criteria"]],
        ),
        procedure=PROCEDURE_STEPS,
    )


@app.get("/api/case/{case_id}", response_model=CaseDetail)
async def get_case(case_id: str):
    driver = app.state.driver
    detail = await asyncio.to_thread(graph_search.case_detail, driver, NEO4J_DATABASE, case_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"case_id={case_id} 없음")
    return CaseDetail(**detail)


@app.get("/api/graph/neighborhood/{case_id}", response_model=GraphNeighborhood)
async def get_neighborhood(case_id: str):
    driver = app.state.driver
    data = await asyncio.to_thread(graph_search.case_neighborhood, driver, NEO4J_DATABASE, case_id)
    if not data["nodes"]:
        raise HTTPException(status_code=404, detail=f"case_id={case_id} 없음 또는 관계 없음")
    return GraphNeighborhood(**data)


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats():
    driver = app.state.driver
    data = await asyncio.to_thread(graph_search.stats_overview, driver, NEO4J_DATABASE)
    return StatsResponse(**data)
