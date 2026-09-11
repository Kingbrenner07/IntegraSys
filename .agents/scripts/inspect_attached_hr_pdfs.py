from pathlib import Path
import fitz

FILES = [
    Path("attached_assets/43_-_TERMO_DE_FORNECIMENTO_DE_TRANSPORTE_1789058383065.pdf"),
    Path("attached_assets/04_-_DECLARAÇÃO_DE_DEPENDENTES_PARA_IR_1789058404355.pdf"),
]

out_dir = Path(".agents/outputs/attached_hr_pdf_pages")
out_dir.mkdir(parents=True, exist_ok=True)

for path in FILES:
    doc = fitz.open(path)
    print(f"\nFILE {path.name} pages={doc.page_count}")
    for index, page in enumerate(doc):
        text = page.get_text("text").replace("\x00", " ").strip()
        print(f"\n--- PAGE {index + 1} ---\n{text[:5000]}")
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        output = out_dir / f"{path.stem}__page-{index + 1}.png"
        pix.save(output)
        print(f"RENDERED {output}")