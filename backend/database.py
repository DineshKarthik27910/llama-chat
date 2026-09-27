import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from backend.config import BASE_DIR

DB_DIR = BASE_DIR / "data"
DB_PATH = DB_DIR / "chat.db"

def get_db_connection() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db_connection()
    try:
        with conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
            ''')
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
                ON messages(conversation_id)
            ''')
    finally:
        conn.close()


def create_conversation(title: str = "New Chat", custom_id: Optional[str] = None) -> Dict[str, Any]:
    conv_id = custom_id or str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (conv_id, title, now, now)
            )
        return {"id": conv_id, "title": title, "created_at": now, "updated_at": now}
    finally:
        conn.close()

def get_conversations() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC"
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def get_conversation(conv_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
            (conv_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def update_conversation_title(conv_id: str, title: str) -> Optional[Dict[str, Any]]:
    now = datetime.utcnow().isoformat()
    conn = get_db_connection()
    try:
        with conn:
            cursor = conn.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title, now, conv_id)
            )
            if cursor.rowcount == 0:
                return None
        return get_conversation(conv_id)
    finally:
        conn.close()

def touch_conversation(conv_id: str) -> None:
    now = datetime.utcnow().isoformat()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conv_id)
            )
    finally:
        conn.close()

def delete_conversation(conv_id: str) -> bool:
    conn = get_db_connection()
    try:
        with conn:
            cursor = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
            return cursor.rowcount > 0
    finally:
        conn.close()

def clear_all_conversations() -> bool:
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("DELETE FROM messages")
            conn.execute("DELETE FROM conversations")
        return True
    finally:
        conn.close()

def add_message(conversation_id: str, role: str, content: str) -> Dict[str, Any]:
    msg_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (msg_id, conversation_id, role, content, now)
            )
        touch_conversation(conversation_id)
        return {
            "id": msg_id,
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "created_at": now
        }
    finally:
        conn.close()

def get_messages(conversation_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            "SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            (conversation_id,)
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()
