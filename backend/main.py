"""FastAPI 앱. 민원 텍스트를 받아 (분류 -> 그래프 탐색 -> 근거 기반 답변) 파이프라인을
실행하고, 그래프 상세/시각화/통계 조회 엔드포인트를 제공한다.
"""

import asyncio
import base64
import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from neo4j import GraphDatabase

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.schemas import (  # noqa: E402
    ArgumentBasisOverview, Classified, ConsultRequest, ConsultResponse, CorpusTotals, CriteriaRef,
    DocumentScanResult, Evidence, EvidencePattern, EvidenceTypeOverview, GraphNeighborhood, CaseDetail,
    IssueSuggestion, KbTermQuote, LawArticleRef, OverallRatioDistribution, Procedure, RatioComparison,
    RatioDistribution, RatioStats, RespondentArgumentGroup, SimilarCase, SimplifyAnswerRequest,
    SimplifyAnswerResponse, SimulateFactorOption, SimulateResponse, StatsResponse,
)
from backend.services import answerer, document_scanner, graph_search, orchestrator, simulator  # noqa: E402
from common.enums import ISSUE_ENUM  # noqa: E402

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


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _validate_override_issues(issues):
    if not issues:
        return
    invalid = [i for i in issues if i not in ISSUE_ENUM]
    if invalid:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 쟁점: {invalid}")


async def _consult_stream(req: ConsultRequest, driver, sync_client, async_client):
    t0 = time.perf_counter()
    async for event_name, data in orchestrator.run_consult(
        req.text, req.override_issues, driver, NEO4J_DATABASE, sync_client, async_client,
    ):
        yield _sse(event_name, data)
    logger.info("consult(stream) 완료: %.2fs", time.perf_counter() - t0)


@app.post("/api/consult")
async def consult(req: ConsultRequest):
    """SSE 스트리밍 응답. EventSource는 POST 바디를 지원하지 않으므로 프론트에서는
    fetch()로 요청한 뒤 response.body의 ReadableStream을 직접 읽어 파싱해야 한다.

    정상 이벤트 순서: agent_step(classify) -> classified -> agent_step(search) ->
    agent_step(argument_analysis) -> agent_step(evidence_evaluation) -> evidence ->
    procedure -> agent_step(answer) -> answer_chunk(N회) -> done.
    분류가 모호하면(①): agent_step(classify, status=needs_clarification) ->
    needs_clarification으로 끝나고, 프론트가 후보 쟁점 중 하나를 override_issues로
    다시 요청해야 이어진다. 각 이벤트는 `event: <name>\\ndata: <json>\\n\\n` 형식(표준
    SSE)이다. 파이프라인 로직 자체는 orchestrator.run_consult()가 갖고 있고, 여기서는
    SSE로 인코딩만 한다.
    """
    _validate_override_issues(req.override_issues)
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
    """비스트리밍 버전. 테스트·폴백용으로 유지(전체 응답을 한 번에 반환). agent_step
    이벤트는 로그로 남기고 응답 스키마에는 담지 않는다(ConsultResponse는 그대로)."""
    _validate_override_issues(req.override_issues)
    driver = app.state.driver
    client = app.state.anthropic

    classified = evidence = procedure = None
    answer_text = ""
    clarification = None
    t0 = time.perf_counter()
    async for event_name, data in orchestrator.run_consult(
        req.text, req.override_issues, driver, NEO4J_DATABASE, client, app.state.anthropic_async,
    ):
        if event_name == "agent_step":
            logger.info("agent_step[%s]: %s", data["step"], data["decision_reason"])
        elif event_name == "needs_clarification":
            clarification = data
        elif event_name == "classified":
            classified = data
        elif event_name == "evidence":
            evidence = data
        elif event_name == "procedure":
            procedure = data
        elif event_name == "done":
            answer_text = data["answer"]
    logger.info("consult/sync 완료: %.2fs", time.perf_counter() - t0)

    if clarification is not None:
        # 분류가 모호해 사용자 확인이 필요한 경로(①) — 이 엔드포인트는 되묻기 UI가 없는
        # 테스트·폴백용이므로, 후보를 그대로 담아 422로 알려준다(프론트는 /api/consult의
        # needs_clarification SSE 이벤트로 이 상황을 처리한다).
        raise HTTPException(status_code=422, detail={"needs_clarification": clarification["candidates"]})

    return ConsultResponse(
        classified=Classified(**classified),
        answer=answer_text,
        evidence=Evidence(
            similar_cases=[SimilarCase(**c) for c in evidence["similar_cases"]],
            law_articles=[LawArticleRef(**la) for la in evidence["law_articles"]],
            precedents=evidence["precedents"],
            ratio_stats=RatioStats(**evidence["ratio_stats"]),
            criteria=[CriteriaRef(**c) for c in evidence["criteria"]],
            respondent_arguments=[RespondentArgumentGroup(**a) for a in evidence["respondent_arguments"]],
            evidence_patterns=[
                EvidencePattern(
                    **{**p, "ratio_comparison": RatioComparison(**p["ratio_comparison"]) if p["ratio_comparison"] else None}
                )
                for p in evidence["evidence_patterns"]
            ],
            adjacent_issue=evidence["adjacent_issue"],
            kb_terms=[KbTermQuote(**k) for k in evidence["kb_terms"]],
            issue_suggestion=IssueSuggestion(**evidence["issue_suggestion"]) if evidence["issue_suggestion"] else None,
        ),
        procedure=Procedure(**procedure),
    )


@app.post("/api/simplify-answer", response_model=SimplifyAnswerResponse)
async def simplify_answer(req: SimplifyAnswerRequest):
    """9-1 결과 피드백 "설명이 어려워요" — 재분류·재검색 없이 이미 받은 evidence
    그대로, 답변만 더 쉬운 문장으로 다시 생성한다. 톤(확신/신중)은 오케스트레이터의
    ③ 판단과 같은 기준으로 evidence에서 다시 계산한다(별도로 저장해두지 않음)."""
    n_similar = len(req.evidence.similar_cases)
    n_ratio = req.evidence.ratio_stats.n
    high_confidence = (
        n_similar >= orchestrator.HIGH_CONFIDENCE_MIN_SIMILAR_CASES
        and n_ratio >= orchestrator.HIGH_CONFIDENCE_MIN_RATIO_N
    )
    tone = "assertive" if high_confidence else "cautious"
    text = await asyncio.to_thread(
        answerer.answer, app.state.anthropic, req.text, req.evidence.model_dump(), tone, True,
    )
    return SimplifyAnswerResponse(answer=text)


@app.get("/api/simulate/{issue}", response_model=SimulateResponse)
async def simulate(issue: str):
    """쟁점별 배상비율 분포(중앙값/범위/사분위/개별값/일관성)와, 표본이 충분해 신뢰할 수 있는
    ("반영" 등급) 가감산 요인만 참고 정보로 반환한다. 계산기가 아니라 분포 조회이므로 요인을
    선택·합산하지 않는다. 표본이 없는 쟁점은 그래프에 없는 것으로 보고 빈 결과를 반환한다."""
    if issue not in ISSUE_ENUM:
        raise HTTPException(status_code=400, detail=f"issue={issue!r}는 유효한 쟁점이 아닙니다")

    driver = app.state.driver
    distribution, stats = await asyncio.gather(
        asyncio.to_thread(graph_search.ratio_distribution_for_issue, driver, NEO4J_DATABASE, issue),
        asyncio.to_thread(graph_search.factor_stats_for_issue, driver, NEO4J_DATABASE, issue, simulator.FACTOR_MENU),
    )
    graded = simulator.classify_confidence(issue, stats["factors"])
    reflected = [f for f in graded if f["confidence"] == simulator.TIER_REFLECTED]

    return SimulateResponse(
        issue=issue,
        distribution=RatioDistribution(**distribution),
        factors=[SimulateFactorOption(**f) for f in reflected],
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
    """홈 화면의 쟁점별 사례 수뿐 아니라, 통계 탭이 쓰는 코퍼스 규모·전체 배상비율
    분포·반박 논리 순위·증거 유형별 방향까지 한 번에 반환한다(쟁점 필터 없는
    전체 코퍼스 집계 4종은 서로 독립적이라 병렬 조회)."""
    driver = app.state.driver
    overview, corpus, overall_dist, basis_overview, evidence_overview = await asyncio.gather(
        asyncio.to_thread(graph_search.stats_overview, driver, NEO4J_DATABASE),
        asyncio.to_thread(graph_search.corpus_totals, driver, NEO4J_DATABASE),
        asyncio.to_thread(graph_search.overall_ratio_distribution, driver, NEO4J_DATABASE),
        asyncio.to_thread(graph_search.argument_basis_overview, driver, NEO4J_DATABASE),
        asyncio.to_thread(graph_search.evidence_type_overview, driver, NEO4J_DATABASE),
    )
    return StatsResponse(
        total_cases=overview["total_cases"],
        issues=overview["issues"],
        corpus=CorpusTotals(**corpus),
        overall_ratio_distribution=OverallRatioDistribution(**overall_dist),
        argument_basis_overview=[ArgumentBasisOverview(**b) for b in basis_overview],
        evidence_type_overview=[EvidenceTypeOverview(**e) for e in evidence_overview],
    )


_ALLOWED_SCAN_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}
_MAX_SCAN_BYTES = 10 * 1024 * 1024  # 10MB


@app.post("/api/document-scan", response_model=DocumentScanResult)
async def document_scan(file: UploadFile = File(...)):
    """사용자가 올린 서류 사진/PDF를 Claude 비전으로 판독한다("관련 서류 사진
    올리기"). 실제 Claude API 이미지 입력을 쓰는 기능 — 이미지에 없는 내용은
    절대 지어내지 않고, 판독 불가하면 그렇게 응답한다(document_scanner.py)."""
    if file.content_type not in _ALLOWED_SCAN_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다: {file.content_type}")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    if len(contents) > _MAX_SCAN_BYTES:
        raise HTTPException(status_code=400, detail="파일 크기가 너무 큽니다(최대 10MB).")

    data_b64 = base64.b64encode(contents).decode()
    is_pdf = file.content_type == "application/pdf"
    client = app.state.anthropic
    result = await asyncio.to_thread(document_scanner.scan_document, client, file.content_type, data_b64, is_pdf)
    return DocumentScanResult(**result)
