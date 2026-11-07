// Written by scripts/models.mjs: the model files this release was tested with, per variant.
// micro (the default) is in models/, mini in models/mini/.
export const VARIANTS = {"micro":"","mini":"mini"};
export const DEFAULT_VARIANT = 'micro';
export const MODEL_FILES = {
  "micro": {
    "leokani-g2p.data": {
      "bytes": 484864,
      "sha256": "b25d3baf82efc5da668b47bf34a86e7900378b2236d56bcf75cfd4a167d61a1b"
    },
    "leokani-g2p-words.data": {
      "bytes": 5869239,
      "sha256": "fa88a96b7e42c61b8e7b9acaf9787e8537d3d1e8dd4e06764e05e75537fc2aa2"
    },
    "oov-encoder.onnx": {
      "bytes": 1029977,
      "sha256": "4a91d053c5cba5b910bc8aa4c1301e2db4dd33f47b9e3841df9e4596efb7ef3a"
    },
    "oov-decoder.onnx": {
      "bytes": 1377428,
      "sha256": "fe951d01dc9f2b8e1e3a6bba224ba74ea256713029c8512a02c4192ca503619e"
    },
    "context.onnx": {
      "bytes": 1432882,
      "sha256": "b525b8e290004d33f5996c4954bcf289654806133b32289b7842c49da5ac1d20"
    }
  },
  "mini": {
    "leokani-g2p.data": {
      "bytes": 484729,
      "sha256": "d27775335b05bccb67bfc8fd905e90acaa985a25deffa969d5361762d6f57536"
    },
    "leokani-g2p-words.data": {
      "bytes": 5651193,
      "sha256": "2c62d8d9758954af58e799c2845d7906a7cbeb24e95e702b39f199c86b8c1ba6"
    },
    "oov-encoder.onnx": {
      "bytes": 1361382,
      "sha256": "cb3d78b31912a95a871fb19c9371e3350fb7f2a7ee13038a3c990ddc669e9172"
    },
    "oov-decoder.onnx": {
      "bytes": 1826504,
      "sha256": "11a08d5e31c2abb4335fd3bc2531a277b7652afe37b6ecb61f579aca68778565"
    },
    "context.onnx": {
      "bytes": 1432882,
      "sha256": "b525b8e290004d33f5996c4954bcf289654806133b32289b7842c49da5ac1d20"
    }
  }
};
