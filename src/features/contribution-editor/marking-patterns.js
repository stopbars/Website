/* oxlint-disable react-doctor/js-flatmap-filter -- Marking expansion is bounded and the explicit validity filter documents accepted pattern entries. */

import { createXPlaneLineTexturePattern } from './scenery-texture.js';

const APT_MARKING_BASE_WIDTH_METRES = new Map([
  [1, 0.1875],
  [2, 0.1875],
  [3, 0.375],
  [4, 1.3125],
  [5, 0.5625],
  [6, 1.125],
  [7, 1.3125],
  [8, 0.1875],
  [9, 0.5625],
  [10, 0.375],
  [11, 1.875],
  [12, 2.0625],
  [13, 0.9375],
  [14, 1.5],
  [19, 3],
  [20, 0.1875],
  [21, 0.1875],
  [22, 0.1875],
  [23, 0.1875],
  [24, 0.375],
  [25, 0.375],
  [30, 0.1875],
  [31, 0.1875],
  [32, 0.375],
  [40, 0.1875],
  [41, 0.1875],
  [42, 0.1875],
]);
const APT_MARKING_REPEAT_METRES = 3;
const APT_BLACK_BORDER_WIDTH_METRES = 0.1875;

export function markingPatternName(code) {
  const numericCode = Number(code);
  return Number.isInteger(numericCode) && numericCode > 0 ? `apt-marking-${numericCode}` : '';
}

export function withAptMarkingFallbackProperties(properties = {}) {
  const code = Number(properties.markingCode);
  if (
    properties.sourceType !== 'xplane-apt-painted-marking' ||
    !Number.isInteger(code) ||
    code <= 0 ||
    properties.textureAssetPath
  ) {
    return properties;
  }
  const bordered = (code >= 51 && code <= 64) || (code >= 70 && code <= 92);
  const baseCode = bordered ? code - 50 : code;
  const baseWidth = APT_MARKING_BASE_WIDTH_METRES.get(baseCode);
  if (!baseWidth) return properties;
  const widthMeters =
    positiveNumber(properties.widthMeters) ??
    baseWidth + (bordered ? APT_BLACK_BORDER_WIDTH_METRES : 0);
  const textureHeightMeters =
    positiveNumber(properties.textureHeightMeters ?? properties.textureScaleY) ??
    APT_MARKING_REPEAT_METRES;
  if (
    widthMeters === properties.widthMeters &&
    textureHeightMeters === properties.textureHeightMeters
  ) {
    return properties;
  }
  return {
    ...properties,
    widthMeters,
    textureHeightMeters,
    markingFallback: 'xplane-stock-procedural',
  };
}

export function installReferenceTextureFallbacks(map, features) {
  for (const [pattern, image] of createReferenceTextureFallbacks(features)) {
    if (!map.hasImage(pattern)) map.addImage(pattern, image, { pixelRatio: 1 });
  }
}

export function createReferenceTextureFallbacks(features) {
  const fallbacks = new Map();
  for (const feature of features ?? []) {
    const pattern = feature.properties?.renderPattern || feature.properties?.texturePattern;
    if (!pattern || feature.geometry?.type !== 'LineString' || fallbacks.has(pattern)) continue;
    const properties = withAptMarkingFallbackProperties(feature.properties);
    const sourceCode = Number(properties.markingCode);
    const patternCode = Number(/^apt-marking-(\d+)$/.exec(pattern)?.[1]);
    const markingCode = Number.isInteger(sourceCode) && sourceCode > 0 ? sourceCode : patternCode;
    const sourceImage =
      Number.isInteger(markingCode) && markingCode > 0
        ? createAptMarkingPattern(markingCode, { cropToMarking: true })
        : createSolidPattern(properties.markingColor);
    const image = createXPlaneLineTexturePattern(sourceImage, properties);
    if (Number.isInteger(markingCode) && markingCode > 0) {
      weatherProceduralMarking(image, markingCode);
    }
    fallbacks.set(pattern, image);
  }
  return fallbacks;
}

export function createSolidPattern(color) {
  const rgba = parseHexColor(color);
  const width = 32;
  const height = 8;
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return { width, height, data };
}

function parseHexColor(value) {
  const match = /^#([\da-f]{6})$/i.exec(String(value ?? ''));
  if (!match) return [250, 204, 21, 255];
  const numeric = Number.parseInt(match[1], 16);
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255, 255];
}

export function createAptMarkingPattern(code, { cropToMarking = false } = {}) {
  const bordered = (code >= 51 && code <= 64) || (code >= 70 && code <= 92);
  const baseCode = bordered ? code - 50 : code;
  const scale = 2;
  const ink = markingColor(baseCode);
  const lines = markingLines(baseCode);
  const width = repeatWidth(lines, scale);
  const height = 24 * scale;
  const data = new Uint8Array(width * height * 4);

  if (bordered) {
    for (const line of lines) {
      paintLine(data, width, height, line, [10, 10, 10, 255], scale, 2);
    }
  }
  for (const line of lines) paintLine(data, width, height, line, ink, scale, 0);
  const pattern = { width, height, data };
  return cropToMarking ? cropTransparentRows(pattern) : pattern;
}

function repeatWidth(lines, scale) {
  const cycles = lines
    .map((line) => {
      if (line.hatch) return 12 * scale;
      if (line.dash) return (line.dash[0] + line.dash[1]) * scale;
      return 0;
    })
    .filter(Boolean);
  if (cycles.length === 0) return 32 * scale;
  return cycles.reduce(leastCommonMultiple);
}

function leastCommonMultiple(left, right) {
  return Math.abs(left * right) / greatestCommonDivisor(left, right);
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function cropTransparentRows(pattern) {
  let first = pattern.height;
  let last = -1;
  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      if (pattern.data[(y * pattern.width + x) * 4 + 3] === 0) continue;
      first = Math.min(first, y);
      last = Math.max(last, y);
      break;
    }
  }
  if (last < first || (first === 0 && last === pattern.height - 1)) return pattern;
  const height = last - first + 1;
  const rowBytes = pattern.width * 4;
  return {
    width: pattern.width,
    height,
    data: pattern.data.slice(first * rowBytes, (last + 1) * rowBytes),
  };
}

function markingLines(code) {
  const wide = [10, 11, 12, 13, 14, 19, 24, 25, 32].includes(code);
  const thickness = wide ? 3 : 1.5;
  const solid = (offset = 0) => ({ offset, thickness, dash: null });
  const broken = (offset = 0, dash = [24, 18]) => ({ offset, thickness, dash });

  if (code === 22) return [broken(0, [30, 20])];
  if (code === 2 || code === 25 || code === 31) return [broken()];
  if (code === 23) return [broken(0, [10, 20])];
  if (code === 3) return [solid(-2.5), solid(2.5)];
  if (code === 4 || code === 12) {
    return [broken(-6), broken(-2), solid(2), solid(6)];
  }
  if (code === 5 || code === 13) return [broken(-2.5), solid(2.5)];
  if (code === 6 || code === 14) {
    return [{ offset: 0, thickness: wide ? 12 : 9, dash: [4, 4], hatch: true }];
  }
  if (code === 7 || code === 11) return [broken(-5), solid(0), broken(5)];
  if (code === 8) return [broken(0, [12, 34])];
  if (code === 9) return [broken(-3, [12, 34]), broken(3, [12, 34])];
  if (code === 19) return [broken(0, [8, 8])];
  if (code === 21) return [broken(0, [8, 8])];
  return [solid()];
}

function markingColor(code) {
  if (code >= 20 && code <= 25) return [245, 245, 244, 255];
  if (code >= 30 && code <= 32) return [239, 68, 68, 255];
  if (code === 40) return [249, 115, 22, 255];
  if (code === 41) return [59, 130, 246, 255];
  if (code === 42) return [34, 197, 94, 255];
  return [250, 204, 21, 255];
}

function paintLine(data, width, height, line, color, scale, expansion) {
  const center = height / 2 + line.offset * scale;
  const half = (line.thickness * scale) / 2 + expansion * scale;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inStroke = line.hatch
        ? Math.abs(y - center - ((x % (12 * scale)) - 6 * scale)) <= half
        : Math.abs(y - center) <= half;
      if (!inStroke || !dashVisible(x, line.dash, scale)) continue;
      const offset = (y * width + x) * 4;
      data.set(color, offset);
    }
  }
}

function dashVisible(x, dash, scale) {
  if (!dash) return true;
  const cycle = (dash[0] + dash[1]) * scale;
  return x % cycle < dash[0] * scale;
}

function weatherProceduralMarking(image, code) {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3] === 0) continue;
      const noise = proceduralNoise(x, y, code);
      if (noise < 0.025) {
        image.data[offset + 3] = 150;
      } else if (noise < 0.11) {
        image.data[offset] = Math.max(0, image.data[offset] - 14);
        image.data[offset + 1] = Math.max(0, image.data[offset + 1] - 14);
        image.data[offset + 2] = Math.max(0, image.data[offset + 2] - 14);
      }
    }
  }
}

function proceduralNoise(x, y, seed) {
  let value = Math.imul(x + 1, 374_761_393);
  value = Math.imul(value ^ Math.imul(y + 1, 668_265_263), 1_274_126_177);
  value ^= Math.imul(seed, 2_246_822_519);
  value ^= value >>> 13;
  return (value >>> 0) / 4_294_967_296;
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
