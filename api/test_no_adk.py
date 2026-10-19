"""Test that the application runs completely without google-adk installed when AGENT_ASK=0."""

import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient


class TestNoADK(unittest.TestCase):
    def test_main_and_ask_work_without_adk(self):
        """Verify that importing main and querying /api/ask works with AGENT_ASK=0 when ADK is not present."""
        with patch.dict(os.environ, {"AGENT_ASK": "0"}):
            with patch.dict("sys.modules", {"google.adk": None, "agent": None, "agent.runner": None}):
                import main
                client = TestClient(main.app)
                res = client.get("/health")
                self.assertEqual(res.status_code, 200)

                with patch("reader.ask_document_single_attempt") as mock_ask:
                    from models import AskResponse
                    mock_ask.return_value = AskResponse(
                        answer="Standard response without ADK",
                        language="en",
                        answered_from="document",
                    )
                    resp = client.post(
                        "/api/ask",
                        data={
                            "question": "What is the fine?",
                            "lang": "en",
                            "result": '{"source_kind": "text_pdf", "source_text": "Sample"}'
                        }
                    )
                    self.assertEqual(resp.status_code, 200)
                    self.assertEqual(resp.json()["answer"], "Standard response without ADK")


if __name__ == "__main__":
    unittest.main()
