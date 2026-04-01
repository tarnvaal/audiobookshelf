# Epub Renderer Gotchas

DOM layout pitfalls discovered during the custom renderer bring-up. Each one caused a blank screen or broken behavior that required a Docker rebuild cycle to diagnose. Reference this before touching rendering, pagination, or position tracking code.

## 1. Container dimensions are 0 at render time

`container.clientWidth` and `container.clientHeight` return 0 if the element hasn't been laid out yet. This happens when you set dimensions via CSS classes (like `h-full w-full`) and immediately read them in the same frame.

**Fix:** Use `requestAnimationFrame` retry loop, or set explicit inline `style="width: 100%; height: 100%"` on the element in the template.

## 2. requestAnimationFrame retry for deferred layout

Even with inline styles, `clientWidth` can be 0 if the parent chain hasn't laid out. CSS column setup (`columnWidth`, `height`) depends on real pixel values.

**Fix:** `_applyPaginatedLayout` checks dimensions and retries via `requestAnimationFrame` if they're 0. Don't assume layout is ready synchronously after DOM insertion.

## 3. epub.js XHTML is XML — no `document.body`

epub.js parses XHTML content as XML via `DOMParser`. XML documents don't have the `.body` convenience property that HTML documents have. `section.document.body` returns `undefined`.

**Fix:** `doc.body || doc.querySelector('body')`. Always use the fallback.

## 4. XHTML xmlns attributes break HTML rendering

When you serialize an XML document's body via `body.innerHTML`, the output includes `xmlns="http://www.w3.org/1999/xhtml"` on elements. Setting this string as `innerHTML` on an HTML element creates elements in the XHTML namespace, which can render incorrectly or invisibly.

**Fix:** Import child nodes into an HTML document context before serializing:
```js
const temp = document.createElement('div')
for (const child of Array.from(body.childNodes)) {
  temp.appendChild(document.importNode(child, true))
}
return temp.innerHTML
```

## 5. CSS column overflow: wrapper visible, container hidden

For CSS column pagination to work:
- The **wrapper** (column container) needs `overflow: visible` so columns expand horizontally
- The **outer container** needs `overflow: hidden` to clip to one page width
- `translateX` on the wrapper shifts which page is visible

If both have `overflow: hidden`, the horizontal column overflow is clipped and nothing renders.

## 6. getBoundingClientRect ignores CSS column transforms

`getBoundingClientRect()` on elements inside a CSS-column wrapper with `translateX` returns their **pre-transform** column positions, not their visual positions. All elements report coordinates as if no transform were applied.

**Fix:** Calculate which page an element is on via `offsetLeft / pageWidth` and compare to `currentPage`:
```js
_getElementPageOffset(el) {
  let left = el.offsetLeft
  let parent = el.offsetParent
  while (parent && parent !== this.container && parent !== this._wrapper) {
    left += parent.offsetLeft
    parent = parent.offsetParent
  }
  return left
}
const elPage = Math.floor(this._getElementPageOffset(el) / pageWidth)
```

This affects `getFirstVisibleParagraphIndex`, `scrollToElement`, `getVisibleText`, and any other code that needs to know what's on the current page.

## 7. epub.js section.cfiFromElement fails on injected DOM

`section.cfiFromElement(el)` expects `el` to be in the section's parsed XML document (`section.document`), not in the renderer's injected HTML copy. The DOM structures may look identical but they're different document trees.

**Fix:** Don't use `cfiFromElement` for position tracking. Instead, calculate percentage from `currentPage / totalPages` and derive CFI via `book.locations.cfiFromPercentage(pct)`.
