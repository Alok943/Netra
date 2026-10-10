from ultralytics import YOLO
for name, sz in [("yolo26n",416),("yolo26n",640),("yolo26s",320),("yolo26s",416),("yolo26s",640)]:
    p = YOLO(f"{name}.pt").export(format="onnx", imgsz=sz, batch=1, dynamic=False, simplify=True, end2end=True)
    import shutil; shutil.move(p, f"variants/{name}-{sz}.onnx")
