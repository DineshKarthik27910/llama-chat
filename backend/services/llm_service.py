import json
import asyncio
from typing import AsyncGenerator, List, Dict, Any, Optional, Tuple
import httpx
from backend.config import get_settings

SYSTEM_PROMPT = (
    "You are a helpful, brilliant, and friendly AI assistant running on a local private network server. "
    "Format your responses cleanly using Markdown, including code blocks with language identifiers when appropriate."
)

class LLMService:
    @property
    def settings(self):
        return get_settings()

    @property
    def provider(self) -> str:
        return self.settings.LLM_PROVIDER.strip().lower()

    @property
    def api_key(self) -> str:
        return self.settings.LLM_API_KEY.strip()

    @property
    def model(self) -> str:
        return self.settings.LLM_MODEL.strip()

    @property
    def base_url(self) -> str:
        return self.settings.LLM_BASE_URL.strip().rstrip("/")

    async def check_ollama_status(self) -> Tuple[bool, str]:
        """Verify that Ollama server is running and the configured model is available."""
        models_url = f"{self.base_url}/models"
        tags_url = self.base_url.replace("/v1", "") + "/api/tags"

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = None
                try:
                    res = await client.get(models_url)
                except Exception:
                    res = await client.get(tags_url)

                if res.status_code != 200:
                    return False, f"Ollama returned HTTP {res.status_code} at {self.base_url}."

                data = res.json()
                model_names = []
                if "data" in data and isinstance(data["data"], list):
                    model_names = [m.get("id", "") for m in data["data"]]
                elif "models" in data and isinstance(data["models"], list):
                    model_names = [m.get("name", "") for m in data["models"]]

                target = self.model.lower()
                target_base = target.split(":")[0]

                found = any(
                    target == m.lower() or
                    f"{target}:latest" == m.lower() or
                    target_base == m.lower().split(":")[0]
                    for m in model_names
                )

                if not found:
                    avail = ", ".join(model_names) if model_names else "none"
                    return False, f"Ollama is running, but the local Llama model '{self.model}' is unavailable. Available models: {avail}"

                return True, ""
        except httpx.ConnectError:
            return False, f"Ollama is not running or unreachable at {self.base_url}. The local Llama model is unavailable."
        except Exception as e:
            return False, f"Error checking Ollama status: {str(e)}"

    async def get_status(self) -> Dict[str, Any]:
        """Returns safe status information for /api/health."""
        p = self.provider
        if p == "ollama":
            ok, err = await self.check_ollama_status()
            if ok:
                return {
                    "status": "ok",
                    "provider": "ollama",
                    "model": self.model,
                    "mode": "local",
                    "llm_configured": True,
                    "error": None
                }
            else:
                return {
                    "status": "error",
                    "provider": "ollama",
                    "model": self.model,
                    "mode": "unavailable",
                    "llm_configured": False,
                    "error": err or f"Ollama is not running or the local Llama model {self.model} is unavailable."
                }
        else:
            has_key = bool(self.api_key)
            return {
                "status": "ok" if has_key else "warning",
                "provider": p,
                "model": self.model,
                "mode": "live" if has_key else "mock",
                "llm_configured": has_key,
                "error": None if has_key else "LLM_API_KEY is not configured in .env."
            }

    async def _mock_stream(self, prompt: str) -> AsyncGenerator[str, None]:
        """Simulated assistant stream used ONLY for cloud providers when LLM_API_KEY is empty."""
        response_text = (
            f"### 🤖 Local Llama Assistant (Mock Mode)\n\n"
            f"Hello! I received your message:\n> *\"{prompt}\"*\n\n"
            f"---\n\n"
            f"#### ?? Setup Notice: Real LLM Key Required\n"
            f"Currently, `LLM_PROVIDER={self.provider}` requires an API key, but `LLM_API_KEY` is not set in `.env`.\n\n"
            f"To connect to live models:\n"
            f"1. For cloud providers (OpenAI, DeepSeek, Groq, OpenRouter), set:\n"
            f"```env\n"
            f"LLM_PROVIDER={self.provider}\n"
            f"LLM_API_KEY=your_actual_key_here\n"
            f"```\n"
            f"2. For local models using Ollama, set:\n"
            f"```env\n"
            f"LLM_PROVIDER=ollama\n"
            f"LLM_MODEL=llama3.1:8b\n"
            f"LLM_BASE_URL=http://127.0.0.1:11434/v1\n"
            f"LLM_API_KEY=\n"
            f"```\n"
            f"Everything else is fully functional!"
        )

        words = response_text.split(" ")
        for i, word in enumerate(words):
            chunk = word if i == 0 else " " + word
            yield chunk
            await asyncio.sleep(0.015)

    def _prepare_messages(self, history: List[Dict[str, Any]], new_message: str) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        recent = history[-20:] if len(history) > 20 else history
        for msg in recent:
            if msg.get("role") in ("user", "assistant", "system"):
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        messages.append({"role": "user", "content": new_message})
        return messages

    async def generate_response_stream(
        self,
        history: List[Dict[str, Any]],
        new_message: str
    ) -> AsyncGenerator[str, None]:
        p = self.provider

        # -------------------------------------------------------------
        # 1. OLLAMA LOCAL PROVIDER (NEVER REQUIRES API KEY)
        # -------------------------------------------------------------
        if p == "ollama":
            # Verify Ollama availability before attempting the request
            ok, err = await self.check_ollama_status()
            if not ok:
                error_output = (
                    f"⚠️ **Llama Error:** The local Llama model is unavailable.\n\n"
                    f"{err or f'Ollama is not running or model {self.model} is unavailable.'}\n\n"
                    f"Please make sure Ollama is running and model `{self.model}` is downloaded (`ollama run {self.model}`)."
                )
                yield error_output
                return

            # Connect to Ollama chat completions
            messages = self._prepare_messages(history, new_message)
            headers = {
                "Content-Type": "application/json",
                "Authorization": "Bearer ollama"
            }
            payload = {
                "model": self.model,
                "messages": messages,
                "stream": True,
                "temperature": 0.7
            }
            url = f"{self.base_url}/chat/completions"

            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        if response.status_code != 200:
                            error_body = await response.aread()
                            error_msg = f"Ollama HTTP {response.status_code}: {error_body.decode(errors='ignore')}"
                            yield f"⚠️ **Llama Error:**\n```json\n{error_msg}\n```"
                            return

                        async for line in response.aiter_lines():
                            if not line:
                                continue
                            if line.startswith("data: "):
                                data_str = line[6:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    data = json.loads(data_str)
                                    delta = data.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield content
                                except json.JSONDecodeError:
                                    continue
            except httpx.ConnectError:
                yield f"⚠️ **Llama Error:** Ollama is not running or unreachable at `{self.base_url}`. The local Llama model is unavailable."
            except Exception as e:
                yield f"⚠️ **Llama Connection Error:** {str(e)}"
            return

        # -------------------------------------------------------------
        # 2. CLOUD OPENAI-COMPATIBLE PROVIDERS (REQUIRES API KEY)
        # -------------------------------------------------------------
        else:
            if not self.api_key:
                # Cloud provider has no key -> show mock stream notice
                async for chunk in self._mock_stream(new_message):
                    yield chunk
                return

            # Cloud provider with API key
            messages = self._prepare_messages(history, new_message)
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            payload = {
                "model": self.model,
                "messages": messages,
                "stream": True,
                "temperature": 0.7
            }
            url = f"{self.base_url}/chat/completions"

            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        if response.status_code != 200:
                            error_body = await response.aread()
                            error_msg = f"LLM API Error (HTTP {response.status_code}): {error_body.decode(errors='ignore')}"
                            yield f"?? **Error from LLM Provider:**\n```json\n{error_msg}\n```"
                            return

                        async for line in response.aiter_lines():
                            if not line:
                                continue
                            if line.startswith("data: "):
                                data_str = line[6:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    data = json.loads(data_str)
                                    delta = data.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield content
                                except json.JSONDecodeError:
                                    continue
            except httpx.RequestError as e:
                yield f"?? **Network Error connecting to LLM provider:** {str(e)}"
            except Exception as e:
                yield f"?? **Unexpected Error:** {str(e)}"

    async def generate_response(
        self,
        history: List[Dict[str, Any]],
        new_message: str
    ) -> str:
        collected = []
        async for chunk in self.generate_response_stream(history, new_message):
            collected.append(chunk)
        return "".join(collected)

llm_service = LLMService()
