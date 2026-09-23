import { describe, expect, it } from "vitest";
import { htmlToText, sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("drops scripts and their content", () => {
    expect(sanitizeHtml("hi<script>alert(1)</script>there")).toBe("hithere");
  });

  it("strips event handlers and javascript: URLs", () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)"><a href="javascript:alert(1)" onclick="x()">go</a>');
    expect(out).not.toMatch(/onerror|onclick|javascript:|<img/i);
    expect(out).toContain(">go</a>");
  });

  it("keeps formatting, lists, sections and tables", () => {
    const html =
      "<b>bold</b><i>it</i><u>u</u><ul><li>one</li></ul>" +
      "<details><summary>More</summary>inside</details>" +
      '<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("keeps DocLinks with their coordinates", () => {
    const link = '<a class="doclink" data-coll="mail" data-id="m-1" data-title="Hello" href="notes://Mail01/x">Hello</a>';
    const out = sanitizeHtml(link);
    expect(out).toContain('class="doclink"');
    expect(out).toContain('data-coll="mail"');
    expect(out).toContain('data-id="m-1"');
  });

  it("filters inline styles down to formatting properties", () => {
    const out = sanitizeHtml('<span style="color: red; position: fixed; background: url(x)">t</span>');
    expect(out).toContain("color: red");
    expect(out).not.toMatch(/position|url\(/);
  });

  it("unwraps unknown tags but keeps their text", () => {
    expect(sanitizeHtml("<marquee>wheee</marquee>")).toBe("wheee");
  });
});

describe("htmlToText", () => {
  it("turns breaks and blocks into newlines", () => {
    expect(htmlToText("a<br>b<div>c</div>d")).toBe("a\nb\nc\nd");
  });
});
