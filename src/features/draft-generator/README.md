# Draft generator

This feature runs the BARS scenery extractor in a browser Web Worker. Selected scenery files are represented as local `File` objects, mounted in the worker's in-memory filesystem, and never sent to an application endpoint.

The files under `extractor/` and `shims/` are sourced from the BARS Airport Contribution Tool browser viewer. The website copy exposes `generateRemovalGeometry` and supports `buildRemovals: false` so extraction can skip the expensive all-airport remover pass.

Matching prefers native, source-backed light rows. Simulator layers in the same lighting family are merged only when their length, centre and full-path position are nearly identical. The highest-confidence source row supplies the logical line unchanged; matching and selective removals never average or resample source geometry, and every contributing source row remains attached as provenance. Longer logical simulator lines are then clipped into non-overlapping, division-aligned sections so different segmentation between the two datasets does not force an all-or-nothing match. Each accepted logical section expands back to the real source-row sections before selective removals are built. A shorter source row may also match when the source geometry is tightly contained by the longer division shape. When a package only exposes individual source placements, division geometry may guide their ordering into a candidate row, but every removal vertex remains a decoded simulator position. After matching, reconstructed replacement-only guidance geometry may be simplified within a 0.6 metre source corridor to remove placement-to-placement wobble; stopbar, junction and row endpoints remain exact, and native simulator rows are not changed. Unsuitable candidates stay unmatched for manual placement.

After matching, remover geometry is rebuilt from approved source rows only. Every decoded must-keep zone remains active, and unselected stopbar, lead-on, and taxiway-centerline source objects are also protected so the draft cannot remove unrelated lighting.

`matching.js` deliberately accepts only source-backed simulator rows and sections. The detector classification is retained as provenance, while the division object supplies the output classification. Guidance rows may therefore map between decoded taxi-centreline and lead-on presets when their geometry supports it; stopbars remain a strict stopbar-only family. Each source section is assigned once to its best division object, while one division object may own several compiled source segments. Co-located selected layers are all removed but collapse to one replacement shape, and no accepted sections of the same parent row may overlap.

The map includes intentionally small debugging toggles. `SIM geometry` appears after generation: cyan dashed lines are raw extracted simulator rows, while purple solid lines are logical geometries created by merging two or more co-located source rows before splitting and matching. `Division data` is available before and after generation and shows the original API geometry in pink, including its BARS ID in the popup. All layers remain client-side.

Unmatched or unsafe division objects are excluded from the draft XML and emitted as red map features for manual work.

## X-Plane airport data

Selections containing an `apt.dat` or coordinate-named DSF tile are detected as X-Plane scenery.
The generator accepts an individual custom airport package, its `Earth nav data` folder, or
X-Plane's `Global Scenery/Global Airports` folder. Large airport databases are scanned as a stream
and stop as soon as the selected airport block ends, so the full Global Airports file is never
loaded into memory. DSF scanning selects only the one-degree tile containing the selected airport.

Evidence is evaluated in a strict order:

1. exact `apt.dat` lighting strings;
2. decoded DSF `.str` light strings;
3. decoded DSF `.lin` painted hold/centreline markings;
4. `apt.dat` painted hold/centreline markings;
5. recognized individual DSF light objects;
6. manual placement.

The `apt.dat` reader supports official linear-feature light codes 101 through 108 and relevant
painted-line codes 1 through 14 and 51 through 64. The DSF reader implements the version-1 atom,
point-pool, RLE/delta, command-state, airport-filter, object, and polygon records needed for
airport overlays. It preserves straight and Bezier geometry, resolves package-local
`library.txt` exports, and recognizes standard or explicitly named taxiway-light assets.

Only real light evidence is removal-eligible. Painted `.lin` and `apt.dat` markings can position a
BARS replacement when stronger evidence is absent, but are tagged placement-only and never create
or justify a remover. Unknown art assets are ignored rather than guessed. Non-target taxi-edge,
runway, approach, and runway-guard lights that can be identified from source data remain protected.
If no supported evidence matches an object, it remains in the manual-placement list.

Evidence priority is applied per geometry section rather than once for the whole BARS object. An
uncovered marking may therefore complete a route while an exact light string continues to own every
co-located section. When an exact row overlaps only the end of a lower-priority source row, the
uncovered continuation hands off at their decoded shared source vertex rather than at the edge of a
proximity buffer. It remains attached to the BARS object that geometrically matched that row; a
generic endpoint connection cannot transfer it to a neighbouring object. Connected source rows may
extend matched guidance to a nearby BARS stopbar, but the extension terminates at the stopbar itself.

BARS stopbars are hard spatial cut points, not side-validity rules. Lead-ons, taxiway centrelines,
and stand lead-ins retain the side containing their matched Division geometry and are clipped at
the stopbar boundary for both MSFS and X-Plane, regardless of stopbar coordinate direction.

Raw DSFs are decoded directly in the browser. X-Plane also permits 7z-compressed DSFs; those are
reported explicitly and skipped rather than being mis-decoded.

Runway records protect enabled centreline, edge, end, approach, REIL, and touchdown-zone lighting. Centreline and edge systems also receive continuous conservative envelopes between the procedurally estimated lamp positions, because `apt.dat` defines the system rather than every rendered bulb. X-Plane drafts do not contain spatial removal polygons. Exact matched `apt.dat` light strings instead produce compact feature fingerprints, light codes, run indexes, and normalized ranges. Core publishes those selectors as JSON, and the Pilot Client applies them against the user's active scenery only when every source fingerprint still matches. DSF and painted-marking fallback evidence remains placement-only and never authorizes a local scenery edit.
Decoded non-target rows and objects protect taxi-edge, runway, approach, runway-guard, and other
airfield lights at their source geometry. An explicitly light-bearing DSF asset whose family is not
recognized is retained as `unknown-light`; uncertainty never makes it removal-eligible.
