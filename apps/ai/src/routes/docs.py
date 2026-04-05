from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class GenerateDocsRequest(BaseModel):
    workflow_id: str
    workflow_name: str
    definition: dict


class GenerateDocsResponse(BaseModel):
    workflow_id: str
    documentation: str


@router.post("/generate-docs", response_model=GenerateDocsResponse)
async def generate_docs(request: GenerateDocsRequest):
    # Will be implemented in Sprint S7
    return GenerateDocsResponse(
        workflow_id=request.workflow_id,
        documentation=f"Documentation for '{request.workflow_name}' — not yet implemented.",
    )
