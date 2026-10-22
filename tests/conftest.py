"""Configuración global de la suite de pruebas de Midas.

Aísla el almacén de sesiones del PostgreSQL operativo real. Sin esta protección,
cada ejecución de las pruebas de API escribía sesiones de ejemplo (por ejemplo
"Sesión Canvas Dinámico" o "Sesión Copiloto Test") en `midas_operational`, por lo
que terminaban apareciendo en el "Historial de Sesiones" de la aplicación.
"""

import pytest

from src.core.session.store import get_session_store


@pytest.fixture(autouse=True, scope="session")
def disable_operational_session_persistence():
    """Fuerza el almacén de sesiones a operar solo en memoria durante las pruebas."""
    store = get_session_store()
    store.db_url = None
    store._engine = None
    store._postgres_available = False
    yield
