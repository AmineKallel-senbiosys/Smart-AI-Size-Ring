from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import yaml

from app.config import KB_PATH


def _article_text(article: dict[str, Any]) -> str:
    return yaml.safe_dump(article, allow_unicode=True, sort_keys=False).strip()


@dataclass
class KnowledgeBase:
    raw: dict[str, Any]
    rules_yaml: str
    articles: list[dict[str, Any]]
    article_texts: dict[str, str] = field(default_factory=dict)
    catalog: str = ""

    def article(self, article_id: str) -> str | None:
        return self.article_texts.get(str(article_id or "").strip())


def _validated_policies(policies: dict[str, Any]) -> dict[str, Any]:
    kept: dict[str, Any] = {}
    for key, value in (policies or {}).items():
        if isinstance(value, dict) and str(value.get("status") or "") == "validated":
            kept[key] = value
    return kept


def load_kb(path=KB_PATH) -> KnowledgeBase:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    meta = dict(raw.get("meta") or {})
    facts = raw.get("product_facts") or {}
    rules = {
        "meta": {
            "version": meta.get("version"),
            "source_language": meta.get("source_language"),
            "default_reply_language": meta.get("default_reply_language"),
            "reply_languages": meta.get("reply_languages") or [],
        },
        "policies": _validated_policies(raw.get("policies") or {}),
        "product_facts": {"validated": facts.get("validated") or {}},
        "global_rules": raw.get("global_rules") or {},
    }
    articles = [
        article
        for article in (raw.get("articles") or [])
        if isinstance(article, dict) and str(article.get("status") or "") == "validated"
    ]
    texts = {
        str(article.get("id")): _article_text(article)
        for article in articles
        if article.get("id")
    }
    catalog = "\n".join(
        f"{article.get('id')}: {article.get('intent')}"
        for article in articles
        if article.get("id")
    )
    return KnowledgeBase(
        raw=raw,
        rules_yaml=yaml.safe_dump(rules, allow_unicode=True, sort_keys=False).strip(),
        articles=articles,
        article_texts=texts,
        catalog=catalog,
    )


def opening_text(kb: KnowledgeBase) -> str:
    for article in kb.articles:
        templates = article.get("templates") or {}
        block = templates.get("ask_jeweler") if isinstance(templates, dict) else None
        if isinstance(block, dict) and str(block.get("text") or "").strip():
            return str(block["text"]).strip()
    return "Has a jeweler measured this finger?"
