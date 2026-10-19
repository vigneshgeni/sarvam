"""Unit tests for the Ask Sarvam Agent, its tools, runner, fallback, and validation guards."""

import json
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
pytest.importorskip("google.adk", reason="ADK not installed in main venv")
from fastapi.testclient import TestClient

from agent.tools import DocumentContext, create_agent_tools
from agent.runner import (
    AgentAskError,
    parse_agent_json,
    run_agent_turn,
    validate_agent_response,
)
from main import app
from models import AskResponse


class TestAgentTools(unittest.TestCase):
    def setUp(self):
        self.doc_json = {
            "source_kind": "text_pdf",
            "document_kind": "challan",
            "source_text": "Traffic Violation Notice\nChallan No ECH/2026/0098121\nFine amount Rs. 1,000.00\nPay within 60 days or before 05 Dec 2026",
            "summary": ["Traffic violation fine of Rs. 1,000.00.", "Due date is 05 Dec 2026."],
            "actions": [
                {
                    "text": "Pay fine of Rs. 1,000.00",
                    "due_date": "2026-12-05",
                    "quote": "Pay within 60 days or before 05 Dec 2026",
                }
            ],
            "glance": {
                "key_values": [
                    {"label": "Challan No", "value": "ECH/2026/0098121", "evidence": "matched"},
                    {"label": "Fine Amount", "value": "Rs. 1,000.00", "evidence": "matched"},
                ]
            },
        }
        self.ctx = DocumentContext(
            result_json=json.dumps(self.doc_json),
            pdf_pages_text=[self.doc_json["source_text"]],
        )
        tools = create_agent_tools(self.ctx)
        self.search_document = tools[0]
        self.verify_quote = tools[1]
        self.days_until = tools[2]
        self.relative_deadline = tools[3]
        self.prepare_calendar_event = tools[4]

    def test_search_document_finds_verbatim_lines(self):
        res = self.search_document("Fine amount")
        self.assertIn("[Page 1]", res)
        self.assertIn("Fine amount Rs. 1,000.00", res)
        self.assertIn("search_document", self.ctx.tools_used)

    def test_search_document_not_found_falls_back_to_summary(self):
        res = self.search_document("nonexistent keyword query")
        self.assertIn("Traffic violation fine", res)

    def test_verify_quote_matched(self):
        res = self.verify_quote("Fine amount Rs. 1,000.00", page=1)
        self.assertEqual(res["evidence"], "matched")
        self.assertEqual(self.ctx.last_evidence_label, "matched")

    def test_verify_quote_on_photo_is_never_matched(self):
        photo_ctx = DocumentContext(
            result_json=json.dumps({"source_kind": "photo", "summary": ["Notice"]}),
            pdf_pages_text=[],
        )
        photo_tools = create_agent_tools(photo_ctx)
        verify_tool = photo_tools[1]
        res = verify_tool("Any quote from photo", page=1)
        self.assertEqual(res["evidence"], "check_original")

    def test_days_until_calculation(self):
        res = self.days_until("2026-12-05")
        self.assertIn("iso_date", res)
        self.assertEqual(res["iso_date"], "2026-12-05")
        self.assertIn("days_left", res)
        self.assertIn(res["status"], ["upcoming", "passed"])

    def test_relative_deadline_resolution(self):
        res = self.relative_deadline("within 60 days of the date", "2026-10-06")
        self.assertEqual(res["mode"], "computed")
        self.assertIsNotNone(res["calculated_date"])

    def test_prepare_calendar_event(self):
        res = self.prepare_calendar_event(
            title="Pay traffic fine",
            date="2026-12-05",
            note="Use challan number online",
        )
        self.assertEqual(res["title"], "Pay traffic fine")
        self.assertEqual(res["date"], "2026-12-05")
        self.assertEqual(res["action"], "draft_event")
        self.assertIsNotNone(self.ctx.calendar_draft)


class TestAgentRunnerAndValidation(unittest.TestCase):
    def setUp(self):
        self.doc_json = {
            "source_kind": "text_pdf",
            "document_kind": "challan",
            "source_text": "Challan No ECH/2026/0098121 Fine Rs. 1,000 due 05 Dec 2026",
            "summary": ["Challan fine Rs. 1,000."],
        }
        self.ctx = DocumentContext(
            result_json=json.dumps(self.doc_json),
            pdf_pages_text=[self.doc_json["source_text"]],
        )

    def test_parse_agent_json_direct(self):
        raw = '{"answer": "Fine is Rs. 1,000", "not_found": false, "quote": "Fine Rs. 1,000"}'
        parsed = parse_agent_json(raw)
        self.assertEqual(parsed["answer"], "Fine is Rs. 1,000")

    def test_parse_agent_json_markdown_fenced(self):
        raw = '```json\n{"answer": "Hearing on 12 Nov 2026", "not_found": false}\n```'
        parsed = parse_agent_json(raw)
        self.assertEqual(parsed["answer"], "Hearing on 12 Nov 2026")

    def test_validate_agent_response_checks_numbers_and_closing(self):
        raw = {
            "answer": "The fine is Rs. 1,000 and due on 05 Dec 2026.",
            "quote": "Fine Rs. 1,000",
            "page": 1,
            "answered_from": "document",
            "not_found": False,
        }
        res = validate_agent_response(
            raw_data=raw,
            ctx=self.ctx,
            question="What is the fine?",
            lang="en",
            kind="challan",
        )
        self.assertIn("1,000", res.answer)
        self.assertEqual(res.evidence, "matched")
        # Challan document must have legal closing
        self.assertIn("lawyer", res.answer.lower())

    def test_parse_agent_json_unparseable_raises_error(self):
        with self.assertRaises(AgentAskError):
            parse_agent_json("Plain unstructured text without JSON object")

    def test_parse_agent_json_missing_answer_raises_error(self):
        with self.assertRaises(AgentAskError):
            parse_agent_json('{"status": "success", "note": "No answer key here"}')

    def test_validate_invented_number_raises_agent_ask_error(self):
        raw = {
            "answer": "The fine is Rs. 99,999.",
            "quote": "Fine Rs. 1,000",
            "page": 1,
            "answered_from": "document",
            "not_found": False,
        }
        with self.assertRaises(AgentAskError):
            validate_agent_response(
                raw_data=raw,
                ctx=self.ctx,
                question="What is the fine?",
                lang="en",
                kind="challan",
            )

    def test_validate_agent_response_defaults_page_to_none_when_omitted(self):
        raw = {
            "answer": "The fine is Rs. 1,000 and due on 05 Dec 2026.",
            "quote": "Fine Rs. 1,000",
            "answered_from": "document",
            "not_found": False,
        }
        res = validate_agent_response(
            raw_data=raw,
            ctx=self.ctx,
            question="What is the fine?",
            lang="en",
            kind="challan",
        )
        self.assertIsNone(res.page)

    def test_validate_script_guard_failure_raises_error(self):
        # Asking in Tamil but answer returned in English
        raw = {
            "answer": "This is completely in English letters without Tamil script.",
            "quote": None,
            "not_found": False,
        }
        with self.assertRaises(AgentAskError):
            validate_agent_response(
                raw_data=raw,
                ctx=self.ctx,
                question="கேள்வி",
                lang="ta",
                kind="challan",
            )


class TestMainEndpointFlagAndFallback(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.sample_result = json.dumps({
            "source_kind": "text_pdf",
            "document_kind": "challan",
            "source_text": "Challan No ECH/2026/0098121 Fine Rs. 1,000",
            "summary": ["Challan fine Rs. 1,000."],
        })

    def test_agent_flag_off_uses_legacy_ask(self):
        with patch.dict(os.environ, {"AGENT_ASK": "0"}):
            with patch("reader.ask_document_single_attempt") as mock_legacy:
                mock_legacy.return_value = AskResponse(
                    answer="Legacy answer",
                    language="en",
                    answered_from="document",
                )
                resp = self.client.post(
                    "/api/ask",
                    data={
                        "question": "What is the fine?",
                        "lang": "en",
                        "result": self.sample_result,
                    },
                )
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.json()["answer"], "Legacy answer")
                mock_legacy.assert_called_once()

    def test_agent_flag_on_success(self):
        with patch.dict(os.environ, {"AGENT_ASK": "1"}):
            with patch("agent.runner.run_agent_turn", new_callable=AsyncMock) as mock_agent:
                mock_agent.return_value = AskResponse(
                    answer="Agent answer from tools",
                    language="en",
                    answered_from="document",
                    evidence="matched",
                    tools_used=["search_document", "verify_quote"],
                )
                resp = self.client.post(
                    "/api/ask",
                    data={
                        "question": "What is the fine?",
                        "lang": "en",
                        "result": self.sample_result,
                    },
                )
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                self.assertEqual(data["answer"], "Agent answer from tools")
                self.assertEqual(data["tools_used"], ["search_document", "verify_quote"])

    def test_agent_flag_on_fallback_on_error(self):
        with patch.dict(os.environ, {"AGENT_ASK": "1"}):
            with patch("agent.runner.run_agent_turn", new_callable=AsyncMock) as mock_agent:
                mock_agent.side_effect = AgentAskError("Simulation of agent timeout or error")
                with patch("reader.ask_document_single_attempt") as mock_legacy:
                    mock_legacy.return_value = AskResponse(
                        answer="Fallback answer",
                        language="en",
                        answered_from="document",
                    )
                    resp = self.client.post(
                        "/api/ask",
                        data={
                            "question": "What is the fine?",
                            "lang": "en",
                            "result": self.sample_result,
                        },
                    )
                    self.assertEqual(resp.status_code, 200)
                    self.assertEqual(resp.json()["answer"], "Fallback answer")
                    mock_legacy.assert_called_once()

    def test_agent_skipped_when_less_than_30s_remain(self):
        """When deadline - now < 30s, agent is skipped and legacy ask runs immediately."""
        with patch.dict(os.environ, {"AGENT_ASK": "1"}):
            with patch("agent.runner.run_agent_turn", new_callable=AsyncMock) as mock_agent:
                with patch("reader.ask_document_single_attempt") as mock_legacy:
                    mock_legacy.return_value = AskResponse(
                        answer="Legacy answer after skip",
                        language="en",
                        answered_from="document",
                    )
                    t = [1000.0]
                    def fake_time():
                        val = t[0]
                        t[0] += 6.0
                        return val

                    with patch("time.time", side_effect=fake_time):
                        resp = self.client.post(
                            "/api/ask",
                            data={
                                "question": "What is the fine?",
                                "lang": "en",
                                "result": self.sample_result,
                            },
                        )
                        self.assertEqual(resp.status_code, 200)
                        mock_agent.assert_not_called()
                        mock_legacy.assert_called_once()

    def test_agent_timeout_capped_at_15s(self):
        """Agent timeout is capped at min(15.0, deadline - now - 25.0)."""
        with patch.dict(os.environ, {"AGENT_ASK": "1"}):
            with patch("agent.runner.run_agent_turn", new_callable=AsyncMock) as mock_agent:
                mock_agent.return_value = AskResponse(
                    answer="Fast agent answer",
                    language="en",
                    answered_from="document",
                )
                resp = self.client.post(
                    "/api/ask",
                    data={
                        "question": "What is the fine?",
                        "lang": "en",
                        "result": self.sample_result,
                    },
                )
                self.assertEqual(resp.status_code, 200)
                mock_agent.assert_called_once()
                call_kwargs = mock_agent.call_args[1]
                self.assertLessEqual(call_kwargs["timeout"], 15.0)

    def test_ask_works_without_adk_installed_when_flag_off(self):
        """When google-adk is unavailable and AGENT_ASK=0, /api/ask succeeds."""
        with patch.dict(os.environ, {"AGENT_ASK": "0"}):
            with patch.dict("sys.modules", {"google.adk": None, "agent.runner": None}):
                with patch("reader.ask_document_single_attempt") as mock_legacy:
                    mock_legacy.return_value = AskResponse(
                        answer="Legacy without ADK",
                        language="en",
                        answered_from="document",
                    )
                    resp = self.client.post(
                        "/api/ask",
                        data={
                            "question": "What is the fine?",
                            "lang": "en",
                            "result": self.sample_result,
                        },
                    )
                    self.assertEqual(resp.status_code, 200)
                    self.assertEqual(resp.json()["answer"], "Legacy without ADK")


if __name__ == "__main__":
    unittest.main()
