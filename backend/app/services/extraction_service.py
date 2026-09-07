import os
import fitz  # PyMuPDF
import docx


class ExtractionError(Exception):
    """Raised when text cannot be extracted from a document."""
    pass


def extract_text_from_pdf(file_path: str) -> list[dict]:
    pages = []
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise ExtractionError(f"Could not open PDF file: {e}")

    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            text = page.get_text().strip()
            if text:
                pages.append({"page_number": page_index + 1, "text": text})
    finally:
        doc.close()

    if not pages:
        raise ExtractionError("No readable text found in this PDF. It may be empty, scanned, or image-only.")
    return pages


def extract_text_from_txt(file_path: str) -> list[dict]:
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read().strip()
    except Exception as e:
        raise ExtractionError(f"Could not read text file: {e}")

    if not text:
        raise ExtractionError("This text file appears to be empty.")

    # Plain text has no real page concept - treat the whole file as page 1
    return [{"page_number": 1, "text": text}]


def extract_text_from_docx(file_path: str) -> list[dict]:
    try:
        document = docx.Document(file_path)
    except Exception as e:
        raise ExtractionError(f"Could not open DOCX file: {e}")

    paragraphs = [p.text for p in document.paragraphs if p.text.strip()]
    text = "\n".join(paragraphs).strip()

    if not text:
        raise ExtractionError("No readable text found in this DOCX file.")

    # DOCX has no reliable page boundaries without a rendering engine -
    # treat the whole document as page 1, consistent with our TXT handling
    return [{"page_number": 1, "text": text}]


def extract_text(file_path: str, file_name: str) -> list[dict]:
    """Dispatches to the right extractor based on file extension."""
    ext = os.path.splitext(file_name)[1].lower()

    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext == ".txt":
        return extract_text_from_txt(file_path)
    elif ext == ".docx":
        return extract_text_from_docx(file_path)
    else:
        raise ExtractionError(f"Unsupported file type: {ext}")