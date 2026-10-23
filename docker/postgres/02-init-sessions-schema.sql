-- ==============================================================================
-- Midas - Semilla de Base de Datos Operacional: Sesiones Conversacionales
-- Base de datos: midas_operational
-- Historia de Usuario: HU-BACK-03 (ADR-010)
-- Autor: Daniel Echeverría (Backend Lead)
-- ==============================================================================

\connect midas_operational;

-- 1. Tabla de Sesiones de Conversación (ChatGPT-Style Workspace con Topología Canvas)
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    topology_state JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Mensajes de Sesión Multi-Turno
CREATE TABLE IF NOT EXISTS session_messages (
    message_id VARCHAR(50) PRIMARY KEY,
    session_id VARCHAR(50) NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    sender VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices de Rendimiento para Búsqueda y Ordenamiento
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_messages_session_id ON session_messages(session_id);

-- 3. Tabla de Conexiones de Origen y Fuentes Multi-Origen (HU-LAKE-05 & HU-BACK-03)
CREATE TABLE IF NOT EXISTS source_connections (
    connection_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    config_payload JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_source_connections_status ON source_connections(status);

