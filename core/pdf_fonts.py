"""Register bundled fonts that support Polish diacritics for ReportLab PDFs."""

from pathlib import Path

from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = Path(__file__).resolve().parent / 'fonts'
FONT_REGULAR = 'DejaVuSans'
FONT_BOLD = 'DejaVuSans-Bold'

_registered = False


def register_polish_fonts():
    """Idempotent registration of DejaVu Sans (regular + bold)."""
    global _registered
    if _registered:
        return FONT_REGULAR, FONT_BOLD

    regular_path = FONT_DIR / 'DejaVuSans.ttf'
    bold_path = FONT_DIR / 'DejaVuSans-Bold.ttf'
    if not regular_path.is_file() or not bold_path.is_file():
        raise FileNotFoundError(
            f'Brak fontów DejaVu w {FONT_DIR}. '
            'Dodaj DejaVuSans.ttf oraz DejaVuSans-Bold.ttf.'
        )

    pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(regular_path)))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(bold_path)))
    _registered = True
    return FONT_REGULAR, FONT_BOLD


def polish_paragraph_styles():
    """Title / Normal / Heading styles using DejaVu (ąęćłńóśźż)."""
    regular, bold = register_polish_fonts()
    base = getSampleStyleSheet()
    return {
        'title': ParagraphStyle(
            'PolishTitle',
            parent=base['Title'],
            fontName=bold,
            fontSize=18,
            leading=22,
        ),
        'normal': ParagraphStyle(
            'PolishNormal',
            parent=base['Normal'],
            fontName=regular,
            fontSize=10,
            leading=14,
        ),
        'heading': ParagraphStyle(
            'PolishHeading',
            parent=base['Heading2'],
            fontName=bold,
            fontSize=12,
            leading=16,
        ),
    }
