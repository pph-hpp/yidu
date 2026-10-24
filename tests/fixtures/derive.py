"""Optional fixture reproduction, requires pypdf (not an application dependency).
Download chen-hott-120.pdf from the URL in LICENSE.txt before running.
"""
from pathlib import Path
from pypdf import PdfReader, PdfWriter
root = Path(__file__).resolve().parent
writer = PdfWriter()
writer.append(PdfReader(root / "single-column.pdf"))
writer.encrypt("yidu-test")
writer.write(root / "encrypted.pdf")
writer = PdfWriter()
reader = PdfReader(root / "chen-hott-120.pdf")
for page in list(reader.pages)[:100]:
    writer.add_page(page)
writer.write(root / "chen-hott-100.pdf")

