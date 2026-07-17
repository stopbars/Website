export function parseXml(xmlText, sourceFile = "unknown") {
  const warnings = [];
  const root = {
    name: "#document",
    attributes: {},
    children: [],
    text: "",
    path: "#document"
  };
  const stack = [root];
  const tagCounts = new Map();
  const tokenPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+>|[^<]+/g;

  let match;
  while ((match = tokenPattern.exec(xmlText)) !== null) {
    const token = match[0];

    if (token.startsWith("<!--") || token.startsWith("<?") || /^<![^[]/.test(token)) {
      continue;
    }

    if (token.startsWith("<![CDATA[")) {
      appendText(stack[stack.length - 1], token.slice(9, -3));
      continue;
    }

    if (!token.startsWith("<")) {
      appendText(stack[stack.length - 1], decodeEntities(token));
      continue;
    }

    if (token.startsWith("</")) {
      const closingName = token.slice(2, -1).trim();
      const matchIndex = findMatchingOpenTag(stack, closingName);
      if (matchIndex === -1) {
        warnings.push(`${sourceFile}: unmatched closing tag </${closingName}>`);
        continue;
      }

      while (stack.length - 1 >= matchIndex) {
        stack.pop();
      }
      continue;
    }

    const parsedTag = parseStartTag(token);
    if (!parsedTag) {
      warnings.push(`${sourceFile}: could not parse XML tag near offset ${match.index}`);
      continue;
    }

    const parent = stack[stack.length - 1];
    const siblingKey = `${parent.path}/${parsedTag.name}`;
    const siblingIndex = tagCounts.get(siblingKey) ?? 0;
    tagCounts.set(siblingKey, siblingIndex + 1);

    const node = {
      name: parsedTag.name,
      attributes: parsedTag.attributes,
      children: [],
      text: "",
      path: `${parent.path}/${parsedTag.name}[${siblingIndex}]`
    };

    parent.children.push(node);
    if (!parsedTag.selfClosing) {
      stack.push(node);
    }
  }

  if (stack.length > 1) {
    for (let index = stack.length - 1; index >= 1; index -= 1) {
      warnings.push(`${sourceFile}: unclosed tag <${stack[index].name}>`);
    }
  }

  return { root, warnings };
}

function parseStartTag(token) {
  let content = token.slice(1, -1).trim();
  const selfClosing = /\/\s*$/.test(content);
  if (selfClosing) {
    content = content.replace(/\/\s*$/, "").trim();
  }

  const nameMatch = content.match(/^([^\s/>]+)/);
  if (!nameMatch) {
    return null;
  }

  const name = nameMatch[1];
  const attributes = {};
  const attributeText = content.slice(name.length);
  const attributePattern = /([A-Za-z_:\-][\w:.\-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
  let attrMatch;
  while ((attrMatch = attributePattern.exec(attributeText)) !== null) {
    const rawValue = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? "";
    attributes[attrMatch[1]] = decodeEntities(rawValue);
  }

  return { name, attributes, selfClosing };
}

function appendText(node, text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  node.text = node.text ? `${node.text} ${trimmed}` : trimmed;
}

function findMatchingOpenTag(stack, closingName) {
  const target = closingName.toLowerCase();
  for (let index = stack.length - 1; index >= 1; index -= 1) {
    if (stack[index].name.toLowerCase() === target) {
      return index;
    }
  }
  return -1;
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function walkNodes(root, visitor) {
  const visit = (node, ancestors) => {
    visitor(node, ancestors);
    for (const child of node.children ?? []) {
      visit(child, [...ancestors, node]);
    }
  };

  visit(root, []);
}

export function findDescendants(node, predicate) {
  const matches = [];
  walkNodes(node, (candidate) => {
    if (candidate !== node && predicate(candidate)) {
      matches.push(candidate);
    }
  });
  return matches;
}

export function localName(name) {
  return String(name ?? "").split(":").pop().toLowerCase();
}
