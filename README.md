# 🧠 AI Knowledge Graph Builder

**Turn any document into an explorable knowledge graph — and chat with it.**

Upload a PDF, TXT, or DOCX file. Watch it automatically transform into an interactive knowledge graph of entities and relationships. Ask questions and get grounded, source-cited answers powered by a hybrid Graph + Vector RAG pipeline.

🔗 **[Live Demo](https://ai-knowledge-graph-builder.vercel.app)** &nbsp;|&nbsp; 🎥 *Demo video coming soon*

> ⚠️ **Free-tier hosting note:** this demo runs on free hosting tiers. The backend may take **30–60 seconds to wake up** on first load if it's been idle, and project/document metadata (SQLite) may reset on backend restarts — your Neo4j graph data and Gemini/embedding caches persist regardless. See [Deployment Notes](#-deployment-notes--known-limitations) below.

---

## ✨ What makes this different

Most "chat with your PDF" tools only do vector search — they find text that *sounds* similar to your question but miss how concepts actually connect. This project combines **two retrieval systems**:

| | Vector Search (ChromaDB) | Graph Search (Neo4j) |
|---|---|---|
| Good at | "What text is semantically similar to this?" | "What is this connected to, and how?" |
| Weak at | Structural/relational questions | Free-form natural language |

By combining both — and adding **multi-hop graph traversal** so the AI can reason across indirect connections (`Python → USED_FOR → Machine Learning → PART_OF → Artificial Intelligence`) — answers are grounded in *both* what the document says and how its concepts relate to each other.

Ask a question, get an answer, then click **"Show reasoning in graph"** and watch the exact chain of logic light up on the graph in real time.

---

## 🚀 Features

**Document Processing**
- Upload PDF, TXT, or DOCX — single or multiple files at once
- Background/async processing — uploads return instantly, extraction runs behind the scenes
- Automatic entity & relationship extraction via Gemini, with structured-output validation (never trusts raw AI output blindly)
- Cross-chunk relationship detection — connects concepts that never appear in the same paragraph
- Embedding-based entity resolution — merges near-duplicate concepts (e.g. "ML" and "Machine Learning") automatically

**Knowledge Graph**
- Interactive, force-directed graph visualization (React Flow)
- Hover-to-focus exploration, drag-to-rearrange, fullscreen mode
- **Click-to-expand "Explore Mode"** — start from key entities and reveal connections on demand
- **Node clustering** via client-side community detection (label propagation)
- **Confidence-based edge styling** — thicker lines = relationships confirmed more often in the source text
- **Animated "build" playback** — watch the graph construct itself, node by node
- Filter by entity type or by source document
- Shortest-path finder between any two entities
- Side-by-side entity comparison (shared/unique connections)
- Export the graph as a PNG image

**Hybrid RAG Chat**
- Grounded, source-cited answers — strictly no hallucination beyond the retrieved context
- Multi-hop reasoning chains surfaced directly in chat, with one-click graph visualization
- Multi-turn conversational memory
- Persistent chat history per project
- Export conversations as Markdown or PDF

**Platform**
- Full authentication (JWT, bcrypt password hashing)
- Multi-project support with complete data isolation (SQLite + Neo4j + ChromaDB, all scoped per project)
- Response caching for Gemini calls — re-processing identical content skips redundant API calls
- Dark mode, command palette (`⌘K`), onboarding tour, toast notifications
- Fully responsive layout

---

## 🏗️ Architecture

```text
React (Vite + Tailwind + React Flow)
         │  Axios (JWT auth)
         ▼
FastAPI Backend
         │
         ├── Document Processing (PyMuPDF / python-docx)
         │        └── Chunking
         │
         ├── Gemini API
         │        ├── Entity extraction (structured output + Pydantic validation)
         │        ├── Relationship extraction (per-chunk + cross-chunk)
         │        └── Grounded question answering
         │
         ├── Neo4j (Graph DB)
         │        └── Entities, relationships, multi-hop path queries
         │
         ├── ChromaDB (Vector DB)
         │        └── Sentence-Transformer embeddings, semantic search
         │
         └── SQLite
                  └── Users, projects, documents, chat history
```

**Hybrid RAG pipeline:**

```text
User question
     │
     ├──► Vector search (ChromaDB)        ─┐
     ├──► Entity mention detection          │
     │        └──► Graph search (Neo4j)     ├──► Combined context ──► Gemini ──► Grounded answer + sources
     └──► Multi-hop reasoning chain         │
              (Neo4j shortest path)        ─┘
```

---

## 🛠️ Tech Stack

**Backend:** Python · FastAPI · Pydantic · Neo4j · ChromaDB · Gemini API · Sentence Transformers · PyMuPDF · python-docx · SQLite · JWT · bcrypt

**Frontend:** React · Vite · Tailwind CSS · React Flow · d3-force · Axios · lucide-react

**Infrastructure:** Neo4j Aura (graph DB hosting) · Render (backend hosting) · Vercel (frontend hosting)

---

## 📸 Screenshots

> *Add screenshots or a short GIF here — e.g. the graph view, the chat interface, and the "show reasoning" feature in action.*

---

## 📦 Getting Started (Run Locally)

### Prerequisites

Make sure you have the following installed:

| Requirement | Notes |
|---|---|
| [Python 3.11](https://www.python.org/downloads/) | 3.11 recommended for best dependency compatibility |
| [Node.js 18+](https://nodejs.org/) | Includes npm |
| [Git](https://git-scm.com/) | To clone the repo |
| A [Neo4j Aura](https://neo4j.com/product/auradb/) free instance | Cloud-hosted graph database (no local install needed) |
| A [Gemini API key](https://aistudio.google.com/apikey) | Free tier available from Google AI Studio |

### 1. Clone the repository

```bash
git clone https://github.com/arpanp001/ai-knowledge-graph-builder.git
cd <your-repo-name>
```

### 2. Backend setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file inside `backend/` (copy from `.env.example`):

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-flash-lite-latest

NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_password

CHROMA_PATH=chroma_data
EMBEDDING_MODEL=all-MiniLM-L6-v2

JWT_SECRET_KEY=generate_a_long_random_string
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
```

> Generate a secure `JWT_SECRET_KEY` with:
> ```bash
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

Run the backend:

```bash
uvicorn app.main:app --reload
```

The API will be live at `http://127.0.0.1:8000` — check `http://127.0.0.1:8000/docs` for interactive API documentation.

### 3. Frontend setup

In a **new terminal**:

```bash
cd frontend
npm install
```

Create a `.env` file inside `frontend/`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Run the frontend:

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

### 4. You're ready

Register an account, create a project, upload a document, and explore the graph.

---

## 🧪 Running Tests

```bash
cd backend
pytest -v
```

Covers file validation, chunking logic, entity/relationship normalization, password hashing & JWT security, the RAG anti-hallucination guarantee, and the full authentication + project-isolation API flow.

---

## 📁 Project Structure

```text
ai-knowledge-graph-builder/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI route handlers (thin, no business logic)
│   │   ├── services/         # Core business logic (extraction, RAG, auth, etc.)
│   │   ├── repositories/     # Database queries (Neo4j Cypher, SQLite)
│   │   ├── database/         # Connection management (Neo4j, SQLite, ChromaDB)
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── prompts/          # Gemini prompt templates
│   │   └── utils/            # Validators, hashing, retry logic, etc.
│   ├── tests/
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── components/        # React components
        ├── services/          # API client functions
        ├── hooks/             # Custom React hooks
        └── utils/             # Graph layout, export helpers, etc.
```

---

## 🌐 Deployment Notes & Known Limitations

This project is deployed entirely on **free hosting tiers** to keep the live demo accessible at no cost:

- **Backend (Render, free tier):** spins down after 15 minutes of inactivity; the first request afterward takes 30–60 seconds to wake up. No persistent disk, so SQLite (`users`, `projects`, `documents`, `chat_messages`) resets on redeploy or restart.
- **Neo4j (Aura free tier):** may pause after extended inactivity — resume it from the Aura console if the demo shows a connection error.
- **ChromaDB:** stored on the same non-persistent disk as SQLite, so embeddings also reset on backend restart.

None of this affects local development — running everything on your own machine (per the setup instructions above) gives you full persistence.

---

## 🗺️ Roadmap

- [ ] Persistent hosting tier for full data durability
- [ ] Reasoning-path persistence across chat history
- [ ] Neo4j Graph Data Science–based clustering (currently client-side label propagation)
- [ ] Real-time collaborative graph exploration

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙋 About

Built as a full-stack AI/knowledge-graph portfolio project, combining graph databases, vector search, and LLM-powered extraction into a single cohesive Hybrid RAG system.

Feedback, issues, and pull requests are welcome.
