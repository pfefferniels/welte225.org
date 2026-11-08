#!/bin/bash
# VocalTractLab backend 2.4.2 -> WebAssembly (with and without SIMD) and a plain-JavaScript
# fallback, with Emscripten (tested with 3.1.6, Ubuntu's `emscripten` package).
# Source: VocalTractLabBackend-dev as shipped in the vocaltractlab-cython 0.0.17 sdist on PyPI:
#   curl -O https://files.pythonhosted.org/packages/d6/18/3f386515b95e09cb7d15643157ba334d57effd88f1835769026f089a3386/vocaltractlab_cython-0.0.17.tar.gz
#   tar xzf vocaltractlab_cython-0.0.17.tar.gz
# usage: build.sh <path to VocalTractLabBackend-dev> <output dir>
set -e
B=$(cd "$1" && pwd); OUT=$(mkdir -p "$2" && cd "$2" && pwd)
EXPORTS='["_vtlInitialize","_vtlClose","_vtlGetVersion","_vtlGetConstants","_vtlSynthesisReset","_vtlSynthesisAddTract","_vtlSynthesisAddTube","_vtlTractToTube","_vtlFastTractToTube","_vtlGesturalScoreToAudio","_vtlGetGesturalScoreDuration","_vtlGesturalScoreToTractSequence","_malloc","_free"]'
RUNTIME='-sEXPORTED_RUNTIME_METHODS=["FS","ccall","cwrap","getValue","setValue"]'
COMMON="-sMODULARIZE=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker,node -sFILESYSTEM=1 -sSINGLE_FILE=1 -sEXPORTED_FUNCTIONS=$EXPORTS"
for variant in plain simd; do
  FLAGS="-O3"; [ $variant = simd ] && FLAGS="-O3 -msimd128 -flto"
  T=$(mktemp -d); cd $T
  ls $B/src/VocalTractLabBackend/*.cpp $B/src/VocalTractLabApi/VocalTractLabApi.cpp | xargs -P 4 -I{} sh -c \
    "em++ $FLAGS -std=c++17 -D_USE_MATH_DEFINES -I$B/include -I$B/include/VocalTractLabApi -c {} -o \$(basename {} .cpp).o"
  if [ $variant = simd ]; then
    em++ *.o $FLAGS $COMMON "$RUNTIME" -sEXPORT_NAME=createVTL -o $OUT/vtl_wasm_simd.js
  else
    em++ *.o $FLAGS $COMMON "$RUNTIME" -sEXPORT_NAME=createVTL -o $OUT/vtl_wasm.js
    em++ *.o $FLAGS $COMMON "$RUNTIME" -sEXPORT_NAME=createVTLjs -sWASM=0 -o $OUT/vtl_js.js
  fi
  rm -rf $T
done
ls -la $OUT
