from pydantic import BaseModel


class DocumentResponse(BaseModel):
    document_id: str
    file_name: str
    status: str
    message: str