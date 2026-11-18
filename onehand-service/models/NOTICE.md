# Local segmentation models

MobileSAM research/code: https://github.com/ChaoningZhang/MobileSAM (Apache 2.0; license text beside this file).

ONNX conversion publisher: https://huggingface.co/Acly/MobileSAM (exporter metadata identifies MIT).

The downloaded encoder and SAM decoder are pinned to the repository revision and SHA-256 hashes in model-manifest.json. They run in ONNX Runtime on this PC, with MediaPipe landmarks supplying automatic prompts. Images are never uploaded to Hugging Face or another inference service. These are generic segmentation weights, not a ring circumference/fit model and not Aitaca's model.
