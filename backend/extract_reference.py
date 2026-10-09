"""Copy the 2131 train images listed in model/deploy/splits.csv out of the dataset zips.

Usage: python extract_reference.py "<maturity dataset>.zip" "<quality dataset>.zip"
Writes data/reference/<filename>; main.py serves them as the "Similar reference fruits" pictures.
"""

import csv
import sys
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).parent
OUT = ROOT / "data" / "reference"
OUT.mkdir(parents=True, exist_ok=True)

rows = csv.DictReader(open(ROOT / "model" / "deploy" / "splits.csv", encoding="utf-8-sig"))
want = {PurePosixPath(r["path"].replace("\\", "/")).name for r in rows if r["split"] == "train"}

done = 0
for zip_path in sys.argv[1:]:
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name = PurePosixPath(info.filename).name
            # The zips also hold augmented copies; only the originals were used for training.
            if name in want and "Original Dataset" in info.filename:
                (OUT / name).write_bytes(zf.read(info))
                done += 1
print(f"extracted {done} of {len(want)}")
