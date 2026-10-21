-- ==============================================================================
-- Midas - Semilla de Base de Datos Operacional: Sesiones Conversacionales
-- Base de datos: midas_operational
-- Historia de Usuario: HU-BACK-03 (ADR-010)
-- Autor: Daniel Echeverría (Backend Lead)
-- ==============================================================================

\connect midas_operational;

-- 1. Tabla de Sesiones de Conversación (ChatGPT-Style Workspace)
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
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
