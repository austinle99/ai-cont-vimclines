"""RAG service implementation exposing embedding, query, and chat endpoints."""
from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Any, Dict, List, Optional

import faiss  # type: ignore
import numpy as np
import torch
from bitsandbytes import BitsAndBytesConfig  # type: ignore
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from transformers import AutoModelForCausalLM, AutoTokenizer

try:
    from peft import PeftModel
except ImportError:  # pragma: no cover - peft is optional at runtime
    PeftModel = None  # type: ignore

try:
    import psycopg
    from psycopg.types.json import Json
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore
    Json = None  # type: ignore


LOGGER = logging.getLogger("rag_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

DEFAULT_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "meta-llama/Meta-Llama-3-8B-Instruct")
DEFAULT_EMBED_MODEL = os.getenv("EMBED_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
DEFAULT_NAMESPACE = "default"


def get_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


class NamespaceIndex:
    """Simple FAISS index wrapper scoped to a namespace."""

    def __init__(self, dimension: int) -> None:
        self.dimension = dimension
        self.index = faiss.IndexFlatIP(dimension)
        self.documents: List[str] = []
        self.metadatas: List[Dict[str, Any]] = []

    def add_vectors(self, vectors: np.ndarray, documents: List[str], metadatas: List[Dict[str, Any]]) -> None:
        if vectors.size == 0:
            return
        if vectors.shape[1] != self.dimension:
            raise ValueError("Embedding dimension mismatch for namespace index")
        faiss.normalize_L2(vectors)
        self.index.add(vectors)
        self.documents.extend(documents)
        self.metadatas.extend(metadatas)

    def search(self, vector: np.ndarray, top_k: int) -> List[Dict[str, Any]]:
        if self.index.ntotal == 0:
            return []
        faiss.normalize_L2(vector)
        scores, indices = self.index.search(vector, top_k)
        results: List[Dict[str, Any]] = []
        for row_scores, row_indices in zip(scores, indices):
            for score, idx in zip(row_scores, row_indices):
                if idx < 0 or idx >= len(self.documents):
                    continue
                results.append(
                    {
                        "score": float(score),
                        "content": self.documents[idx],
                        "metadata": self.metadatas[idx],
                    }
                )
        return results


class RAGEngine:
    """Encapsulates the embedding model, FAISS index, and language model."""

    def __init__(self) -> None:
        self.device = get_device()
        self.embedder = SentenceTransformer(DEFAULT_EMBED_MODEL, device=self.device)
        self.embedder.max_seq_length = int(os.getenv("EMBED_MAX_LENGTH", self.embedder.max_seq_length))
        self.embedding_dimension = self.embedder.get_sentence_embedding_dimension()
        self.namespaces: Dict[str, NamespaceIndex] = {}
        self.model, self.tokenizer = self._load_model()
        self.pg_conn = self._init_postgres()
        if self.pg_conn is not None:
            self._ensure_tables()
            self._hydrate_from_storage()

    def _load_model(self):
        model_name = DEFAULT_MODEL_NAME
        LOGGER.info("Loading base model %s on %s", model_name, self.device)
        compute_dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float16
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=compute_dtype,
        )
        tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            device_map="auto",
            quantization_config=quant_config,
            torch_dtype=compute_dtype,
        )
        lora_path = os.getenv("LORA_WEIGHTS")
        if lora_path and PeftModel is not None:
            LOGGER.info("Applying LoRA adapters from %s", lora_path)
            model = PeftModel.from_pretrained(model, lora_path)
        model.eval()
        return model, tokenizer

    def _init_postgres(self):
        if psycopg is None:
            LOGGER.warning("psycopg is not installed; PostgreSQL persistence disabled")
            return None
        dsn = os.getenv("POSTGRES_DSN")
        if not dsn:
            host = os.getenv("POSTGRES_HOST", "postgres")
            port = os.getenv("POSTGRES_PORT", "5432")
            user = os.getenv("POSTGRES_USER", "postgres")
            password = os.getenv("POSTGRES_PASSWORD", "postgres")
            dbname = os.getenv("POSTGRES_DB", "ai_cont_db")
            dsn = f"dbname={dbname} user={user} password={password} host={host} port={port}"
        try:
            conn = psycopg.connect(dsn, autocommit=True)
            LOGGER.info("Connected to PostgreSQL for RAG persistence")
            return conn
        except Exception as exc:  # pragma: no cover
            LOGGER.warning("Failed to connect to PostgreSQL: %s", exc)
            return None

    def _ensure_tables(self) -> None:
        if self.pg_conn is None:
            return
        with self.pg_conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS rag_documents (
                    id SERIAL PRIMARY KEY,
                    namespace TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata JSONB,
                    embedding JSONB NOT NULL
                )
                """
            )

    def _hydrate_from_storage(self) -> None:
        if self.pg_conn is None:
            return
        with self.pg_conn.cursor() as cur:
            cur.execute("SELECT namespace, content, metadata, embedding FROM rag_documents")
            rows = cur.fetchall()
        namespace_groups: Dict[str, List[Dict[str, Any]]] = {}
        for namespace, content, metadata, embedding in rows:
            namespace_groups.setdefault(namespace, []).append(
                {
                    "content": content,
                    "metadata": metadata or {},
                    "embedding": np.array(json.loads(embedding), dtype=np.float32),
                }
            )
        for namespace, docs in namespace_groups.items():
            vectors = np.vstack([doc["embedding"] for doc in docs]).astype(np.float32)
            texts = [doc["content"] for doc in docs]
            metas = [doc["metadata"] for doc in docs]
            self._get_namespace_index(namespace).add_vectors(vectors, texts, metas)
        if namespace_groups:
            LOGGER.info("Hydrated %s namespaces from PostgreSQL", len(namespace_groups))

    def _get_namespace_index(self, namespace: str) -> NamespaceIndex:
        if namespace not in self.namespaces:
            self.namespaces[namespace] = NamespaceIndex(self.embedding_dimension)
        return self.namespaces[namespace]

    def embed_texts(self, texts: List[str]) -> np.ndarray:
        embeddings = self.embedder.encode(texts, convert_to_numpy=True, batch_size=int(os.getenv("EMBED_BATCH_SIZE", 8)))
        return embeddings.astype(np.float32)

    def add_texts(
        self,
        texts: List[str],
        namespace: str = DEFAULT_NAMESPACE,
        metadatas: Optional[List[Dict[str, Any]]] = None,
        persist: bool = False,
    ) -> np.ndarray:
        if not texts:
            raise ValueError("No texts provided for embedding")
        vectors = self.embed_texts(texts)
        namespace_index = self._get_namespace_index(namespace)
        if metadatas is None:
            metadatas = [{} for _ in texts]
        namespace_index.add_vectors(vectors, texts, metadatas)
        if persist and self.pg_conn is not None and Json is not None:
            with self.pg_conn.cursor() as cur:
                for text, metadata, vector in zip(texts, metadatas, vectors):
                    cur.execute(
                        "INSERT INTO rag_documents (namespace, content, metadata, embedding) VALUES (%s, %s, %s, %s)",
                        (namespace, text, Json(metadata or {}), json.dumps(vector.tolist())),
                    )
        return vectors

    def similarity_search(self, query: str, namespace: str, top_k: int) -> List[Dict[str, Any]]:
        vector = self.embed_texts([query])
        namespace_index = self._get_namespace_index(namespace)
        return namespace_index.search(vector, top_k)

    def chat(self, question: str, namespace: str, top_k: int, history: List[Dict[str, str]]) -> str:
        context_docs = self.similarity_search(question, namespace, top_k)
        context_text = "\n".join([f"- {doc['content']}" for doc in context_docs]) or "No relevant documents found."
        history_text = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in history])
        prompt = self._build_prompt(question, context_text, history_text)
        inputs = self.tokenizer(prompt, return_tensors="pt", truncation=True, max_length=4096)
        inputs = {k: v.to(self.model.device) for k, v in inputs.items()}
        with torch.no_grad():
            output = self.model.generate(
                **inputs,
                max_new_tokens=int(os.getenv("MAX_NEW_TOKENS", 512)),
                temperature=float(os.getenv("GEN_TEMPERATURE", 0.2)),
                top_p=float(os.getenv("GEN_TOP_P", 0.9)),
                do_sample=True,
                pad_token_id=self.tokenizer.pad_token_id,
            )
        generated = output[0][inputs["input_ids"].shape[1]:]
        response = self.tokenizer.decode(generated, skip_special_tokens=True).strip()
        return response

    @staticmethod
    def _build_prompt(question: str, context: str, history: str) -> str:
        system_prompt = (
            "You are an expert assistant helping with container logistics. Use the provided context to answer the question. "
            "If the answer is not in the context, be honest about it and suggest next steps."
        )
        prompt_parts = [f"<|system|>\n{system_prompt}"]
        if history:
            prompt_parts.append(f"<|history|>\n{history}")
        prompt_parts.append(f"<|context|>\n{context}")
        prompt_parts.append(f"<|user|>\n{question}\n<|assistant|>")
        return "\n\n".join(prompt_parts)


class EmbedRequest(BaseModel):
    texts: List[str] = Field(..., description="Texts to embed")
    namespace: str = Field(DEFAULT_NAMESPACE, description="Namespace for indexing")
    metadatas: Optional[List[Dict[str, Any]]] = Field(None, description="Optional metadata for each text")
    persist: bool = Field(False, description="Persist embeddings to PostgreSQL if available")


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimension: int


class QueryRequest(BaseModel):
    query: str
    namespace: str = Field(DEFAULT_NAMESPACE)
    top_k: int = Field(5, ge=1, le=50)


class QueryResponse(BaseModel):
    results: List[Dict[str, Any]]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    namespace: str = Field(DEFAULT_NAMESPACE)
    top_k: int = Field(5, ge=1, le=20)
    history: List[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    context: List[Dict[str, Any]]


@lru_cache(maxsize=1)
def get_engine() -> RAGEngine:
    return RAGEngine()


def get_app() -> FastAPI:
    app = FastAPI(title="RAG Service", version="1.0.0")

    @app.on_event("startup")
    async def _startup_event() -> None:
        get_engine()
        LOGGER.info("RAG engine initialized")

    @app.post("/embed", response_model=EmbedResponse)
    async def embed_texts(payload: EmbedRequest, engine: RAGEngine = Depends(get_engine)):
        if payload.metadatas is not None and len(payload.metadatas) != len(payload.texts):
            raise HTTPException(status_code=400, detail="Number of metadatas must match number of texts")
        vectors = engine.add_texts(
            payload.texts,
            namespace=payload.namespace,
            metadatas=payload.metadatas,
            persist=payload.persist,
        )
        return EmbedResponse(embeddings=vectors.tolist(), dimension=vectors.shape[1])

    @app.post("/query", response_model=QueryResponse)
    async def query_similar(payload: QueryRequest, engine: RAGEngine = Depends(get_engine)):
        results = engine.similarity_search(payload.query, payload.namespace, payload.top_k)
        return QueryResponse(results=results)

    @app.post("/chat", response_model=ChatResponse)
    async def chat(payload: ChatRequest, engine: RAGEngine = Depends(get_engine)):
        history_dicts = [message.model_dump() for message in payload.history]
        answer = engine.chat(payload.question, payload.namespace, payload.top_k, history_dicts)
        context = engine.similarity_search(payload.question, payload.namespace, payload.top_k)
        return ChatResponse(answer=answer, context=context)

    @app.get("/healthz")
    async def healthcheck() -> JSONResponse:
        engine = get_engine()
        return JSONResponse(
            {
                "status": "ok",
                "device": engine.device,
                "model": DEFAULT_MODEL_NAME,
                "embed_model": DEFAULT_EMBED_MODEL,
            }
        )

    return app


app = get_app()

