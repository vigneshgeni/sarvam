"""document_kind maps to the coarse document_type, and a profile round-trips."""
import unittest

from models import DocumentProfile, ExplainResponse, KIND_TO_DOCUMENT_TYPE, coarse_type_for_kind


class KindMappingTests(unittest.TestCase):
    def test_every_kind_has_a_coarse_type(self):
        self.assertEqual(len(KIND_TO_DOCUMENT_TYPE), 23)
        self.assertEqual(coarse_type_for_kind("lab_report"), "medical")
        self.assertEqual(coarse_type_for_kind("prescription"), "medical")
        self.assertEqual(coarse_type_for_kind("loan"), "bank")
        self.assertEqual(coarse_type_for_kind("invoice"), "receipt")
        self.assertEqual(coarse_type_for_kind("pension_notice"), "government_notice")
        self.assertEqual(coarse_type_for_kind("form"), "other")
        self.assertIsNone(coarse_type_for_kind(None))

    def test_response_derives_type_from_kind(self):
        body = ExplainResponse(
            document_kind="lab_report",
            document_type="other",
            doc_type="other",
            title="Blood test",
            language="en",
            summary=["A lab report."],
            profile=DocumentProfile(lab_name="City Diagnostics", referred_by="Dr A"),
        )
        self.assertEqual(body.document_type, "medical")
        self.assertEqual(body.doc_type, "medical")
        self.assertEqual(body.profile.lab_name, "City Diagnostics")

    def test_old_result_without_kind_keeps_its_type(self):
        body = ExplainResponse(
            document_type="insurance",
            doc_type="insurance",
            title="Claim",
            language="en",
            summary=["A claim letter."],
        )
        self.assertEqual(body.document_type, "insurance")
        self.assertIsNone(body.document_kind)


if __name__ == "__main__":
    unittest.main()
