"""
Midas Lakehouse Ingestion - Excel Spreadsheet Connector
Historia de Usuario: HU-LAKE-02 (Universal Ingestion Multi-Fuente)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
"""

import io
import logging
import re
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    import openpyxl
except ImportError:
    openpyxl = None

from src.lakehouse.ingestion.fingerprint import (
    compute_schema_fingerprint,
    create_bronze_envelope,
)

logger = logging.getLogger("midas.lakehouse.ingestion.excel")


class ExcelSourceConnector:
    """
    Parser robusto para archivos de hoja de cálculo Excel (.xlsx / .xlsm).
    Soporta:
    - Auto-detección inteligente de filas de cabecera (incluso con banners de título en filas 1 a 5).
    - Ingesta multi-pestaña (ej. Presupuesto_Metas, Costos_Operativos).
    - Normalización de nombres de columnas a snake_case sin caracteres disruptivos.
    - Manejo de celdas combinadas y valores nulos/vacíos.
    - Envoltura canónica automática en el formato Bronze de Midas.
    """

    def __init__(
        self,
        file_source: Union[str, bytes, io.BytesIO],
        source_name: str = "Presupuesto_Corporativo_2026.xlsx",
        max_header_scan_rows: int = 10,
    ):
        """
        :param file_source: Ruta en disco (.xlsx), bytes crudos, o BytesIO.
        :param source_name: Nombre lógico o archivo de origen para auditoría.
        :param max_header_scan_rows: Número máximo de filas iniciales a inspeccionar para detectar cabeceras.
        """
        if openpyxl is None:
            raise RuntimeError("La librería 'openpyxl' no está instalada en el entorno.")

        self.source_name = source_name
        self.max_header_scan_rows = max_header_scan_rows

        if isinstance(file_source, str):
            self.file_path = file_source
            self._bytes_stream = None
        elif isinstance(file_source, bytes):
            self.file_path = None
            self._bytes_stream = io.BytesIO(file_source)
        elif isinstance(file_source, io.BytesIO):
            self.file_path = None
            self._bytes_stream = file_source
        else:
            raise ValueError("file_source debe ser str, bytes o io.BytesIO")

    def _load_workbook(self) -> openpyxl.Workbook:
        """Carga el workbook en modo data_only para obtener valores calculados de fórmulas."""
        if self.file_path:
            return openpyxl.load_workbook(self.file_path, data_only=True, read_only=False)
        else:
            self._bytes_stream.seek(0)
            return openpyxl.load_workbook(self._bytes_stream, data_only=True, read_only=False)

    def get_sheet_names(self) -> List[str]:
        """Retorna los nombres de todas las hojas existentes en el libro Excel."""
        wb = self._load_workbook()
        try:
            return wb.sheetnames
        finally:
            wb.close()

    @property
    def sheet_names(self) -> List[str]:
        """Propiedad de conveniencia para acceder a los nombres de las hojas."""
        return self.get_sheet_names()

    def _normalize_header(self, raw_header: Any, index: int) -> str:
        """Normaliza una cadena de cabecera a snake_case seguro."""
        if raw_header is None or str(raw_header).strip() == "":
            return f"col_{index}"
        
        cleaned = str(raw_header).strip().lower()
        cleaned = re.sub(r"[^\w\s]", "", cleaned)  # Eliminar símbolos extraños
        cleaned = re.sub(r"\s+", "_", cleaned)     # Espacios a guión bajo
        return cleaned or f"col_{index}"

    def detect_header_row(self, sheet: openpyxl.worksheet.worksheet.Worksheet) -> Tuple[int, List[str]]:
        """
        Escanea las primeras N filas para identificar la fila de cabecera más probable.
        Criterio: Fila con mayor cantidad de celdas no nulas de tipo texto.
        Retorna (header_row_index_1_based, lista_de_columnas_normalizadas).
        """
        best_row_idx = 1
        best_headers: List[str] = []
        max_valid_cells = -1

        scan_limit = min(self.max_header_scan_rows, sheet.max_row)

        for row_idx in range(1, scan_limit + 1):
            row_values = [sheet.cell(row=row_idx, column=col_idx).value for col_idx in range(1, sheet.max_column + 1)]
            # Contar celdas con texto no vacío
            text_cells = [v for v in row_values if v is not None and str(v).strip() != ""]
            
            if len(text_cells) > max_valid_cells:
                max_valid_cells = len(text_cells)
                best_row_idx = row_idx
                # Construir nombres de cabecera únicos
                seen_counts: Dict[str, int] = {}
                headers = []
                for idx, val in enumerate(row_values, start=1):
                    norm = self._normalize_header(val, idx)
                    if norm in seen_counts:
                        seen_counts[norm] += 1
                        norm = f"{norm}_{seen_counts[norm]}"
                    else:
                        seen_counts[norm] = 1
                    headers.append(norm)
                best_headers = headers

        return best_row_idx, best_headers

    def extract_sheet(
        self,
        sheet_name: str,
        batch_id: str,
        header_row_override: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Extrae todos los registros de una hoja específica y los envuelve en el contrato Bronze.
        """
        wb = self._load_workbook()
        try:
            if sheet_name not in wb.sheetnames:
                raise ValueError(f"La hoja '{sheet_name}' no existe en el libro. Hojas disponibles: {wb.sheetnames}")

            sheet = wb[sheet_name]
            if sheet.max_row < 1:
                return []

            if header_row_override is not None:
                header_row_idx = header_row_override
                row_values = [sheet.cell(row=header_row_idx, column=col_idx).value for col_idx in range(1, sheet.max_column + 1)]
                headers = [self._normalize_header(v, idx) for idx, v in enumerate(row_values, start=1)]
            else:
                header_row_idx, headers = self.detect_header_row(sheet)

            # Cortar columnas finales completamente vacías
            non_empty_indices = [
                i for i, h in enumerate(headers) if not h.startswith("col_") or any(
                    sheet.cell(row=r, column=i+1).value is not None for r in range(header_row_idx + 1, sheet.max_row + 1)
                )
            ]
            if not non_empty_indices:
                return []

            active_headers = [headers[i] for i in non_empty_indices]
            fingerprint = compute_schema_fingerprint(active_headers)

            enveloped_records: List[Dict[str, Any]] = []

            for row_idx in range(header_row_idx + 1, sheet.max_row + 1):
                row_dict = {}
                is_all_empty = True
                for i in non_empty_indices:
                    col_name = headers[i]
                    cell_val = sheet.cell(row=row_idx, column=i + 1).value
                    if cell_val is not None and str(cell_val).strip() != "":
                        is_all_empty = False
                    row_dict[col_name] = cell_val

                # Omitir filas en blanco
                if not is_all_empty:
                    envelope = create_bronze_envelope(
                        record=row_dict,
                        source_type="EXCEL_SPREADSHEET",
                        source_origin=f"{self.source_name}#{sheet_name}",
                        batch_id=batch_id,
                        schema_fingerprint=fingerprint,
                    )
                    enveloped_records.append(envelope)

            logger.info(
                "Extraídos %d registros desde hoja '%s' (origen: %s, batch_id=%s)",
                len(enveloped_records),
                sheet_name,
                self.source_name,
                batch_id,
            )
            return enveloped_records
        finally:
            wb.close()

    def extract_all_sheets(self, batch_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Extrae todas las hojas del archivo Excel, retornando un diccionario {sheet_name: registros_bronze}.
        """
        sheets = self.get_sheet_names()
        results = {}
        for name in sheets:
            results[name] = self.extract_sheet(sheet_name=name, batch_id=batch_id)
        return results
