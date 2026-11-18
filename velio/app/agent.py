from __future__ import annotations

import json
import logging
import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from openai import OpenAI

from app.config import OPENAI_API_KEY, OPENAI_MODEL, OPENAI_TEMPERATURE, PROMPT_PATH
from app.kb import KnowledgeBase

log = logging.getLogger("velio")

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "open_article",
            "description": "Read one validated knowledge-base article by its id, such as KB-43.",
            "parameters": {
                "type": "object",
                "properties": {"article_id": {"type": "string"}},
                "required": ["article_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "resolve_circumference",
            "description": (
                "Work out a ring circumference from millimetre measurements in the knowledge base. "
                "Call this as soon as the customer gives a jeweler circumference or one or two home "
                "measurements. Do not compare the numbers or calculate the average yourself."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "jeweler_mm": {"type": "number"},
                    "ring_mm": {"type": "number"},
                    "finger_mm": {"type": "number"},
                },
                "additionalProperties": False,
            },
        },
    },
]

_ZONE_PATTERN = re.compile(
    r"^(?:C\s*(?P<op>>|<)\s*(?P<bound>[0-9.]+)"
    r"|(?P<low>[0-9.]+)\s*(?P<lop><=|<)\s*C\s*(?P<rop><=|<)\s*(?P<high>[0-9.]+))$"
)
_CIRCUMFERENCE_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def _client() -> OpenAI:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPEN_AI_API_KEY is missing")
    return OpenAI(api_key=OPENAI_API_KEY)


def _policy(kb: KnowledgeBase, policy_id: str) -> dict[str, Any]:
    value = (kb.raw.get("policies") or {}).get(policy_id) or {}
    return value if isinstance(value, dict) else {}


def _decimal(value: Any, fallback: str) -> Decimal:
    try:
        return Decimal(str(value if value is not None else fallback))
    except Exception:
        return Decimal(fallback)


def _agreement_mm(kb: KnowledgeBase) -> Decimal:
    return _decimal(_policy(kb, "POL-SIZE-MEASURE").get("agreement_mm"), "1.0")


def _range_mm(kb: KnowledgeBase) -> tuple[Decimal, Decimal]:
    policy = _policy(kb, "POL-SIZE-RESULT")
    return (
        _decimal(policy.get("circumference_min_mm"), "50.6"),
        _decimal(policy.get("circumference_max_mm"), "67.2"),
    )


def _millimetres(value: Any) -> Decimal | None:
    if value is None or value is False or value == "":
        return None
    if isinstance(value, bool):
        return None
    text = str(value).strip().lower().replace(",", ".").replace("mm", "").strip()
    if not text:
        return None
    try:
        number = Decimal(text)
    except Exception:
        return None
    if not number.is_finite() or number <= 0:
        return None
    return number


def _one_decimal(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP), "f")


def _plain_mm(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _zone_matches(circumference: Decimal, expression: str) -> bool:
    text = expression.split("(", 1)[0].strip()
    match = _ZONE_PATTERN.fullmatch(text)
    if not match:
        return False
    if match.group("op"):
        bound = Decimal(match.group("bound"))
        return circumference > bound if match.group("op") == ">" else circumference < bound
    low = Decimal(match.group("low"))
    high = Decimal(match.group("high"))
    left = circumference >= low if match.group("lop") == "<=" else circumference > low
    right = circumference <= high if match.group("rop") == "<=" else circumference < high
    return left and right


def _display_size(size: str | None) -> str | None:
    if size and re.fullmatch(r"US\d+", size):
        return f"US {size[2:]}"
    return size


def _template_text(kb: KnowledgeBase, name: str) -> str:
    for article in kb.articles:
        templates = article.get("templates") or {}
        block = templates.get(name) if isinstance(templates, dict) else None
        if isinstance(block, dict) and str(block.get("text") or "").strip():
            return str(block["text"]).strip()
    return ""


def _reply_text(
    kb: KnowledgeBase,
    template: str,
    circumference: str | None = None,
    size: str | None = None,
    fit: str | None = None,
) -> str:
    text = _template_text(kb, template)
    if not text:
        return ""
    shown = _display_size(size) or ""
    return (
        text.replace("[C]", circumference or "")
        .replace("[size]", shown)
        .replace("[loose/tight]", fit or "")
        .strip()
    )


def _fit_for(kb: KnowledgeBase, circumference: Decimal) -> dict[str, Any]:
    shown = _one_decimal(circumference)
    low, high = _range_mm(kb)
    if circumference < low or circumference > high:
        template = "result_out_of_range"
        return {
            "action": template,
            "template": template,
            "circumference_mm": shown,
            "size": None,
            "fit": None,
            "reply_text": _reply_text(kb, template, shown),
        }
    for zone in _policy(kb, "POL-SIZE-RESULT").get("fit_zones") or []:
        size = str(zone.get("size") or "")
        for fit_name in ("loose", "ok", "tight"):
            expression = str(zone.get(fit_name) or "")
            if not expression or not _zone_matches(circumference, expression):
                continue
            if "out of range" in expression.lower():
                template = "result_out_of_range"
                return {
                    "action": template,
                    "template": template,
                    "circumference_mm": shown,
                    "size": None,
                    "fit": None,
                    "reply_text": _reply_text(kb, template, shown),
                }
            if fit_name == "ok":
                template = "result_ok"
                return {
                    "action": template,
                    "template": template,
                    "circumference_mm": shown,
                    "size": size,
                    "fit": "expected",
                    "reply_text": _reply_text(kb, template, shown, size),
                }
            template = "result_check"
            return {
                "action": template,
                "template": template,
                "circumference_mm": shown,
                "size": size,
                "fit": fit_name,
                "reply_text": _reply_text(kb, template, shown, size, fit_name),
            }
    template = "result_out_of_range"
    return {
        "action": template,
        "template": template,
        "circumference_mm": shown,
        "size": None,
        "fit": None,
        "reply_text": _reply_text(kb, template, shown),
    }


def resolve_circumference(
    kb: KnowledgeBase,
    jeweler_mm: Any = None,
    ring_mm: Any = None,
    finger_mm: Any = None,
) -> dict[str, Any]:
    jeweler = _millimetres(jeweler_mm)
    ring = _millimetres(ring_mm)
    finger = _millimetres(finger_mm)
    agreement = _agreement_mm(kb)
    if jeweler is not None:
        result = _fit_for(kb, jeweler)
        result.update({
            "ok": True,
            "source": "jeweler",
            "instruction": (
                f"Use the jeweler circumference {result['circumference_mm']} mm as the final "
                "circumference. Do not average it with home measurements. "
                f"Send reply_text, which is template {result['template']}."
            ),
        })
        return result
    if ring is None and finger is None:
        return {
            "ok": False,
            "action": "need_measurements",
            "instruction": "No circumference was provided. Ask for the measurements in millimetres.",
        }
    if ring is None or finger is None:
        template = "missing_measurement"
        return {
            "ok": True,
            "action": template,
            "template": template,
            "reply_text": _reply_text(kb, template),
            "instruction": "Only one home measurement is present. Send reply_text. Do not give a size yet.",
        }
    difference = abs(ring - finger)
    if difference > agreement:
        template = "repeat_both"
        return {
            "ok": True,
            "action": template,
            "template": template,
            "difference_mm": _plain_mm(difference),
            "within_agreement": False,
            "reply_text": _reply_text(kb, template),
            "instruction": (
                f"The measurements differ by {_plain_mm(difference)} mm, which is more than "
                f"{_plain_mm(agreement)} mm. Send reply_text. Do not average them."
            ),
        }
    average = (ring + finger) / 2
    result = _fit_for(kb, average)
    result.update({
        "ok": True,
        "source": "home_average",
        "difference_mm": _plain_mm(difference),
        "within_agreement": True,
        "instruction": (
            f"The measurements differ by {_plain_mm(difference)} mm, which is "
            f"{_plain_mm(agreement)} mm or less. The average is already applied. Send reply_text."
        ),
    })
    return result


def _execute(name: str, arguments: dict[str, Any], kb: KnowledgeBase) -> dict[str, Any]:
    if name == "open_article":
        text = kb.article(str(arguments.get("article_id") or ""))
        if not text:
            return {"ok": False, "reason": "article_not_found"}
        return {"ok": True, "article": text}
    if name == "resolve_circumference":
        return resolve_circumference(
            kb,
            arguments.get("jeweler_mm"),
            arguments.get("ring_mm"),
            arguments.get("finger_mm"),
        )
    return {"ok": False, "reason": "unknown_tool"}


def _system_prompt(kb: KnowledgeBase) -> str:
    instructions = PROMPT_PATH.read_text(encoding="utf-8")
    articles = "\n\n".join(kb.article_texts.values()) or "No validated article is loaded."
    return (
        f"{instructions}\n\n"
        f"# Knowledge\n{kb.rules_yaml}\n\n"
        f"# Validated articles\n{kb.catalog}\n\n"
        f"{articles}"
    )


def _size_math_from_message(message: str, kb: KnowledgeBase) -> dict[str, Any] | None:
    found: list[Decimal] = []
    for match in _CIRCUMFERENCE_NUMBER.finditer(message):
        number = _millimetres(match.group(0))
        if number is None or number < Decimal("40") or number > Decimal("90"):
            continue
        found.append(number)
        if len(found) == 2:
            break
    if len(found) < 2:
        return None
    return resolve_circumference(kb, ring_mm=found[0], finger_mm=found[1])


def reply(session: dict[str, Any], message: str, kb: KnowledgeBase) -> str:
    size_math = _size_math_from_message(message, kb)
    context = "Session so far is in the messages below.\n"
    if size_math:
        context += (
            "Circumference calculation for the two measurements in this message. "
            "This is authoritative. Send its reply_text. Do not recalculate:\n"
            f"{json.dumps(size_math, ensure_ascii=False, default=str)}"
        )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _system_prompt(kb)},
        {"role": "system", "content": context},
    ]
    for item in session.get("messages") or []:
        if item.get("role") in {"user", "assistant"} and item.get("content"):
            messages.append({"role": item["role"], "content": item["content"]})

    client = _client()
    final = ""
    for _round in range(4):
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            temperature=OPENAI_TEMPERATURE,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        choice = response.choices[0].message
        tool_calls = list(choice.tool_calls or [])
        if not tool_calls:
            final = (choice.content or "").strip()
            break
        messages.append({
            "role": "assistant",
            "content": choice.content or "",
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.function.name,
                        "arguments": call.function.arguments,
                    },
                }
                for call in tool_calls
            ],
        })
        for call in tool_calls:
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}
            try:
                result = _execute(call.function.name, arguments, kb)
            except Exception as exc:
                log.exception("Tool %s failed", call.function.name)
                result = {"ok": False, "reason": "tool_error", "detail": str(exc)}
            reply_text = str(result.get("reply_text") or "").strip()
            if reply_text:
                final = reply_text
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })
        if final:
            break
    if not final:
        final = "I can only help you find your ring size."
    return final
