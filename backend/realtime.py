import asyncio
import json
from datetime import datetime, timezone


_subscribers: set[asyncio.Queue] = set()
_event_seq = 0


def _next_event_id() -> int:
    global _event_seq
    _event_seq += 1
    return _event_seq


def publish_event(
    kind: str,
    *,
    channels: list[str] | None = None,
    cache_prefixes: list[str] | None = None,
    payload: dict | None = None,
    user_ids: list[int] | None = None,
    roles: list[str] | None = None,
) -> None:
    if not _subscribers:
        return

    event = {
        "id": _next_event_id(),
        "kind": kind,
        "channels": channels or [],
        "cache_prefixes": cache_prefixes or [],
        "payload": payload or {},
        "user_ids": user_ids or [],
        "roles": roles or [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    stale_queues: list[asyncio.Queue] = []
    for queue in list(_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            stale_queues.append(queue)

    for queue in stale_queues:
        _subscribers.discard(queue)


def subscribe() -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=128)
    _subscribers.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    _subscribers.discard(queue)


def event_matches_user(event: dict, user: dict) -> bool:
    allowed_user_ids = event.get("user_ids") or []
    if allowed_user_ids and user["id"] not in allowed_user_ids:
        return False

    allowed_roles = event.get("roles") or []
    if allowed_roles and user["role"] not in allowed_roles:
        return False

    return True


def encode_sse(event_name: str, payload: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
