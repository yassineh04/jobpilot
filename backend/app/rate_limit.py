import time
from collections import defaultdict, deque
from threading import Lock
from fastapi import Depends, HTTPException
from app.dependencies import get_current_user
from app import models


class RateLimiter:
    """In-memory sliding window per user. Enough for a single backend instance."""

    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window = window_seconds
        self._calls: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def __call__(self, user: models.User = Depends(get_current_user)) -> models.User:
        now = time.monotonic()
        with self._lock:
            calls = self._calls[str(user.id)]
            while calls and now - calls[0] > self.window:
                calls.popleft()
            if len(calls) >= self.max_calls:
                retry = int(self.window - (now - calls[0])) + 1
                raise HTTPException(429, f"Too many requests. Try again in {retry} seconds.",
                                    headers={"Retry-After": str(retry)})
            calls.append(now)
        return user


ai_rate_limit = RateLimiter(max_calls=40, window_seconds=600)
