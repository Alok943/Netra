# YOLO26n ONNX export

One-time export of YOLO26n to `public/models/yolo26n-320.onnx`. The exported file is committed; `ml/.venv/` is not.

## Versions used

| Item | Version |
| --- | --- |
| Python | 3.13.12 |
| ultralytics | 8.4.174 |
| onnx | 1.23.2 |
| onnxslim | 0.1.98 |
| onnxruntime (Python, for the sanity check) | 1.31.0 |
| torch | 2.14.1+cpu |
| ONNX opset | 18 |

## Commands

Run from `ml/` on Windows (use `.venv/bin/python` on macOS or Linux):

```bash
python -m venv .venv
.venv/Scripts/python -m pip install ultralytics onnx onnxslim onnxruntime
cd export
../.venv/Scripts/python -c "from ultralytics import YOLO; YOLO('yolo26n.pt').export(format='onnx', imgsz=320, batch=1, dynamic=False, simplify=True, end2end=True)"
cp yolo26n.onnx ../../public/models/yolo26n-320.onnx
```

`end2end=True` is passed explicitly. With the default arguments this Ultralytics version exported the raw
`[1, 84, 2100]` head instead of the NMS-free one.

## Model I/O (checked with the `onnx` Python package instead of Netron, same information)

| | Name | Shape | Type |
| --- | --- | --- | --- |
| Input | `images` | `[1, 3, 320, 320]` | float32, RGB, 0 to 1, planar NCHW |
| Output | `output0` | `[1, 300, 6]` | float32 |

**Output format: end-to-end, NMS-free.** Each of the 300 rows is `x1, y1, x2, y2, score, class_id` in 320-px
letterbox coordinates, sorted by score. A sanity run on Ultralytics' `bus.jpg` gave person (0.88, 0.85, 0.61)
and bus (0.88), so the coordinate space and class order are as expected.

`src/vision/detector.ts` also contains a parser for the raw `[1, 84, 2100]` head (with per-class NMS), picked by
looking at the output shape, so either export works.

## File

- `public/models/yolo26n-320.onnx`: 9.4 MB, FP32.
- FP16 was not tried: Ultralytics only exports half precision on a CUDA device and this machine is CPU-only.
  FP32 is already small enough, so it was left as is.

## Licence

YOLO26 is AGPL-3.0 until an Ultralytics licence is bought. Keep the deployment passcode-protected and private until then.

## Update 2026-10-10: models actually served

The 320 px nano model above was replaced after a desktop accuracy check (see `BENCH.md`). The app now serves two
files and picks one at load time (`CONFIG.detector.models` in `src/config.ts`):

| Execution provider | File | Input | Size |
| --- | --- | --- | --- |
| WebGPU | `public/models/yolo26s-416.onnx` | 416 | 38 MB |
| WASM | `public/models/yolo26n-416.onnx` | 416 | 9.8 MB |

Both use the same export command as above with `YOLO('yolo26s.pt')` or `YOLO('yolo26n.pt')` and `imgsz=416`.
