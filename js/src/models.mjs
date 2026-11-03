// Written by scripts/models.mjs: the model files this release was tested with, per variant.
// micro (the default) is in models/, mini in models/mini/.
export const VARIANTS = {"micro":"","mini":"mini"};
export const DEFAULT_VARIANT = 'micro';
export const MODEL_FILES = {
  "micro": {
    "leokani-g2p.json.gz": {
      "bytes": 4656918,
      "sha256": "2d0da7653feb2f7174ecc313b5e30dea3c0e2fb6e58f9255816c7e06e9c9c962"
    },
    "oov-encoder.onnx": {
      "bytes": 3868129,
      "sha256": "5ffcb175371b369ca0f4a28d39e8d8a75abab796b46e63ed7d0a311cacf89307"
    },
    "oov-decoder.onnx": {
      "bytes": 5105543,
      "sha256": "c188e599976bb820209b1dd8747a8e3278aa7aa372e73ab5367809e406f25088"
    },
    "context.onnx": {
      "bytes": 5371378,
      "sha256": "283f1122bbcb8cc577c568d2b52e1a2e205c286cae528f0b7b9e3b9492c91409"
    }
  },
  "mini": {
    "leokani-g2p.json.gz": {
      "bytes": 4567474,
      "sha256": "ad3fe089e709acaac276fdc7fe0a18041cfc28d6633b51f8e6bab6dbbcf0d733"
    },
    "oov-encoder.onnx": {
      "bytes": 5114420,
      "sha256": "0a44b762b29dca3d9b8150b2f70076fae0d51a09ccdbb4ddc4ef032aec0829bc"
    },
    "oov-decoder.onnx": {
      "bytes": 6773509,
      "sha256": "2564e89e9aadbd3932d9e4fe1d3652a6dfa0f68dc84e10d88504f2c4a9d1733a"
    },
    "context.onnx": {
      "bytes": 5371378,
      "sha256": "283f1122bbcb8cc577c568d2b52e1a2e205c286cae528f0b7b9e3b9492c91409"
    }
  }
};
