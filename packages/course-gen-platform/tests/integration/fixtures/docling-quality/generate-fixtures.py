"""Generate deterministic quality fixtures for the Docling A/B benchmark."""

from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm as DocxCm
from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Cm, Pt
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parent
FONT_PATH = Path("C:/Windows/Fonts/arial.ttf")


def _append_value(parent, tag: str, value: str):
    element = OxmlElement(tag)
    element.set(qn("w:val"), value)
    parent.append(element)
    return element


def _add_multilevel_decimal_numbering(document: Document) -> int:
    numbering = document.part.numbering_part.element
    abstract_ids = [
        int(element.get(qn("w:abstractNumId")))
        for element in numbering.findall(qn("w:abstractNum"))
    ]
    num_ids = [
        int(element.get(qn("w:numId")))
        for element in numbering.findall(qn("w:num"))
    ]
    abstract_id = max(abstract_ids, default=-1) + 1
    num_id = max(num_ids, default=0) + 1

    abstract = OxmlElement("w:abstractNum")
    abstract.set(qn("w:abstractNumId"), str(abstract_id))
    _append_value(abstract, "w:multiLevelType", "multilevel")
    for level, marker, left in ((0, "%1.", 720), (1, "%1.%2.", 1440)):
        level_element = OxmlElement("w:lvl")
        level_element.set(qn("w:ilvl"), str(level))
        _append_value(level_element, "w:start", "1")
        _append_value(level_element, "w:numFmt", "decimal")
        _append_value(level_element, "w:lvlText", marker)
        _append_value(level_element, "w:lvlJc", "left")
        paragraph_properties = OxmlElement("w:pPr")
        indentation = OxmlElement("w:ind")
        indentation.set(qn("w:left"), str(left))
        indentation.set(qn("w:hanging"), "360")
        paragraph_properties.append(indentation)
        level_element.append(paragraph_properties)
        abstract.append(level_element)
    numbering.append(abstract)

    concrete = OxmlElement("w:num")
    concrete.set(qn("w:numId"), str(num_id))
    _append_value(concrete, "w:abstractNumId", str(abstract_id))
    numbering.append(concrete)
    return num_id


def _set_list_level(paragraph, num_id: int, level: int) -> None:
    num_properties = paragraph._p.get_or_add_pPr().get_or_add_numPr()
    indentation_level = num_properties.find(qn("w:ilvl"))
    if indentation_level is None:
        indentation_level = OxmlElement("w:ilvl")
        num_properties.insert(0, indentation_level)
    indentation_level.set(qn("w:val"), str(level))
    numbering_id = num_properties.find(qn("w:numId"))
    if numbering_id is None:
        numbering_id = OxmlElement("w:numId")
        num_properties.append(numbering_id)
    numbering_id.set(qn("w:val"), str(num_id))


def make_docx() -> None:
    document = Document()
    document.add_heading("Проверка структуры документа", level=1)
    document.add_heading("Нумерованные и вложенные списки", level=2)
    list_num_id = _add_multilevel_decimal_numbering(document)
    list_items = (
        ("Первый обязательный шаг", "List Number", 0),
        ("Вложенный шаг А", "List Number 2", 1),
        ("Вложенный шаг Б", "List Number 2", 1),
        ("Второй обязательный шаг", "List Number", 0),
    )
    for text, style, level in list_items:
        paragraph = document.add_paragraph(text, style=style)
        _set_list_level(paragraph, list_num_id, level)

    document.add_heading("Таблица с объединёнными ячейками", level=2)
    table = document.add_table(rows=3, cols=3)
    table.style = "Table Grid"
    merged = table.cell(0, 0).merge(table.cell(0, 2))
    merged.text = "Сводные показатели"
    merged.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    rows = [
        ("Метрика", "Значение", "Единица"),
        ("Точность", "98", "процентов"),
    ]
    for row_index, values in enumerate(rows, start=1):
        for column_index, value in enumerate(values):
            table.cell(row_index, column_index).text = value
    for section in document.sections:
        section.top_margin = DocxCm(2)
        section.bottom_margin = DocxCm(2)
    document.save(ROOT / "structured-lists-and-table.docx")


def add_textbox(slide, left, top, width, height, text, size=20, bold=False):
    shape = slide.shapes.add_textbox(Cm(left), Cm(top), Cm(width), Cm(height))
    paragraph = shape.text_frame.paragraphs[0]
    paragraph.text = text
    paragraph.font.size = Pt(size)
    paragraph.font.bold = bold
    return shape


def make_pptx() -> None:
    presentation = Presentation()
    presentation.slide_width = Cm(33.867)
    presentation.slide_height = Cm(19.05)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])

    add_textbox(slide, 1.5, 0.7, 28, 1.4, "Порядок чтения и данные диаграммы", 28, True)
    add_textbox(slide, 2, 3.0, 8, 2, "Шаг один: собрать данные", 20, True)
    arrow = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Cm(10.5), Cm(3.2), Cm(4), Cm(1.4))
    arrow.fill.solid()
    arrow.fill.fore_color.rgb = RGBColor(47, 111, 191)
    add_textbox(slide, 15, 3.0, 9, 2, "Шаг два: проверить результат", 20, True)
    add_textbox(slide, 2, 5.3, 22, 1, "Подпись схемы: последовательность обработки", 15)

    chart_data = ChartData()
    chart_data.categories = ["Квартал 1", "Квартал 2", "Квартал 3"]
    chart_data.add_series("Документы", (10, 20, 30))
    chart = slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        Cm(2),
        Cm(7),
        Cm(22),
        Cm(9),
        chart_data,
    ).chart
    chart.has_title = True
    chart.chart_title.text_frame.text = "Обработанные документы по кварталам"
    add_textbox(slide, 24.8, 8, 7, 4, "Контрольные значения:\n10, 20, 30", 18, True)
    presentation.save(ROOT / "reading-order-chart.pptx")


def make_raster_ocr_pdf() -> None:
    width, height = 2480, 3508
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(FONT_PATH), 62)
    heading = ImageFont.truetype(str(FONT_PATH), 74)
    small = ImageFont.truetype(str(FONT_PATH), 48)

    draw.text((160, 180), "РУССКИЙ OCR: КОНТРОЛЬНЫЙ ДОКУМЕНТ", font=heading, fill="black")
    draw.text(
        (160, 390),
        "КОНТРОЛЬНАЯ ФРАЗА: КАЧЕСТВО РАСПОЗНАВАНИЯ",
        font=font,
        fill="black",
    )
    draw.text(
        (160, 520),
        "ВТОРАЯ ФРАЗА: ДОКУМЕНТЫ ПРЕВРАЩАЮТСЯ В ЗНАНИЯ",
        font=font,
        fill="black",
    )

    x_positions = [160, 1050, 1650, 2260]
    y_positions = [850, 1040, 1230, 1420]
    for x in x_positions:
        draw.line((x, y_positions[0], x, y_positions[-1]), fill="black", width=7)
    for y in y_positions:
        draw.line((x_positions[0], y, x_positions[-1], y), fill="black", width=7)
    cells = [
        ("Показатель", "Значение", "Единица"),
        ("Точность", "98", "процентов"),
        ("Страницы", "12", "штук"),
    ]
    for row, values in enumerate(cells):
        for column, value in enumerate(values):
            draw.text((x_positions[column] + 25, y_positions[row] + 45), value, font=small, fill="black")

    png_path = ROOT / ".raster-ocr-source.png"
    image.save(png_path, dpi=(300, 300))
    page_width, page_height = A4
    pdf = canvas.Canvas(str(ROOT / "russian-raster-ocr.pdf"), pagesize=A4, pageCompression=1)
    pdf.drawImage(ImageReader(str(png_path)), 0, 0, page_width, page_height)
    pdf.showPage()
    pdf.save()
    png_path.unlink()


PIXEL_FONT = {
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
}


def make_vector_outline_pdf() -> None:
    pdf = canvas.Canvas(str(ROOT / "vector-outlines-no-text.pdf"), pagesize=A4, pageCompression=1)
    scale = 10
    x, y = 90, 500
    for character in "NO TEXT":
        if character == " ":
            x += scale * 4
            continue
        for row, pattern in enumerate(PIXEL_FONT[character]):
            for column, bit in enumerate(pattern):
                if bit == "1":
                    pdf.rect(x + column * scale, y - row * scale, scale, scale, stroke=0, fill=1)
        x += scale * 7
    # Vector-only diagram elements make the negative case non-empty visually.
    pdf.setLineWidth(3)
    pdf.circle(180, 300, 55, stroke=1, fill=0)
    pdf.line(235, 300, 360, 300)
    pdf.rect(360, 245, 110, 110, stroke=1, fill=0)
    pdf.showPage()
    pdf.save()


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    make_docx()
    make_pptx()
    make_raster_ocr_pdf()
    make_vector_outline_pdf()
