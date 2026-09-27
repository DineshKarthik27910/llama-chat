# Llama Chat

A private, self-hosted, full-featured AI chat application powered by **FastAPI** and local **Ollama** running **Llama 3.2**. Designed for responsive single-user or multi-device interaction over your Local Area Network (LAN) without transmitting your private conversations to external cloud providers.

---

## Features

- **100% Local & Private:** Runs entirely on your local machine using Ollama and Llama 3.2. No data leaves your network.
- **LAN-Accessible:** Host on one computer and interact seamlessly from any smartphone, tablet, or laptop on the same Wi-Fi / local network.
- **Real-Time Streaming:** Server-Sent Events (SSE) provide fast, token-by-token streaming responses.
- **Conversational Memory:** Preserves multi-turn conversation context so Llama understands follow-up questions.
- **Persistent Chat History:** Stored locally in SQLite with full CRUD capabilities (create, rename, switch, and delete chats).
- **Code Highlighting & Copy:** Markdown formatting with syntax-highlighted code blocks and one-click copy buttons.
- **Zero API Key Requirement:** Local Ollama integration requires no third-party accounts or API keys.
- **Responsive Web Interface:** Modern dark-themed web UI inspired by contemporary AI chat interfaces, fully optimized for both desktop and mobile viewports.

---

## Tech Stack

- **Backend:** Python 3.10+, [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), [HTTPX](https://www.python-httpx.org/), [Pydantic](https://docs.pydantic.dev/)
- **LLM Engine:** [Ollama](https://ollama.com/) with **Llama 3.2**
- **Database:** SQLite with raw SQL helper operations and automated schema migration
- **Frontend:** Vanilla HTML5, CSS3 (Modern Dark Theme), and JavaScript (ES6+), with [Highlight.js](https://highlightjs.org/), [Marked.js](https://marked.js.org/), and [DOMPurify](https://github.com/cure53/DOMPurify)

---

## Requirements

- **Operating System:** Windows, macOS, or Linux
- **Python:** 3.10 or higher
- **Ollama:** Installed and running locally
- **Hardware:** Sufficient RAM / VRAM to run Llama 3.2 (typically 4GB+ RAM available)

---

## Setup & Installation

### 1. Clone the Repository

```bash
git clone <YOUR-GITHUB-REPO-URL>
cd <REPO-FOLDER>
```

### 2. Set Up Python Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate on Windows (PowerShell):
venv\Scripts\Activate.ps1
# Or on Windows (CMD):
venv\Scripts\activate.bat
# Or on Linux/macOS:
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

---

## Ollama & Llama 3.2 Configuration

### 1. Install & Launch Ollama

Download and install Ollama from [ollama.com](https://ollama.com/download). Once installed, ensure Ollama is running:

```bash
ollama --version
```

### 2. Pull the Llama 3.2 Model

Download the Llama 3.2 model locally:

```bash
ollama pull llama3.2
```

Verify that the model is installed:

```bash
ollama list
```

---

## Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Open `.env` and verify the settings:

```env
# Network Configuration
# Set SERVER_HOST to your machine's LAN IP address (e.g. 192.168.1.100) or localhost
# Set SERVER_BIND_HOST to 0.0.0.0 to enable access from other devices on your LAN
SERVER_HOST=192.168.1.100
SERVER_PORT=8000
SERVER_BIND_HOST=0.0.0.0

# LLM Provider Configuration
LLM_PROVIDER=ollama
LLM_API_KEY=
LLM_MODEL=llama3.2
LLM_BASE_URL=http://127.0.0.1:11434/v1

# Database Configuration
DATABASE_URL=sqlite:///./data/chat.db
```

> **Note:** Ollama does not require an API key; leave `LLM_API_KEY=` blank.

---

## Running the Application

### Option A: Using the Runner Script (Recommended)

```bash
python run.py
```

*On Windows, you can also double-click `run.bat`.*

The runner displays detected network IP addresses and active connection endpoints:

```text
=================================================================
           🔒 PRIVATE LAN LLAMA APPLICATION           
=================================================================
  * Configured Host : 192.168.1.100
  * Configured Port : 8000
  * Listening on    : 0.0.0.0:8000 (all interfaces)
  * LLM Provider    : ollama (llama3.2)
-----------------------------------------------------------------
  ACCESS URLS:
  🏠 This computer (local)    : http://localhost:8000
  📱 Other devices (LAN/Wi-Fi): http://<SERVER-IP>:8000
=================================================================
```

### Option B: Using Uvicorn Directly

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

## Accessing from Another Device on Your LAN

1. Ensure the host computer and your client device (phone, tablet, laptop) are connected to the same Wi-Fi / local network.
2. Find the host machine's local IP address:
   - **Windows:** Run `ipconfig` in Command Prompt / PowerShell (look for IPv4 Address under your active Wi-Fi or Ethernet adapter).
   - **macOS / Linux:** Run `ifconfig` or `ip addr`.
3. Set `SERVER_HOST` in `.env` to this IP address (e.g., `192.168.1.100`).
4. Ensure your firewall permits incoming connections on port `8000`.
5. On your phone or secondary computer, open any web browser and navigate to:

```text
http://<SERVER-IP>:8000
```

*Example URL format:*
```text
http://192.168.1.100:8000
```

---

## Verification & Automated Tests

A built-in test suite verifies server socket binding, API health, frontend delivery, conversation CRUD operations, and streaming responses:

```bash
python verify_system.py
```

---

## Project Structure

```text
├── backend/
│   ├── models/
│   │   └── schemas.py          # Pydantic data schemas
│   ├── services/
│   │   └── llm_service.py      # Ollama streaming client & error handler
│   ├── config.py               # Pydantic BaseSettings environment config
│   ├── database.py             # SQLite storage and conversation managers
│   └── main.py                 # FastAPI application routes & static mounts
├── data/                       # Local SQLite storage (git-ignored)
├── frontend/
│   ├── css/
│   │   ├── style.css           # Modern dark UI theme
│   │   └── vendor/             # Syntax highlighting stylesheet
│   ├── js/
│   │   ├── api.js              # Fetch client for backend endpoints
│   │   ├── app.js              # UI controller, event listeners, streaming
│   │   └── vendor/             # Highlight.js, Marked.js, DOMPurify
│   └── index.html              # Main chat interface
├── .env.example                # Safe environment variable template
├── .gitignore                  # Security & repository exclusions
├── requirements.txt            # Python dependencies
├── run.bat                     # Windows launch batch script
├── run.py                      # Server runner with network discovery
├── verify_system.py            # Automated system verification test
└── README.md                   # Documentation
```

---

## License

This project is licensed under the MIT License.
