import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/markdown.js";

test("assistant Markdown renders common chat formatting", () => {
  const rendered = renderMarkdown("**Bold**\n\n```js\nconst answer = 42;\n```\n\n[Docs](https://example.com)");

  assert.match(rendered, /<strong>Bold<\/strong>/);
  assert.match(rendered, /<pre><code class="language-js">/);
  assert.match(rendered, /target="_blank"/);
  assert.match(rendered, /rel="noopener noreferrer"/);
});

test("assistant Markdown does not allow raw HTML or unsafe links", () => {
  const rendered = renderMarkdown("<script>alert('nope')</script>\n\n[bad](javascript:alert('nope'))");

  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;/);
  assert.doesNotMatch(rendered, /href="javascript:/);
});
