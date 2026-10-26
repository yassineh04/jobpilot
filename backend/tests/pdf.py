"""Builds small, valid text PDFs for tests (one line of text per row, Helvetica, Latin-1)."""


def make_pdf(lines: list[str]) -> bytes:
    def escape(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    rows = "\n".join(f"({escape(line)}) Tj 0 -16 Td" for line in lines)
    stream = f"BT /F1 11 Tf 50 780 Td\n{rows}\nET".encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


SAMPLE_CV = [
    "Alex Martin",
    "Backend developer - Montreal, QC",
    "EXPERIENCE",
    "Software Developer Intern, Lightspeed - Montreal",
    "May 2024 - Aug 2024",
    "- Built a REST API in Python and FastAPI used by 3 internal teams",
    "- Reduced PostgreSQL query time by 40% with better indexes",
    "Teaching Assistant, Concordia University",
    "Sept 2023 - present",
    "- Graded assignments for the Data Structures course",
    "EDUCATION",
    "Concordia University - Bachelor of Computer Science, 2022 - 2026, GPA 3.7",
    "PROJECTS",
    "JobPilot - job search tracker built with Next.js and Docker",
    "SKILLS",
    "Python, FastAPI, PostgreSQL, Docker, React, Git",
    "LANGUAGES",
    "French (native), English (fluent), Spanish (notions)",
]
