const DMS_COORDINATE_PATTERN =
  /(\d{1,3}(?:[.,]\d+)?)\s*°\s*(\d{1,2}(?:[.,]\d+)?)\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*["″]?\s*([NSEW])/gi;

const parseDecimal = (value) => Number(value.replace(',', '.'));

const dmsToDecimal = (degrees, minutes, seconds, hemisphere) => {
  const degreeValue = parseDecimal(degrees);
  const minuteValue = parseDecimal(minutes);
  const secondValue = parseDecimal(seconds);

  if (minuteValue >= 60 || secondValue >= 60) return null;

  const decimal = degreeValue + minuteValue / 60 + secondValue / 3600;
  return ['S', 'W'].includes(hemisphere.toUpperCase()) ? -decimal : decimal;
};

const validPair = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

export const parseCoordinatePair = (value) => {
  const text = value.trim();
  if (!text) return null;

  const coordinates = [...text.matchAll(DMS_COORDINATE_PATTERN)].map((match) => ({
    value: dmsToDecimal(match[1], match[2], match[3], match[4]),
    hemisphere: match[4].toUpperCase(),
  }));

  if (coordinates.length >= 2) {
    const latitude = coordinates.find(({ hemisphere }) => ['N', 'S'].includes(hemisphere))?.value;
    const longitude = coordinates.find(({ hemisphere }) => ['E', 'W'].includes(hemisphere))?.value;
    if (validPair(latitude, longitude)) return { latitude, longitude };
  }

  const decimalValues = text.match(/[-+]?\d+(?:[.,]\d+)?/g)?.map(parseDecimal);
  if (decimalValues?.length === 2 && validPair(decimalValues[0], decimalValues[1])) {
    return { latitude: decimalValues[0], longitude: decimalValues[1] };
  }

  return null;
};
