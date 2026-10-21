// 목업 화면(.dc.html)을 그대로 그려 주는 작은 실행기
// - public/mockup-files/*.dc.html 파일 하나 = 화면 하나 (Claude 디자인 캔버스에서 만든 목업)
// - 파일 안 <script data-dc-script>의 Component 클래스가 상태(state)와 화면 값(renderVals)을 만들고,
//   <x-dc> 안의 템플릿에 {{값}} · <sc-for> · <sc-if> · onClick/onChange 를 연결한다.
// - setState가 불리면 화면 전체를 다시 그리되, 입력 중인 칸의 포커스 · 스크롤 · <details> 열림은 유지한다.

const EXPR = /\{\{\s*([^}]+?)\s*\}\}/g;

class DCLogic {
  constructor(props) {
    this.props = props || {};
    this.state = {};
  }

  setState(update) {
    const next = typeof update === "function" ? update(this.state) : update;
    this.state = Object.assign({}, this.state, next);
    if (this._rerender) this._rerender();
  }
}

// "a.b.c" → 값 / true · false · 숫자 → 그대로
function resolve(expr, scope) {
  const e = expr.trim();
  if (e === "true") return true;
  if (e === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);
  return e.split(".").reduce((obj, key) => (obj == null ? undefined : obj[key]), scope);
}

function toText(v) {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function interp(str, scope) {
  return str.replace(EXPR, (_, e) => toText(resolve(e, scope)));
}

function onlyExpr(str) {
  const m = str.trim().match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  return m ? m[1] : null;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function renderNodes(nodes, scope, parent, ctx) {
  nodes.forEach((n) => renderNode(n, scope, parent, ctx));
}

function renderNode(node, scope, parent, ctx) {
  if (node.nodeType === 3) {
    parent.appendChild(document.createTextNode(interp(node.data, scope)));
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.localName;

  if (tag === "sc-for") {
    const list = resolve(onlyExpr(node.getAttribute("list")) || "", scope) || [];
    const as = node.getAttribute("as") || "item";
    list.forEach((item) => {
      const inner = Object.create(scope);
      inner[as] = item;
      renderNodes(Array.from(node.childNodes), inner, parent, ctx);
    });
    return;
  }
  if (tag === "sc-if") {
    const v = resolve(onlyExpr(node.getAttribute("value")) || "false", scope);
    if (v) renderNodes(Array.from(node.childNodes), scope, parent, ctx);
    return;
  }

  const el = node.namespaceURI === SVG_NS ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  let value = null;
  Array.from(node.attributes).forEach((attr) => {
    const name = attr.name;
    if (name.startsWith("hint-")) return;
    if (/^on[a-z]+$/.test(name)) {
      const fn = resolve(onlyExpr(attr.value) || "", scope);
      if (typeof fn !== "function") return;
      let evt = name.slice(2);
      const textLike = tag === "textarea" || (tag === "input" && !["checkbox", "radio"].includes(node.getAttribute("type")));
      if (evt === "change" && textLike) evt = "input";
      el.addEventListener(evt, (e) => fn(e));
      return;
    }
    const v = interp(attr.value, scope);
    if (name === "value" && (tag === "input" || tag === "textarea")) value = v;
    try {
      el.setAttribute(name, v);
    } catch (e) {
      /* 잘못된 속성 이름은 건너뜀 */
    }
  });

  // 캔버스 화면끼리 이동 (href="Journey.dc.html") → 같은 실행기로 열기
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    if (/\.dc\.html$/.test(href)) {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        ctx.navigate(href.replace(/\.dc\.html$/, ""));
      });
    } else if (href === "#") {
      el.addEventListener("click", (e) => e.preventDefault());
    }
  }

  if (tag !== "textarea") renderNodes(Array.from(node.childNodes), scope, el, ctx);
  if (value != null) el.value = value;
  parent.appendChild(el);
}

// 다시 그릴 때 유지할 것: 포커스 · 커서 위치 · 스크롤 · <details> 열림
function pathOf(el, root) {
  const path = [];
  while (el && el !== root) {
    const p = el.parentNode;
    if (!p) return null;
    path.unshift(Array.prototype.indexOf.call(p.children, el));
    el = p;
  }
  return el === root ? path : null;
}

function byPath(root, path) {
  return path.reduce((el, i) => (el && el.children ? el.children[i] : null), root);
}

function snapshot(root) {
  const keep = { scroll: [], open: [] };
  const a = document.activeElement;
  if (a && root.contains(a)) {
    keep.focus = { path: pathOf(a, root), s: a.selectionStart, e: a.selectionEnd };
  }
  root.querySelectorAll("*").forEach((el) => {
    if (el.scrollTop > 0 || el.scrollLeft > 0) keep.scroll.push({ path: pathOf(el, root), t: el.scrollTop, l: el.scrollLeft });
    if (el.localName === "details" && el.open) keep.open.push(pathOf(el, root));
  });
  return keep;
}

function restore(root, keep) {
  keep.open.forEach((p) => {
    const el = p && byPath(root, p);
    if (el && el.localName === "details") el.open = true;
  });
  keep.scroll.forEach(({ path, t, l }) => {
    const el = path && byPath(root, path);
    if (el) {
      el.scrollTop = t;
      el.scrollLeft = l;
    }
  });
  if (keep.focus && keep.focus.path) {
    const el = byPath(root, keep.focus.path);
    if (el && el.focus) {
      el.focus({ preventScroll: true });
      try {
        if (keep.focus.s != null && el.setSelectionRange) el.setSelectionRange(keep.focus.s, keep.focus.e);
      } catch (e) {
        /* 선택 영역이 없는 입력 칸 */
      }
    }
  }
}

// .dc.html 텍스트 → { helmet, template, Component }
export function parseBoard(html, baseUrl) {
  const fixed = html.split("__MOCKUP__").join(baseUrl);
  const doc = new DOMParser().parseFromString(fixed, "text/html");
  const xdc = doc.querySelector("x-dc");
  const helmet = xdc.querySelector("helmet");
  const template = Array.from(xdc.childNodes).filter((n) => n !== helmet);
  const code = doc.querySelector("script[data-dc-script]").textContent;
  // eslint-disable-next-line no-new-func
  const Component = new Function("DCLogic", code + "\n;return Component;")(DCLogic);
  const title = (doc.querySelector("title") || {}).textContent || "";
  return { helmet, template, Component, title };
}

// 화면을 container에 그리고, 정리 함수를 돌려준다.
export function mountBoard(container, board, navigate) {
  const headNodes = [];
  if (board.helmet) {
    Array.from(board.helmet.children).forEach((n) => {
      const copy = document.importNode(n, true);
      copy.setAttribute("data-mockup-helmet", "1");
      document.head.appendChild(copy);
      headNodes.push(copy);
    });
  }
  const inst = new board.Component({});
  const ctx = { navigate };
  const draw = () => {
    const keep = snapshot(container);
    const frag = document.createDocumentFragment();
    renderNodes(board.template, Object.assign(Object.create(null), inst.renderVals()), frag, ctx);
    container.replaceChildren(frag);
    restore(container, keep);
  };
  inst._rerender = draw;
  draw();
  return () => {
    inst._rerender = null;
    headNodes.forEach((n) => n.remove());
    container.replaceChildren();
  };
}
