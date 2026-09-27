import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import settings, BASE_DIR, get_settings
from backend.database import (
    init_db,
    create_conversation,
    get_conversations,
    get_conversation,
    update_conversation_title,
    delete_conversation,
    clear_all_conversations,
    add_message,
    get_messages
)
from backend.models.schemas import (
    ConversationSchema,
    ConversationDetailSchema,
    CreateConversationRequest,
    UpdateConversationRequest,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    MessageSchema
)
from backend.services.llm_service import llm_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    init_db()
    yield

app = FastAPI(
    title="Llama Web Server",
    description="LAN-Accessible Llama AI Assistant with FastAPI, streaming responses, and persistent history",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for full cross-origin and cross-device local network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = BASE_DIR / "frontend"

# --- API Endpoints ---

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    status_info = await llm_service.get_status()
    current_settings = get_settings()
    return HealthResponse(
        status=status_info["status"],
        provider=status_info["provider"],
        model=status_info["model"],
        mode=status_info["mode"],
        llm_configured=status_info["llm_configured"],
        error=status_info.get("error"),
        server_host=current_settings.SERVER_HOST,
        server_port=current_settings.SERVER_PORT,
        server_bind_host=current_settings.SERVER_BIND_HOST,
        public_url=current_settings.public_url,
        llm_provider=status_info["provider"],
        llm_model=status_info["model"]
    )



@app.get("/api/conversations", response_model=List[ConversationSchema])
async def list_conversations():
    return get_conversations()

@app.post("/api/conversations", response_model=ConversationSchema, status_code=status.HTTP_201_CREATED)
async def new_conversation(payload: Optional[CreateConversationRequest] = None):
    title = payload.title if payload and payload.title else "New Chat"
    conv = create_conversation(title=title)
    return conv

@app.get("/api/conversations/{conv_id}", response_model=ConversationDetailSchema)
async def get_single_conversation(conv_id: str):
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = get_messages(conv_id)
    return {
        "id": conv["id"],
        "title": conv["title"],
        "created_at": conv["created_at"],
        "updated_at": conv["updated_at"],
        "messages": messages
    }

@app.patch("/api/conversations/{conv_id}", response_model=ConversationSchema)
async def rename_conversation(conv_id: str, payload: UpdateConversationRequest):
    updated = update_conversation_title(conv_id, payload.title.strip())
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return updated

@app.delete("/api/conversations/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_conversation(conv_id: str):
    deleted = delete_conversation(conv_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return None

@app.delete("/api/conversations", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_conversations():
    clear_all_conversations()
    return None

@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest):
    message_text = payload.message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # 1. Resolve or create conversation
    conv_id = payload.conversation_id
    is_new_conversation = False
    if not conv_id:
        # Title generated from first 35 chars of user message
        preview_title = (message_text[:35] + "...") if len(message_text) > 35 else message_text
        conv = create_conversation(title=preview_title)
        conv_id = conv["id"]
        is_new_conversation = True
    else:
        existing = get_conversation(conv_id)
        if not existing:
            # Re-create if not found
            preview_title = (message_text[:35] + "...") if len(message_text) > 35 else message_text
            conv = create_conversation(title=preview_title, custom_id=conv_id)
            is_new_conversation = True
        elif existing["title"] == "New Chat":
            # Auto-title if it was still generic
            preview_title = (message_text[:35] + "...") if len(message_text) > 35 else message_text
            update_conversation_title(conv_id, preview_title)

    # 2. Save user message to database
    user_msg = add_message(conversation_id=conv_id, role="user", content=message_text)

    # 3. Fetch prior history for context
    history = get_messages(conv_id)

    # 4. Stream response or full response
    if payload.stream:
        async def event_generator():
            full_response = []
            # Yield metadata header first
            yield f"data: {json.dumps({'event': 'start', 'conversation_id': conv_id, 'user_message': user_msg})}\n\n"

            async for chunk in llm_service.generate_response_stream(history[:-1], message_text):
                full_response.append(chunk)
                yield f"data: {json.dumps({'event': 'token', 'chunk': chunk})}\n\n"

            # Save assistant message to database
            final_content = "".join(full_response)
            ai_msg = add_message(conversation_id=conv_id, role="assistant", content=final_content)

            # Yield done event
            yield f"data: {json.dumps({'event': 'done', 'conversation_id': conv_id, 'ai_message': ai_msg})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    else:
        ai_content = await llm_service.generate_response(history[:-1], message_text)
        ai_msg = add_message(conversation_id=conv_id, role="assistant", content=ai_content)
        return ChatResponse(
            conversation_id=conv_id,
            user_message=user_msg,
            ai_message=ai_msg
        )

# --- Static Frontend Serving ---
# Mount static assets (css, js)
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/")
async def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "Frontend not found, please check frontend/index.html"}
