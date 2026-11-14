"""Durable, owner-reviewed support. No model calls and no implicit sends.

The polling bot alone consumes approved replies. A crash after claiming a send
leaves it unknown; it is never retried automatically.
"""
import json
import re
from datetime import datetime, timedelta, timezone

from bot.app_db import get_db_connection, init_db, StaleRevisionError


class SupportNotFoundError(LookupError):
    pass


def support_scope(text, topic="general"):
    # Conservative routing, not a diagnosis or a comprehensive safety screen.
    return "personal" if topic == "health" or re.search(
        r"симптом|самочувств|боль|боли\b|болит|болят|головокруж|обморок|рвот|тошн|давлен|сердц|лекарств|анализ|диабет|беремен|судорог|одыш|онемени",
        text, re.IGNORECASE,
    ) else "application"


def _owner(actor_id, owner_id):
    if type(actor_id) is not int or type(owner_id) is not int or owner_id <= 0 or actor_id != owner_id:
        raise PermissionError("Only the configured owner may review support")


def _ticket(conn, ticket_id):
    row = conn.execute("SELECT * FROM support_tickets WHERE id = ?", (ticket_id,)).fetchone()
    if not row:
        raise SupportNotFoundError("Support ticket not found")
    ticket = dict(row)
    review = conn.execute("SELECT * FROM support_reviews WHERE ticket_id = ?", (ticket_id,)).fetchone()
    ticket["review"] = dict(review)
    ticket["review"]["sources"] = json.loads(ticket["review"].pop("sources_json"))
    ticket["review"]["uncertainties"] = json.loads(ticket["review"].pop("uncertainties_json"))
    return ticket


def get_ticket(ticket_id, db_path=None):
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        return _ticket(conn, ticket_id)


def list_tickets(db_path=None, limit=100, *, include_closed=False):
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        where = "" if include_closed else "WHERE t.status = 'open'"
        rows = conn.execute(f"SELECT t.id FROM support_tickets t {where} ORDER BY t.id DESC LIMIT ?", (min(max(limit, 1), 100),)).fetchall()
        return [_ticket(conn, r["id"]) for r in rows]


def _editable(ticket, expected_version, recipient_id):
    review = ticket["review"]
    if (review["draft_version"] != expected_version or ticket["user_id"] != recipient_id
            or review["recipient_id"] != recipient_id or ticket["status"] != "open"
            or review["delivery_status"] not in ("prepared", "error")):
        raise StaleRevisionError("Ticket, recipient or draft version changed; reload the card")


def save_draft(ticket_id, expected_version, recipient_id, actor_id, owner_id, text=None, db_path=None):
    _owner(actor_id, owner_id)
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        ticket = _ticket(conn, ticket_id)
        _editable(ticket, expected_version, recipient_id)
        uncertainties = []
        if text is None:
            if ticket["review"]["scope"] == "personal":
                raise ValueError("Вопрос о самочувствии: нужен личный ответ Ольги, автоматический черновик не создаётся.")
            text = "Спасибо за вопрос! Я уточню детали по вашему обращению и отвечу лично."
            uncertainties = ["Ручной шаблон: проверьте и дополните ответ перед отправкой. ИИ не использован."]
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 1500:
            raise ValueError("Ответ должен содержать от 1 до 1500 символов")
        conn.execute("""UPDATE support_reviews SET draft_text = ?, draft_version = draft_version + 1,
                        approved_by = NULL, approved_version = NULL, delivery_status = 'prepared',
                        sources_json = '[]', uncertainties_json = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE ticket_id = ?""", (text.strip(), json.dumps(uncertainties, ensure_ascii=False), ticket_id))
        return _ticket(conn, ticket_id)


def approve_reply(ticket_id, expected_version, recipient_id, actor_id, owner_id, db_path=None):
    _owner(actor_id, owner_id)
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        ticket = _ticket(conn, ticket_id)
        _editable(ticket, expected_version, recipient_id)
        if not ticket["review"]["draft_text"]:
            raise ValueError("Сначала подготовьте и проверьте конкретный текст ответа")
        conn.execute("""UPDATE support_reviews SET delivery_status = 'approved', approved_by = ?,
                        approved_version = draft_version, updated_at = CURRENT_TIMESTAMP
                        WHERE ticket_id = ?""", (actor_id, ticket_id))
        return _ticket(conn, ticket_id)


def reject_ticket(ticket_id, expected_version, recipient_id, actor_id, owner_id, db_path=None):
    _owner(actor_id, owner_id)
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        ticket = _ticket(conn, ticket_id)
        _editable(ticket, expected_version, recipient_id)
        conn.execute("UPDATE support_tickets SET status = 'rejected' WHERE id = ?", (ticket_id,))
        conn.execute("""UPDATE support_reviews SET closed_at = CURRENT_TIMESTAMP,
                        approved_by = NULL, approved_version = NULL, updated_at = CURRENT_TIMESTAMP
                        WHERE ticket_id = ?""", (ticket_id,))
        return _ticket(conn, ticket_id)


def claim_reply(db_path=None):
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("""SELECT r.ticket_id FROM support_reviews r JOIN support_tickets t ON t.id = r.ticket_id
                              WHERE t.status = 'open' AND r.delivery_status = 'approved'
                              AND r.recipient_id = t.user_id AND r.approved_version = r.draft_version
                              ORDER BY r.ticket_id LIMIT 1""").fetchone()
        if not row:
            return None
        conn.execute("UPDATE support_reviews SET delivery_status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?", (row["ticket_id"],))
        return _ticket(conn, row["ticket_id"])


def finish_reply(ticket_id, version, status, db_path=None, message_id=None):
    if status not in ("sent", "error", "unknown"):
        raise ValueError("Invalid delivery result")
    with get_db_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        result = conn.execute("""UPDATE support_reviews SET delivery_status = ?, telegram_message_id = ?,
                                 closed_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END,
                                 updated_at = CURRENT_TIMESTAMP
                                 WHERE ticket_id = ? AND draft_version = ? AND delivery_status = 'sending'""",
                              (status, message_id, status, ticket_id, version))
        if result.rowcount != 1:
            raise StaleRevisionError("Delivery result does not match the claimed draft")
        if status == "sent":
            conn.execute("UPDATE support_tickets SET status = 'answered' WHERE id = ?", (ticket_id,))


def recover_interrupted_replies(db_path=None):
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        conn.execute("UPDATE support_reviews SET owner_notified = -1 WHERE owner_notified = 2")
        return conn.execute("""UPDATE support_reviews SET delivery_status = 'unknown', updated_at = CURRENT_TIMESTAMP
                               WHERE delivery_status = 'sending'""").rowcount


def purge_closed_text(db_path=None, now=None):
    """30-day retention after closure. IDs/statuses remain; personal text is erased."""
    cutoff = ((now or datetime.now(timezone.utc)) - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        ids = [r["ticket_id"] for r in conn.execute("SELECT ticket_id FROM support_reviews WHERE closed_at IS NOT NULL AND closed_at < ?", (cutoff,))]
        for ticket_id in ids:
            conn.execute("UPDATE support_tickets SET message = '[текст удалён по сроку хранения]', contact = '' WHERE id = ?", (ticket_id,))
            conn.execute("UPDATE support_reviews SET draft_text = '', sources_json = '[]', uncertainties_json = '[]' WHERE ticket_id = ?", (ticket_id,))
        return len(ids)
