import json
import time
import socket
import urllib.request
import urllib.error
from backend.config import settings

BASE_URL = f"http://127.0.0.1:{settings.SERVER_PORT}"

def test_1_socket_listening():
    print("[1/6] Testing socket listener on bind host...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2.0)
    result = sock.connect_ex(("127.0.0.1", settings.SERVER_PORT))
    sock.close()
    if result == 0:
        print(f"  ? Port {settings.SERVER_PORT} is open and accepting connections.")
        return True
    else:
        print(f"  ? Port {settings.SERVER_PORT} is NOT accepting connections (code: {result}).")
        return False

def test_2_health_endpoint():
    print("[2/6] Testing GET /api/health...")
    url = f"{BASE_URL}/api/health"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=5) as res:
        data = json.loads(res.read().decode())
        print(f"  ? Response (HTTP {res.status}):", data)
        assert data.get("status") == "ok", "Health status must be 'ok'"
        assert "mode" in data, "Mode must be present ('live' or 'mock')"
        assert "llm_configured" in data, "llm_configured must be boolean"
        print(f"  ? Mode correctly reported as: '{data['mode']}' (llm_configured={data['llm_configured']})")
        print(f"  ? Advertised LAN host: {data['server_host']}:{data['server_port']}")
        print(f"  ? Bind host: {data['server_bind_host']}")
        return data

def test_3_frontend_load():
    print("[3/6] Testing GET / (Frontend loading at localhost:8000)...")
    url = f"{BASE_URL}/"
    with urllib.request.urlopen(url, timeout=5) as res:
        html = res.read().decode()
        assert res.status == 200, f"Expected 200, got {res.status}"
        assert "Llama" in html, "HTML missing title/branding"
        assert "/static/js/api.js" in html, "HTML missing api.js script"
        assert "/static/js/app.js" in html, "HTML missing app.js script"
        print(f"  ? Frontend index.html served successfully ({len(html)} bytes).")

def test_4_conversation_crud():
    print("[4/6] Testing /api/conversations CRUD and SQLite persistence...")
    # Create conversation
    create_url = f"{BASE_URL}/api/conversations"
    payload = json.dumps({"title": "Automated Test Session"}).encode()
    req = urllib.request.Request(create_url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as res:
        conv = json.loads(res.read().decode())
        conv_id = conv["id"]
        print(f"  ? Created conversation ID: {conv_id} with title: '{conv['title']}'")

    # List conversations
    list_url = f"{BASE_URL}/api/conversations"
    with urllib.request.urlopen(list_url, timeout=5) as res:
        convs = json.loads(res.read().decode())
        found = any(c["id"] == conv_id for c in convs)
        assert found, "Created conversation not found in list"
        print(f"  ? Verified conversation listed ({len(convs)} conversations in database).")

    return conv_id

def test_5_chat_streaming(conv_id):
    print("[5/6] Testing POST /api/chat with streaming response...")
    chat_url = f"{BASE_URL}/api/chat"
    payload = json.dumps({
        "conversation_id": conv_id,
        "message": "Hello from automated test. Can you confirm you are running?",
        "stream": True
    }).encode()

    req = urllib.request.Request(chat_url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as res:
        assert res.status == 200
        raw_stream = res.read().decode()
        lines = raw_stream.split("\n")
        events = [line[6:] for line in lines if line.startswith("data: ")]
        assert len(events) >= 2, f"Expected streaming tokens, got {len(events)} events"

        parsed_events = [json.loads(e) for e in events]
        start_ev = next((e for e in parsed_events if e.get("event") == "start"), None)
        done_ev = next((e for e in parsed_events if e.get("event") == "done"), None)
        tokens = [e.get("chunk") for e in parsed_events if e.get("event") == "token"]

        assert start_ev is not None, "Missing start event"
        assert done_ev is not None, "Missing done event"
        assert len(tokens) > 0, "No token chunks received"

        full_reply = "".join(tokens)
        print(f"  ? Received {len(tokens)} streaming token chunks.")
        print(f"  ? Assistant reply snippet: {full_reply[:80]}...")

    # Verify SQLite message persistence
    detail_url = f"{BASE_URL}/api/conversations/{conv_id}"
    with urllib.request.urlopen(detail_url, timeout=5) as res:
        detail = json.loads(res.read().decode())
        messages = detail.get("messages", [])
        assert len(messages) == 2, f"Expected 2 messages in SQLite, found {len(messages)}"
        assert messages[0]["role"] == "user"
        assert messages[1]["role"] == "assistant"
        print("  ? SQLite persistence verified: User prompt and AI response stored in DB.")

def test_6_cleanup(conv_id):
    print("[6/6] Cleaning up test conversation...")
    del_url = f"{BASE_URL}/api/conversations/{conv_id}"
    req = urllib.request.Request(del_url, method="DELETE")
    with urllib.request.urlopen(req, timeout=5) as res:
        assert res.status == 204
        print(f"  ? Test conversation {conv_id} deleted.")

def main():
    print("=" * 60)
    print("  VERIFICATION SUITE FOR IP-ACCESSIBLE LLAMA APPLICATION")
    print("=" * 60)
    if not test_1_socket_listening():
        print("Server is not currently running. Please start with python run.py first.")
        return False

    test_2_health_endpoint()
    test_3_frontend_load()
    conv_id = test_4_conversation_crud()
    test_5_chat_streaming(conv_id)
    test_6_cleanup(conv_id)

    print("\n" + "=" * 60)
    print("  ALL LOCAL & FUNCTIONAL TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    main()
