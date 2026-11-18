from __future__ import annotations

import logging
import threading
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.agent import reply
from app.config import HOST, KB_PATH, PORT
from app.kb import KnowledgeBase, load_kb, opening_text

log = logging.getLogger("velio")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Velio")
SESSIONS: dict[str, dict[str, Any]] = {}
LOCK = threading.Lock()
KB_STATE: dict[str, Any] = {"mtime": None, "kb": None}


class MessageBody(BaseModel):
    message: str
    session_id: str | None = None


def get_kb() -> KnowledgeBase:
    mtime = KB_PATH.stat().st_mtime
    with LOCK:
        if KB_STATE["kb"] is None or KB_STATE["mtime"] != mtime:
            KB_STATE["kb"] = load_kb()
            KB_STATE["mtime"] = mtime
            log.info("Loaded knowledge base (%s articles)", len(KB_STATE["kb"].articles))
        return KB_STATE["kb"]


def _session(session_id: str | None) -> dict[str, Any]:
    with LOCK:
        if session_id and session_id in SESSIONS:
            return SESSIONS[session_id]
        sid = uuid.uuid4().hex
        session = {"id": sid, "messages": []}
        SESSIONS[sid] = session
        return session


@app.get("/api/opening")
def opening() -> dict[str, Any]:
    kb = get_kb()
    session = _session(None)
    text = opening_text(kb)
    session["messages"].append({"role": "assistant", "content": text})
    return {"session_id": session["id"], "reply": text}


@app.post("/api/message")
def message(body: MessageBody) -> dict[str, Any]:
    text = body.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is required")
    kb = get_kb()
    session = _session(body.session_id)
    session["messages"].append({"role": "user", "content": text})
    try:
        answer = reply(session, text, kb)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("chat turn failed")
        raise HTTPException(status_code=502, detail="The sizing assistant could not answer.") from exc
    session["messages"].append({"role": "assistant", "content": answer})
    return {"session_id": session["id"], "reply": answer}


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
