"""API 요청/응답 Pydantic 모델. 그래프 스키마(scripts/load_graph.py)와 이름을 맞춘다."""

from typing import Optional

from pydantic import BaseModel


class ConsultRequest(BaseModel):
    text: str


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


class Evidence(BaseModel):
    similar_cases: list[SimilarCase] = []
    law_articles: list[LawArticleRef] = []
    precedents: list[str] = []
    ratio_stats: RatioStats = RatioStats()
    criteria: list[CriteriaRef] = []


class Procedure(BaseModel):
    steps: list[str] = []
    documents: list[str] = []


class ConsultResponse(BaseModel):
    classified: Classified
    answer: str
    evidence: Evidence
    procedure: Procedure


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


class StatsResponse(BaseModel):
    total_cases: int
    issues: list[IssueStat]


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
