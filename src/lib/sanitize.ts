// ============================================================================
// Rich-text sanitizer. Memo, topic and journal bodies are stored as HTML and
// rendered with dangerouslySetInnerHTML, and File > Import accepts arbitrary
// JSON, so every stored body goes through this allowlist first: formatting
// tags survive, scripts/handlers/foreign URLs do not. DocLinks (anchors with
// class "doclink" and data-* coordinates) are preserved.
// ============================================================================

/** Tags removed together with everything inside them. */
const DROP = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet",
  "link", "meta", "base", "form", "input", "button", "select", "textarea",
  "option", "svg", "math", "template", "noscript", "audio", "video", "canvas",
  "title", "head",
]);

/** Allowed tags and the attributes each may keep (beyond `style` and `class`). */
const ALLOWED: Record<string, string[]> = {
  a: ["href", "title", "data-coll", "data-id", "data-db", "data-title"],
  b: [], strong: [], i: [], em: [], u: [], s: [], strike: [], sub: [], sup: [],
  br: [], hr: [], p: ["align"], div: ["align"], span: [], pre: [], code: [],
  blockquote: [], ul: [], ol: [], li: [],
  h1: [], h2: [], h3: [], h4: [],
  font: ["color", "face", "size"],
  details: ["open"], summary: [],
  table: ["border", "cellpadding", "cellspacing"], thead: [], tbody: [], tr: [],
  td: ["colspan", "rowspan", "align"], th: ["colspan", "rowspan", "align"],
};

/** Inline style properties a body may use. */
const STYLE_PROPS = new Set([
  "color", "background-color", "font-weight", "font-style", "font-family",
  "font-size", "text-decoration", "text-decoration-line", "text-align",
  "margin-left", "padding-left",
]);

/** Classes the app itself writes into bodies. */
const CLASSES = new Set(["doclink", "memo-quote", "permanent-pen", "rt-section", "rt-table"]);

const SAFE_URL = /^(https?:|mailto:|notes:|#)/i;

function cleanStyle(el: HTMLElement): void {
  const kept: string[] = [];
  const style = el.style;
  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i);
    const value = style.getPropertyValue(prop);
    if (!STYLE_PROPS.has(prop)) continue;
    if (/url\(|expression\(|javascript:/i.test(value)) continue;
    kept.push(`${prop}: ${value}`);
  }
  if (kept.length) el.setAttribute("style", kept.join("; "));
  else el.removeAttribute("style");
}

function cleanNode(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 8 /* comment */) {
      child.remove();
      continue;
    }
    if (child.nodeType !== 1 /* element */) continue;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (DROP.has(tag)) {
      el.remove();
      continue;
    }
    cleanNode(el);
    const allowed = ALLOWED[tag];
    if (!allowed) {
      // Unknown tag: keep its text and children, lose the wrapper.
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "style") continue;
      if (name === "class") {
        const classes = attr.value.split(/\s+/).filter((c) => CLASSES.has(c));
        if (classes.length) el.setAttribute("class", classes.join(" "));
        else el.removeAttribute("class");
        continue;
      }
      if (!allowed.includes(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" && !SAFE_URL.test(attr.value.trim())) el.removeAttribute("href");
    }
    if (el.hasAttribute("style")) cleanStyle(el);
  }
}

/** Return a copy of `html` with only the allowlisted tags, attributes and styles. */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  if (typeof DOMParser === "undefined") {
    // No DOM (never the case in the browser): fall back to plain escaped text.
    return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
  cleanNode(doc.body);
  return doc.body.innerHTML;
}

/** Escape plain text for safe inclusion in HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text to HTML with line breaks. */
export function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

const BLOCKS = new Set(["p", "div", "li", "tr", "h1", "h2", "h3", "h4", "blockquote", "pre", "details", "summary", "table", "ul", "ol"]);

/** HTML to plain text (for search, snippets and the plain `body` field). */
export function htmlToText(html: string): string {
  if (!html) return "";
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, "");
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
  let out = "";
  const newline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) out += child.textContent ?? "";
      else if (child.nodeType === 1) {
        const tag = (child as Element).tagName.toLowerCase();
        if (tag === "br") out += "\n";
        else if (BLOCKS.has(tag)) {
          newline();
          walk(child);
          newline();
        } else walk(child);
      }
    }
  };
  walk(doc.body);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
