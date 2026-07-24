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


class ConsultResponse(BaseModel):
    classified: Classified
    answer: str
    evidence: Evidence
    procedure: list[str]


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
