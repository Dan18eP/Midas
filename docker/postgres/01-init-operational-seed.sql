-- ==============================================================================
-- Midas - Semilla de Base de Datos Operacional (PostgreSQL)
-- Base de datos: midas_operational
-- Especificación: documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md
-- Autor: Daniel Echeverría (Backend Lead)
-- ==============================================================================

\connect midas_operational;

-- 1. Tabla de Clientes (con campos PII para probar Escudo de Atlas/Ranger)
CREATE TABLE IF NOT EXISTS clientes (
    id_cliente VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email_contacto VARCHAR(150) NOT NULL,
    telefono VARCHAR(50),
    ciudad VARCHAR(100) NOT NULL,
    region VARCHAR(50) NOT NULL,
    categoria_segmento VARCHAR(50) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Pedidos Operacionales
CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido VARCHAR(50) PRIMARY KEY,
    id_cliente VARCHAR(50) NOT NULL REFERENCES clientes(id_cliente),
    fecha_pedido DATE NOT NULL,
    canal_venta VARCHAR(50) NOT NULL,
    estado_pedido VARCHAR(50) NOT NULL,
    total_bruto NUMERIC(14, 2) NOT NULL,
    total_descuento NUMERIC(14, 2) DEFAULT 0.00,
    total_neto NUMERIC(14, 2) NOT NULL,
    moneda VARCHAR(10) DEFAULT 'COP',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Detalle de Órdenes
CREATE TABLE IF NOT EXISTS ordenes_detalle (
    id_detalle VARCHAR(50) PRIMARY KEY,
    id_pedido VARCHAR(50) NOT NULL REFERENCES pedidos(id_pedido),
    id_producto VARCHAR(50) NOT NULL,
    nombre_producto VARCHAR(150) NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario NUMERIC(14, 2) NOT NULL,
    descuento_aplicado NUMERIC(14, 2) DEFAULT 0.00,
    subtotal NUMERIC(14, 2) NOT NULL
);

-- Inserción de Datos Iniciales de Prueba
INSERT INTO clientes (id_cliente, nombre, email_contacto, telefono, ciudad, region, categoria_segmento) VALUES
('CLI-001', 'Carlos Mendoza', 'carlos.mendoza@empresa.com', '+57 300 123 4567', 'Bogotá', 'ANDINA', 'CORPORATIVO'),
('CLI-002', 'Laura Gómez', 'laura.gomez@tech.co', '+57 311 987 6543', 'Medellín', 'ANTIOQUIA', 'PYME'),
('CLI-003', 'Andrés Pastrana', 'andres.p@comercio.io', '+57 320 555 1122', 'Cali', 'PACIFICO', 'RETAIL'),
('CLI-004', 'Mariana Silva', 'mariana.silva@innovar.com', '+57 315 444 3322', 'Barranquilla', 'CARIBE', 'CORPORATIVO'),
('CLI-005', 'Julián Restrepo', 'julian.r@global.co', '+57 310 777 8899', 'Bucaramanga', 'SANTANDERES', 'PYME')
ON CONFLICT (id_cliente) DO NOTHING;

INSERT INTO pedidos (id_pedido, id_cliente, fecha_pedido, canal_venta, estado_pedido, total_bruto, total_descuento, total_neto) VALUES
('ORD-1001', 'CLI-001', '2026-10-15', 'ONLINE_WEB', 'COMPLETADO', 1500000.00, 150000.00, 1350000.00),
('ORD-1002', 'CLI-002', '2026-10-15', 'DIRECTO_ASESOR', 'COMPLETADO', 2800000.00, 280000.00, 2520000.00),
('ORD-1003', 'CLI-003', '2026-10-16', 'ONLINE_APP', 'COMPLETADO', 850000.00, 0.00, 850000.00),
('ORD-1004', 'CLI-004', '2026-10-16', 'B2B_PORTAL', 'COMPLETADO', 4200000.00, 420000.00, 3780000.00),
('ORD-1005', 'CLI-005', '2026-10-17', 'ONLINE_WEB', 'PENDIENTE', 1100000.00, 50000.00, 1050000.00)
ON CONFLICT (id_pedido) DO NOTHING;

INSERT INTO ordenes_detalle (id_detalle, id_pedido, id_producto, nombre_producto, cantidad, precio_unitario, descuento_aplicado, subtotal) VALUES
('DET-001', 'ORD-1001', 'PROD-A', 'Licencia Midas Enterprise Core', 1, 1500000.00, 150000.00, 1350000.00),
('DET-002', 'ORD-1002', 'PROD-B', 'Suscripción Data Fabric Anual', 2, 1400000.00, 280000.00, 2520000.00),
('DET-003', 'ORD-1003', 'PROD-C', 'Módulo Copiloto Agéntico', 1, 850000.00, 0.00, 850000.00),
('DET-004', 'ORD-1004', 'PROD-A', 'Licencia Midas Enterprise Core', 3, 1400000.00, 420000.00, 3780000.00),
('DET-005', 'ORD-1005', 'PROD-C', 'Módulo Copiloto Agéntico', 1, 1100000.00, 50000.00, 1050000.00)
ON CONFLICT (id_detalle) DO NOTHING;
