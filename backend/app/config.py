"""Runtime configuration, sourced from environment variables."""
import os
from dataclasses import dataclass, field


def _origins() -> list[str]:
    raw = os.getenv(
        "ULTRA_PDF_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


def _origin_regex() -> str | None:
    """Optional regex for matching dynamic frontend origins.

    Cloudflare Pages gives every production/preview deploy a `*.pages.dev`
    subdomain, so a regex is more practical than listing exact origins. Set
    ULTRA_PDF_CORS_ORIGIN_REGEX to override; the default covers pages.dev.
    """
    return os.getenv(
        "ULTRA_PDF_CORS_ORIGIN_REGEX",
        r"https://.*\.pages\.dev",
    )


@dataclass(frozen=True)
class Settings:
    # Reject uploads larger than this (bytes). Default 100 MB.
    max_upload_bytes: int = int(os.getenv("ULTRA_PDF_MAX_UPLOAD", str(100 * 1024 * 1024)))
    cors_origins: list[str] = field(default_factory=_origins)
    cors_origin_regex: str | None = field(default_factory=_origin_regex)


settings = Settings()
