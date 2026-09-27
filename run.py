import socket
import sys
import uvicorn
from backend.config import settings

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # Connect to a public DNS IP (doesn't send data) to determine primary network interface
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def print_banner():
    detected_ip = get_local_ip()
    configured_host = settings.SERVER_HOST
    port = settings.SERVER_PORT
    bind_host = settings.SERVER_BIND_HOST

    print("=" * 65)
    print("              PRIVATE LAN LLAMA APPLICATION              ")
    print("=" * 65)
    print(f"  * Configured Host : {configured_host}")
    print(f"  * Configured Port : {port}")
    print(f"  * Listening on    : {bind_host}:{port} (all interfaces)")
    print(f"  * Detected LAN IP : {detected_ip}")
    print(f"  * LLM Provider    : {settings.LLM_PROVIDER} ({settings.LLM_MODEL})")
    print("-" * 65)
    print("  ACCESS URLS:")
    print(f"  * This computer (local)    : http://localhost:{port}")
    print(f"  * Other devices (LAN/Wi-Fi): http://{configured_host}:{port}")
    if detected_ip != configured_host and detected_ip != "127.0.0.1":
        print(f"  * Alternate LAN IP address : http://{detected_ip}:{port}")
    print("-" * 65)
    print("  * To change the IP address, edit SERVER_HOST in .env")
    print("  * Ensure Windows Firewall permits incoming connections on port " + str(port))
    print("=" * 65 + "\n")

if __name__ == "__main__":
    print_banner()
    uvicorn.run(
        "backend.main:app",
        host=settings.SERVER_BIND_HOST,
        port=settings.SERVER_PORT,
        reload=False
    )
