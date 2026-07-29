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
    LawArticleRef, OverallRatioDistribution, Procedure, RatioComparison, RatioDistribution, RatioStats,
    RespondentArgumentGroup, SimilarCase, SimulateFactorOption, SimulateResponse, StatsResponse,
)
from backend.services import answerer, classifier, document_scanner, graph_search, simulator  # noqa: E402
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

# 쟁점 유형별 제출 서류. 그래프에 없는 실무 지식이므로 절차와 마찬가지로 정적 데이터로 시작하되,
# "제출 서류 안내"를 뭉뚱그리지 말라는 요구 때문에 쟁점별로 구체화한다(주제 설명문 원문 요구사항).
DOCUMENT_MAP: dict[str, list[str]] = {
    "설명의무_위반": ["가입신청서(계약서) 사본", "상품설명서", "투자자정보확인서", "상담 녹취록(있는 경우)"],
    "적합성원칙_위반": ["가입신청서(계약서) 사본", "투자자정보확인서", "상품설명서", "상담 녹취록(있는 경우)"],
    "적정성원칙_위반": ["가입신청서(계약서) 사본", "투자자정보확인서", "상품설명서"],
    "부당권유": ["가입신청서(계약서) 사본", "상담 녹취록(있는 경우)", "손실보전각서 등 관련 서면(있는 경우)"],
    "불완전판매_기타": ["가입신청서(계약서) 사본", "상품설명서", "투자자정보확인서"],
    "우대금리_미적용": ["가입신청서", "상품설명서(우대금리 조건 명시분)", "통장 거래내역"],
    "중도해지_불이익": ["예적금 가입신청서", "상품설명서", "중도해지 정산내역서"],
    "금리인하요구권": ["금리인하요구권 신청서", "소득·재산 증빙자료", "금리 산정내역서"],
    "임의처리_무단거래": ["계좌·카드 거래내역서", "본인 미승인 확인서(이의제기서)", "고객센터 접수증"],
    "착오송금": ["송금 이체확인증", "수취인 정보(확인 가능한 범위)", "반환 요청 접수 내역"],
    "전산장애": ["장애 발생 시각 화면 캡처·로그", "거래 실패 내역", "고객센터 문의 이력"],
    "보이스피싱_피해보상": ["사건사고사실확인원(경찰 신고접수증)", "이체내역서", "피해구제 신청서"],
    "담보_보증분쟁": ["대출 약정서", "담보·보증 계약서", "등기사항증명서(해당 시)"],
    "예금지급_분쟁": ["예금통장·증서 사본", "본인확인서류", "거래내역서"],
    "수수료_비용분쟁": ["수수료 부과 내역서", "상품설명서(수수료 조항)", "거래내역서"],
    "약관해석_분쟁": ["약관 사본(해당 조항 표시)", "가입신청서", "관련 상담·안내 이력"],
    "기타": ["가입신청서(계약서) 사본", "상품설명서", "관련 상담 이력 또는 녹취(있는 경우)"],
}


def build_documents(issues: list) -> list:
    seen, docs = set(), []
    for issue in issues or ["기타"]:
        for doc in DOCUMENT_MAP.get(issue, DOCUMENT_MAP["기타"]):
            if doc not in seen:
                seen.add(doc)
                docs.append(doc)
    return docs[:6]


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
    # 나머지(ratio_stats/law_articles/precedents/criteria/respondent_arguments/evidence_patterns)는
    # 서로 독립적이므로 병렬 실행한다.
    similar = await asyncio.to_thread(graph_search.find_similar_cases, driver, NEO4J_DATABASE, issues, products)
    case_ids = [c["case_id"] for c in similar]

    (
        ratio_stats, law_articles, precedents, criteria,
        respondent_arguments, evidence_patterns,
    ) = await asyncio.gather(
        asyncio.to_thread(graph_search.ratio_stats_for_issues, driver, NEO4J_DATABASE, issues),
        asyncio.to_thread(graph_search.law_articles_for_issues, driver, NEO4J_DATABASE, issues),
        asyncio.to_thread(graph_search.precedents_for_cases, driver, NEO4J_DATABASE, case_ids),
        asyncio.to_thread(graph_search.criteria_for, driver, NEO4J_DATABASE, issues),
        asyncio.to_thread(graph_search.respondent_arguments_for_issues, driver, NEO4J_DATABASE, issues),
        asyncio.to_thread(graph_search.evidence_patterns_for_issues, driver, NEO4J_DATABASE, issues),
    )
    return {
        "similar_cases": similar, "ratio_stats": ratio_stats,
        "law_articles": law_articles, "precedents": precedents, "criteria": criteria,
        "respondent_arguments": respondent_arguments, "evidence_patterns": evidence_patterns,
    }


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _validate_override_issues(issues):
    if not issues:
        return
    invalid = [i for i in issues if i not in ISSUE_ENUM]
    if invalid:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 쟁점: {invalid}")


async def _resolve_classified(req: ConsultRequest, client):
    """결과 화면에서 "이 쟁점이 아니에요"로 사용자가 직접 고른 쟁점이 있으면 그걸
    그대로 쓰고(재분류 LLM 호출 생략), 없으면 평소대로 classifier로 분류한다."""
    if req.override_issues:
        return {"issues": req.override_issues, "products": [], "factors": []}
    return await asyncio.to_thread(classifier.classify, client, req.text)


async def _consult_stream(req: ConsultRequest, driver, sync_client, async_client):
    t0 = time.perf_counter()
    classified = await _resolve_classified(req, sync_client)
    yield _sse("classified", classified)
    t1 = time.perf_counter()

    evidence = await _gather_evidence(driver, classified["issues"], classified["products"])
    yield _sse("evidence", evidence)
    procedure = {"steps": PROCEDURE_STEPS, "documents": build_documents(classified["issues"])}
    yield _sse("procedure", procedure)
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
    """비스트리밍 버전. 테스트·폴백용으로 유지(전체 응답을 한 번에 반환)."""
    _validate_override_issues(req.override_issues)
    driver = app.state.driver
    client = app.state.anthropic

    t0 = time.perf_counter()
    classified = await _resolve_classified(req, client)
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
            respondent_arguments=[RespondentArgumentGroup(**a) for a in evidence["respondent_arguments"]],
            evidence_patterns=[
                EvidencePattern(
                    **{**p, "ratio_comparison": RatioComparison(**p["ratio_comparison"]) if p["ratio_comparison"] else None}
                )
                for p in evidence["evidence_patterns"]
            ],
        ),
        procedure=Procedure(steps=PROCEDURE_STEPS, documents=build_documents(classified["issues"])),
    )


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
