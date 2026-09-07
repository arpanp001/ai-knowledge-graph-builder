from typing import Literal, List
from pydantic import BaseModel

# Controlled set of entity types - keeps the graph consistent instead of
# letting Gemini invent a new category for every document
EntityType = Literal[
    "Person",
    "Organization",
    "Technology",
    "Concept",
    "Algorithm",
    "Programming Language",
    "Database",
    "Framework",
    "Method",
    "Product",
    "Location",
    "Dataset",
    "Model",
    "Other",
]


class Entity(BaseModel):
    name: str
    type: EntityType


class EntityExtractionResult(BaseModel):
    entities: List[Entity]