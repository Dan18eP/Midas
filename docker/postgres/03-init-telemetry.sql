-- Keep events across API restarts for replay and SSE reconnection.
\connect midas_operational;

CREATE TABLE IF NOT EXISTS pipeline_events (
    event_id BIGSERIAL PRIMARY KEY,
    stage VARCHAR(30) NOT NULL,
    node_id VARCHAR(150) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL,
    records_count INT DEFAULT 0,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_events_payload_id ON pipeline_events ((payload->>'event_id'));
CREATE INDEX IF NOT EXISTS pipeline_events_timestamp ON pipeline_events (created_at);
