import os
from fastapi import UploadFile
from app.config.settings import MAX_FILE_SIZE, ALLOWED_EXTENSIONS


class FileValidationError(Exception):
    """Raised when an uploaded file fails validation."""
    pass


def validate_file_extension(filename: str) -> None:
    """Check that the file has an allowed extension."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise FileValidationError(
            f"Unsupported file type '{ext}'. Only PDF files are supported right now."
        )


def validate_file_size(file: UploadFile) -> None:
    """Check that the file does not exceed the max allowed size."""
    # Move to the end of the file to measure its size, then reset the pointer
    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)

    if size == 0:
        raise FileValidationError("The uploaded file is empty.")

    if size > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE / (1024 * 1024)
        raise FileValidationError(f"File is too large. Maximum allowed size is {max_mb:.0f} MB.")