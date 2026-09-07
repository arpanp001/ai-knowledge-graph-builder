from typing import List, Optional
from pydantic import BaseModel


class ChatRequest(BaseModel):
    question: str


class SourceChunk(BaseModel):
    file_name: str
    page_number: Optional[int] = None
    chunk_id: Optional[str] = None
    similarity_score: Optional[float] = None


class ReasoningPathNode(BaseModel):
    key: str
    name: str
    type: str


class ReasoningPath(BaseModel):
    nodes: List[ReasoningPathNode]
    relations: List[str]


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceChunk]
    graph_entities_used: List[str]
    reasoning_path: Optional[ReasoningPath] = None