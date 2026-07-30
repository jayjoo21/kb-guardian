"""데모 공개 링크의 Anthropic 크레딧 남용 방지용 인메모리 rate limit.

Railway는 단일 프로세스로 띄우는 게 기본이라 인메모리 카운터로 충분하다(다중
인스턴스로 스케일하면 무의미해지지만, 데모 목적상 그 정도 정교함은 불필요).
IP당 고정 윈도우(시간 단위) 카운트 방식 — 창이 넘어가면 카운트 리셋.
"""

import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request

DEMO_LIMIT_MESSAGE = "데모 이용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요."


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float = 3600.0):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._counts: dict[str, tuple[float, int]] = defaultdict(lambda: (0.0, 0))

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            window_start, count = self._counts[key]
            if now - window_start >= self.window_seconds:
                window_start, count = now, 0
            if count >= self.max_requests:
                raise HTTPException(status_code=429, detail=DEMO_LIMIT_MESSAGE)
            self._counts[key] = (window_start, count + 1)


def client_ip(request: Request) -> str:
    """Railway 등 프록시 뒤에서는 X-Forwarded-For의 첫 IP가 실제 클라이언트."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
