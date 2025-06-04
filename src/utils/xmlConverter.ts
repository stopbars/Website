// Types and interfaces
interface Vertex {
  lat: number;
  lon: number;
}

interface StopBar {
  name: string;
  runway?: string;  // Make runway optional
  points: string[];
}

interface ConversionOptions {
  airportCode: string;
  airportName: string;
  sceneryName: string;
}

// Utility functions for coordinate conversion
const validateCoordinate = (coord: number, isLat: boolean): boolean => {
  const maxDegrees = isLat ? 90 : 180;
  return !isNaN(coord) && Math.abs(coord) <= maxDegrees;
};

const convertCoordinate = (coord: number, isLat: boolean): string => {
  if (!validateCoordinate(coord, isLat)) {
    throw new Error(`Invalid coordinate value: ${coord}`);
  }

  const abs = Math.abs(coord);
  const degrees = Math.floor(abs);
  const minutes = Math.floor((abs - degrees) * 60);
  const seconds = ((abs - degrees) * 60 - minutes) * 60;
  
  const degStr = String(degrees).padStart(isLat ? 2 : 3, '0');

  return (coord < 0 ? '-' : '+') + 
         degStr +
         String(minutes).padStart(2, '0') +
         seconds.toFixed(3).padStart(6, '0');
};

// Validate MSFS XML format and structure
export const validateMSFSXml = (xmlContent: string) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      return { isValid: false, error: 'Invalid XML format' };
    }

    // Check root element
    const root = xmlDoc.documentElement;
    if (root.tagName !== 'FSData') {
      return { isValid: false, error: 'Not a valid MSFS stopbar XML file' };
    }

    // Verify polygons exist
    const polygons = xmlDoc.getElementsByTagName('Polygon');
    if (polygons.length === 0) {
      return { isValid: false, error: 'No stopbar polygons found in file' };
    }

    // Verify polygon structure
    for (const polygon of polygons) {
      const displayName = polygon.getAttribute('displayName');
      if (!displayName) {
        return { isValid: false, error: 'One or more polygons missing displayName attribute' };
      }

      // Verify vertices exist
      const vertices = polygon.getElementsByTagName('Vertex');
      if (vertices.length === 0) {
        return { 
          isValid: false, 
          error: `Polygon "${displayName}" has no vertices` 
        };
      }

      // Check vertex coordinates
      for (const vertex of vertices) {
        const lat = parseFloat(vertex.getAttribute('lat') || '');
        const lon = parseFloat(vertex.getAttribute('lon') || '');
        
        if (!validateCoordinate(lat, true) || !validateCoordinate(lon, false)) {
          return { 
            isValid: false, 
            error: `Invalid coordinates in polygon "${displayName}": lat=${lat}, lon=${lon}` 
          };
        }
      }
    }

    return { isValid: true };
  } catch (err) {
    return { 
      isValid: false, 
      error: err instanceof Error ? err.message : 'Failed to validate XML' 
    };
  }
};

// Convert MSFS XML to BARS format
export const convertToBARS = (xmlContent: string, options: ConversionOptions): string => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
  const polygons = xmlDoc.getElementsByTagName('Polygon');
  const stopbars: StopBar[] = [];

  // Process each polygon
  for (let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i];
    const displayName = polygon.getAttribute('displayName') || '';
    
    // Split displayName into name and runway (if it exists)
    const nameParts = displayName.split('-').map(s => s.trim());
    const stopBar = nameParts[0];
    const runway = nameParts[1];  // Will be undefined if no runway designation
    
    if (runway) {
      const formattedRunway = runway.replace(/ /g, '/').toUpperCase();
      if (!validateRunway(formattedRunway)) {
        throw new Error(`Invalid runway format in "${displayName}". Must contain two runway designations (e.g., "06/24" or "16L/34R")`);
      }
    }
    
    // Get vertices and convert coordinates
    const vertices = polygon.getElementsByTagName('Vertex');
    const points: string[] = [];

    for (let j = 0; j < vertices.length; j++) {
      const vertex = vertices[j];
      const lat = parseFloat(vertex.getAttribute('lat') || '0');
      const lon = parseFloat(vertex.getAttribute('lon') || '0');
      
      const convertedLat = convertCoordinate(lat, true);
      const convertedLon = convertCoordinate(lon, false);
      points.push(convertedLat + convertedLon);
    }

    // Add formatted stopbar to array
    if (runway) {
      // With runway designation
      stopbars.push({
      name: `${stopBar.toUpperCase()}--${(i + 1).toString().padStart(2, '0')}`,
      runway: runway.replace(/ /g, '/').toUpperCase(),
      points
      });
    } else {
      // Without runway designation
      stopbars.push({
      name: `${stopBar.toUpperCase()}--${(i + 1).toString().padStart(2, '0')}`,
      points
      });
    }
  }

  // Generate BARS XML
  const barsXml = `<?xml version="1.0" encoding="utf-8"?>
<Bars>
${stopbars.map(bar => {
    const baseXml = `    <StopBar>
        <Name>${bar.name}</Name>`;
    const runwayXml = bar.runway ? `\n        <Runway>${bar.runway}</Runway>` : '';
    const pointsXml = bar.points.map(point => `        <Point>${point}</Point>`).join('\n');
    return `${baseXml}${runwayXml}\n${pointsXml}\n    </StopBar>`;
  }).join('\n')}
</Bars>`;

  return barsXml;
};

const validateRunway = (runway: string): boolean => {

  const runways = runway.split('/');
  return runways.length === 2 && 
         runways.every(r => /^\d{2}[LCR]?$/.test(r.trim()));
};

// Validate converted BARS XML
export const validateBARS = (xmlContent: string) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      return { isValid: false, error: 'Invalid BARS XML format' };
    }

    // Check root element
    const root = xmlDoc.documentElement;
    if (root.tagName !== 'Bars') {
      return { isValid: false, error: 'Invalid BARS XML root element' };
    }

    // Verify stopbars exist
    const stopbars = xmlDoc.getElementsByTagName('StopBar');
    if (stopbars.length === 0) {
      return { isValid: false, error: 'No stopbars found in BARS XML' };
    }

    // Verify stopbar structure
    for (const stopbar of stopbars) {
      // Check required elements
      const name = stopbar.getElementsByTagName('Name')[0]?.textContent;
      const points = stopbar.getElementsByTagName('Point');

      if (!name || points.length === 0) {
        return { 
          isValid: false, 
          error: 'Missing required elements in StopBar (Name or Points)' 
        };
      }

      // Validate point format
      for (const point of points) {
        const pointText = point.textContent || '';
        if (!/^[+-]\d{6}\.\d{3}[+-]\d{7}\.\d{3}$/.test(pointText)) {
          return { 
            isValid: false, 
            error: `Invalid point format in stopbar "${name}": ${pointText}` 
          };
        }
      }
    }

    return { isValid: true };
  } catch (err) {
    return { 
      isValid: false, 
      error: err instanceof Error ? err.message : 'Failed to validate BARS XML' 
    };
  }
};