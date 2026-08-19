"""Chatbot microservice - a thin, stateless wrapper around Groq's
OpenAI-compatible chat-completions endpoint. It holds no DynamoDB table
and no conversation history server-side; the frontend sends the recent
message history with every request (see frontend/src/js/chatbot.js).

GROQ_API_KEY never lives in the repo - it's a GitHub Environment secret,
injected into the `app-secrets` k8s Secret at deploy time (see
.github/workflows/deploy.yml) and mounted here as a plain env var.
"""
import os
from typing import List, Literal, Optional

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Cloud Bank Chatbot Service", version="1.0.0")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_PROMPT = (
    "You are the Cloud Bank support assistant, embedded in the Cloud Bank web app. "
    "You help customers understand their accounts, cards, transfers, statements, loans, "
    "cheques, and other Cloud Bank services, and how to use the app. "
    "You cannot see anyone's real account data or take actions - you only answer questions "
    "and point people to the right page in the app. Keep answers short and friendly. "
    "If asked something outside banking/the app, gently redirect back to how you can help "
    "with Cloud Bank. Never invent account numbers, balances, or transaction details."
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = Field(default_factory=list, description="Recent turns, oldest first")


class ChatResponse(BaseModel):
    reply: str


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/chatbot/")
def root():
    return {"service": "chatbot-service", "status": "running", "configured": bool(GROQ_API_KEY)}


@app.post("/chatbot/message", response_model=ChatResponse)
def send_message(req: ChatRequest):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Chatbot isn't configured yet (missing GROQ_API_KEY).")
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message can't be empty.")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    # Cap history so a long-running chat session doesn't blow up token usage.
    for turn in req.history[-12:]:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": req.message})

    try:
        resp = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"model": GROQ_MODEL, "messages": messages, "temperature": 0.4, "max_tokens": 500},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        reply = data["choices"][0]["message"]["content"].strip()
    except requests.HTTPError as e:
        detail = e.response.text[:300] if e.response is not None else str(e)
        raise HTTPException(status_code=502, detail=f"Groq API error: {detail}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Chatbot is temporarily unavailable: {e}")

    return {"reply": reply}
