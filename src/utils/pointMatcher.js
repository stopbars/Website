const reconvertCoordinate = (coord) => {
  const isLatNegative = coord.startsWith('-');
  const isLonNegative = coord.includes('-', 1);

  const parts = coord.split(/[+-]/).filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Invalid coordinate format: ${coord}`);
  }

  const latDeg = parseFloat(parts[0].substring(0, 2));
  const latMin = parseFloat(parts[0].substring(2, 4));
  const latSec = parseFloat(parts[0].substring(4));

  const lonDeg = parseFloat(parts[1].substring(0, 3));
  const lonMin = parseFloat(parts[1].substring(3, 5));
  const lonSec = parseFloat(parts[1].substring(5));

  let latitude = latDeg + latMin / 60 + latSec / 3600;
  let longitude = lonDeg + lonMin / 60 + lonSec / 3600;

  if (isLatNegative) latitude = -latitude;
  if (isLonNegative) longitude = -longitude;

  return { lat: latitude, lon: longitude };
};

const extractStopBars = (xmlString) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const stopBars = Array.from(xmlDoc.getElementsByTagName("StopBar"));
  
  console.log(`Found ${stopBars.length} stopbars in XML`);
  
  const extracted = stopBars.map((bar) => {
    const name = bar.getElementsByTagName("Name")[0]?.textContent || "";
    const runway = bar.getElementsByTagName("Runway")[0]?.textContent || "";
    const points = Array.from(bar.getElementsByTagName("Point"))
      .map(point => point.textContent || "");
    
    const midPointText = points[Math.floor(points.length / 2)] || points[0] || "";
    const coords = reconvertCoordinate(midPointText);
    
    console.log(`Extracted stopbar: ${name} (Runway: ${runway || 'none'}) at position:`, coords);
    return { name, runway, points, coords };
  });

  return extracted;
};

const findClosestStopbars = (targetBars, referenceBars) => {
  console.log('\nStarting stopbar matching process:');
  console.log(`Target stopbars: ${targetBars.length}`);
  console.log(`Reference stopbars: ${referenceBars.length}`);

  const mappings = [];
  const usedRefs = new Set();

  targetBars.forEach(target => {
    console.log(`\nProcessing target stopbar: ${target.name}`);
    let closestRef = null;
    let minDistance = Infinity;

    referenceBars.forEach(ref => {
      if (usedRefs.has(ref.name)) {
        console.log(`  Skipping ${ref.name} - already mapped`);
        return;
      }

      const distance = Math.sqrt(
        Math.pow(target.coords.lat - ref.coords.lat, 2) + 
        Math.pow(target.coords.lon - ref.coords.lon, 2)
      );

      console.log(`  Checking against ${ref.name} - Distance: ${distance.toFixed(6)}`);

      if (distance < minDistance && distance < 0.0004) {
        minDistance = distance;
        closestRef = ref;
        console.log(`    New best match! Distance: ${distance.toFixed(6)}`);
      }
    });

    if (closestRef) {
      console.log(`  ✓ Matched ${target.name} to ${closestRef.name} (Distance: ${minDistance.toFixed(6)})`);
      mappings.push({
        targetId: target.name,
        targetName: target.name,
        referenceName: closestRef.name
      });
      usedRefs.add(closestRef.name);
    } else {
      console.log(`  ✗ No match found for ${target.name}`);
    }
  });

  console.log('\nMatching complete:');
  console.log(`Found ${mappings.length} matches out of ${targetBars.length} stopbars`);
  return mappings;
};

const updateXMLNames = (originalXml, mappings, referenceBars) => {
  console.log('\nUpdating stopbar names and runways in XML:');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(originalXml, "text/xml");
  let updateCount = 0;

  mappings.forEach(mapping => {
    const stopBars = Array.from(xmlDoc.getElementsByTagName('StopBar'));
    const targetBar = stopBars.find(bar => {
      const nameEl = bar.getElementsByTagName('Name')[0];
      return nameEl?.textContent === mapping.targetName;
    });

    // Find the matching reference stopbar
    const referenceBar = referenceBars.find(ref => ref.name === mapping.referenceName);

    if (targetBar && referenceBar) {
      // Update name
      const nameEl = targetBar.getElementsByTagName('Name')[0];
      if (nameEl) {
        console.log(`Renaming stopbar: ${mapping.targetName} → ${mapping.referenceName}`);
        nameEl.textContent = mapping.referenceName;

        // Update runway if exists in reference
        if (referenceBar.runway) {
          let runwayEl = targetBar.getElementsByTagName('Runway')[0];
          if (!runwayEl) {
            runwayEl = xmlDoc.createElement('Runway');
            const firstPoint = targetBar.getElementsByTagName('Point')[0];
            targetBar.insertBefore(runwayEl, firstPoint);
          }
          console.log(`  - Updated runway to: ${referenceBar.runway}`);
          runwayEl.textContent = referenceBar.runway;
        }
        updateCount++;
      }
    }
  });

  console.log(`Updated ${updateCount} stopbar names and runways`);
  return new XMLSerializer().serializeToString(xmlDoc);
};

export const matchStopbars = async (submissionXml, airportICAO, token) => {
  try {
    console.log(`\nStarting stopbar matching for airport: ${airportICAO}`);
    
    const response = await fetch('https://api.stopbars.com/airports/submissions?status=approved', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to fetch approved submissions');

    const data = await response.json();
    const approvedSubmissions = data.submissions[airportICAO] || [];

    console.log(`Found ${approvedSubmissions.length} approved submissions for ${airportICAO}`);

    if (approvedSubmissions.length > 0) {
      const referenceXml = approvedSubmissions[0].xmlData;
      console.log('Using first approved submission as reference');
      
      console.log('\nExtracting stopbars from target submission:');
      const targetBars = extractStopBars(submissionXml);
      
      console.log('\nExtracting stopbars from reference submission:');
      const referenceBars = extractStopBars(referenceXml);
      
      const mappings = findClosestStopbars(targetBars, referenceBars);
      
      return updateXMLNames(submissionXml, mappings, referenceBars);
    }

    console.log('No approved submissions found - returning original XML');
    return submissionXml;
  } catch (error) {
    console.error('Error during stopbar matching:', error);
    throw error;
  }
};