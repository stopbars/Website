import SevenZip from '7z-wasm';
import wasmUrl from '7z-wasm/7zz.wasm?url';

export function createDsfDecoder(options) {
  return SevenZip({ ...options, locateFile: () => new URL(wasmUrl, import.meta.url).href });
}
