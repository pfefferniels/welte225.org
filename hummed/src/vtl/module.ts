// The VocalTractLab module as Emscripten builds it (vtl/build.sh): its exports, typed.

type Pointer = number;

export interface VtlModule {
  readonly FS: { writeFile(path: string, data: string): void };
  ccall(
    name: string,
    returns: 'number',
    argTypes: readonly ('string' | 'number')[],
    args: readonly (string | number)[],
  ): number;
  getValue(pointer: Pointer, type: 'i32' | 'double'): number;
  _malloc(bytes: number): Pointer;
  _free(pointer: Pointer): void;
  _vtlSynthesisReset(): number;
  _vtlFastTractToTube(
    tract: Pointer,
    lengths: Pointer,
    areas: Pointer,
    articulators: Pointer,
    incisorPos: Pointer,
    tongueTipSide: Pointer,
    velumOpening: Pointer,
  ): number;
  _vtlSynthesisAddTube(
    newSamples: number,
    audio: Pointer,
    lengths: Pointer,
    areas: Pointer,
    articulators: Pointer,
    incisorPos: number,
    velumOpening: number,
    tongueTipSide: number,
    glottis: Pointer,
  ): number;
  /** The heap views; which of these an Emscripten version exports differs. */
  readonly HEAPF64?: Float64Array;
  readonly HEAP32?: Int32Array;
  readonly wasmMemory?: WebAssembly.Memory;
  readonly buffer?: ArrayBuffer;
}

export type CreateVtl = (options: {
  print(text: string): void;
  printErr(text: string): void;
}) => Promise<VtlModule>;
