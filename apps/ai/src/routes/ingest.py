from fastapi import APIRouter

router = APIRouter()


@router.post("/ingest")
async def ingest_documents():
    # Will be implemented in Sprint S7
    return {"status": "ok", "message": "Ingestion not yet implemented."}
