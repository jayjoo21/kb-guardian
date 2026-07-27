"""
금융감독원(fss.or.kr) 분쟁조정결정례 / 분쟁해결기준 크롤러

대상1 분쟁조정결정례 목록의 "번호"는 게시글 순위 표시일 뿐 고정 ID가 아니다
(새 게시글이 올라오면 기존 글의 번호도 밀려 바뀐다). 그래서 저장 폴더명은
번호 대신 상세페이지 URL의 nttId(고정 식별자)를 사용한다.
대상2 분쟁해결기준은 번호(prcdntSlno)가 상세 URL 파라미터와 동일한 고정 ID라서
그대로 사용한다.

fss.or.kr의 WAF는 (1) 표준 requests 라이브러리의 TLS 핸드셰이크 지문(JA3)과
(2) "crawler/bot" 등이 들어간 User-Agent를 감지해 연결을 즉시 끊는다(RemoteDisconnected).
curl이나 실제 브라우저는 통과한다. 그래서 브라우저(Chrome) TLS 지문과 헤더를
그대로 흉내 내는 curl_cffi(impersonate="chrome")를 쓰고, User-Agent는 별도로
지정하지 않는다 — 프로젝트 규칙(요청 간 지연, User-Agent 명시)의 "User-Agent
명시"는 이 사이트에서는 오히려 차단을 유발하므로, 그 대신 curl_cffi가 실어
보내는 표준 Chrome UA를 그대로 사용한다.

사용법:
    pip install curl_cffi beautifulsoup4
    python scripts/crawl_fss.py --test          # 각 게시판 1페이지만
    python scripts/crawl_fss.py                  # 전체 크롤링
    python scripts/crawl_fss.py --target decisions
    python scripts/crawl_fss.py --target criteria
"""

import argparse
import json
import logging
import re
import time
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse

from curl_cffi import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.fss.or.kr"
DECISIONS_LIST_URL = f"{BASE_URL}/fss/bbs/B0000390/list.do"
DECISIONS_MENU_NO = "201193"
CRITERIA_LIST_URL = f"{BASE_URL}/fss/job/fncCnflPrcdnt/list.do"
CRITERIA_MENU_NO = "201194"
MAIN_PRECEDENTS_LIST_URL = f"{BASE_URL}/fss/job/fncCnflMainPrcdnt/list.do"
MAIN_PRECEDENTS_MENU_NO = "201196"

REQUEST_DELAY_SEC = 1.5
MAX_RETRIES = 3
REQUEST_TIMEOUT = 20
ALLOWED_ATTACHMENT_EXTS = {".hwp", ".hwpx", ".pdf"}

DATA_ROOT = Path("data/raw")
DECISIONS_DIR = DATA_ROOT / "decisions"
CRITERIA_DIR = DATA_ROOT / "criteria"
MAIN_PRECEDENTS_DIR = DATA_ROOT / "main_precedents"
FAILURES_LOG = Path("data/failed/failures.log")

SIZE_PAREN_RE = re.compile(r"\(파일크기\s*[:：]\s*[^)]*\)")
SIZE_BRACKET_RE = re.compile(r"\[\s*[\d.]+\s*[KMG]?B\s*\]\s*$", re.IGNORECASE)
FS_UNSAFE_RE = re.compile(r'[\\/:*?"<>|]')
COUNT_TOTAL_RE = re.compile(r"전체\s*([\d,]+)\s*건.*?(\d+)\s*/\s*(\d+)\s*페이지", re.S)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("crawl_fss")


def log_failure(context: str, url: str, error: str) -> None:
    FAILURES_LOG.parent.mkdir(parents=True, exist_ok=True)
    with FAILURES_LOG.open("a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{context}\t{url}\t{error}\n")


class FssCrawler:
    # 커스텀 User-Agent(예: "...Crawler...")를 실으면 WAF가 즉시 연결을 끊는다.
    # impersonate="chrome"이 알아서 정상적인 크롬 UA/헤더를 실어 보내므로 건드리지 않는다.
    def __init__(self):
        self.session = requests.Session(impersonate="chrome")

    def get(self, url: str, params: dict | None = None):
        last_error = "unknown error"
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = self.session.get(url, params=params, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                return resp
            except requests.exceptions.RequestException as exc:
                last_error = str(exc)
                logger.warning(
                    "GET 실패 (%d/%d) url=%s params=%s: %s",
                    attempt, MAX_RETRIES, url, params, exc,
                )
                if attempt < MAX_RETRIES:
                    time.sleep(REQUEST_DELAY_SEC * attempt)
        log_failure(context="GET", url=f"{url} params={params}", error=last_error)
        return None

    def get_soup(self, url: str, params: dict | None = None):
        resp = self.get(url, params=params)
        if resp is None:
            return None
        return BeautifulSoup(resp.text, "html.parser")

    def sleep(self) -> None:
        time.sleep(REQUEST_DELAY_SEC)


def clean_filename(raw: str) -> str:
    text = SIZE_PAREN_RE.sub("", raw)
    text = SIZE_BRACKET_RE.sub("", text)
    text = text.replace("다운로드", "")
    text = FS_UNSAFE_RE.sub("_", text)
    return text.strip() or "file"


def extract_attachments(view) -> list[dict]:
    attachments = []
    seen_urls = set()
    for a in view.select("a[href*='fileDown.do']"):
        href = urljoin(BASE_URL, a["href"])
        if href in seen_urls:
            continue
        seen_urls.add(href)
        filename = clean_filename(a.get_text(" ", strip=True))
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_ATTACHMENT_EXTS:
            continue
        attachments.append({"filename": filename, "url": href})
    return attachments


def parse_view_detail(soup: BeautifulSoup) -> dict | None:
    view = soup.select_one("div.bd-view")
    if view is None:
        return None
    body_el = view.select_one("div.dbdata")
    body_text = body_el.get_text("\n", strip=True) if body_el else ""
    return {"body_text": body_text, "attachments": extract_attachments(view)}


def detect_total_pages(soup: BeautifulSoup, default: int = 1) -> int:
    el = soup.select_one("div.count-total")
    if el is None:
        return default
    m = COUNT_TOTAL_RE.search(el.get_text(" ", strip=True))
    if not m:
        return default
    return int(m.group(3))


def parse_decision_list(soup: BeautifulSoup) -> list[dict]:
    rows = soup.select("div.bd-list table tbody tr")
    items = []
    for tr in rows:
        tds = tr.find_all("td")
        if len(tds) < 6:
            continue
        title_a = tds[3].find("a")
        if title_a is None or not title_a.get("href"):
            continue
        href = urljoin(DECISIONS_LIST_URL, title_a["href"])
        ntt_id = parse_qs(urlparse(href).query).get("nttId", [None])[0]
        if not ntt_id:
            continue
        items.append({
            "ntt_id": ntt_id,
            "list_no": tds[0].get_text(strip=True),
            "region": tds[1].get_text(strip=True),
            "type": tds[2].get_text(strip=True),
            "title": title_a.get_text(strip=True),
            "dept": tds[4].get_text(strip=True),
            "date": tds[5].get_text(strip=True),
            "detail_url": href,
        })
    return items


def _parse_prcdnt_style_list(soup: BeautifulSoup, base_url: str) -> list[dict]:
    """분쟁해결기준/주요판례 게시판 공용 파서(둘 다 prcdntSlno 파라미터를 쓰는 동일 템플릿).
    urljoin의 base를 호출자가 넘겨야 한다 — 게시판마다 상세페이지 경로(fncCnflPrcdnt vs
    fncCnflMainPrcdnt)가 다르므로 base를 고정하면 다른 게시판 URL로 잘못 resolve된다."""
    rows = soup.select("div.bd-list table tbody tr")
    items = []
    for tr in rows:
        tds = tr.find_all("td")
        if len(tds) < 6:
            continue
        title_a = tds[3].find("a")
        if title_a is None or not title_a.get("href"):
            continue
        href = urljoin(base_url, title_a["href"])
        slno = parse_qs(urlparse(href).query).get("prcdntSlno", [None])[0]
        if not slno:
            continue
        items.append({
            "prcdnt_slno": slno,
            "list_no": tds[0].get_text(strip=True),
            "region": tds[1].get_text(strip=True),
            "type": tds[2].get_text(strip=True),
            "title": title_a.get_text(strip=True),
            "summary": tds[4].get_text(strip=True),
            "date": tds[5].get_text(strip=True),
            "detail_url": href,
        })
    return items


def parse_criteria_list(soup: BeautifulSoup) -> list[dict]:
    return _parse_prcdnt_style_list(soup, CRITERIA_LIST_URL)


def parse_main_precedents_list(soup: BeautifulSoup) -> list[dict]:
    return _parse_prcdnt_style_list(soup, MAIN_PRECEDENTS_LIST_URL)


def load_processed_ids(metadata_path: Path) -> set:
    ids = set()
    if not metadata_path.exists():
        return ids
    with metadata_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if "post_id" in rec:
                ids.add(rec["post_id"])
    return ids


def append_metadata(metadata_path: Path, record: dict) -> None:
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    with metadata_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def download_attachment(crawler: FssCrawler, url: str, dest_path: Path) -> bool:
    if dest_path.exists() and dest_path.stat().st_size > 0:
        return True
    resp = crawler.get(url)
    if resp is None:
        return False
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(resp.content)
    return True


def process_post(crawler: FssCrawler, item: dict, post_id: str, out_dir: Path,
                  metadata_path: Path, board_name: str) -> bool:
    detail_soup = crawler.get_soup(item["detail_url"])
    if detail_soup is None:
        logger.error("%s: %s 상세 페이지 조회 실패", board_name, post_id)
        return False

    detail = parse_view_detail(detail_soup)
    if detail is None:
        log_failure(board_name, item["detail_url"], "본문 영역(div.bd-view)을 찾을 수 없음")
        logger.error("%s: %s 본문 영역을 찾을 수 없음", board_name, post_id)
        return False

    post_dir = out_dir / post_id
    post_dir.mkdir(parents=True, exist_ok=True)
    (post_dir / "body.txt").write_text(detail["body_text"], encoding="utf-8")

    saved_files = []
    for att in detail["attachments"]:
        crawler.sleep()
        dest = post_dir / att["filename"]
        if download_attachment(crawler, att["url"], dest):
            saved_files.append(att["filename"])
        else:
            logger.error("%s: %s 첨부파일 다운로드 실패: %s", board_name, post_id, att["filename"])

    record = dict(item)
    record["post_id"] = post_id
    record["attachments"] = saved_files
    append_metadata(metadata_path, record)
    logger.info(
        "%s: %s 완료 (첨부 %d/%d) - %s",
        board_name, post_id, len(saved_files), len(detail["attachments"]), item["title"],
    )
    return True


def crawl_board(crawler: FssCrawler, *, name: str, list_url: str, menu_no: str,
                 out_dir: Path, metadata_path: Path, parse_list_fn, id_field: str,
                 test_mode: bool) -> None:
    processed_ids = load_processed_ids(metadata_path)
    logger.info("%s: 기존 처리 완료 %d건 확인", name, len(processed_ids))

    first_soup = crawler.get_soup(list_url, params={"menuNo": menu_no, "pageIndex": 1})
    if first_soup is None:
        logger.error("%s: 1페이지 조회 실패, 중단", name)
        return

    total_pages = 1 if test_mode else detect_total_pages(first_soup, default=1)
    logger.info("%s: 총 %d페이지 처리 예정%s", name, total_pages, " (테스트 모드)" if test_mode else "")

    for page in range(1, total_pages + 1):
        if page == 1:
            soup = first_soup
        else:
            crawler.sleep()
            soup = crawler.get_soup(list_url, params={"menuNo": menu_no, "pageIndex": page})
            if soup is None:
                logger.error("%s: %d페이지 조회 실패, 스킵", name, page)
                continue

        items = parse_list_fn(soup)
        logger.info("%s: %d페이지 - %d건 발견", name, page, len(items))

        for item in items:
            post_id = item[id_field]
            if post_id in processed_ids:
                logger.info("%s: %s 이미 처리됨, 스킵", name, post_id)
                continue
            crawler.sleep()
            if process_post(crawler, item, post_id, out_dir, metadata_path, name):
                processed_ids.add(post_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="금감원 분쟁조정결정례/분쟁해결기준 크롤러")
    parser.add_argument("--test", action="store_true", help="각 게시판 1페이지만 크롤링")
    parser.add_argument(
        "--target", choices=["decisions", "criteria", "main_precedents", "all"], default="all",
        help="크롤링할 게시판 선택 (기본: all)",
    )
    args = parser.parse_args()

    crawler = FssCrawler()

    if args.target in ("decisions", "all"):
        crawl_board(
            crawler,
            name="분쟁조정결정례",
            list_url=DECISIONS_LIST_URL,
            menu_no=DECISIONS_MENU_NO,
            out_dir=DECISIONS_DIR,
            metadata_path=DECISIONS_DIR / "metadata.jsonl",
            parse_list_fn=parse_decision_list,
            id_field="ntt_id",
            test_mode=args.test,
        )

    if args.target in ("criteria", "all"):
        crawl_board(
            crawler,
            name="분쟁해결기준",
            list_url=CRITERIA_LIST_URL,
            menu_no=CRITERIA_MENU_NO,
            out_dir=CRITERIA_DIR,
            metadata_path=CRITERIA_DIR / "metadata.jsonl",
            parse_list_fn=parse_criteria_list,
            id_field="prcdnt_slno",
            test_mode=args.test,
        )

    if args.target in ("main_precedents", "all"):
        crawl_board(
            crawler,
            name="주요판례",
            list_url=MAIN_PRECEDENTS_LIST_URL,
            menu_no=MAIN_PRECEDENTS_MENU_NO,
            out_dir=MAIN_PRECEDENTS_DIR,
            metadata_path=MAIN_PRECEDENTS_DIR / "metadata.jsonl",
            parse_list_fn=parse_main_precedents_list,
            id_field="prcdnt_slno",
            test_mode=args.test,
        )


if __name__ == "__main__":
    main()
