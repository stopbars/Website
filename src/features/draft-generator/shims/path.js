function normalize(value) {
  const input = String(value ?? "").replaceAll("\\", "/");
  const absolute = input.startsWith("/");
  const parts = [];
  for (const part of input.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : ".");
}

export function resolve(...parts) {
  let result = "";
  for (const part of parts) {
    const value = String(part ?? "").replaceAll("\\", "/");
    result = value.startsWith("/") ? value : `${result}/${value}`;
  }
  return normalize(result.startsWith("/") ? result : `/${result}`);
}

export function join(...parts) {
  return normalize(parts.filter(Boolean).join("/"));
}

export function basename(value) {
  const normalized = normalize(value);
  return normalized === "/" ? "" : normalized.split("/").at(-1);
}

export function extname(value) {
  const name = basename(value);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index);
}

export function dirname(value) {
  const normalized = normalize(value);
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

export function relative(from, to) {
  const fromParts = resolve(from).split("/").filter(Boolean);
  const toParts = resolve(to).split("/").filter(Boolean);
  let shared = 0;
  while (shared < fromParts.length && fromParts[shared] === toParts[shared]) shared += 1;
  return [...fromParts.slice(shared).map(() => ".."), ...toParts.slice(shared)].join("/");
}

export default { resolve, join, basename, extname, dirname, relative };
