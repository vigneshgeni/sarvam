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

    def test_a_long_pdf_splits_into_five_page_calls(self):
        import io
        import pypdf
        from reader import PAGE_CHUNK, pdf_page_chunks, pdf_page_count

        writer = pypdf.PdfWriter()
        for _ in range(10):
            writer.add_blank_page(width=72, height=72)
        buf = io.BytesIO()
        writer.write(buf)
        data = buf.getvalue()
        self.assertEqual(pdf_page_count([(data, "application/pdf")]), 10)
        chunks = pdf_page_chunks(data)
        self.assertEqual([(start, end) for _, start, end in chunks], [(1, 5), (6, 10)])
        self.assertEqual(PAGE_CHUNK, 5)
        self.assertEqual(pdf_page_count([(b"jpg", "image/jpeg")]), 0)

    def test_an_in_range_lab_row_matches_by_label_and_value(self):
        from evidence import match_lab_row

        pages = ["Haemoglobin 13.2 g/dL 12.0 – 15.0"]
        self.assertEqual(match_lab_row("Haemoglobin", "13.2", "", 1, pages), "matched")
        self.assertEqual(match_lab_row("Haemoglobin", "99", "", 1, pages), "check_original")


if __name__ == "__main__":
    unittest.main()
