# Compares YOLO26 variants on coco128 (relative accuracy only: coco128 is a subset of COCO train).
import json, sys
from ultralytics import YOLO
rows = []
for name in ["yolo26n", "yolo26s"]:
    m = YOLO(f"{name}.pt")
    for sz in ([320, 416, 640] if name == "yolo26n" else [320, 416, 640]):
        r = m.val(data="coco128.yaml", imgsz=sz, batch=16, device="cpu", verbose=False, plots=False)
        rows.append({"model": name, "imgsz": sz, "map50_95": round(float(r.box.map), 3), "map50": round(float(r.box.map50), 3)})
        print(rows[-1], flush=True)
json.dump(rows, open("bench.json", "w"), indent=1)
