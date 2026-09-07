import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import documents, projects, auth
from app.database.neo4j import verify_connection, close_driver, GraphConnectionError
from app.database.sqlite import init_db
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Knowledge Graph Builder")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(projects.router)
app.include_router(auth.router)

@app.on_event("startup")
def on_startup():
    init_db()
    try:
        verify_connection()
    except GraphConnectionError as e:
        logger.warning(f"Neo4j connection issue at startup: {e}")


@app.on_event("shutdown")
def on_shutdown():
    close_driver()


@app.get("/")
def read_root():
    return {"message": "Backend is running"}