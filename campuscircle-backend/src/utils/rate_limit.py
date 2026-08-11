import time
from collections import defaultdict
from fastapi import Request

class InMemoryRateLimiter:
    def __init__(self, limit: int = 5, window_seconds: int = 3600):
        self.limit = limit
        self.window_seconds = window_seconds
        self.history = defaultdict(list)

    def is_rate_limited(self, key: str) -> bool:
        now = time.time()
        self.history[key] = [
            ts for ts in self.history[key]
            if now - ts < self.window_seconds
        ]
        return len(self.history[key]) >= self.limit

    def record(self, key: str):
        self.history[key].append(time.time())

def get_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"
