import os
import re
import uuid
from fastapi import UploadFile
from app.config.settings import UPLOAD_DIRECTORY


def sanitize_filename(filename: str) -> str:
    """Remove unsafe characters from a filename, keeping it readable."""
    # Keep only letters, numbers, dots, dashes, underscores
    filename = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    return filename


def generate_document_id() -> str:
    """Generate a unique ID for a document."""
    return str(uuid.uuid4())


def save_uploaded_file(file: UploadFile, document_id: str) -> str:
    """
    Save the uploaded file to disk using a unique, safe filename.
    Returns the full path where the file was saved.
    """
    safe_name = sanitize_filename(file.filename)
    stored_filename = f"{document_id}_{safe_name}"
    file_path = os.path.join(UPLOAD_DIRECTORY, stored_filename)

    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    return file_path