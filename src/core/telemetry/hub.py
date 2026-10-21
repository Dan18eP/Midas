"""Telemetry Event Hub providing in-memory ring buffer and SSE broadcasting."""

import asyncio
from collections import deque
import logging
import os
from typing import AsyncGenerator, Deque, List, Optional, Set

from src.core.telemetry.events import TelemetryEvent

logger = logging.getLogger("midas.telemetry.hub")


class TelemetryHub:
    """Central Hub for streaming real-time telemetry events via Server-Sent Events (SSE).

    Features:
    - Thread-safe / async in-memory ring buffer (default max capacity 100 events).
    - Transparent reconnection with Last-Event-ID replay.
    - Non-blocking broadcast to all active SSE subscribers.
    - Automatic heartbeat (ping) comments to maintain connection alive through proxies.
    """

    def __init__(self, max_buffer_size: int = 100, store=None):
        self._max_buffer_size = max_buffer_size
        self._buffer: Deque[TelemetryEvent] = deque(maxlen=max_buffer_size)
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()
        self._store = store

    @property
    def buffer_size(self) -> int:
        """Current number of events stored in the ring buffer."""
        return len(self._buffer)

    @property
    def subscriber_count(self) -> int:
        """Count of active SSE client connections."""
        return len(self._subscribers)

    async def publish(self, event: TelemetryEvent) -> None:
        """Publish a telemetry event into the buffer and broadcast to all subscribers."""
        if self._store:
            await asyncio.to_thread(self._store.append, event)
        async with self._lock:
            self._buffer.append(event)
            dead_subscribers = []
            for queue in self._subscribers:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    dead_subscribers.append(queue)

            for dead in dead_subscribers:
                self._subscribers.discard(dead)

        logger.debug(
            "TelemetryEvent published: %s on node %s (broadcasting to %d subscribers)",
            event.event_id,
            event.node_id,
            len(self._subscribers),
        )

    def publish_sync(self, event: TelemetryEvent) -> None:
        """Synchronous wrapper for publishing an event into the hub."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.publish(event))
        except RuntimeError:
            # Fallback if called outside of an active asyncio event loop
            if self._store:
                self._store.append(event)
            self._buffer.append(event)

    def get_buffered_events(self) -> List[TelemetryEvent]:
        """Return a snapshot of all events currently in the buffer."""
        return list(self._buffer)

    def get_events_after(self, last_event_id: str) -> List[TelemetryEvent]:
        """Return all buffered events recorded chronologically after the given event_id."""
        if self._store:
            return self._store.history(after=last_event_id)
        events = list(self._buffer)
        if not last_event_id:
            return events

        # Search for the position of last_event_id
        target_index = -1
        for idx, evt in enumerate(events):
            if evt.event_id == last_event_id:
                target_index = idx
                break

        if target_index >= 0:
            return events[target_index + 1 :]

        # If last_event_id was purged or not found, return the full recent buffer
        return events

    def history(self, hours=None, limit=1000, node_id=None):
        if self._store:
            return self._store.history(hours=hours, limit=limit, node_id=node_id)
        from datetime import datetime, timedelta, timezone

        since = datetime.now(timezone.utc) - timedelta(hours=hours) if hours is not None else None
        return [event for event in self._buffer if (not since or event.timestamp >= since)
                and (not node_id or event.node_id == node_id)][-limit:]

    def clear(self) -> None:
        """Clear the event buffer and discard active references."""
        self._buffer.clear()

    async def subscribe(
        self,
        last_event_id: Optional[str] = None,
        heartbeat_interval: float = 15.0,
        max_events: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """Yield an async stream of SSE-formatted strings for a connected client.

        Args:
            last_event_id: If specified, replays buffered events that occurred after this ID.
            heartbeat_interval: Seconds between keep-alive SSE comment pings.
            max_events: Optional upper limit of events to yield before closing the stream.
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=200)

        async with self._lock:
            self._subscribers.add(queue)

        yielded_count = 0
        try:
            # 1. Replay missed events from buffer if Last-Event-ID was supplied or present
            if last_event_id:
                missed_events = self.get_events_after(last_event_id)
                for missed in missed_events:
                    yield missed.to_sse_format()
                    yielded_count += 1
                    if max_events is not None and yielded_count >= max_events:
                        return

            # 2. Stream new live events with keep-alive heartbeat
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=heartbeat_interval)
                    yield event.to_sse_format()
                    yielded_count += 1
                    if max_events is not None and yielded_count >= max_events:
                        return
                except asyncio.TimeoutError:
                    # SSE comment keep-alive format
                    yield ": ping\n\n"
        finally:
            async with self._lock:
                self._subscribers.discard(queue)
            logger.debug("Subscriber disconnected. Active subscribers: %d", len(self._subscribers))


# Global singleton instance
_hub_instance: Optional[TelemetryHub] = None


def get_telemetry_hub() -> TelemetryHub:
    """Return the global TelemetryHub singleton."""
    global _hub_instance
    if _hub_instance is None:
        db_url = os.getenv("DATABASE_URL")
        store = None
        if db_url:
            from src.core.telemetry.store import TelemetryEventStore

            store = TelemetryEventStore(db_url)
        _hub_instance = TelemetryHub(max_buffer_size=100, store=store)
    return _hub_instance


def reset_telemetry_hub() -> None:
    """Reset the global TelemetryHub singleton (useful for test isolation)."""
    global _hub_instance
    if _hub_instance is not None:
        _hub_instance.clear()
    _hub_instance = None
