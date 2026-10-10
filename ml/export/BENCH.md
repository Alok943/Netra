# Detector variants (2026-10-10)

Accuracy: Ultralytics `val` on coco128 at the given image size, CPU. coco128 is a small subset of COCO train, so
numbers are inflated; only the differences between rows mean anything.
Speed: ONNX Runtime Web, blank input, ms per frame, on a desktop laptop (Intel i5-12500H, integrated GPU).
A phone will be slower, so treat these as ratios.

| Model | Input | mAP 50-95 | WebGPU ms | WASM ms | File |
| --- | --- | --- | --- | --- | --- |
| yolo26n (current) | 320 | 38.6 | 35 | 115 | 9.8 MB |
| yolo26n | 416 | 43.7 | 36 | 166 | 9.8 MB |
| yolo26n | 640 | 48.6 | 49 | 396 | 9.9 MB |
| yolo26s | 320 | 46.6 | 38 | 283 | 38 MB |
| yolo26s | 416 | 52.1 | 53 | 429 | 38 MB |
| yolo26s | 640 | 57.4 | 93 | 1035 | 38 MB |
