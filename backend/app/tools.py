"""Detects which underlying CLI tools are available at runtime.

Used by /api/health so the frontend can disable server-backed tools whose
binaries are missing, rather than failing mid-operation.
"""
import shutil
from dataclasses import dataclass


@dataclass(frozen=True)
class ToolRuntime:
    def probe(self) -> dict[str, bool]:
        return {
            "ghostscript": self._has("gs"),
            "qpdf": self._has("qpdf"),
            "tesseract": self._has("tesseract"),
            "poppler": self._has("pdftoppm"),
        }

    @staticmethod
    def _has(binary: str) -> bool:
        return shutil.which(binary) is not None


tool_runtime = ToolRuntime()
