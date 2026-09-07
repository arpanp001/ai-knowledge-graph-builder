from typing import Literal, List
from pydantic import BaseModel

# Controlled vocabulary - Gemini must pick one of these, it cannot invent new ones.
# This keeps the graph consistent instead of having a slightly different
# relationship label for every sentence in the document.
RelationType = Literal[
    "USES",
    "USED_FOR",
    "PART_OF",
    "RELATED_TO",
    "IMPLEMENTS",
    "DEPENDS_ON",
    "CREATED_BY",
    "TYPE_OF",
    "CONTAINS",
    "SUPPORTS",
]


class Relationship(BaseModel):
    source: str
    relation: RelationType
    target: str


class RelationshipExtractionResult(BaseModel):
    relationships: List[Relationship]