import { createHash } from "node:crypto";

const LIGHT_EVIDENCE_TERMS = [
  "light",
  "centerlight",
  "centrelight",
  "stopbar",
  "stop_bar",
  "stop bar",
  "holdlight",
  "hold_light",
  "hold short",
  "leadon",
  "lead_on",
  "lead on",
  "wigwag",
  "lightpreset"
];

const AIRFIELD_CONTEXT_TERMS = [
  "taxiway",
  "taxi",
  "centerline",
  "centreline",
  "edge",
  "inset",
  "runway",
  "rwy",
  "apron"
];

const COLOR_TERMS = ["green", "red", "yellow", "blue", "orange", "white"];
const EXACT_MODEL_CLASSIFICATIONS = new Map([
  ["ftlib_holdlight1", "runway-guard"],
  ["ftlib_holdlight2", "runway-guard"]
]);
const TOKEN_EXPANSIONS = new Map([
  ["lgt", ["light"]],
  ["lgts", ["light"]],
  ["txlgt", ["taxi", "light"]],
  ["txelgt", ["taxi", "edge", "light"]],
  ["rwlgt", ["runway", "light"]],
  ["aplgt", ["apron", "light"]],
  ["gr", ["green"]],
  ["grn", ["green"]],
  ["gn", ["green"]],
  ["go", ["green", "orange"]],
  ["re", ["red"]],
  ["rd", ["red"]],
  ["or", ["orange"]],
  ["org", ["orange"]],
  ["orn", ["orange"]],
  ["ye", ["yellow"]],
  ["yl", ["yellow"]],
  ["yw", ["yellow"]],
  ["bl", ["blue"]],
  ["blu", ["blue"]],
  ["wt", ["white"]],
  ["wh", ["white"]]
]);
const TARGET_LIGHT_CLASSIFICATIONS = new Set([
  "stopbar",
  "lead-on",
  "taxi-centerline"
]);
const DEBUG_LIGHT_EXCLUDED_CLASSIFICATIONS = new Set([
  "not-light",
  "unknown",
  "apron",
  "airfield-light"
]);

export function classifyObject({ sourceType, rawTag, guid, name, extraText }) {
  const { haystack, expansionReasons } = buildHeuristicHaystack([sourceType, rawTag, guid, name, extraText]
    .filter(Boolean)
    .join(" "));
  const reasons = [...expansionReasons];

  for (const term of LIGHT_EVIDENCE_TERMS) {
    if (haystack.includes(term)) {
      reasons.push(`matched term "${term}"`);
    }
  }

  if (["lightrow", "edgelights", "apronedgelights"].includes(sourceType)) {
    reasons.push(`XML type ${rawTag} is a light row type`);
  }

  if (sourceType === "visual-effect") {
    reasons.push("XML type VisualEffectObject is treated as likely light-related");
  }

  const hasLightEvidence =
    LIGHT_EVIDENCE_TERMS.some((term) => haystack.includes(term)) ||
    ["lightrow", "edgelights", "apronedgelights", "visual-effect"].includes(sourceType);
  const hasAirfieldContext = AIRFIELD_CONTEXT_TERMS.some((term) => haystack.includes(term));

  if (hasLightEvidence && hasAirfieldContext) {
    for (const term of COLOR_TERMS) {
      if (haystack.includes(term)) {
        reasons.push(`matched color "${term}" with airfield light context`);
      }
    }
  }

  const lightRelated =
    hasLightEvidence ||
    (hasAirfieldContext && ["lightrow", "edgelights", "apronedgelights"].includes(sourceType));

  const exactModelClassification = EXACT_MODEL_CLASSIFICATIONS.get(
    String(name ?? "").trim().toLowerCase()
  );
  let classification = "unknown";
  if (exactModelClassification) {
    classification = exactModelClassification;
    reasons.push(`exact model name identifies ${exactModelClassification} fixture`);
  } else if (containsAny(haystack, ["taxisign", "taxi_sign", "taxi sign"])) {
    classification = "taxi-sign";
    reasons.push("taxi-sign illumination is not a stop-bar light");
  } else if (
    containsAny(haystack, ["stopbar", "stop_bar", "stop bar", "holdlight", "hold_light", "hold short"]) ||
    (
      hasLightEvidence &&
      hasAirfieldContext &&
      containsAny(haystack, ["taxi", "taxiway"]) &&
      haystack.includes("red") &&
      !containsAny(haystack, ["runway", "rwy"])
    )
  ) {
    classification = "stopbar";
  } else if (
    containsAny(haystack, ["leadon", "lead_on", "lead on"]) ||
    (
      hasLightEvidence &&
      hasAirfieldContext &&
      containsAny(haystack, ["taxi", "taxiway"]) &&
      haystack.includes("orange") &&
      !containsAny(haystack, ["runway", "rwy"])
    )
  ) {
    classification = "lead-on";
  } else if (
    containsAny(haystack, [
      "wigwag",
      "wig_wag",
      "wig wag",
      "guardlight",
      "guard_light",
      "guard light",
      "runway guard"
    ])
  ) {
    classification = "runway-guard";
  } else if (containsAny(haystack, ["apronlights", "apron_lights", "apron lights"])) {
    classification = "airfield-light";
  } else if (
    containsAny(haystack, ["runway", "rwy"]) &&
    containsAny(haystack, ["light", "centerline", "centreline", "centerlight", "centrelight", "edge", "inset"])
  ) {
    classification = "runway";
  } else if (
    hasLightEvidence &&
    containsAny(haystack, ["centerline", "centreline", "centerlight", "centrelight", "inset"]) &&
    (
      containsAny(haystack, ["taxi", "taxiway"]) ||
      containsAny(haystack, ["green", "orange"]) ||
      ["lightrow", "edgelights", "apronedgelights"].includes(sourceType)
    )
  ) {
    classification = "taxi-centerline";
  } else if (
    hasLightEvidence &&
    hasAirfieldContext &&
    containsAny(haystack, ["taxi", "taxiway"]) &&
    (
      haystack.includes("green") ||
      (haystack.includes("yellow") && haystack.includes("taxilight"))
    ) &&
    !containsAny(haystack, ["runway", "rwy", "edge", "blue"])
  ) {
    classification = "taxi-centerline";
  } else if (
    hasLightEvidence &&
    containsAny(haystack, ["taxi", "taxiway", "edge"]) &&
    containsAny(haystack, ["edge", "blue"])
  ) {
    classification = "taxi-edge";
  } else if (hasLightEvidence && haystack.includes("apron")) {
    classification = "apron";
  } else if (lightRelated) {
    classification = "unknown-light";
  } else if (["library-object", "visual-effect", "simprop-container", "scenery-object"].includes(sourceType)) {
    classification = "not-light";
    reasons.push("no light-related heuristic matched");
  }

  const confidence = confidenceFor(classification, reasons, sourceType);
  return { classification, confidence, reasons };
}

function confidenceFor(classification, reasons, sourceType) {
  if (classification === "not-light" || classification === "unknown") {
    return 0.2;
  }

  if (["lightrow", "edgelights", "apronedgelights"].includes(sourceType)) {
    return Math.min(0.95, 0.75 + reasons.length * 0.04);
  }

  if (classification === "unknown-light") {
    return Math.min(0.75, 0.45 + reasons.length * 0.05);
  }

  return Math.min(0.95, 0.7 + reasons.length * 0.04);
}

export function isLikelyLightClassification(classification) {
  return !["not-light", "unknown"].includes(classification);
}

export function isTargetLightClassification(classification) {
  return TARGET_LIGHT_CLASSIFICATIONS.has(classification);
}

export function isDebugLightClassification(classification) {
  return !DEBUG_LIGHT_EXCLUDED_CLASSIFICATIONS.has(classification);
}

function buildHeuristicHaystack(value) {
  const base = String(value ?? "").toLowerCase();
  const expansionReasons = [];
  const expandedTerms = [];
  const seenTerms = new Set();

  for (const token of base.match(/[a-z]+[0-9]*/g) ?? []) {
    const normalizedToken = token.replace(/[0-9]+$/g, "");
    const expansions = expansionsForToken(normalizedToken);
    if (expansions.length === 0) {
      continue;
    }

    expansionReasons.push(`expanded abbreviation "${normalizedToken}" as "${expansions.join(" ")}"`);
    for (const expansion of expansions) {
      if (!seenTerms.has(expansion)) {
        seenTerms.add(expansion);
        expandedTerms.push(expansion);
      }
    }
  }

  return {
    haystack: [base, ...expandedTerms].join(" "),
    expansionReasons
  };
}

function expansionsForToken(token) {
  if (!token) {
    return [];
  }

  const direct = TOKEN_EXPANSIONS.get(token);
  if (direct) {
    return direct;
  }

  if (token.endsWith("lgt")) {
    const expansions = ["light"];
    if (token.startsWith("tx")) {
      expansions.push("taxi");
    }
    if (token.startsWith("rw")) {
      expansions.push("runway");
    }
    if (token.startsWith("ap")) {
      expansions.push("apron");
    }
    return expansions;
  }

  return [];
}

function containsAny(value, terms) {
  return terms.some((term) => value.includes(term));
}

export function stableId(...parts) {
  return createHash("sha1")
    .update(parts.map((part) => String(part)).join("|"))
    .digest("hex")
    .slice(0, 16);
}
