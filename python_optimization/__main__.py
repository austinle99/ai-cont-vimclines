"""Entrypoint for running the RAG FastAPI service with uvicorn."""
import os

import uvicorn


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("python_optimization.rag_service:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()

