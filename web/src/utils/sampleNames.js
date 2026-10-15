/**
 * Person names from the bundled sample caches, including mixed-script
 * renderings such as the Marathi e-challan "सुरेश Raman".
 * Places and institutions (Anand Nagar, hospitals, courts) are not listed.
 * Hide applies this list even when a cache has no protected_terms_rendered.
 */
export const SAMPLE_NAME_RENDERINGS = {
  'sample-court-summons.pdf': ['Shri Anand Rao', 'Anand Rao', 'Shri Karthik S.', 'Karthik S.', 'Smt. R. Lakshmi', 'R. Lakshmi'],
  'sample-echallan.pdf': ['Suresh Raman', 'सुरेश Raman'],
  'sample-health-checkup.pdf': ['Mr. Prakash N.', 'Prakash N.', 'Dr. K. Menon', 'K. Menon', 'Dr. P. Iyer', 'P. Iyer'],
  'sample-insurance-letter.pdf': ['Mr. Ravi Kumar', 'Ravi Kumar'],
  'sample-invoice-warranty.pdf': ['Meena Subramanian'],
  'sample-lab-report.pdf': ['Mr. Suresh Babu', 'Suresh Babu', 'Dr. A. Rao', 'A. Rao', 'Dr. P. Nair', 'P. Nair'],
  'sample-mutual-fund-statement.pdf': ['Ms. Meera Iyer', 'Meera Iyer'],
  'sample-pension-notice.jpg': ['Smt. Kamala Devi', 'Kamala Devi'],
  'sample-prescription.jpg': ['Dr. S. Rao', 'S. Rao', 'Lakshmi Narayan'],
  'sample-property-tax-notice.pdf': ['Kamala Devi'],
}

export const SAMPLE_NAME_RENDERING_LIST = [...new Set(Object.values(SAMPLE_NAME_RENDERINGS).flat())]
