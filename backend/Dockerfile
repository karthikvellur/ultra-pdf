# Ultra PDF backend — container image for free hosting (Hugging Face Spaces).
#
# HF Spaces (Docker SDK) runs the container as a non-root user and expects the
# app to listen on port 7860. This image installs the native tools the heavy
# PDF operations depend on, then the Python deps, then launches uvicorn.
FROM python:3.12-slim

# System tools the backend shells out to:
#   ghostscript → compression        qpdf (via pikepdf wheel, but keep CLI too)
#   tesseract-ocr → OCR              poppler-utils → pdf2image (pdftoppm)
# ocrmypdf also needs unpaper/pngquant optionally; the core set below is enough.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    tesseract-ocr \
    qpdf \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user (HF Spaces requirement + good practice).
RUN useradd -m -u 1000 appuser
ENV HOME=/home/appuser \
    PATH=/home/appuser/.local/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python deps first for better layer caching.
COPY --chown=appuser:appuser requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy the application code.
COPY --chown=appuser:appuser app ./app

USER appuser

# HF Spaces expects 7860; PORT is also honored for other platforms.
ENV PORT=7860
EXPOSE 7860

# Shell form so ${PORT} expands.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
