"""
data/raw/{decisions,criteria}/{id}/ 의 첨부파일(또는 본문)에서 텍스트를 추출해
data/parsed/{decisions,criteria}/{id}.json 으로 저장한다.

hwp 표 추출에 대한 주의사항:
  pyhwp의 표준 CLI(hwp5txt)는 xsl/plaintext.xsl에서 TableControl을
  "<표>" placeholder로만 찍고 실제 셀 내용은 버린다(pyhwp 자체 한계).
  그래서 hwp5txt를 그대로 쓰지 않고, Hwp5File의 내부 XML 모델을
  (hwp5proc xml과 동일한 xmlevents/xmldump_nested로) 직접 얻어와
  TableControl/TableBody/TableRow/TableCell을 순회하며 셀 텍스트를
  " | "로 이어붙이는 방식으로 표 내용을 살린다.

사용법:
  python scripts/parse_docs.py --ids 127565,131672 --target decisions   # 소규모 테스트
  python scripts/parse_docs.py                                          # 전체 처리
  python scripts/parse_docs.py --force                                  # 이미 처리된 것도 재처리
"""

import argparse
import csv
import io
import json
import logging
import re
import shutil
import zipfile
from contextlib import closing
from pathlib import Path
from xml.etree import ElementTree as ET

import pdfplumber
from hwp5.proc.xml import xmldump_nested
from hwp5.xmlmodel import Hwp5File

DATA_RAW = Path("data/raw")
DATA_PARSED = Path("data/parsed")
DATA_FAILED = Path("data/failed")
FAILURES_CSV = DATA_FAILED / "failures.csv"

MIN_TEXT_LEN = 200

BOARDS = {
    "decisions": {"name": "분쟁조정결정례", "raw_dir": DATA_RAW / "decisions", "parsed_dir": DATA_PARSED / "decisions"},
    "criteria": {"name": "분쟁해결기준", "raw_dir": DATA_RAW / "criteria", "parsed_dir": DATA_PARSED / "criteria"},
    "main_precedents": {"name": "주요판례", "raw_dir": DATA_RAW / "main_precedents", "parsed_dir": DATA_PARSED / "main_precedents"},
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logging.getLogger("hwp5").setLevel(logging.WARNING)
logger = logging.getLogger("parse_docs")


# ---------------------------------------------------------------------------
# hwp 추출 (표 내용 포함)
# ---------------------------------------------------------------------------

# hwp5의 xmldump_nested가 이따금 폰트 이름 등 속성값에 XML 1.0에서 허용되지
# 않는 제어문자(예: \x04)를 그대로 실어 보내 ET.fromstring이 "not well-formed"로
# 죽는 경우가 있다. 본문과 무관한 DocInfo 쪽 값이므로 안전하게 제거한다.
_XML_INVALID_CHARS_RE = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _hwp_to_xml_root(path: Path) -> ET.Element:
    with closing(Hwp5File(str(path))) as hwp5file:
        buf = io.BytesIO()
        xmldump_nested(hwp5file, buf, embedbin=False, xml_declaration=False)
        xml_text = buf.getvalue().decode("utf-8", errors="replace")
    xml_text = _XML_INVALID_CHARS_RE.sub("", xml_text)
    return ET.fromstring(xml_text)


def _walk_hwp_table(table_body: ET.Element, out: list) -> None:
    for row in table_body.findall("TableRow"):
        cell_texts = []
        for cell in row.findall("TableCell"):
            buf = []
            _walk_hwp_node(cell, buf)
            cell_texts.append("".join(buf).strip().replace("\n", " "))
        out.append(" | ".join(cell_texts))
        out.append("\n")


def _walk_hwp_node(elem: ET.Element, out: list) -> None:
    tag = elem.tag
    if tag == "Text":
        if elem.text:
            out.append(elem.text)
        return
    if tag == "ControlChar":
        return
    if tag == "GShapeObjectControl":
        out.append("\n<그림>\n")
        return
    if tag == "TableControl":
        out.append("\n<표>\n")
        body = elem.find("TableBody")
        if body is not None:
            _walk_hwp_table(body, out)
        out.append("</표>\n")
        return
    for child in elem:
        _walk_hwp_node(child, out)
    if tag == "Paragraph":
        out.append("\n")


def extract_hwp(path: Path) -> str:
    root = _hwp_to_xml_root(path)
    body = root.find("BodyText")
    if body is None:
        return ""
    out = []
    _walk_hwp_node(body, out)
    return "".join(out).strip()


# ---------------------------------------------------------------------------
# hwpx 추출 (표 내용 포함) - Contents/section*.xml 안의 텍스트 노드를 순회
# ---------------------------------------------------------------------------

def _walk_hwpx_node(elem: ET.Element, out: list) -> None:
    local = elem.tag.rsplit("}", 1)[-1]
    if local == "t":
        if elem.text:
            out.append(elem.text)
        return
    for child in elem:
        _walk_hwpx_node(child, out)
    if local == "tc":
        out.append("\t")
    elif local == "tr":
        out.append("\n")
    elif local == "p":
        out.append("\n")


def extract_hwpx(path: Path) -> str:
    out = []
    with zipfile.ZipFile(path) as zf:
        section_names = sorted(
            n for n in zf.namelist()
            if re.match(r"Contents/section\d+\.xml$", n, re.IGNORECASE)
        )
        for name in section_names:
            root = ET.fromstring(zf.read(name))
            _walk_hwpx_node(root, out)
    return "".join(out).strip()


# ---------------------------------------------------------------------------
# pdf 추출 (표 내용 포함)
# ---------------------------------------------------------------------------

def extract_pdf(path: Path) -> str:
    parts = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text:
                parts.append(text)
            for table in page.extract_tables():
                rows = [" | ".join((c or "").strip() for c in row) for row in table]
                parts.append("\n<표>\n" + "\n".join(rows) + "\n</표>")
    return "\n".join(parts).strip()


def extract_from_file(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".hwp":
        return extract_hwp(path)
    if ext == ".hwpx":
        return extract_hwpx(path)
    if ext == ".pdf":
        return extract_pdf(path)
    raise ValueError(f"지원하지 않는 파일 형식: {ext}")


# ---------------------------------------------------------------------------
# 메타데이터 / 실패 기록
# ---------------------------------------------------------------------------

def load_metadata(raw_dir: Path) -> dict:
    path = raw_dir / "metadata.jsonl"
    records = {}
    if not path.exists():
        return records
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            post_id = rec.get("post_id")
            if post_id:
                records[post_id] = rec
    return records


def log_failure(board: str, post_id: str, filename: str, reason: str) -> None:
    FAILURES_CSV.parent.mkdir(parents=True, exist_ok=True)
    is_new = not FAILURES_CSV.exists()
    with FAILURES_CSV.open("a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["board", "id", "filename", "reason"])
        writer.writerow([board, post_id, filename, reason])


def copy_to_failed(src: Path, board: str, post_id: str) -> None:
    dest_dir = DATA_FAILED / board / post_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    if not dest.exists():
        shutil.copy2(src, dest)


# ---------------------------------------------------------------------------
# 게시글 단위 처리
# ---------------------------------------------------------------------------

def process_post(board_key: str, board_name: str, post_id: str, record: dict,
                  raw_dir: Path, parsed_dir: Path, force: bool) -> str:
    parsed_path = parsed_dir / f"{post_id}.json"
    if parsed_path.exists() and not force:
        return "skip"

    post_dir = raw_dir / post_id
    attachments = record.get("attachments") or []
    texts = []
    source_files = []
    had_failure = False

    if attachments:
        for fname in attachments:
            fpath = post_dir / fname
            if not fpath.exists():
                log_failure(board_key, post_id, fname, "첨부파일이 data/raw에 없음")
                had_failure = True
                continue
            try:
                text = extract_from_file(fpath)
            except Exception as exc:
                logger.error("%s: %s/%s 추출 실패: %s", board_name, post_id, fname, exc)
                log_failure(board_key, post_id, fname, f"추출 실패: {exc}")
                copy_to_failed(fpath, board_key, post_id)
                had_failure = True
                continue
            if len(text) < MIN_TEXT_LEN:
                logger.error("%s: %s/%s 추출 텍스트 %d자 (200자 미만)", board_name, post_id, fname, len(text))
                log_failure(board_key, post_id, fname, f"추출 텍스트 {len(text)}자 (200자 미만)")
                copy_to_failed(fpath, board_key, post_id)
                had_failure = True
                continue
            texts.append(text)
            source_files.append(fname)
    else:
        body_path = post_dir / "body.txt"
        if body_path.exists():
            body_text = body_path.read_text(encoding="utf-8").strip()
            if len(body_text) < MIN_TEXT_LEN:
                log_failure(board_key, post_id, "body.txt", f"본문 텍스트 {len(body_text)}자 (200자 미만)")
                had_failure = True
            else:
                texts.append(body_text)
                source_files.append("body.txt")
        else:
            log_failure(board_key, post_id, "-", "첨부파일도 본문(body.txt)도 없음")
            had_failure = True

    if not texts:
        return "fail"

    output = {
        "id": post_id,
        "title": record.get("title", ""),
        "sector": record.get("region", ""),
        "type": record.get("type", ""),
        "date": record.get("date", ""),
        "source_files": source_files,
        "text": "\n\n".join(texts),
    }
    parsed_dir.mkdir(parents=True, exist_ok=True)
    parsed_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    return "partial" if had_failure else "ok"


def run_board(board_key: str, force: bool, ids_filter: list) -> None:
    cfg = BOARDS[board_key]
    metadata = load_metadata(cfg["raw_dir"])
    logger.info("%s: metadata %d건 로드", cfg["name"], len(metadata))
    if not metadata:
        logger.warning("%s: metadata.jsonl이 없거나 비어있음, 건너뜀", cfg["name"])
        return

    target_ids = ids_filter if ids_filter else list(metadata.keys())
    stats = {"ok": 0, "partial": 0, "fail": 0, "skip": 0}
    for post_id in target_ids:
        record = metadata.get(post_id)
        if record is None:
            logger.warning("%s: %s - metadata에 없음, 건너뜀", cfg["name"], post_id)
            continue
        result = process_post(board_key, cfg["name"], post_id, record, cfg["raw_dir"], cfg["parsed_dir"], force)
        stats[result] += 1
        logger.info("%s: %s -> %s", cfg["name"], post_id, result)

    logger.info(
        "%s: 완료 - ok=%d partial=%d fail=%d skip=%d",
        cfg["name"], stats["ok"], stats["partial"], stats["fail"], stats["skip"],
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="FSS 첨부파일/본문 텍스트 추출기")
    parser.add_argument("--target", choices=["decisions", "criteria", "main_precedents", "all"], default="all")
    parser.add_argument("--force", action="store_true", help="이미 parsed된 게시글도 덮어쓰기")
    parser.add_argument("--ids", help="쉼표로 구분된 게시글 ID만 처리 (소규모 테스트용)")
    args = parser.parse_args()

    ids_filter = [x.strip() for x in args.ids.split(",")] if args.ids else None

    board_keys = list(BOARDS.keys()) if args.target == "all" else [args.target]
    for board_key in board_keys:
        run_board(board_key, args.force, ids_filter)


if __name__ == "__main__":
    main()
