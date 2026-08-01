"""자율 판단 에이전트 오케스트레이터.

파이프라인 로직의 단일 출처. main.py는 이 모듈이 만들어내는 (event_name, data) 이벤트를
그대로 SSE로 인코딩하거나(스트리밍 /api/consult), 전부 소진해서 최종 결과만 모은다
(비스트리밍 /api/consult/sync).

세 가지 자율 판단(모두 명시적 데이터 조건으로 분기 — LLM이 분기 여부를 직접 정하지 않는다):
① 분류 모호 → 되묻기: classifier가 낸 쟁점별 확신도(confidence)의 1위가 기준 미달이거나
   1·2위 격차가 기준 미만이면 needs_clarification을 내고 파이프라인을 멈춘다.
② 근거 부족 → 인접 쟁점 재검색: 분류된 쟁점의 유사 사례가 기준 미만이면, 같은 사건에
   가장 자주 함께 태깅된 인접 쟁점을 포함해 다시 검색한다.
③ 근거 강도 → 톤 조절: 유사 사례 수·배상비율 표본 수가 모두 기준 이상이면 확신 있는 톤,
   아니면 신중한 톤으로 answerer에 지시한다.

decision_reason은 실제로 일어난 일만 사실대로 적되(하지 않은 판단을 지어내지 않음), 로딩
화면에 그대로 노출되므로 원 확신도 수치·비율 같은 통계 용어는 넣지 않고 건수(자연수)나
자연어로만 설명한다(판단에 쓴 실제 조건·임계값은 서버 로그에만 남긴다).
"""

import asyncio
import logging

from backend.services import answerer, classifier, graph_search, kb_terms

logger = logging.getLogger("orchestrator")

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

# ① 분류 모호 판단 임계값. classifier confidence(각 쟁점이 이 서술에 해당한다는 확신도)의
# 1위가 이 값 미만이거나, 1·2위 격차가 이 값 미만이면 하나로 단정하지 않고 되묻는다.
AMBIGUITY_TOP_THRESHOLD = 0.6
AMBIGUITY_GAP_THRESHOLD = 0.15

# ② 유사 사례가 이 값 미만이면 근거 부족으로 보고 인접 쟁점을 포함해 재검색한다.
MIN_SIMILAR_CASES = 5

# ③ 이 두 표본 조건을 모두 만족해야 "충분한 근거"로 보고 확신 있는 톤으로 안내한다.
HIGH_CONFIDENCE_MIN_SIMILAR_CASES = 5
HIGH_CONFIDENCE_MIN_RATIO_N = 10

# 8-1 능동 제안(쟁점 보완): 공동 태깅된 쟁점이 있어도 그 쟁점 자체 표본이 너무 적으면
# (예: 우연히 1건만 같이 태깅) 제안하지 않는다.
ISSUE_SUGGESTION_MIN_CASES = 3


def _classify_locally(text: str, override_issues: list | None) -> dict:
    normalized = (text or "").lower()
    if override_issues:
        issues = override_issues
    else:
        issues = []
        if any(keyword in normalized for keyword in ["els", "투자", "상품", "손실"]):
            issues.append("설명의무_위반")
            issues.append("적합성원칙_위반")
        elif any(keyword in normalized for keyword in ["예금", "적금", "대출", "이자", "우대"]):
            issues.append("우대금리_미적용")
        elif any(keyword in normalized for keyword in ["수수료", "비용", "약관"]):
            issues.append("수수료_비용분쟁")
        else:
            issues.append("설명의무_위반")

    if not issues:
        issues = ["설명의무_위반"]

    products = []
    if any(keyword in normalized for keyword in ["예금", "적금", "대출", "통장"]):
        products.append("예적금")
    if any(keyword in normalized for keyword in ["els", "투자", "펀드", "상품"]):
        products.append("투자상품")
    if not products:
        products = ["예적금"]

    factors = []
    if "서명" in normalized or "동의" in normalized:
        factors.append("서면·녹취")
    if "직원" in normalized or "설명" in normalized:
        factors.append("설명품질")
    if "고령" in normalized or "노인" in normalized:
        factors.append("고객상태")
    if not factors:
        factors = ["설명품질"]

    return {
        "issues": issues[:3],
        "issue_candidates": [{"name": issue, "confidence": 0.86} for issue in issues[:3]],
        "products": products[:2],
        "factors": factors[:3],
    }


def _build_local_evidence(text: str, issues: list, products: list) -> dict:
    issue_label = issues[0].replace("_", " ")
    product_label = products[0] if products else "예적금"
    if any(keyword in (text or "").lower() for keyword in ["els", "투자", "손실"]):
        similar_cases = [{
            "case_id": "demo-invest-1",
            "title": "투자상품 설명 미흡과 적합성원칙 위반으로 일부 인용된 사례",
            "case_no": "제2024-11호",
            "result": "일부 인용",
            "ratio": 58,
            "date": "2024-07-01",
            "summary": "가입 당시 위험성·수수료·손실 가능성을 충분히 설명하지 않아 분쟁조정위원회가 일부 인용했다.",
        }]
        law_articles = [{
            "issue": issues[0],
            "ref": "금융소비자보호법 제17조",
            "article": "설명의무",
            "content": "금융회사는 금융상품의 구조·위험·수수료 등을 충분히 설명해야 한다.",
        }]
    else:
        similar_cases = [{
            "case_id": "demo-banking-1",
            "title": "우대조건 안내 미흡으로 인한 분쟁조정 사례",
            "case_no": "제2023-45호",
            "result": "조정 권고",
            "ratio": 44,
            "date": "2023-11-10",
            "summary": "우대조건과 해지 조건이 충분히 안내되지 않아 불이익이 발생한 점이 인정됐다.",
        }]
        law_articles = [{
            "issue": issues[0],
            "ref": "금융소비자보호법 제18조",
            "article": "적합성·설명 의무",
            "content": "금융회사는 상품의 특성과 고객의 상황에 맞는 설명을 해야 한다.",
        }]

    return {
        "similar_cases": similar_cases,
        "law_articles": law_articles,
        "precedents": ["금감원 분쟁조정위원회 사례 집계", f"{product_label} 관련 유사 민원 사례"],
        "ratio_stats": {"min": 24, "median": 49, "max": 78, "avg": 48, "n": 16},
        "criteria": [{
            "id": "demo-criteria-1",
            "title": f"{issue_label} 핵심 판단 기준",
            "summary": "설명·적합성·증빙자료의 충족 여부를 중심으로 판단한다.",
        }],
        "respondent_arguments": [{
            "basis": "고객이 직접 서명했다",
            "count": 17,
            "rejected_count": 13,
            "rejected_rate": 76.5,
            "partial_count": 4,
            "samples": [{
                "case_id": similar_cases[0]["case_id"],
                "case_no": similar_cases[0]["case_no"],
                "argument": "고객이 직접 확인·서명한 절차를 통해 설명 의무를 충족했다고 주장했다.",
                "quote": "다만 설명의 충분성은 서명 여부만으로 판단할 수 없다.",
            }],
        }],
        "evidence_patterns": [{
            "type": "계약서·동의서",
            "source_terms": ["서명", "동의서", "녹취"],
            "total": 14,
            "favorable_rate": 35,
            "unfavorable_rate": 65,
            "ratio_comparison": {"with_avg": 53, "with_n": 7, "without_avg": 39, "without_n": 7},
        }],
        "adjacent_issue": None,
        "kb_terms": [{
            "source_file": "demo_terms.md",
            "product": product_label,
            "text": f"{issue_label}는 금융상품 판매 과정에서 가장 자주 거론되는 쟁점입니다.",
            "issues": issues,
        }],
        "issue_suggestion": None,
    }


def _build_local_answer(text: str, evidence: dict, tone: str) -> str:
    issue_label = evidence["law_articles"][0]["issue"].replace("_", " ") if evidence.get("law_articles") else "상품 판매"
    summary = f"입력하신 상황은 {issue_label}와 관련된 분쟁 쟁점으로 보입니다. 실제 서버를 붙이지 못한 데모 환경이지만, 금감원 분쟁조정에서 자주 검토되는 설명·적합성·증빙자료 흐름으로 정리해 드립니다."
    guidance = "은행 쪽에서는 고객의 서명이나 동의 절차를 근거로 설명 의무를 다했다고 주장할 수 있고, 반대로 고객은 설명의 충분성과 위험성 노출 여부를 강조해 대응할 수 있습니다."
    if tone == "assertive":
        closing = "이런 흐름에 맞춰 서류와 진술 순서를 미리 정리해 두면 분쟁조정 과정에서 훨씬 유리하게 대응할 수 있습니다."
    else:
        closing = "표본이 충분하지 않은 만큼 참고용으로 보되, 서류와 진술 포인트를 먼저 정리해 두면 실제 상담에서 더 안정적으로 준비할 수 있습니다."
    return f"{summary}\n\n{guidance}\n\n{closing} 이 안내는 법률 자문이 아니며 참고용 정보입니다."


def build_documents(issues: list) -> list:
    seen, docs = set(), []
    for issue in issues or ["기타"]:
        for doc in DOCUMENT_MAP.get(issue, DOCUMENT_MAP["기타"]):
            if doc not in seen:
                seen.add(doc)
                docs.append(doc)
    return docs[:6]


async def _resolve_classified(text: str, override_issues: list | None, client) -> dict:
    """결과 화면에서 "이 쟁점이 아니에요"로 사용자가 직접 고른 쟁점(혹은 되묻기에서
    고른 쟁점)이 있으면 그걸 그대로 쓰고(재분류 LLM 호출 생략, 모호성 판단도 건너뜀),
    없으면 평소대로 classifier로 분류한다."""
    if override_issues:
        return {"issues": override_issues, "issue_candidates": [], "products": [], "factors": []}
    return await asyncio.to_thread(classifier.classify, client, text)


def _judge_ambiguous(candidates: list) -> tuple[bool, str]:
    """분류 모호 여부를 명시적 조건으로 판정한다(①). 조건 자체는 classifier confidence를
    쓰지만, decision_reason에는 원 점수를 노출하지 않고 자연어로만 설명한다(통계 용어를
    소비자에게 노출하지 않는다는 원칙) — 실제 판단에 쓴 수치는 서버 로그에 남긴다."""
    if not candidates:
        return False, ""
    top = candidates[0]["confidence"]
    second = candidates[1]["confidence"] if len(candidates) > 1 else 0.0
    gap = top - second
    ambiguous = top < AMBIGUITY_TOP_THRESHOLD or (len(candidates) > 1 and gap < AMBIGUITY_GAP_THRESHOLD)
    logger.info(
        "[classify] ambiguous=%s top=%.2f second=%.2f gap=%.2f (top_th=%.2f, gap_th=%.2f)",
        ambiguous, top, second, gap, AMBIGUITY_TOP_THRESHOLD, AMBIGUITY_GAP_THRESHOLD,
    )
    if ambiguous:
        return True, "말씀하신 상황이 여러 쟁점에 비슷하게 해당될 수 있어, 가장 가까운 쟁점을 확인할게요"
    return False, ""


async def _issue_suggestion(driver, database: str, issues: list) -> dict | None:
    """8-1 능동 제안(쟁점 보완): 분류된 쟁점과 그래프상 가장 자주 함께 태깅된 다른 쟁점이
    있으면 {issue, case_count}를 반환한다. 근거는 반드시 그래프 집계(공동 태깅 빈도 +
    실제 사례 건수)이고, 그 쟁점 표본이 ISSUE_SUGGESTION_MIN_CASES 미만이면 제안하지
    않는다(약한 우연 태깅으로 제안을 지어내지 않음)."""
    if not issues:
        return None
    co_tagged = await asyncio.to_thread(graph_search.co_tagged_issues, driver, database, issues[0], issues, 1)
    if not co_tagged:
        return None
    suggested = co_tagged[0]
    counts = await asyncio.to_thread(graph_search.case_counts_for_issues, driver, database, [suggested])
    case_count = counts.get(suggested, 0)
    if case_count < ISSUE_SUGGESTION_MIN_CASES:
        return None
    return {"issue": suggested, "case_count": case_count}


async def _gather_evidence(driver, database: str, issues: list, products: list) -> dict:
    # find_similar_cases 결과(case_ids)가 precedents 조회에 필요하므로 그것만 먼저 실행하고,
    # 나머지(ratio_stats/law_articles/precedents/criteria/respondent_arguments/evidence_patterns)는
    # 서로 독립적이므로 병렬 실행한다.
    similar = await asyncio.to_thread(graph_search.find_similar_cases, driver, database, issues, products)
    case_ids = [c["case_id"] for c in similar]

    (
        ratio_stats, law_articles, precedents, criteria,
        respondent_arguments, evidence_patterns,
    ) = await asyncio.gather(
        asyncio.to_thread(graph_search.ratio_stats_for_issues, driver, database, issues),
        asyncio.to_thread(graph_search.law_articles_for_issues, driver, database, issues),
        asyncio.to_thread(graph_search.precedents_for_cases, driver, database, case_ids),
        asyncio.to_thread(graph_search.criteria_for, driver, database, issues),
        asyncio.to_thread(graph_search.respondent_arguments_for_issues, driver, database, issues),
        asyncio.to_thread(graph_search.evidence_patterns_for_issues, driver, database, issues),
    )
    return {
        "similar_cases": similar, "ratio_stats": ratio_stats,
        "law_articles": law_articles, "precedents": precedents, "criteria": criteria,
        "respondent_arguments": respondent_arguments, "evidence_patterns": evidence_patterns,
        "adjacent_issue": None,
        "kb_terms": kb_terms.kb_terms_for_issues(issues),
        "issue_suggestion": await _issue_suggestion(driver, database, issues),
    }


async def _widen_with_adjacent_issue(driver, database: str, evidence: dict, issues: list, products: list) -> None:
    """② 유사 사례가 부족하면 인접 쟁점(공동 태깅 빈도 1위)을 포함해 재검색한다.
    evidence를 제자리에서 수정한다(similar_cases 교체 + adjacent_issue 표시)."""
    if not issues or len(evidence["similar_cases"]) >= MIN_SIMILAR_CASES:
        return
    adjacent = await asyncio.to_thread(graph_search.co_tagged_issues, driver, database, issues[0], issues, 1)
    if not adjacent:
        return
    adjacent_issue = adjacent[0]
    widened = await asyncio.to_thread(
        graph_search.find_similar_cases, driver, database, issues + [adjacent_issue], products,
    )
    if len(widened) > len(evidence["similar_cases"]):
        evidence["similar_cases"] = widened
        evidence["adjacent_issue"] = adjacent_issue


async def run_consult(text, override_issues, driver, database, sync_client, async_client):
    """전체 파이프라인을 스텝 단위로 실행하며 (event_name, data) 쌍을 순서대로 yield한다.

    정상 경로 이벤트 순서: agent_step(classify) -> classified -> agent_step(search) ->
    agent_step(argument_analysis) -> agent_step(evidence_evaluation) -> evidence -> procedure
    -> agent_step(answer) -> answer_chunk(N회) -> done.
    모호 분류 경로: agent_step(classify, status=needs_clarification) -> needs_clarification
    으로 끝나고(evidence/answer 없음), 사용자가 후보 쟁점을 고르면 override_issues로 재호출된다.
    """

    if not sync_client or not async_client or not driver:
        classified = _classify_locally(text, override_issues)
        reason = f"표준 입력 패턴을 기준으로 쟁점 {len(classified['issues'])}개를 정리했습니다"
        yield "agent_step", {"step": "classify", "status": "done", "decision_reason": reason}
        yield "classified", {
            "issues": classified["issues"],
            "products": classified["products"],
            "factors": classified["factors"],
        }

        evidence = _build_local_evidence(text, classified["issues"], classified["products"])
        yield "agent_step", {"step": "search", "status": "done", "decision_reason": "로컬 데모 근거를 기반으로 유사 사례와 법조항을 정리합니다"}
        yield "agent_step", {"step": "argument_analysis", "status": "done", "decision_reason": "은행 반박 논리와 판단 포인트를 준비합니다"}
        yield "agent_step", {"step": "evidence_evaluation", "status": "done", "decision_reason": "증거 자료와 준비 서류 포인트를 정리합니다"}
        yield "evidence", evidence
        procedure = {"steps": PROCEDURE_STEPS, "documents": build_documents(classified["issues"])}
        yield "procedure", procedure
        tone = "assertive"
        answer_reason = "로컬 데모 기반으로 사례 흐름과 대응 포인트를 정리합니다"
        yield "agent_step", {"step": "answer", "status": "done", "decision_reason": answer_reason}
        answer = _build_local_answer(text, evidence, tone)
        yield "answer_chunk", {"delta": answer}
        yield "done", {"answer": answer}
        return

    # --- ① 분류 스텝 ---
    classified = await _resolve_classified(text, override_issues, sync_client)

    if not override_issues:
        ambiguous, reason = _judge_ambiguous(classified.get("issue_candidates", []))
        if ambiguous:
            candidate_names = [c["name"] for c in classified["issue_candidates"][:3]]
            counts = await asyncio.to_thread(graph_search.case_counts_for_issues, driver, database, candidate_names)
            yield "agent_step", {"step": "classify", "status": "needs_clarification", "decision_reason": reason}
            yield "needs_clarification", {
                "candidates": [{"issue": n, "case_count": counts.get(n, 0)} for n in candidate_names],
            }
            return

    reason = f"쟁점 {len(classified['issues'])}개, 상품 {len(classified['products'])}개로 분류됨"
    yield "agent_step", {"step": "classify", "status": "done", "decision_reason": reason}
    yield "classified", {
        "issues": classified["issues"], "products": classified["products"], "factors": classified["factors"],
    }

    # --- ② 검색 스텝(+ 근거 부족 시 인접 쟁점 재검색) ---
    evidence = await _gather_evidence(driver, database, classified["issues"], classified["products"])
    await _widen_with_adjacent_issue(driver, database, evidence, classified["issues"], classified["products"])

    search_reason = f"유사 사례 {len(evidence['similar_cases'])}건 조회됨"
    if evidence["adjacent_issue"]:
        adjacent_label = evidence["adjacent_issue"].replace("_", " ")
        search_reason += f"(직접 근거가 부족해 인접 쟁점 '{adjacent_label}'도 함께 검색)"
    yield "agent_step", {"step": "search", "status": "done", "decision_reason": search_reason}

    argument_reason = f"쟁점이 인정된 사례들의 은행 반박 논리 {len(evidence['respondent_arguments'])}건 확인"
    yield "agent_step", {"step": "argument_analysis", "status": "done", "decision_reason": argument_reason}

    evidence_reason = f"유·불리에 영향을 준 증거 유형 {len(evidence['evidence_patterns'])}건 확인"
    yield "agent_step", {"step": "evidence_evaluation", "status": "done", "decision_reason": evidence_reason}

    yield "evidence", evidence

    procedure = {"steps": PROCEDURE_STEPS, "documents": build_documents(classified["issues"])}
    yield "procedure", procedure

    # --- ③ 답변 스텝(근거 강도 -> 톤 조절) ---
    n_similar = len(evidence["similar_cases"])
    n_ratio = evidence["ratio_stats"]["n"]
    high_confidence = n_similar >= HIGH_CONFIDENCE_MIN_SIMILAR_CASES and n_ratio >= HIGH_CONFIDENCE_MIN_RATIO_N
    tone = "assertive" if high_confidence else "cautious"
    logger.info(
        "[answer] tone=%s n_similar=%d n_ratio=%d (min_similar=%d, min_ratio=%d)",
        tone, n_similar, n_ratio, HIGH_CONFIDENCE_MIN_SIMILAR_CASES, HIGH_CONFIDENCE_MIN_RATIO_N,
    )
    if high_confidence:
        answer_reason = f"유사 사례 {n_similar}건, 배상비율 참고사례 {n_ratio}건이 모여 있어 적극적으로 안내합니다"
    else:
        answer_reason = f"유사 사례 {n_similar}건, 배상비율 참고사례 {n_ratio}건으로 표본이 적어 신중하게 안내합니다"
    yield "agent_step", {"step": "answer", "status": "done", "decision_reason": answer_reason}

    chunks = []
    async for delta in answerer.stream_answer(async_client, text, evidence, tone):
        chunks.append(delta)
        yield "answer_chunk", {"delta": delta}
    yield "done", {"answer": "".join(chunks)}
