#!/usr/bin/env python3
"""Membangun berkas CV contoh (PDF & DOCX) untuk pengujian unggah CV.

Isi CV sengaja dibuat spesifik (nama proyek, angka) agar mudah diverifikasi
bahwa teksnya benar-benar terekstraksi backend, bukan sekadar berkas terunggah.
Dibangun dengan pustaka standar Python saja: PDF ditulis manual, DOCX adalah
arsip ZIP berisi XML minimal.
"""

import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).parent

LINES = [
    "ANDRI HARI MUSYAFFA",
    "Backend Engineer - Jakarta, Indonesia",
    "andrihari0704@gmail.com",
    "",
    "RINGKASAN",
    "Lulusan Teknik Informatika Universitas Bina Nusantara dengan tiga tahun",
    "pengalaman membangun layanan web berskala menengah.",
    "",
    "PENGALAMAN KERJA",
    "Backend Engineer - PT Maju Teknologi (2023 - sekarang)",
    "- Merancang layanan API yang melayani 50.000 permintaan per hari.",
    "- Menurunkan waktu respons rata-rata sebesar 40 persen.",
    "- Memimpin migrasi basis data dari MySQL ke PostgreSQL.",
    "",
    "KEAHLIAN",
    "Node.js, TypeScript, React, PostgreSQL, MongoDB, Docker",
    "",
    "PENDIDIKAN",
    "S1 Teknik Informatika, Universitas Bina Nusantara, IPK 3.60",
]


def build_pdf(path: Path) -> None:
    """PDF satu halaman, teks tak terkompresi agar mudah diekstraksi."""
    content = ["BT", "/F1 11 Tf", "14 TL", "50 780 Td"]
    for line in LINES:
        escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        content.append(f"({escaped}) Tj T*")
    content.append("ET")
    stream = "\n".join(content).encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode()

    path.write_bytes(bytes(out))


def build_docx(path: Path) -> None:
    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    paragraphs = "".join(
        f"<w:p><w:r><w:t xml:space='preserve'>{esc(line)}</w:t></w:r></w:p>"
        for line in LINES
    )
    document = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>"
        f"<w:body>{paragraphs}</w:body></w:document>"
    )
    content_types = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>"
        "<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>"
        "<Default Extension='xml' ContentType='application/xml'/>"
        "<Override PartName='/word/document.xml' ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/>"
        "</Types>"
    )
    rels = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>"
        "<Relationship Id='rId1' "
        "Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' "
        "Target='word/document.xml'/></Relationships>"
    )

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)


def main() -> int:
    build_pdf(HERE / "cv-andri.pdf")
    build_docx(HERE / "cv-andri.docx")
    # Berkas format salah untuk pengujian validasi negatif (UC-11).
    (HERE / "cv-invalid.txt").write_text("Ini bukan PDF maupun DOCX.\n", encoding="utf-8")
    for name in ("cv-andri.pdf", "cv-andri.docx", "cv-invalid.txt"):
        print(f"OK -> {HERE / name} ({(HERE / name).stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
