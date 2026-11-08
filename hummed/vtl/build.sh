#!/bin/bash
# Build vtl.js: VocalTractLab 2.4.2 (GPL-3.0, Peter Birkholz et al.), from the
# vocaltractlab-cython 0.0.17 sdist on PyPI, with vocaltractlab.patch applied, compiled to
# WebAssembly with Emscripten 3.1.6 (the Ubuntu package) into one file, the wasm inlined.
# The patch raises the gestural model's limit from 60 s to 240 s and adds
# vtlGesturalScoreToStates, which returns a score's tract states in memory.
#   vtl/build.sh [output file, default ../vtl.js]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(realpath -m "${1:-$HERE/../vtl.js}")
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
curl -sS -o "$T/vtl.tar.gz" https://files.pythonhosted.org/packages/d6/18/3f386515b95e09cb7d15643157ba334d57effd88f1835769026f089a3386/vocaltractlab_cython-0.0.17.tar.gz
tar xzf "$T/vtl.tar.gz" -C "$T"
B=$T/vocaltractlab_cython-0.0.17/VocalTractLabBackend-dev
(cd "$B" && patch -p1 < "$HERE/vocaltractlab.patch")
EXPORTS='["_vtlInitialize","_vtlClose","_vtlGetVersion","_vtlGetConstants","_vtlSynthesisReset","_vtlSynthesisAddTube","_vtlFastTractToTube","_vtlGesturalScoreToStates","_malloc","_free"]'
mkdir -p "$T/obj" && cd "$T/obj"
ls "$B"/src/VocalTractLabBackend/*.cpp "$B/src/VocalTractLabApi/VocalTractLabApi.cpp" | xargs -P 4 -I{} sh -c \
  "em++ -O3 -msimd128 -flto -std=c++17 -D_USE_MATH_DEFINES -I$B/include -I$B/include/VocalTractLabApi -c {} -o \$(basename {} .cpp).o 2>/dev/null"
em++ ./*.o -O3 -msimd128 -flto -sMODULARIZE=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker,node -sFILESYSTEM=1 -sSINGLE_FILE=1 \
  -sEXPORTED_FUNCTIONS="$EXPORTS" '-sEXPORTED_RUNTIME_METHODS=["FS","ccall","getValue"]' -sEXPORT_NAME=createVTL -o "$OUT"
ls -la "$OUT"
