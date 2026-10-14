# EXPECTED FACTS FOR THE THREE EARLIER SAMPLES (written from the documents, not from the app)

Labels: [M] stated in the document (Matched), [C] computed in code from document dates (Calculated). "Today" in these notes is 12 Oct 2026; behaviour for past dates follows "Date passed" rules.

## sample-invoice-warranty.pdf (tax invoice, mobile phone purchase)
- Issuer: Sunrise Mobiles & Electronics, Coimbatore [M]. Invoice No SME/2026/004217 [M]. Invoice date 08 Oct 2026 [M].
- Item: Zephyr M5 5G (8GB + 128GB), Midnight Blue; IMEI 356000000012345 [M]. Quantity 1.
- Taxable value Rs. 17,795.76; CGST 9% Rs. 1,601.62; SGST 9% Rs. 1,601.62; total paid Rs. 20,999.00 [M]. Payment by UPI [M].
- Warranty valid until 07 Oct 2027 [M] (12 months from invoice date).
- Register warranty on the brand's app within 30 days of purchase: 07 Nov 2026 [C]. Without it only 6-month standard cover applies [M].
- Out-of-box defect: report to the store within 48 hours of purchase with invoice and original box: 10 Oct 2026 [C]. This date has passed on 12 Oct 2026, so: "Date passed", no calendar button, not in "Add all dates".
- Warnings stated in the document: warranty does not cover physical damage, liquid damage or unauthorised repairs; goods once sold are not returnable or refundable [M].
- Contact: support@sunrisemobiles.example, 0422-000-0000 [M].
- Share default: customer name (Meena Subramanian), phone, address, IMEI, invoice number, UPI reference are hidden; store name, item, amounts and dates stay.
- Ask checks: "Which product did I buy?" must answer Zephyr M5 5G (8GB + 128GB) from the document; "How long is the warranty?" until 07 Oct 2027.

## sample-property-tax-notice.pdf (municipal property tax demand notice)
- Issuer: Anand Nagar Municipality, Revenue Department [M]. Notice No ANM/PT/2026/07741 [M]. Notice date 08 Oct 2026 [M]. Property ID AN/07/0412/0089, Ward 7 [M]. Owner Kamala Devi [M].
- Amounts: property tax 3,200.00 + library cess 160.00 + water and drainage 480.00 = total demand Rs. 3,840.00 [M].
- Early payment rebate 5% (Rs. 192.00) if paid on or before 30 Nov 2026; payable with rebate Rs. 3,648.00 [M].
- Last date to pay without penalty: 31 Dec 2026 [M]. After that 2% per month penalty on the unpaid amount [M].
- File a written objection with the Assessor within 30 days of the notice date: 07 Nov 2026 [C].
- Warning stated: non-payment may lead to recovery action as per municipal rules [M].
- How to pay: online at pay.anandnagarmunicipality.example with the Property ID; counter Monday to Friday 10:00 am to 4:00 pm [M]. Helpline 0422-000-0000 [M].
- Upcoming actions on 12 Oct 2026: 30 Nov 2026, 31 Dec 2026, 07 Nov 2026 (all three can be added to the calendar).
- Share default: owner name, property ID and notice number hidden; municipality name, amounts and dates stay.

## sample-echallan.pdf (traffic e-challan) → design screen 14, challan column
- Issuer: City Traffic Police, Anand Nagar [M]. Challan No ECH/2026/0098121 [M]. Notice date 06 Oct 2026, 11:42 am [M]. Vehicle TN 99 AB 1234, two-wheeler [M]. Place: Lake Road Junction [M]. Owner Suresh Raman [M].
- Violation: rider without a helmet, recorded by roadside camera [M]. Fine Rs. 1,000.00 [M].
- Pay within 60 days of the notice date, on or before 05 Dec 2026 [M] (the document states the date). Contesting also by 05 Dec 2026 [M].
- Warning stated: if not paid or contested by 05 Dec 2026 the case may be forwarded to the Virtual Court and additional charges may apply [M].
- No warnings may be invented beyond the document (for example, nothing about licence points or imprisonment).
- Share default: owner name, vehicle number and challan number hidden; authority name, violation, fine and dates stay.

## Notes for testers
- Dates in these samples run to 31 Dec 2026. After a date passes, "Date passed" is the correct behaviour.
- Currency should display as Rs./₹ with Indian digit grouping (₹20,999.00, ₹3,840.00, ₹1,000.00).
- All three have a text layer. Also test the PNG versions as photos (OCR path).
