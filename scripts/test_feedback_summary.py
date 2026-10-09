import unittest

from feedback_summary import summarize


class SummarizeTests(unittest.TestCase):
    def test_excludes_sample_traffic_and_counts_reasons(self) -> None:
        summary = summarize(
            [
                {"rating": "up", "lang": "en", "sample": False},
                {
                    "rating": "down",
                    "lang": "ta",
                    "sample": True,
                    "reasons": ["wrong_date"],
                },
                {
                    "rating": "down",
                    "lang": "hi",
                    "sample": False,
                    "reasons": ["wrong_amount", "other"],
                },
            ]
        )
        self.assertEqual(summary["included"], 2)
        self.assertEqual(summary["excluded_sample"], 1)
        self.assertEqual(summary["rating"], {"up": 1, "down": 1})
        self.assertEqual(summary["language"], {"en": 1, "hi": 1})
        self.assertEqual(summary["reasons"], {"wrong_amount": 1, "other": 1})
        self.assertEqual(summary["doc_type"], {"unknown": 2})

    def test_counts_api_categories_and_folds_the_rest_into_unknown(self) -> None:
        summary = summarize(
            [
                {"rating": "up", "lang": "en", "sample": False, "docType": "medical"},
                {"rating": "up", "lang": "en", "sample": False, "docType": "government_notice"},
                {"rating": "down", "lang": "ta", "sample": False, "docType": "lab_report"},
                {"rating": "up", "lang": "hi", "sample": False, "docType": "insurance"},
            ]
        )
        self.assertEqual(
            summary["doc_type"],
            {"medical": 1, "government_notice": 1, "unknown": 1, "insurance": 1},
        )


if __name__ == "__main__":
    unittest.main()
