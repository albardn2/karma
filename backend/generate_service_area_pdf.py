#!/usr/bin/env python3
import os
import sys
from datetime import timezone
from typing import Optional, List, Tuple
import re

from dotenv import load_dotenv
load_dotenv()

from sshtunnel import SSHTunnelForwarder
import paramiko

from sqlalchemy import create_engine, select, func, text
from sqlalchemy.orm import sessionmaker
from geoalchemy2.functions import ST_Within

# --- import your models (adjust if needed) ---
from models.common import Customer, Invoice, ServiceArea

# ----------------- CONFIG -----------------
SSH_HOST = "157.230.117.38" #os.getenv("SSH_HOST")
SSH_USER = "root" #os.getenv("SSH_USER")
SSH_PASSWORD ="aBa&8826833a" #os.getenv("SSH_PASSWORD")
SSH_KEY_FILE = os.getenv("SSH_KEY_FILE")

REMOTE_DB_HOST = os.getenv("REMOTE_DB_HOST", "127.0.0.1")
REMOTE_DB_PORT = int(os.getenv("REMOTE_DB_PORT", "5432"))
LOCAL_BIND_PORT = int(os.getenv("LOCAL_BIND_PORT", "6543"))

DB_USER = os.getenv("DB_USER", "local")
DB_PASS = os.getenv("DB_PASS", "local")
DB_NAME = os.getenv("DB_NAME", "backend")
OUTPUT_PDF = os.getenv("OUTPUT_PDF", "service_area_customers.pdf")

ARABIC_FONT_PATH = os.getenv("ARABIC_FONT_PATH", "NotoNaskhArabic-VariableFont_wght.ttf")  # Optional custom font path
USE_SSH = True


def build_database_url(local_port: int) -> str:
    return f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@127.0.0.1:{local_port}/{DB_NAME}"


def get_session(database_url: str):
    engine = create_engine(database_url, future=True)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return Session()


def fetch_service_area(session, sa_uuid: str) -> Optional[ServiceArea]:
    return session.execute(
        select(ServiceArea).where(
            ServiceArea.is_deleted == False,
            ServiceArea.uuid == sa_uuid
        )
    ).scalar_one_or_none()


def fetch_customers_in_service_area(session, service_area: ServiceArea) -> List[Tuple[str, str, str, str]]:
    last_inv_subq = (
        select(
            Invoice.customer_uuid.label("c_uuid"),
            func.max(Invoice.created_at).label("last_inv_ts"),
        )
        .where(Invoice.is_deleted == False)
        .group_by(Invoice.customer_uuid)
        .subquery()
    )

    q = (
        select(
            Customer.uuid,
            Customer.company_name,
            last_inv_subq.c.last_inv_ts,
            Customer.full_address,   # ✅ added address
        )
        .outerjoin(last_inv_subq, last_inv_subq.c.c_uuid == Customer.uuid)
        .where(
            Customer.is_deleted == False,
            Customer.coordinates.isnot(None),
            ST_Within(Customer.coordinates, service_area.geometry),
            )
        .order_by(Customer.company_name.asc())
    )

    rows = []
    for c_uuid, company, last_inv, address in session.execute(q).all():
        if last_inv is not None and last_inv.tzinfo is None:
            last_inv = last_inv.replace(tzinfo=timezone.utc)
        rows.append((
            c_uuid,
            company or "",
            last_inv.isoformat() if last_inv else "",
            address or "",
        ))
    return rows


# --------- PDF ---------
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Arabic shaping / bidi
import arabic_reshaper
from bidi.algorithm import get_display

ARABIC_FONT_NAME = "UnifiedArabicFont"
_ARABIC_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")


def rtl(s: str) -> str:
    if not s:
        return ""
    return get_display(arabic_reshaper.reshape(s))


def maybe_rtl(s: str) -> str:
    return rtl(s) if s and _ARABIC_RE.search(s) else s


def register_unified_font() -> bool:
    candidates = []
    if ARABIC_FONT_PATH:
        candidates.append(ARABIC_FONT_PATH)
    candidates += [
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/NotoSansArabic-Regular.ttf",
        os.path.expanduser("~/Library/Fonts/NotoSansArabic-Regular.ttf"),
        os.path.expanduser("~/Library/Fonts/DejaVuSans.ttf"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                pdfmetrics.registerFont(TTFont(ARABIC_FONT_NAME, path))
                return True
            except Exception as e:
                print(f"WARNING: failed to register {path}: {e}", file=sys.stderr)
    print("❌ No Arabic-capable font found! Set ARABIC_FONT_PATH to a TTF with Arabic + Latin support.", file=sys.stderr)
    return False


def build_pdf(rows: List[Tuple[str, str, str, str]], service_area: ServiceArea, output_path: str):
    if not register_unified_font():
        sys.exit(1)

    pagesize = landscape(LETTER)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=pagesize,
        leftMargin=0.40 * inch,
        rightMargin=0.40 * inch,
        topMargin=0.45 * inch,
        bottomMargin=0.45 * inch,
        title=f"Customers in Service Area {service_area.name} ({service_area.uuid})",
        allowSplitting=1,
    )

    styles = getSampleStyleSheet()

    base_style = ParagraphStyle(
        "base",
        parent=styles["BodyText"],
        fontName=ARABIC_FONT_NAME,
        fontSize=9,
        leading=11,
        alignment=TA_LEFT,
        splitLongWords=1,
        wordWrap="CJK",
    )
    body_center = ParagraphStyle("body_center", parent=base_style, alignment=TA_CENTER)

    header_style = ParagraphStyle(
        "header",
        parent=base_style,
        fontName=ARABIC_FONT_NAME,
        fontSize=11,
        leading=13,
        alignment=TA_RIGHT,
    )

    title_style = ParagraphStyle(
        "title",
        parent=base_style,
        fontName=ARABIC_FONT_NAME,
        fontSize=18,
        leading=22,
        alignment=TA_LEFT,
    )

    title = Paragraph(
        f"Customers in Service Area: {service_area.name} "
        f"&nbsp;&nbsp;<font size=10>UUID: {service_area.uuid}</font>",
        title_style,
    )

    # ✅ Arabic headers (now includes Address)
    header_cells = [
        Paragraph(rtl("مُعرّف العميل (UUID)"), header_style),
        Paragraph(rtl("اسم الشركة"), header_style),
        Paragraph(rtl("العنوان"), header_style),
        Paragraph(rtl("تاريخ/وقت آخر فاتورة"), header_style),
        Paragraph(rtl("المبيعات"), header_style),
        Paragraph(rtl("ملاحظة"), header_style),
    ]

    data = [header_cells]

    for c_uuid, company, last_inv_str, address in rows:
        data.append([
            Paragraph(c_uuid, base_style),
            Paragraph(maybe_rtl(company), base_style),
            Paragraph(maybe_rtl(address), base_style),
            Paragraph(last_inv_str or "", body_center),
            Paragraph("", body_center),
            Paragraph("", base_style),
        ])

    total_width = doc.width
    ratios = [0.20, 0.22, 0.28, 0.15, 0.07, 0.08]  # tuned for 6 columns
    col_widths = [total_width * r for r in ratios]

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ("ALIGN", (0, 0), (-1, 0), "RIGHT"),
    ]))

    story = [title, Spacer(1, 0.22 * inch), table]
    doc.build(story)


# --------- SSH TUNNEL ---------
def open_tunnel():
    if not SSH_HOST or not SSH_USER:
        print("ERROR: SSH_HOST/SSH_USER not set.", file=sys.stderr)
        sys.exit(1)

    ssh_pkey = None
    if SSH_KEY_FILE:
        ssh_pkey = paramiko.RSAKey.from_private_key_file(os.path.expanduser(SSH_KEY_FILE))

    server = SSHTunnelForwarder(
        (SSH_HOST, 22),
        ssh_username=SSH_USER,
        ssh_password=SSH_PASSWORD if SSH_PASSWORD and not ssh_pkey else None,
        ssh_pkey=ssh_pkey,
        remote_bind_address=(REMOTE_DB_HOST, REMOTE_DB_PORT),
        local_bind_address=("127.0.0.1", LOCAL_BIND_PORT),
    )
    server.start()
    return server


# --------- MAIN ---------
def main():
    print("Enter the Service Area UUID you want to use:")
    sa_uuid = input("> ").strip()
    if not sa_uuid:
        print("No UUID entered. Exiting.")
        sys.exit(1)

    server = None
    try:
        if USE_SSH:
            server = open_tunnel()
            local_port = server.local_bind_port
            database_url = build_database_url(local_port)
        else:
            database_url = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{REMOTE_DB_HOST}:{REMOTE_DB_PORT}/{DB_NAME}"

        session = get_session(database_url)

        try:
            session.execute(text("SELECT PostGIS_Version()"))
        except Exception as e:
            print(f"WARNING: Could not confirm PostGIS availability: {e}", file=sys.stderr)

        sa = fetch_service_area(session, sa_uuid)
        if not sa:
            print(f"ServiceArea '{sa_uuid}' not found.", file=sys.stderr)
            sys.exit(1)

        rows = fetch_customers_in_service_area(session, sa)
        build_pdf(rows, sa, OUTPUT_PDF)
        print(f"✅ PDF generated: {OUTPUT_PDF} (rows: {len(rows)})")

    finally:
        if server:
            server.stop()


if __name__ == "__main__":
    main()
