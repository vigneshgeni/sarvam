"""document_kind maps to the coarse document_type, and a profile round-trips."""

from models import GeminiReaderResponse, lift_reader_result
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

    def test_one_part_is_returned_as_a_single_document(self):
        raw = GeminiReaderResponse(
            title="Loan",
            language="en",
            summary=["A loan."],
            profile="",
            parts=[{
                "part_id": "part-1",
                "title": "Loan",
                "document_type": "bank",
                "document_kind": "loan",
                "pages": [1, 1],
                "profile": {"tenure": "20 years", "emi_day_of_month": 5},
            }],
        )
        lifted = lift_reader_result(raw)
        self.assertIsNone(lifted.parts)
        self.assertEqual(lifted.document_kind, "loan")
        self.assertEqual(lifted.profile.tenure, "20 years")
        self.assertEqual(lifted.profile.emi_day_of_month, 5)

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

    def test_a_long_pdf_keeps_a_longer_budget(self):
        import io
        import pypdf
        from reader import (
            LONG_DOCUMENT_PAGES,
            LONG_REQUEST_DEADLINE,
            REQUEST_DEADLINE,
            pdf_page_count,
        )

        writer = pypdf.PdfWriter()
        for _ in range(8):
            writer.add_blank_page(width=72, height=72)
        buf = io.BytesIO()
        writer.write(buf)
        self.assertEqual(pdf_page_count([(buf.getvalue(), "application/pdf")]), 8)
        self.assertGreaterEqual(8, LONG_DOCUMENT_PAGES)
        self.assertEqual(pdf_page_count([(b"jpg", "image/jpeg")]), 0)
        self.assertGreater(LONG_REQUEST_DEADLINE, REQUEST_DEADLINE)


if __name__ == "__main__":
    unittest.main()
