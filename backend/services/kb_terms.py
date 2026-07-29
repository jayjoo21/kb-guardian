"""KB국민은행 공개 약관·상품설명서에서 발췌한 실제 문구 조회.

scripts/extract_kb_terms.py가 생성한 data/graph/kb_terms.json(원문 대조 검증까지 끝난
정적 파일)을 그대로 읽는다. 다른 그래프 조회와 달리 Neo4j가 아니라 로컬 JSON이라
드라이버가 필요 없다.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger("kb_terms")

_PATH = Path("data/graph/kb_terms.json")
_cache: list | None = None

MAX_RESULTS = 3


def _load() -> list:
    global _cache
    if _cache is None:
        if _PATH.exists():
            _cache = json.loads(_PATH.read_text(encoding="utf-8"))
            logger.info("KB 약관 문구 %d건 로드", len(_cache))
        else:
            _cache = []
    return _cache


def kb_terms_for_issues(issues: list) -> list:
    """분류된 쟁점과 issues가 하나라도 겹치는 KB 약관 문구를 최대 MAX_RESULTS건 반환.
    issues가 비어 있으면 무차별로 보여주지 않고 빈 리스트를 낸다."""
    if not issues:
        return []
    issue_set = set(issues)
    matched = [q for q in _load() if issue_set & set(q.get("issues", []))]
    return matched[:MAX_RESULTS]
