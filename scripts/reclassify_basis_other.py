"""
basis="기타"로 분류된 respondent_arguments 331건을 재분류한다.
결정문 재추출이 아니라 이미 저장된 data/graph/arguments/*.json의 argument 텍스트만
읽어 basis 필드를 다시 붙이는 작업. 사용자가 확정한 9개 클러스터로 분류하고,
어느 클러스터에도 맞지 않는 잔여(약 67건)는 basis="기타"로 그대로 둔다.

분류 규칙은 data/graph/basis_other_survey.md 기반 3차 반복 조사에서 확정된
키워드 규칙을 그대로 사용한다(사용자가 검토·승인한 클러스터 경계). 다만
"설명·통지_이행주장"(74건, 사용자가 두 개로 분리 요청)만은 키워드로는 안전하게
가입시점 설명 vs 사후 통지/인지/이의부재/추인을 구분할 수 없어(둘 다 "설명","통지",
"인지","이의","동의" 등 유사 어휘를 씀), 74건 전체를 직접 읽고 문장의 핵심 주장이
무엇인지 판단해 수동으로 라벨링했다. SPLIT5_6 리스트가 그 결과이며, 순서는
아래 classify()가 원본 파일을 glob 정렬 순으로 순회하며 "기타"인 항목만 걸러낼 때
나오는 순서와 정확히 일치해야 한다(data/graph/basis_other_survey.md와 동일 순서).

재실행 가능: basis가 이미 새 값으로 바뀐 항목은 "기타"가 아니므로 재분류 대상에서
자동 제외된다. --dry-run으로 실제 파일 수정 없이 결과만 확인 가능.
"""

import argparse
import glob
import io
import json
import os
import sys
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ARGUMENTS_DIR = "data/graph/arguments"

# 우선순위 순서대로 첫 매치 클러스터에 배정. 이름은 사용자가 확정한 basis enum 값과 동일.
RULES = [
    ("환헤지_계약정당성", ["헤지비율", "환위험", "통화옵션", "수출실적", "집중관리시스템",
                        "손실이전계약", "헤지실패", "피봇계약", "오버헤지", "헤지소홀", "환헤지"]),
    ("착오취소_요건부인", ["착오", "동기의", "사기에 의한", "선의의 수익자", "기망행위",
                        "중요부분"]),
    ("본인확인_절차이행", ["본인확인", "인감", "비밀번호", "신분증", "준점유자", "필체",
                        "여권", "주민등록증", "공무원증", "안심클릭", "표현대리", "무권대리"]),
    ("일임_임의매매부인", ["일임", "위임", "임의매매", "매도권한", "과당매매", "임의가입",
                      "신청인의 의사에 따라", "신청인의 요청"]),
    ("__SPLIT_설명통지__", ["설명", "고지", "안내하였", "안내한", "통지", "통보", "인지",
                          "이의", "추인", "SMS", "잔고", "동의"]),
    ("약관법령_해석방어", ["약관", "규정", "여신업무", "특별법", "민사소송법", "근저당",
                       "채권최고액", "포괄근", "한정근", "여신전문금융업법", "표준약관",
                       "간투법", "전자금융거래법", "관광진흥법", "할부거래법"]),
    ("제3자_책임전가", ["운용사", "판매사", "PG사", "타행", "관여할 수 없는", "권한이 없",
                     "실질적 권리", "단순 중개", "단순소개자"]),
    ("손해_인과관계다툼", ["손해", "인과관계", "특별손해", "상계", "공제", "배상액",
                       "배상책임이 없다", "책임이 없다", "책임을 물을 수 없", "책임을 묻기"]),
]

# "__SPLIT_설명통지__"로 걸러진 74건을 등장 순서대로 E(설명이행_주장)/T(통지인지_이의부재)로
# 수동 라벨링한 결과. 순서는 data/graph/basis_other_survey.md의 "설명·통지_이행주장" 절과 동일.
SPLIT5_6 = list(
    "EETTTTEETT"  # 1-10
    "TTTTTETTEE"  # 11-20
    "EEEEEEETEE"  # 21-30
    "EEEETTTETE"  # 31-40
    "TETETTEEET"  # 41-50
    "ETTETTTTET"  # 51-60
    "TEETTTTTEE"  # 61-70
    "TTTE"        # 71-74
)
assert len(SPLIT5_6) == 74, len(SPLIT5_6)


def classify_all():
    files = sorted(glob.glob(os.path.join(ARGUMENTS_DIR, "*.json")))
    split_idx = 0
    plan = []  # (file_path, arg_index_in_list, case_id, old_basis, new_basis, text)
    counts = defaultdict(int)

    for f in files:
        with open(f, encoding="utf-8") as fh:
            d = json.load(fh)
        cid = d.get("case_id") or os.path.splitext(os.path.basename(f))[0]
        args = d.get("respondent_arguments", [])
        for i, a in enumerate(args):
            if a.get("basis") != "기타":
                continue
            text = a.get("argument", "")
            new_basis = None
            for name, kws in RULES:
                if any(kw in text for kw in kws):
                    if name == "__SPLIT_설명통지__":
                        label = SPLIT5_6[split_idx]
                        split_idx += 1
                        new_basis = "설명이행_주장" if label == "E" else "통지인지_이의부재"
                    else:
                        new_basis = name
                    break
            if new_basis is None:
                new_basis = "기타"  # 잔여, 변경 없음
            counts[new_basis] += 1
            plan.append((f, i, cid, a.get("basis"), new_basis, text))

    assert split_idx == 74, f"설명/통지 분리 대상 개수가 74가 아님: {split_idx}"
    return plan, counts


def apply_plan(plan):
    by_file = defaultdict(list)
    for f, i, cid, old_basis, new_basis, text in plan:
        if new_basis != "기타":
            by_file[f].append((i, new_basis))

    changed_files = 0
    changed_args = 0
    for f, updates in by_file.items():
        with open(f, encoding="utf-8") as fh:
            d = json.load(fh)
        for i, new_basis in updates:
            d["respondent_arguments"][i]["basis"] = new_basis
            changed_args += 1
        with open(f, "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        changed_files += 1
    return changed_files, changed_args


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="파일 수정 없이 결과 요약만 출력")
    args = ap.parse_args()

    plan, counts = classify_all()

    print(f"전체 재검토 대상: {len(plan)}건\n")
    order = [name for name, _ in RULES if name != "__SPLIT_설명통지__"]
    order = order[:4] + ["설명이행_주장", "통지인지_이의부재"] + order[4:]
    for name in order:
        print(f"  {name}: {counts.get(name, 0)}건")
    print(f"  기타(잔여, 미변경): {counts.get('기타', 0)}건")

    if args.dry_run:
        print("\n--dry-run: 파일은 수정하지 않았습니다.")
        return

    changed_files, changed_args = apply_plan(plan)
    print(f"\n{changed_files}개 파일, {changed_args}건 basis 갱신 완료.")


if __name__ == "__main__":
    main()
