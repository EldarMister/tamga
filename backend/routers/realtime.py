import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from backend.dependencies import get_current_user
from backend.realtime import encode_sse, event_matches_user, subscribe, unsubscribe

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


@router.get("/stream")
async def stream_realtime(request: Request):
    user = get_current_user(request)
    queue = subscribe()

    async def event_stream():
        try:
            yield encode_sse("hello", {
                "user_id": user["id"],
                "role": user["role"],
            })

            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield ": ping\n\n"
                    continue

                if not event_matches_user(event, user):
                    continue

                yield encode_sse("update", event)
        finally:
            unsubscribe(queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
