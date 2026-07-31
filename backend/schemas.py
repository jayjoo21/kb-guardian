"""API 요청/응답 Pydantic 모델. 그래프 스키마(scripts/load_graph.py)와 이름을 맞춘다."""

from typing import Optional

from pydantic import BaseModel


class DocumentScanResult(BaseModel):
    """업로드한 서류 이미지/PDF 판독 결과. 이미지에 실제로 없는 항목은 null —
    추론해서 채우지 않는다(backend/services/document_scanner.py)."""
    readable: bool
    document_type: str
    has_signature: Optional[bool] = None
    signature_note: Optional[str] = None
    investment_profile_marked: Optional[bool] = None
    product_name: Optional[str] = None
    notes: Optional[str] = None


class ConsultRequest(BaseModel):
    text: str
    # 사용자가 결과 화면에서 "이 쟁점이 아니에요"로 직접 고른 쟁점. 있으면 classifier
    # LLM 호출을 건너뛰고 이 쟁점을 그대로 써서 evidence/answer를 재생성한다
    # (원문 텍스트는 그대로 두고 쟁점만 강제 지정하는 재분석 흐름).
    override_issues: Optional[list[str]] = None


class Classified(BaseModel):
    issues: list[str] = []
    products: list[str] = []
    factors: list[str] = []


class SimilarCase(BaseModel):
    case_id: str
    title: str
    case_no: Optional[str] = None
    result: Optional[str] = None
    ratio: Optional[float] = None
    date: Optional[str] = None


class RatioStats(BaseModel):
    min: Optional[float] = None
    median: Optional[float] = None
    max: Optional[float] = None
    avg: Optional[float] = None
    n: int = 0


class CriteriaRef(BaseModel):
    id: str
    title: str
    summary: Optional[str] = None


class LawArticleRef(BaseModel):
    issue: str
    ref: str


class LawArticleDetail(BaseModel):
    """법조문 상세 정보"""
    ref: str
    article: str
    content: str


class ConsumerRight(BaseModel):
    """소비자 권리 정보"""
    id: str
    title: str
    description: str
    when_to_use: str
    how_to_exercise: str
    law_article_ref: str
    law_article_detail: Optional[LawArticleDetail] = None


class ConsumerRightsResponse(BaseModel):
    """소비자 권리 목록 응답"""
    rights: list[ConsumerRight]


class ProductStat(BaseModel):
    """상품별 통계"""
    product: str
    case_count: int
    ratio_stats: RatioStats


class ProductStatsResponse(BaseModel):
    """상품별 통계 응답"""
    products: list[ProductStat]


class ProductDetail(BaseModel):
    """상품 상세 정보"""
    product: str
    case_count: int
    issues: list[str]
    avg_ratio: float | None
    ratio_n: int


class ProductDetailResponse(BaseModel):
    """상품 상세 응답"""
    detail: ProductDetail


class RiskSignal(BaseModel):
    """위험 신호"""
    type: str
    original_text: str
    explanation: str


class RiskSignalAnalysis(BaseModel):
    """위험 신호 분석 결과"""
    signals: list[RiskSignal]
    analysis_summary: str


class RiskSignalAnalysisResponse(BaseModel):
    """위험 신호 분석 응답"""
    analysis: RiskSignalAnalysis


class LearningPoint(BaseModel):
    """학습용 점 카드"""
    issue: str
    case_id: str
    summary: str
    case_count: int
    avg_ratio: float | None


class LearningTerm(BaseModel):
    """학습용 용어 카드"""
    term: str
    description: str
    case_count: int
    example_cases: list[str]


class LearningContentResponse(BaseModel):
    """학습 콘텐츠 응답"""
    points: list[LearningPoint]
    terms: list[LearningTerm]


class ChatRequest(BaseModel):
    """채팅 요청"""
    message: str
    current_evidence: dict | None = None


class ChatResponse(BaseModel):
    """채팅 응답"""
    type: str
    answer: str
    source: str | None
    action: str | None
    action_data: str | None


class ArgumentSample(BaseModel):
    """basis 그룹 안의 대표 사례 하나 — 같은 사건(case_id) 안에서 은행 주장과
    위원회 판단(인용문)을 짝지어 보여주기 위한 단위. quote가 null이면 위원회가
    이 주장을 직접 인용한 문장이 없다는 뜻(통계만 표시, 인용은 생략). case_no는
    "금감원 분쟁조정 제○○호" 표시용 공식 사건번호(196건 중 6건은 결측이라 null)."""
    case_id: str
    case_no: Optional[str] = None
    argument: str
    quote: Optional[str] = None


class RespondentArgumentGroup(BaseModel):
    """"은행은 이렇게 반박합니다" 카드 하나 분량 — basis(반박 근거 유형)별 집계.
    rejected_rate는 accepted="배척" 비율만이고(일부인정은 0.5로 섞지 않음),
    일부인정은 partial_count로 별도 표시한다."""
    basis: str
    count: int
    rejected_count: int
    rejected_rate: float
    partial_count: int
    samples: list[ArgumentSample] = []


class RatioComparison(BaseModel):
    with_avg: float
    with_n: int
    without_avg: float
    without_n: int


class EvidencePattern(BaseModel):
    """"이런 자료가 있으면 유리해요" 카드 하나 분량 — Evidence type별 집계."""
    type: str
    source_terms: list[str] = []  # 원문에 실제 쓰인 서류/자료 표현 빈출 3개
    total: int
    favorable_rate: float
    unfavorable_rate: float
    ratio_comparison: Optional[RatioComparison] = None  # 양쪽 n>=10일 때만 채움


class KbTermQuote(BaseModel):
    """KB국민은행 공개 약관·상품설명서에서 발췌한 실제 문구(scripts/extract_kb_terms.py로
    추출 + 원문 대조 검증됨). issues는 스크립트가 판단한 관련 쟁점(0개 이상)."""
    source_file: str
    product: str
    text: str
    issues: list[str] = []


class IssueSuggestion(BaseModel):
    """8-1 능동 제안(쟁점 보완) — 분류된 쟁점과 그래프상 공동 태깅 빈도가 가장 높은
    다른 쟁점. case_count는 그 쟁점의 실제 사례 건수(그래프 집계, 자연수)."""
    issue: str
    case_count: int


class Evidence(BaseModel):
    similar_cases: list[SimilarCase] = []
    law_articles: list[LawArticleRef] = []
    precedents: list[str] = []
    ratio_stats: RatioStats = RatioStats()
    criteria: list[CriteriaRef] = []
    respondent_arguments: list[RespondentArgumentGroup] = []
    evidence_patterns: list[EvidencePattern] = []
    # 유사 사례가 부족해(orchestrator.MIN_SIMILAR_CASES 미만) 함께 검색한 인접 쟁점.
    # None이면 인접 쟁점 검색이 트리거되지 않은 것(직접 근거만으로 충분했다는 뜻).
    adjacent_issue: Optional[str] = None
    kb_terms: list[KbTermQuote] = []
    issue_suggestion: Optional[IssueSuggestion] = None


class Procedure(BaseModel):
    steps: list[str] = []
    documents: list[str] = []


class ConsultResponse(BaseModel):
    classified: Classified
    answer: str
    evidence: Evidence
    procedure: Procedure


class SimplifyAnswerRequest(BaseModel):
    """9-1 결과 피드백 "설명이 어려워요" — 재분류·재검색 없이 같은 evidence로 답변만
    더 쉬운 문장으로 다시 생성한다."""
    text: str
    evidence: Evidence


class SimplifyAnswerResponse(BaseModel):
    answer: str


class OutcomeDetail(BaseModel):
    respondent: str
    result: Optional[str] = None
    ratio: Optional[float] = None
    amount: Optional[float] = None


class IssueDetail(BaseModel):
    name: str
    result: Optional[str] = None


class FactorDetail(BaseModel):
    name: str
    direction: Optional[str] = None
    value_pp: Optional[float] = None


class CaseDetail(BaseModel):
    case_id: str
    title: str
    case_no: Optional[str] = None
    date: Optional[str] = None
    sector: Optional[str] = None
    summary: Optional[str] = None
    recommendation: Optional[str] = None
    issues: list[IssueDetail] = []
    products: list[str] = []
    law_articles: list[str] = []
    precedents: list[str] = []
    factors: list[FactorDetail] = []
    outcomes: list[OutcomeDetail] = []
    refers_to: list[str] = []
    referred_by: list[str] = []
    unresolved_refs: list[str] = []


class GraphNode(BaseModel):
    id: str
    label: str
    type: str


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str


class GraphNeighborhood(BaseModel):
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


class IssueStat(BaseModel):
    issue: str
    case_count: int
    ratio_stats: RatioStats


class DateRange(BaseModel):
    from_year: int
    to_year: int


class CorpusTotals(BaseModel):
    """통계 탭/데이터 출처 카드용 — 전체 그래프 기준(쟁점 필터 없음) 노드 건수 + 기간."""
    precedents: int
    law_articles: int
    criteria: int
    date_range: Optional[DateRange] = None
    # 코퍼스에 실제로 있는 가장 최근 사례 등록일(YYYY-MM-DD) — "최종 갱신일" 표시용 실측값.
    latest_case_date: Optional[str] = None


class OverallRatioDistribution(BaseModel):
    """전체 사례 기준(쟁점 필터 없음) 배상비율 분포 — 통계 탭 히스토그램용.
    SimulateResponse의 RatioDistribution과 달리 consistency 라벨은 없다(쟁점별
    일관성 판단이라 전체 통합 분포에는 의미가 없음)."""
    min: Optional[float] = None
    median: Optional[float] = None
    max: Optional[float] = None
    avg: Optional[float] = None
    p25: Optional[float] = None
    p75: Optional[float] = None
    n: int = 0
    values: list[float] = []


class ArgumentBasisOverview(BaseModel):
    """"은행이 자주 쓰는 반박 논리" 순위용 — 전체 코퍼스 기준(쟁점 필터 없음) basis별 집계."""
    basis: str
    count: int
    rejected_count: int
    rejected_rate: float


class EvidenceTypeOverview(BaseModel):
    """"결과를 가르는 자료" 카드용 — 전체 코퍼스 기준(쟁점 필터 없음) EvidenceType별 집계."""
    type: str
    source_terms: list[str] = []
    total: int
    favorable_rate: float
    unfavorable_rate: float


class StatsResponse(BaseModel):
    total_cases: int
    issues: list[IssueStat]
    corpus: CorpusTotals
    overall_ratio_distribution: OverallRatioDistribution
    argument_basis_overview: list[ArgumentBasisOverview] = []
    evidence_type_overview: list[EvidenceTypeOverview] = []


class RatioDistribution(BaseModel):
    min: Optional[float] = None
    median: Optional[float] = None
    max: Optional[float] = None
    avg: Optional[float] = None
    p25: Optional[float] = None
    p75: Optional[float] = None
    n: int = 0
    values: list[float] = []  # 개별 사례 배상비율(히스토그램용). 그래프에서 그대로 조회한 실측치.
    consistency: str = "데이터_부족"  # "일관" | "편차_큼" | "데이터_부족"(n<5)


class SimulateFactorOption(BaseModel):
    name: str
    direction: str  # "가산" | "감산" | "중립" — with/without 평균 배상비율 차이의 부호로 결정
    pp: Optional[float] = None
    n_with: int = 0
    n_without: int = 0
    confidence: str = "판단_유보"  # "반영"(n_with>=10) | "참고"(5~9) | "판단_유보"(<5 또는 부호 반대)


class SimulateResponse(BaseModel):
    issue: str
    distribution: RatioDistribution
    factors: list[SimulateFactorOption] = []  # confidence == "반영"인 요인만 (참고용, 계산기 아님)
