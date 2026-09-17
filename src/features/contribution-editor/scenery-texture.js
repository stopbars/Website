/* oxlint-disable react-doctor/js-combine-iterations -- Texture lookup keeps normalization and candidate selection as separate diagnostic stages. */

export function composeXPlaneLineTexture(image, properties = {}) {
  const layers = Array.isArray(properties.lineTextureLayers)
    ? properties.lineTextureLayers.filter(validLayer)
    : [];
  if (layers.length === 0) return image;

  const coordinateWidth = positiveNumber(properties.texturePixelWidth, 1);
  const normalized = layers.map((layer) => ({
    s1: clamp(layer.s1 / coordinateWidth, 0, 1),
    sm: clamp(layer.sm / coordinateWidth, 0, 1),
    s2: clamp(layer.s2 / coordinateWidth, 0, 1),
  }));
  const leftExtent = Math.max(...normalized.map((layer) => layer.sm - layer.s1), 0);
  const rightExtent = Math.max(...normalized.map((layer) => layer.s2 - layer.sm), 0);
  const bodyRows = xPlaneLineBodyRows(image.height, properties);
  // X-Plane repeats the texture's vertical T axis along the line and uses its
  // horizontal S axis across it. MapLibre line patterns use the opposite image
  // axes, so transpose the selected atlas strips while composing the layers.
  const outputWidth = bodyRows.length;
  const outputHeight = Math.max(1, Math.ceil((leftExtent + rightExtent) * image.width));
  const outputCenter = leftExtent * image.width;
  const output = {
    width: outputWidth,
    height: outputHeight,
    data: new Uint8ClampedArray(outputWidth * outputHeight * 4),
  };

  for (const layer of normalized) {
    const sourceStart = Math.floor(layer.s1 * image.width);
    const sourceEnd = Math.max(sourceStart + 1, Math.ceil(layer.s2 * image.width));
    const targetStart = Math.round(outputCenter - (layer.sm - layer.s1) * image.width);
    for (const [targetX, sourceY] of bodyRows.entries()) {
      for (let sourceX = sourceStart; sourceX < sourceEnd; sourceX += 1) {
        const targetY = targetStart + sourceX - sourceStart;
        if (targetY < 0 || targetY >= output.height || sourceX >= image.width) continue;
        blendPixel(
          output.data,
          (targetY * output.width + targetX) * 4,
          image.data,
          (sourceY * image.width + sourceX) * 4
        );
      }
    }
  }
  return output;
}

export function forceOpaqueTexture(image) {
  const output = clonePixelImage(image);
  for (let offset = 3; offset < output.data.length; offset += 4) {
    output.data[offset] = 255;
  }
  return output;
}

const LINE_WIDTH_ZOOMS = Object.freeze([13, 14, 15, 16, 17, 18, 19, 20, 21]);
const LINE_PATTERN_HEIGHT = 64;
const MAX_LINE_PATTERN_EDGE = 2048;

export function xPlaneLinePhysicalWidth(properties = {}, fallback = 0) {
  const directWidth = positiveNumber(properties.textureWidthMeters ?? properties.widthMeters, 0);
  if (directWidth > 0) return directWidth;

  const layers = Array.isArray(properties.lineTextureLayers)
    ? properties.lineTextureLayers.filter(validLayer)
    : [];
  const coordinateWidth = positiveNumber(properties.texturePixelWidth, 0);
  const textureScaleX = positiveNumber(properties.textureScaleX ?? properties.textureScale, 0);
  if (layers.length === 0 || coordinateWidth <= 0 || textureScaleX <= 0) return fallback;

  const leftExtent = Math.max(...layers.map((layer) => layer.sm - layer.s1), 0);
  const rightExtent = Math.max(...layers.map((layer) => layer.s2 - layer.sm), 0);
  return ((leftExtent + rightExtent) / coordinateWidth) * textureScaleX || fallback;
}

export function metresPerPixel(latitude, zoom) {
  const boundedLatitude = clamp(Number(latitude) || 0, -85.051_129, 85.051_129);
  return (156_543.033_928_040_97 * Math.cos((boundedLatitude * Math.PI) / 180)) / 2 ** zoom;
}

export function xPlaneLineTextureDimensions(properties) {
  const widthMeters = xPlaneLinePhysicalWidth(properties, 0.25);
  const fullTextureLength = xPlaneLineRepeatMeters(properties, 8);
  const aspectRatio = Math.max(0.125, Math.min(256, fullTextureLength / widthMeters));
  const targetHeight = Math.max(
    1,
    Math.min(LINE_PATTERN_HEIGHT, Math.floor(MAX_LINE_PATTERN_EDGE / aspectRatio))
  );
  return {
    width: Math.max(1, Math.min(MAX_LINE_PATTERN_EDGE, Math.round(targetHeight * aspectRatio))),
    height: targetHeight,
    physicalWidth: widthMeters,
    physicalLength: fullTextureLength,
  };
}

export function xPlaneLineRepeatMeters(properties = {}, fallback = 8) {
  const fullLength = positiveNumber(
    properties.textureScaleY ?? properties.textureHeightMeters,
    fallback
  );
  const coordinateHeight = positiveNumber(properties.texturePixelHeight, 0);
  const capIntervals = lineCapIntervals(properties, coordinateHeight);
  if (coordinateHeight <= 0 || capIntervals.length === 0) return fullLength;
  const excluded = intervalLength(capIntervals);
  return Math.max(fullLength / coordinateHeight, fullLength * (1 - excluded / coordinateHeight));
}

export function createXPlaneLineTexturePattern(image, properties) {
  const dimensions = xPlaneLineTextureDimensions(properties);
  return dimensions.width === image.width && dimensions.height === image.height
    ? clonePixelImage(image)
    : resamplePixelImage(image, dimensions.width, dimensions.height);
}

export function realWorldLineWidthExpression(latitude, { minimum = 1, fallback = 1 } = {}) {
  const widthMeters = ['number', ['get', 'widthMeters'], 0];
  const stops = [];
  for (const zoom of LINE_WIDTH_ZOOMS) {
    const pixelsPerMeter = 1 / metresPerPixel(latitude, zoom);
    stops.push(zoom, [
      'case',
      ['>', widthMeters, 0],
      ['max', minimumVisibleLinePixels(zoom, minimum), ['*', widthMeters, pixelsPerMeter]],
      Math.max(fallback, minimumVisibleLinePixels(zoom, minimum)),
    ]);
  }
  return ['interpolate', ['exponential', 2], ['zoom'], ...stops];
}

function resamplePixelImage(image, width, height) {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(
      image.height - 1,
      Math.max(0, Math.floor(((y + 0.5) * image.height) / height))
    );
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(
        image.width - 1,
        Math.max(0, Math.floor(((x + 0.5) * image.width) / width))
      );
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      output[targetOffset] = image.data[sourceOffset];
      output[targetOffset + 1] = image.data[sourceOffset + 1];
      output[targetOffset + 2] = image.data[sourceOffset + 2];
      output[targetOffset + 3] = image.data[sourceOffset + 3];
    }
  }
  return { width, height, data: output };
}

function clonePixelImage(image) {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
}

function minimumVisibleLinePixels(zoom, minimum = 1) {
  if (zoom <= 14) return Math.max(minimum, 1.5);
  if (zoom <= 16) return Math.max(minimum, 2);
  if (zoom <= 18) return Math.max(minimum, 2.5);
  if (zoom <= 19) return Math.max(minimum, 3);
  return Math.max(minimum, 4);
}

function validLayer(layer) {
  return (
    Number.isFinite(layer?.s1) &&
    Number.isFinite(layer?.sm) &&
    Number.isFinite(layer?.s2) &&
    layer.s1 <= layer.sm &&
    layer.sm <= layer.s2
  );
}

function xPlaneLineBodyRows(imageHeight, properties) {
  const coordinateHeight = positiveNumber(properties.texturePixelHeight, imageHeight);
  const intervals = lineCapIntervals(properties, coordinateHeight);
  if (intervals.length === 0) {
    return Array.from({ length: imageHeight }, (_, index) => index);
  }
  const rows = [];
  for (let row = 0; row < imageHeight; row += 1) {
    const coordinate = ((row + 0.5) / imageHeight) * coordinateHeight;
    if (!intervals.some(([start, end]) => coordinate >= start && coordinate < end)) {
      rows.push(row);
    }
  }
  return rows.length > 0 ? rows : Array.from({ length: imageHeight }, (_, index) => index);
}

function lineCapIntervals(properties, coordinateHeight) {
  if (!(coordinateHeight > 0)) return [];
  const intervals = [...(properties.startCaps ?? []), ...(properties.endCaps ?? [])]
    .map((cap) => [
      clamp(Math.min(Number(cap?.t1), Number(cap?.t2)), 0, coordinateHeight),
      clamp(Math.max(Number(cap?.t1), Number(cap?.t2)), 0, coordinateHeight),
    ])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (!previous || interval[0] > previous[1]) merged.push(interval);
    else previous[1] = Math.max(previous[1], interval[1]);
  }
  return merged;
}

function intervalLength(intervals) {
  return intervals.reduce((total, [start, end]) => total + end - start, 0);
}

function blendPixel(target, targetOffset, source, sourceOffset) {
  const sourceAlpha = source[sourceOffset + 3] / 255;
  if (sourceAlpha <= 0) return;
  const targetAlpha = target[targetOffset + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  for (let channel = 0; channel < 3; channel += 1) {
    target[targetOffset + channel] = Math.round(
      (source[sourceOffset + channel] * sourceAlpha +
        target[targetOffset + channel] * targetAlpha * (1 - sourceAlpha)) /
        outputAlpha
    );
  }
  target[targetOffset + 3] = Math.round(outputAlpha * 255);
}

function positiveNumber(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
