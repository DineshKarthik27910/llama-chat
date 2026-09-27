from pydantic import BaseModel, Field
from typing import List, Optional

class MessageSchema(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    created_at: str

class ConversationSchema(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str

class ConversationDetailSchema(ConversationSchema):
    messages: List[MessageSchema] = []

class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Chat"

class UpdateConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)

class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str = Field(..., min_length=1)
    stream: bool = True

class ChatResponse(BaseModel):
    conversation_id: str
    user_message: MessageSchema
    ai_message: MessageSchema

class HealthResponse(BaseModel):
    status: str
    provider: str
    model: str
    mode: str  # "local" | "live" | "mock" | "unavailable"
    llm_configured: bool
    server_host: str
    server_port: int
    server_bind_host: str
    public_url: str
    error: Optional[str] = None
    # Backward compatibility
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None


