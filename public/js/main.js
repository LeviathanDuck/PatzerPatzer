// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/htmldomapi.js
function createElement(tagName2, options) {
  return document.createElement(tagName2, options);
}
function createElementNS(namespaceURI, qualifiedName, options) {
  return document.createElementNS(namespaceURI, qualifiedName, options);
}
function createDocumentFragment() {
  return parseFragment(document.createDocumentFragment());
}
function createTextNode(text) {
  return document.createTextNode(text);
}
function createComment(text) {
  return document.createComment(text);
}
function insertBefore(parentNode2, newNode, referenceNode) {
  if (isDocumentFragment(parentNode2)) {
    let node = parentNode2;
    while (node && isDocumentFragment(node)) {
      const fragment2 = parseFragment(node);
      node = fragment2.parent;
    }
    parentNode2 = node !== null && node !== void 0 ? node : parentNode2;
  }
  if (isDocumentFragment(newNode)) {
    newNode = parseFragment(newNode, parentNode2);
  }
  if (referenceNode && isDocumentFragment(referenceNode)) {
    referenceNode = parseFragment(referenceNode).firstChildNode;
  }
  parentNode2.insertBefore(newNode, referenceNode);
}
function removeChild(node, child) {
  node.removeChild(child);
}
function appendChild(node, child) {
  if (isDocumentFragment(child)) {
    child = parseFragment(child, node);
  }
  node.appendChild(child);
}
function parentNode(node) {
  if (isDocumentFragment(node)) {
    while (node && isDocumentFragment(node)) {
      const fragment2 = parseFragment(node);
      node = fragment2.parent;
    }
    return node !== null && node !== void 0 ? node : null;
  }
  return node.parentNode;
}
function nextSibling(node) {
  var _a;
  if (isDocumentFragment(node)) {
    const fragment2 = parseFragment(node);
    const parent = parentNode(fragment2);
    if (parent && fragment2.lastChildNode) {
      const children = Array.from(parent.childNodes);
      const index = children.indexOf(fragment2.lastChildNode);
      return (_a = children[index + 1]) !== null && _a !== void 0 ? _a : null;
    }
    return null;
  }
  return node.nextSibling;
}
function tagName(elm) {
  return elm.tagName;
}
function setTextContent(node, text) {
  node.textContent = text;
}
function getTextContent(node) {
  return node.textContent;
}
function isElement(node) {
  return node.nodeType === 1;
}
function isText(node) {
  return node.nodeType === 3;
}
function isComment(node) {
  return node.nodeType === 8;
}
function isDocumentFragment(node) {
  return node.nodeType === 11;
}
function parseFragment(fragmentNode, parentNode2) {
  var _a, _b, _c;
  const fragment2 = fragmentNode;
  (_a = fragment2.parent) !== null && _a !== void 0 ? _a : fragment2.parent = parentNode2 !== null && parentNode2 !== void 0 ? parentNode2 : null;
  (_b = fragment2.firstChildNode) !== null && _b !== void 0 ? _b : fragment2.firstChildNode = fragmentNode.firstChild;
  (_c = fragment2.lastChildNode) !== null && _c !== void 0 ? _c : fragment2.lastChildNode = fragmentNode.lastChild;
  return fragment2;
}
var htmlDomApi = {
  createElement,
  createElementNS,
  createTextNode,
  createDocumentFragment,
  createComment,
  insertBefore,
  removeChild,
  appendChild,
  parentNode,
  nextSibling,
  tagName,
  setTextContent,
  getTextContent,
  isElement,
  isText,
  isComment,
  isDocumentFragment
};

// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/vnode.js
function vnode(sel, data, children, text, elm) {
  const key = data === void 0 ? void 0 : data.key;
  return { sel, data, children, text, elm, key };
}

// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/is.js
var array = Array.isArray;
function primitive(s) {
  return typeof s === "string" || typeof s === "number" || s instanceof String || s instanceof Number;
}

// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/init.js
var emptyNode = vnode("", {}, [], void 0, void 0);
function sameVnode(vnode1, vnode22) {
  var _a, _b;
  const isSameKey = vnode1.key === vnode22.key;
  const isSameIs = ((_a = vnode1.data) === null || _a === void 0 ? void 0 : _a.is) === ((_b = vnode22.data) === null || _b === void 0 ? void 0 : _b.is);
  const isSameSel = vnode1.sel === vnode22.sel;
  const isSameTextOrFragment = !vnode1.sel && vnode1.sel === vnode22.sel ? typeof vnode1.text === typeof vnode22.text : true;
  return isSameSel && isSameKey && isSameIs && isSameTextOrFragment;
}
function documentFragmentIsNotSupported() {
  throw new Error("The document fragment is not supported on this platform.");
}
function isElement2(api, vnode3) {
  return api.isElement(vnode3);
}
function isDocumentFragment2(api, vnode3) {
  return api.isDocumentFragment(vnode3);
}
function createKeyToOldIdx(children, beginIdx, endIdx) {
  var _a;
  const map = {};
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = (_a = children[i]) === null || _a === void 0 ? void 0 : _a.key;
    if (key !== void 0) {
      map[key] = i;
    }
  }
  return map;
}
var hooks = [
  "create",
  "update",
  "remove",
  "destroy",
  "pre",
  "post"
];
function init(modules, domApi, options) {
  const cbs = {
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [],
    post: []
  };
  const api = domApi !== void 0 ? domApi : htmlDomApi;
  for (const hook of hooks) {
    for (const module of modules) {
      const currentHook = module[hook];
      if (currentHook !== void 0) {
        cbs[hook].push(currentHook);
      }
    }
  }
  function emptyNodeAt(elm) {
    const id = elm.id ? "#" + elm.id : "";
    const classes = elm.getAttribute("class");
    const c = classes ? "." + classes.split(" ").join(".") : "";
    return vnode(api.tagName(elm).toLowerCase() + id + c, {}, [], void 0, elm);
  }
  function emptyDocumentFragmentAt(frag) {
    return vnode(void 0, {}, [], void 0, frag);
  }
  function createRmCb(childElm, listeners) {
    return function rmCb() {
      if (--listeners === 0) {
        const parent = api.parentNode(childElm);
        if (parent !== null) {
          api.removeChild(parent, childElm);
        }
      }
    };
  }
  function createElm(vnode3, insertedVnodeQueue) {
    var _a, _b, _c, _d, _e;
    let i;
    const data = vnode3.data;
    const hook = data === null || data === void 0 ? void 0 : data.hook;
    (_a = hook === null || hook === void 0 ? void 0 : hook.init) === null || _a === void 0 ? void 0 : _a.call(hook, vnode3);
    const children = vnode3.children;
    const sel = vnode3.sel;
    if (sel === "!") {
      (_b = vnode3.text) !== null && _b !== void 0 ? _b : vnode3.text = "";
      vnode3.elm = api.createComment(vnode3.text);
    } else if (sel === "") {
      vnode3.elm = api.createTextNode(vnode3.text);
    } else if (sel !== void 0) {
      const hashIdx = sel.indexOf("#");
      const dotIdx = sel.indexOf(".", hashIdx);
      const hash2 = hashIdx > 0 ? hashIdx : sel.length;
      const dot = dotIdx > 0 ? dotIdx : sel.length;
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash2, dot)) : sel;
      const ns = data === null || data === void 0 ? void 0 : data.ns;
      const elm = ns === void 0 ? api.createElement(tag, data) : api.createElementNS(ns, tag, data);
      vnode3.elm = elm;
      if (hash2 < dot)
        elm.setAttribute("id", sel.slice(hash2 + 1, dot));
      if (dotIdx > 0)
        elm.setAttribute("class", sel.slice(dot + 1).replace(/\./g, " "));
      for (i = 0; i < cbs.create.length; ++i)
        cbs.create[i](emptyNode, vnode3);
      if (primitive(vnode3.text) && (!array(children) || children.length === 0)) {
        api.appendChild(elm, api.createTextNode(vnode3.text));
      }
      if (array(children)) {
        for (i = 0; i < children.length; ++i) {
          const ch = children[i];
          if (ch != null) {
            api.appendChild(elm, createElm(ch, insertedVnodeQueue));
          }
        }
      }
      if (hook !== void 0) {
        (_c = hook.create) === null || _c === void 0 ? void 0 : _c.call(hook, emptyNode, vnode3);
        if (hook.insert !== void 0) {
          insertedVnodeQueue.push(vnode3);
        }
      }
    } else if (((_d = options === null || options === void 0 ? void 0 : options.experimental) === null || _d === void 0 ? void 0 : _d.fragments) && vnode3.children) {
      vnode3.elm = ((_e = api.createDocumentFragment) !== null && _e !== void 0 ? _e : documentFragmentIsNotSupported)();
      for (i = 0; i < cbs.create.length; ++i)
        cbs.create[i](emptyNode, vnode3);
      for (i = 0; i < vnode3.children.length; ++i) {
        const ch = vnode3.children[i];
        if (ch != null) {
          api.appendChild(vnode3.elm, createElm(ch, insertedVnodeQueue));
        }
      }
    } else {
      vnode3.elm = api.createTextNode(vnode3.text);
    }
    return vnode3.elm;
  }
  function addVnodes(parentElm, before, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before);
      }
    }
  }
  function invokeDestroyHook(vnode3) {
    var _a, _b;
    const data = vnode3.data;
    if (data !== void 0) {
      (_b = (_a = data === null || data === void 0 ? void 0 : data.hook) === null || _a === void 0 ? void 0 : _a.destroy) === null || _b === void 0 ? void 0 : _b.call(_a, vnode3);
      for (let i = 0; i < cbs.destroy.length; ++i)
        cbs.destroy[i](vnode3);
      if (vnode3.children !== void 0) {
        for (let j = 0; j < vnode3.children.length; ++j) {
          const child = vnode3.children[j];
          if (child != null && typeof child !== "string") {
            invokeDestroyHook(child);
          }
        }
      }
    }
  }
  function removeVnodes(parentElm, vnodes, startIdx, endIdx) {
    var _a, _b;
    for (; startIdx <= endIdx; ++startIdx) {
      let listeners;
      const ch = vnodes[startIdx];
      if (ch != null) {
        if (ch.sel !== void 0) {
          invokeDestroyHook(ch);
          listeners = cbs.remove.length + 1;
          const rm = createRmCb(ch.elm, listeners);
          for (let i = 0; i < cbs.remove.length; ++i)
            cbs.remove[i](ch, rm);
          const removeHook = (_b = (_a = ch === null || ch === void 0 ? void 0 : ch.data) === null || _a === void 0 ? void 0 : _a.hook) === null || _b === void 0 ? void 0 : _b.remove;
          if (removeHook !== void 0) {
            removeHook(ch, rm);
          } else {
            rm();
          }
        } else if (ch.children) {
          invokeDestroyHook(ch);
          removeVnodes(parentElm, ch.children, 0, ch.children.length - 1);
        } else {
          api.removeChild(parentElm, ch.elm);
        }
      }
    }
  }
  function updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue) {
    let oldStartIdx = 0;
    let newStartIdx = 0;
    let oldEndIdx = oldCh.length - 1;
    let oldStartVnode = oldCh[0];
    let oldEndVnode = oldCh[oldEndIdx];
    let newEndIdx = newCh.length - 1;
    let newStartVnode = newCh[0];
    let newEndVnode = newCh[newEndIdx];
    let oldKeyToIdx;
    let idxInOld;
    let elmToMove;
    let before;
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx];
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx];
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx];
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldStartVnode.elm, api.nextSibling(oldEndVnode.elm));
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm);
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];
      } else {
        if (oldKeyToIdx === void 0) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        }
        idxInOld = oldKeyToIdx[newStartVnode.key];
        if (idxInOld === void 0) {
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm);
          newStartVnode = newCh[++newStartIdx];
        } else if (oldKeyToIdx[newEndVnode.key] === void 0) {
          api.insertBefore(parentElm, createElm(newEndVnode, insertedVnodeQueue), api.nextSibling(oldEndVnode.elm));
          newEndVnode = newCh[--newEndIdx];
        } else {
          elmToMove = oldCh[idxInOld];
          if (elmToMove.sel !== newStartVnode.sel) {
            api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm);
          } else {
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
            oldCh[idxInOld] = void 0;
            api.insertBefore(parentElm, elmToMove.elm, oldStartVnode.elm);
          }
          newStartVnode = newCh[++newStartIdx];
        }
      }
    }
    if (newStartIdx <= newEndIdx) {
      before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm;
      addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue);
    }
    if (oldStartIdx <= oldEndIdx) {
      removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
    }
  }
  function patchVnode(oldVnode, vnode3, insertedVnodeQueue) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const hook = (_a = vnode3.data) === null || _a === void 0 ? void 0 : _a.hook;
    (_b = hook === null || hook === void 0 ? void 0 : hook.prepatch) === null || _b === void 0 ? void 0 : _b.call(hook, oldVnode, vnode3);
    const elm = vnode3.elm = oldVnode.elm;
    if (oldVnode === vnode3)
      return;
    if (vnode3.data !== void 0 || vnode3.text !== void 0 && vnode3.text !== oldVnode.text) {
      (_c = vnode3.data) !== null && _c !== void 0 ? _c : vnode3.data = {};
      (_d = oldVnode.data) !== null && _d !== void 0 ? _d : oldVnode.data = {};
      for (let i = 0; i < cbs.update.length; ++i)
        cbs.update[i](oldVnode, vnode3);
      (_g = (_f = (_e = vnode3.data) === null || _e === void 0 ? void 0 : _e.hook) === null || _f === void 0 ? void 0 : _f.update) === null || _g === void 0 ? void 0 : _g.call(_f, oldVnode, vnode3);
    }
    const oldCh = oldVnode.children;
    const ch = vnode3.children;
    if (vnode3.text === void 0) {
      if (oldCh !== void 0 && ch !== void 0) {
        if (oldCh !== ch)
          updateChildren(elm, oldCh, ch, insertedVnodeQueue);
      } else if (ch !== void 0) {
        if (oldVnode.text !== void 0)
          api.setTextContent(elm, "");
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);
      } else if (oldCh !== void 0) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);
      } else if (oldVnode.text !== void 0) {
        api.setTextContent(elm, "");
      }
    } else if (oldVnode.text !== vnode3.text) {
      if (oldCh !== void 0) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);
      }
      api.setTextContent(elm, vnode3.text);
    }
    (_h = hook === null || hook === void 0 ? void 0 : hook.postpatch) === null || _h === void 0 ? void 0 : _h.call(hook, oldVnode, vnode3);
  }
  return function patch2(oldVnode, vnode3) {
    let i, elm, parent;
    const insertedVnodeQueue = [];
    for (i = 0; i < cbs.pre.length; ++i)
      cbs.pre[i]();
    if (isElement2(api, oldVnode)) {
      oldVnode = emptyNodeAt(oldVnode);
    } else if (isDocumentFragment2(api, oldVnode)) {
      oldVnode = emptyDocumentFragmentAt(oldVnode);
    }
    if (sameVnode(oldVnode, vnode3)) {
      patchVnode(oldVnode, vnode3, insertedVnodeQueue);
    } else {
      elm = oldVnode.elm;
      parent = api.parentNode(elm);
      createElm(vnode3, insertedVnodeQueue);
      if (parent !== null) {
        api.insertBefore(parent, vnode3.elm, api.nextSibling(elm));
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data.hook.insert(insertedVnodeQueue[i]);
    }
    for (i = 0; i < cbs.post.length; ++i)
      cbs.post[i]();
    return vnode3;
  };
}

// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/h.js
function addNS(data, children, sel) {
  data.ns = "http://www.w3.org/2000/svg";
  if (sel !== "foreignObject" && children !== void 0) {
    for (let i = 0; i < children.length; ++i) {
      const child = children[i];
      if (typeof child === "string")
        continue;
      const childData = child.data;
      if (childData !== void 0) {
        addNS(childData, child.children, child.sel);
      }
    }
  }
}
function h(sel, b, c) {
  let data = {};
  let children;
  let text;
  let i;
  if (c !== void 0) {
    if (b !== null) {
      data = b;
    }
    if (array(c)) {
      children = c;
    } else if (primitive(c)) {
      text = c.toString();
    } else if (c && c.sel) {
      children = [c];
    }
  } else if (b !== void 0 && b !== null) {
    if (array(b)) {
      children = b;
    } else if (primitive(b)) {
      text = b.toString();
    } else if (b && b.sel) {
      children = [b];
    } else {
      data = b;
    }
  }
  if (children !== void 0) {
    for (i = 0; i < children.length; ++i) {
      if (primitive(children[i]))
        children[i] = vnode(void 0, void 0, void 0, children[i], void 0);
    }
  }
  if (sel.startsWith("svg") && (sel.length === 3 || sel[3] === "." || sel[3] === "#")) {
    addNS(data, children, sel);
  }
  return vnode(sel, data, children, text, void 0);
}

// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/modules/attributes.js
var xlinkNS = "http://www.w3.org/1999/xlink";
var xmlnsNS = "http://www.w3.org/2000/xmlns/";
var xmlNS = "http://www.w3.org/XML/1998/namespace";
var colonChar = 58;
var xChar = 120;
var mChar = 109;
function updateAttrs(oldVnode, vnode3) {
  let key;
  const elm = vnode3.elm;
  let oldAttrs = oldVnode.data.attrs;
  let attrs = vnode3.data.attrs;
  if (!oldAttrs && !attrs)
    return;
  if (oldAttrs === attrs)
    return;
  oldAttrs = oldAttrs || {};
  attrs = attrs || {};
  for (key in attrs) {
    const cur = attrs[key];
    const old = oldAttrs[key];
    if (old !== cur) {
      if (cur === true) {
        elm.setAttribute(key, "");
      } else if (cur === false) {
        elm.removeAttribute(key);
      } else {
        if (key.charCodeAt(0) !== xChar) {
          elm.setAttribute(key, cur);
        } else if (key.charCodeAt(3) === colonChar) {
          elm.setAttributeNS(xmlNS, key, cur);
        } else if (key.charCodeAt(5) === colonChar) {
          key.charCodeAt(1) === mChar ? elm.setAttributeNS(xmlnsNS, key, cur) : elm.setAttributeNS(xlinkNS, key, cur);
        } else {
          elm.setAttribute(key, cur);
        }
      }
    }
  }
  for (key in oldAttrs) {
    if (!(key in attrs)) {
      elm.removeAttribute(key);
    }
  }
}
var attributesModule = {
  create: updateAttrs,
  update: updateAttrs
};

// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/modules/class.js
function updateClass(oldVnode, vnode3) {
  let cur;
  let name;
  const elm = vnode3.elm;
  let oldClass = oldVnode.data.class;
  let klass = vnode3.data.class;
  if (!oldClass && !klass)
    return;
  if (oldClass === klass)
    return;
  oldClass = oldClass || {};
  klass = klass || {};
  for (name in oldClass) {
    if (oldClass[name] && !Object.prototype.hasOwnProperty.call(klass, name)) {
      elm.classList.remove(name);
    }
  }
  for (name in klass) {
    cur = klass[name];
    if (cur !== oldClass[name]) {
      elm.classList[cur ? "add" : "remove"](name);
    }
  }
}
var classModule = { create: updateClass, update: updateClass };

// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/modules/eventlisteners.js
function invokeHandler(handler, vnode3, event) {
  if (typeof handler === "function") {
    handler.call(vnode3, event, vnode3);
  } else if (typeof handler === "object") {
    for (let i = 0; i < handler.length; i++) {
      invokeHandler(handler[i], vnode3, event);
    }
  }
}
function handleEvent(event, vnode3) {
  const name = event.type;
  const on = vnode3.data.on;
  if (on && on[name]) {
    invokeHandler(on[name], vnode3, event);
  }
}
function createListener() {
  return function handler(event) {
    handleEvent(event, handler.vnode);
  };
}
function updateEventListeners(oldVnode, vnode3) {
  const oldOn = oldVnode.data.on;
  const oldListener = oldVnode.listener;
  const oldElm = oldVnode.elm;
  const on = vnode3 && vnode3.data.on;
  const elm = vnode3 && vnode3.elm;
  let name;
  if (oldOn === on) {
    return;
  }
  if (oldOn && oldListener) {
    if (!on) {
      for (name in oldOn) {
        oldElm.removeEventListener(name, oldListener, false);
      }
    } else {
      for (name in oldOn) {
        if (!on[name]) {
          oldElm.removeEventListener(name, oldListener, false);
        }
      }
    }
  }
  if (on) {
    const listener = vnode3.listener = oldVnode.listener || createListener();
    listener.vnode = vnode3;
    if (!oldOn) {
      for (name in on) {
        elm.addEventListener(name, listener, false);
      }
    } else {
      for (name in on) {
        if (!oldOn[name]) {
          elm.addEventListener(name, listener, false);
        }
      }
    }
  }
}
var eventListenersModule = {
  create: updateEventListeners,
  update: updateEventListeners,
  destroy: updateEventListeners
};

// src/tree/ops.ts
var pathHead = (path) => path.slice(0, 2);
var pathTail = (path) => path.slice(2);
var pathInit = (path) => path.slice(0, -2);
var pathLast = (path) => path.slice(-2);
function childById(node, id) {
  return node.children.find((c) => c.id === id);
}
function nodeAtPath(root, path) {
  if (path === "") return root;
  const child = childById(root, pathHead(path));
  return child ? nodeAtPath(child, pathTail(path)) : void 0;
}
function parentAtPath(root, path) {
  if (path === "") return void 0;
  return nodeAtPath(root, pathInit(path));
}
function nodeListAt(root, path) {
  const nodes = [root];
  let node = root;
  let p = path;
  while (p !== "") {
    const child = childById(node, pathHead(p));
    if (!child) break;
    nodes.push(child);
    node = child;
    p = pathTail(p);
  }
  return nodes;
}
function pathIsMainline(root, path) {
  if (path === "") return true;
  const firstChild = root.children[0];
  return firstChild?.id === pathHead(path) && pathIsMainline(firstChild, pathTail(path));
}
function mainlineNodeList(root) {
  const nodes = [];
  let node = root;
  while (node) {
    nodes.push(node);
    node = node.children[0];
  }
  return nodes;
}
function addNode(root, path, node) {
  const parent = nodeAtPath(root, path);
  if (!parent) return;
  if (!childById(parent, node.id)) {
    parent.children.push(node);
  }
}
function deleteNodeAt(root, path) {
  if (path === "") return;
  const parent = parentAtPath(root, path);
  if (!parent) return;
  const id = pathLast(path);
  parent.children = parent.children.filter((c) => c.id !== id);
}
function promoteAt(root, path, toMainline) {
  const nodes = nodeListAt(root, path);
  for (let i = nodes.length - 2; i >= 0; i--) {
    const node = nodes[i + 1];
    const parent = nodes[i];
    if (parent.children[0]?.id !== node.id) {
      parent.children = [node, ...parent.children.filter((c) => c.id !== node.id)];
      if (!toMainline) break;
    } else if (node.forceVariation) {
      node.forceVariation = false;
      if (!toMainline) break;
    }
  }
}

// src/analyse/ctrl.ts
var AnalyseCtrl = class {
  constructor(root) {
    this.root = root;
    this.path = "";
    this.nodeList = [root];
    this.node = root;
    this.mainline = mainlineNodeList(root);
  }
  /**
   * Jump to the node at path.
   * If the path is invalid, the current position is unchanged.
   * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts setPath
   */
  setPath(path) {
    const target = nodeAtPath(this.root, path);
    if (!target) return;
    this.path = path;
    this.nodeList = nodeListAt(this.root, path);
    this.node = target;
    this.mainline = mainlineNodeList(this.root);
  }
};

// src/board/cosmetics.ts
var BOARD_WHEEL_NAV_KEY = "boardWheelNavEnabled";
var BOARD_WHEEL_NAV_DEFAULT = false;
var boardWheelNavEnabled = (() => {
  const stored = localStorage.getItem(BOARD_WHEEL_NAV_KEY);
  return stored === null ? BOARD_WHEEL_NAV_DEFAULT : stored === "true";
})();
function setBoardWheelNavEnabled(enabled) {
  boardWheelNavEnabled = enabled;
  localStorage.setItem(BOARD_WHEEL_NAV_KEY, String(enabled));
}
var REVIEW_DOTS_USER_ONLY_KEY = "reviewDotsUserOnly";
var reviewDotsUserOnly = localStorage.getItem(REVIEW_DOTS_USER_ONLY_KEY) === "true";
function setReviewDotsUserOnly(enabled) {
  reviewDotsUserOnly = enabled;
  localStorage.setItem(REVIEW_DOTS_USER_ONLY_KEY, String(enabled));
}
var ZOOM_DEFAULT = 85;
var ZOOM_KEY = "boardZoom";
var boardZoom = (() => {
  const stored = localStorage.getItem(ZOOM_KEY);
  const n = stored !== null ? parseInt(stored, 10) : NaN;
  return !isNaN(n) && n >= 0 && n <= 100 ? n : ZOOM_DEFAULT;
})();
function applyBoardZoom(zoom) {
  document.body.style.setProperty("---zoom", String(zoom));
}
function saveBoardZoom(zoom) {
  boardZoom = zoom;
  localStorage.setItem(ZOOM_KEY, String(zoom));
}
var BOARD_THEME_KEY = "boardTheme";
var BOARD_THEME_DEFAULT = "green";
var BOARD_THEMES_FEATURED = [
  "brown",
  "wood4",
  "maple",
  "horsey",
  "blue",
  "blue2",
  "blue3",
  "green",
  "marble",
  "olive",
  "grey",
  "metal",
  "newspaper",
  "purple",
  "purple-diag"
];
var boardTheme = localStorage.getItem(BOARD_THEME_KEY) ?? BOARD_THEME_DEFAULT;
function applyBoardTheme(name) {
  document.body.dataset.board = name;
  boardTheme = name;
  localStorage.setItem(BOARD_THEME_KEY, name);
}
var PIECE_SET_KEY = "pieceSet";
var PIECE_SET_DEFAULT = "staunty";
var PIECE_SETS_FEATURED = [
  "cburnett",
  "merida",
  "alpha",
  "companion",
  "kosal",
  "caliente",
  "rhosgfx",
  "maestro",
  "fresca",
  "cardinal",
  "gioco",
  "staunty",
  "monarchy",
  "dubrovny",
  "mpchess",
  "horsey",
  "anarcandy"
];
var PIECE_VARS = [
  ["---white-pawn", "wP"],
  ["---white-knight", "wN"],
  ["---white-bishop", "wB"],
  ["---white-rook", "wR"],
  ["---white-queen", "wQ"],
  ["---white-king", "wK"],
  ["---black-pawn", "bP"],
  ["---black-knight", "bN"],
  ["---black-bishop", "bB"],
  ["---black-rook", "bR"],
  ["---black-queen", "bQ"],
  ["---black-king", "bK"]
];
var PIECE_WEBP_SETS = /* @__PURE__ */ new Set(["monarchy"]);
var pieceSet = localStorage.getItem(PIECE_SET_KEY) ?? PIECE_SET_DEFAULT;
function applyPieceSet(name) {
  const ext = PIECE_WEBP_SETS.has(name) ? "webp" : "svg";
  for (const [cssVar, file] of PIECE_VARS) {
    document.body.style.setProperty(cssVar, `url(/piece/${name}/${file}.${ext})`);
  }
  document.body.dataset.pieceSet = name;
  pieceSet = name;
  localStorage.setItem(PIECE_SET_KEY, name);
}
var FILTER_DEFAULTS = {
  "board-brightness": 100,
  "board-contrast": 100,
  "board-hue": 0
};
var FILTER_LS_PREFIX = "boardFilter.";
var boardFilters = {};
for (const [prop, def] of Object.entries(FILTER_DEFAULTS)) {
  const stored = localStorage.getItem(FILTER_LS_PREFIX + prop);
  boardFilters[prop] = stored !== null ? parseInt(stored, 10) : def;
}
function clearBoardLocalData() {
  localStorage.removeItem(ZOOM_KEY);
  localStorage.removeItem(BOARD_THEME_KEY);
  localStorage.removeItem(PIECE_SET_KEY);
  localStorage.removeItem(BOARD_WHEEL_NAV_KEY);
  localStorage.removeItem(REVIEW_DOTS_USER_ONLY_KEY);
  for (const prop of Object.keys(FILTER_DEFAULTS)) {
    localStorage.removeItem(FILTER_LS_PREFIX + prop);
  }
}
function filtersAtDefault() {
  return Object.entries(FILTER_DEFAULTS).every(([p, def]) => boardFilters[p] === def);
}
function setFilter(prop, value) {
  boardFilters[prop] = value;
  document.body.style.setProperty(`---${prop}`, value.toString());
  localStorage.setItem(FILTER_LS_PREFIX + prop, value.toString());
  document.body.classList.toggle("simple-board", filtersAtDefault());
}
function resetFilters() {
  for (const [prop, def] of Object.entries(FILTER_DEFAULTS)) setFilter(prop, def);
}
var BOARD_THEME_EXT = {
  brown: "png",
  horsey: "jpg",
  blue: "png",
  green: "png",
  purple: "png",
  "purple-diag": "png",
  wood4: "jpg",
  maple: "jpg",
  blue2: "jpg",
  blue3: "jpg",
  marble: "jpg",
  olive: "jpg",
  grey: "jpg",
  metal: "jpg",
  newspaper: "svg"
};
function boardThumbnailUrl(name) {
  if (name === "newspaper") return "/images/board/svg/newspaper.svg";
  return `/images/board/${name}.thumbnail.${BOARD_THEME_EXT[name]}`;
}
function piecePreviewUrl(name) {
  return PIECE_WEBP_SETS.has(name) ? `/piece/${name}/wN.webp` : `/piece/${name}/wN.svg`;
}
function renderFilterSlider(prop, label, min, max, step2, redraw2, fmt) {
  const value = boardFilters[prop] ?? FILTER_DEFAULTS[prop] ?? min;
  return h("div.board-settings__slider-row", [
    h("label", label),
    h("input", {
      attrs: { type: "range", min, max, step: step2, value },
      on: {
        input: (e) => {
          setFilter(prop, parseInt(e.target.value, 10));
          redraw2();
        }
      }
    }),
    h("span.board-settings__slider-val", fmt ? fmt(value) : `${value}%`)
  ]);
}
function renderBoardSettings(redraw2) {
  return h("div.board-settings", [
    // Sliders
    renderFilterSlider("board-brightness", "Brightness", 20, 140, 1, redraw2),
    renderFilterSlider("board-contrast", "Contrast", 40, 200, 2, redraw2),
    renderFilterSlider("board-hue", "Hue", 0, 100, 1, redraw2, (v) => `\xB1${Math.round(v * 3.6)}\xB0`),
    filtersAtDefault() ? null : h("button.board-settings__reset", {
      on: { click: () => {
        resetFilters();
        redraw2();
      } }
    }, "Reset"),
    // Board theme tile grid
    h("div.board-settings__label", "Board"),
    h(
      "div.board-settings__theme-grid",
      BOARD_THEMES_FEATURED.map(
        (name) => h("button.board-settings__theme-tile", {
          class: { active: boardTheme === name },
          attrs: { title: name },
          on: { click: () => {
            applyBoardTheme(name);
            redraw2();
          } }
        }, [
          h("span", { attrs: { style: `background-image: url(${boardThumbnailUrl(name)})` } })
        ])
      )
    ),
    // Piece set tile grid
    h("div.board-settings__label", "Pieces"),
    h(
      "div.board-settings__piece-grid",
      PIECE_SETS_FEATURED.map(
        (name) => h("button.board-settings__piece-tile", {
          class: { active: pieceSet === name },
          attrs: { title: name },
          on: { click: () => {
            applyPieceSet(name);
            redraw2();
          } }
        }, [
          h("piece", { attrs: { style: `background-image: url(${piecePreviewUrl(name)})` } })
        ])
      )
    )
  ]);
}
applyBoardZoom(boardZoom);
applyBoardTheme(boardTheme);
applyPieceSet(pieceSet);
for (const [prop, value] of Object.entries(boardFilters)) {
  document.body.style.setProperty(`---${prop}`, value.toString());
}
document.body.classList.toggle("simple-board", filtersAtDefault());

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/types.js
var FILE_NAMES = ["a", "b", "c", "d", "e", "f", "g", "h"];
var RANK_NAMES = ["1", "2", "3", "4", "5", "6", "7", "8"];
var COLORS = ["white", "black"];
var ROLES = ["pawn", "knight", "bishop", "rook", "queen", "king"];
var CASTLING_SIDES = ["a", "h"];
var isDrop = (v) => "role" in v;

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/util.js
var defined = (v) => v !== void 0;
var opposite = (color) => color === "white" ? "black" : "white";
var squareRank = (square) => square >> 3;
var squareFile = (square) => square & 7;
var squareFromCoords = (file, rank) => 0 <= file && file < 8 && 0 <= rank && rank < 8 ? file + 8 * rank : void 0;
var roleToChar = (role) => {
  switch (role) {
    case "pawn":
      return "p";
    case "knight":
      return "n";
    case "bishop":
      return "b";
    case "rook":
      return "r";
    case "queen":
      return "q";
    case "king":
      return "k";
  }
};
function charToRole(ch) {
  switch (ch.toLowerCase()) {
    case "p":
      return "pawn";
    case "n":
      return "knight";
    case "b":
      return "bishop";
    case "r":
      return "rook";
    case "q":
      return "queen";
    case "k":
      return "king";
    default:
      return;
  }
}
function parseSquare(str) {
  if (str.length !== 2)
    return;
  return squareFromCoords(str.charCodeAt(0) - "a".charCodeAt(0), str.charCodeAt(1) - "1".charCodeAt(0));
}
var makeSquare = (square) => FILE_NAMES[squareFile(square)] + RANK_NAMES[squareRank(square)];
var parseUci = (str) => {
  if (str[1] === "@" && str.length === 4) {
    const role = charToRole(str[0]);
    const to = parseSquare(str.slice(2));
    if (role && defined(to))
      return { role, to };
  } else if (str.length === 4 || str.length === 5) {
    const from = parseSquare(str.slice(0, 2));
    const to = parseSquare(str.slice(2, 4));
    let promotion;
    if (str.length === 5) {
      promotion = charToRole(str[4]);
      if (!promotion)
        return;
    }
    if (defined(from) && defined(to))
      return { from, to, promotion };
  }
  return;
};
var makeUci = (move3) => isDrop(move3) ? `${roleToChar(move3.role).toUpperCase()}@${makeSquare(move3.to)}` : makeSquare(move3.from) + makeSquare(move3.to) + (move3.promotion ? roleToChar(move3.promotion) : "");
var kingCastlesTo = (color, side) => color === "white" ? side === "a" ? 2 : 6 : side === "a" ? 58 : 62;
var rookCastlesTo = (color, side) => color === "white" ? side === "a" ? 3 : 5 : side === "a" ? 59 : 61;

// src/analyse/boardGlyphs.ts
var maxGlyphs = 4;
function annotationShapes(node) {
  const { uci, glyphs, san } = node;
  if (uci && san && glyphs) {
    return glyphs.slice(0, maxGlyphs).map((glyph, idx) => {
      const move3 = parseUci(uci);
      const destSquare = san.startsWith("O-O") ? squareRank(move3.to) === 0 ? san.startsWith("O-O-O") ? "c1" : "g1" : san.startsWith("O-O-O") ? "c8" : "g8" : makeSquare(move3.to);
      const symbol = glyph.symbol;
      const prerendered = glyphToSvg[symbol] ? glyphToSvg[symbol](idx) : void 0;
      if (prerendered) {
        return {
          orig: destSquare,
          brush: "",
          customSvg: { html: prerendered }
        };
      }
      return {
        orig: destSquare,
        label: { text: symbol, fill: "purple" }
        // keep some purple just to keep feedback forum on their toes
      };
    }).reverse();
  } else return [];
}
var composeGlyph = (fill, path) => (stackedNumber) => `<defs><filter id="a"><feDropShadow dx="4" dy="7" flood-opacity=".5" stdDeviation="5"/></filter></defs><g transform="matrix(.4 0 0 .4 ${glyphStacktoPx(stackedNumber).x} ${glyphStacktoPx(stackedNumber).y})"><circle cx="50" cy="50" r="50" fill="${fill}" filter="url(#a)"/>${path}</g>`;
var glyphStacktoPx = (stack) => ({
  x: 71 - stack % maxGlyphs * 28,
  y: -12
});
var glyphToSvg = {
  "?!": composeGlyph(
    "#56b4e9",
    '<path fill="#fff" d="M37.734 21.947c-3.714 0-7.128.464-10.242 1.393-3.113.928-6.009 2.13-8.685 3.605l4.343 8.766c2.35-1.202 4.644-2.157 6.883-2.867a22.366 22.366 0 0 1 6.799-1.065c2.294 0 4.07.464 5.326 1.393 1.311.874 1.967 2.186 1.967 3.933 0 1.748-.546 3.277-1.639 4.588-1.038 1.257-2.786 2.758-5.244 4.506-2.786 2.021-4.751 3.961-5.898 5.819-1.147 1.857-1.721 4.15-1.721 6.88v2.952h10.568v-2.377c0-1.147.137-2.103.41-2.868.328-.764.93-1.557 1.803-2.376.874-.82 2.104-1.803 3.688-2.95 2.13-1.584 3.906-3.058 5.326-4.424 1.42-1.42 2.485-2.95 3.195-4.59.71-1.638 1.065-3.576 1.065-5.816 0-4.206-1.584-7.675-4.752-10.406-3.114-2.731-7.51-4.096-13.192-4.096zm24.745.819 2.048 39.084h9.75l2.047-39.084zM35.357 68.73c-1.966 0-3.632.52-4.998 1.557-1.365.983-2.047 2.732-2.047 5.244 0 2.404.682 4.152 2.047 5.244 1.366 1.038 3.032 1.557 4.998 1.557 1.912 0 3.55-.519 4.916-1.557 1.366-1.092 2.05-2.84 2.05-5.244 0-2.512-.684-4.26-2.05-5.244-1.365-1.038-3.004-1.557-4.916-1.557zm34.004 0c-1.966 0-3.632.52-4.998 1.557-1.365.983-2.049 2.732-2.049 5.244 0 2.404.684 4.152 2.05 5.244 1.365 1.038 3.03 1.557 4.997 1.557 1.912 0 3.55-.519 4.916-1.557 1.366-1.092 2.047-2.84 2.047-5.244 0-2.512-.681-4.26-2.047-5.244-1.365-1.038-3.004-1.557-4.916-1.557z"/>'
  ),
  "?": composeGlyph(
    "#e69f00",
    '<path fill="#fff" d="M40.436 60.851q0-4.66 1.957-7.83 1.958-3.17 6.712-6.619 4.195-2.983 5.967-5.127 1.864-2.237 1.864-5.22 0-2.983-2.237-4.475-2.144-1.585-6.06-1.585-3.915 0-7.737 1.212t-7.83 3.263l-4.941-9.975q4.568-2.517 9.881-4.101 5.314-1.585 11.653-1.585 9.695 0 15.008 4.661 5.407 4.661 5.407 11.839 0 3.822-1.212 6.619-1.212 2.796-3.635 5.22-2.424 2.33-6.06 5.034-2.703 1.958-4.195 3.356-1.491 1.398-2.05 2.703-.467 1.305-.467 3.263v2.703H40.436zm-1.492 18.924q0-4.288 2.33-5.966 2.331-1.771 5.687-1.771 3.263 0 5.594 1.771 2.33 1.678 2.33 5.966 0 4.102-2.33 5.966-2.331 1.772-5.594 1.772-3.356 0-5.686-1.772-2.33-1.864-2.33-5.966z"/>'
  ),
  "??": composeGlyph(
    "#df5353",
    '<path fill="#fff" d="M31.8 22.22c-3.675 0-7.052.46-10.132 1.38-3.08.918-5.945 2.106-8.593 3.565l4.298 8.674c2.323-1.189 4.592-2.136 6.808-2.838a22.138 22.138 0 0 1 6.728-1.053c2.27 0 4.025.46 5.268 1.378 1.297.865 1.946 2.16 1.946 3.89s-.541 3.242-1.622 4.539c-1.027 1.243-2.756 2.73-5.188 4.458-2.756 2-4.7 3.918-5.836 5.755-1.134 1.837-1.702 4.107-1.702 6.808v2.92h10.457v-2.35c0-1.135.135-2.082.406-2.839.324-.756.918-1.54 1.783-2.35.864-.81 2.079-1.784 3.646-2.918 2.107-1.568 3.863-3.026 5.268-4.376 1.405-1.405 2.46-2.92 3.162-4.541.703-1.621 1.054-3.54 1.054-5.755 0-4.161-1.568-7.592-4.702-10.294-3.08-2.702-7.43-4.052-13.05-4.052zm38.664 0c-3.675 0-7.053.46-10.133 1.38-3.08.918-5.944 2.106-8.591 3.565l4.295 8.674c2.324-1.189 4.593-2.136 6.808-2.838a22.138 22.138 0 0 1 6.728-1.053c2.27 0 4.026.46 5.269 1.378 1.297.865 1.946 2.16 1.946 3.89s-.54 3.242-1.62 4.539c-1.027 1.243-2.757 2.73-5.189 4.458-2.756 2-4.7 3.918-5.835 5.755-1.135 1.837-1.703 4.107-1.703 6.808v2.92h10.457v-2.35c0-1.135.134-2.082.404-2.839.324-.756.918-1.54 1.783-2.35.865-.81 2.081-1.784 3.648-2.918 2.108-1.568 3.864-3.026 5.269-4.376 1.405-1.405 2.46-2.92 3.162-4.541.702-1.621 1.053-3.54 1.053-5.755 0-4.161-1.567-7.592-4.702-10.294-3.08-2.702-7.43-4.052-13.05-4.052zM29.449 68.504c-1.945 0-3.593.513-4.944 1.54-1.351.973-2.027 2.703-2.027 5.188 0 2.378.676 4.108 2.027 5.188 1.35 1.027 3 1.54 4.944 1.54 1.892 0 3.512-.513 4.863-1.54 1.35-1.08 2.026-2.81 2.026-5.188 0-2.485-.675-4.215-2.026-5.188-1.351-1.027-2.971-1.54-4.863-1.54zm38.663 0c-1.945 0-3.592.513-4.943 1.54-1.35.973-2.026 2.703-2.026 5.188 0 2.378.675 4.108 2.026 5.188 1.351 1.027 2.998 1.54 4.943 1.54 1.891 0 3.513-.513 4.864-1.54 1.351-1.08 2.027-2.81 2.027-5.188 0-2.485-.676-4.215-2.027-5.188-1.35-1.027-2.973-1.54-4.864-1.54z"/>'
  ),
  "!?": composeGlyph(
    "#ea45d8",
    '<path fill="#fff" d="M60.823 58.9q0-4.098 1.72-6.883 1.721-2.786 5.9-5.818 3.687-2.622 5.243-4.506 1.64-1.966 1.64-4.588t-1.967-3.933q-1.885-1.393-5.326-1.393t-6.8 1.065q-3.36 1.065-6.883 2.868l-4.343-8.767q4.015-2.212 8.685-3.605 4.67-1.393 10.242-1.393 8.521 0 13.192 4.097 4.752 4.096 4.752 10.405 0 3.36-1.065 5.818-1.066 2.458-3.196 4.588-2.13 2.048-5.326 4.424-2.376 1.72-3.687 2.95-1.31 1.229-1.802 2.376-.41 1.147-.41 2.868v2.376h-10.57zm-1.311 16.632q0-3.77 2.048-5.244 2.049-1.557 4.998-1.557 2.868 0 4.916 1.557 2.049 1.475 2.049 5.244 0 3.605-2.049 5.244-2.048 1.556-4.916 1.556-2.95 0-4.998-1.556-2.048-1.64-2.048-5.244zM36.967 61.849h-9.75l-2.049-39.083h13.847zM25.004 75.532q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244z" vector-effect="non-scaling-stroke"/>'
  ),
  "!": composeGlyph(
    "#22ac38",
    '<path fill="#fff" d="M54.967 62.349h-9.75l-2.049-39.083h13.847zM43.004 76.032q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244z" vector-effect="non-scaling-stroke"/>'
  ),
  "!!": composeGlyph(
    "#168226",
    '<path fill="#fff" d="M71.967 62.349h-9.75l-2.049-39.083h13.847zM60.004 76.032q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244zM37.967 62.349h-9.75l-2.049-39.083h13.847zM26.004 76.032q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244z" vector-effect="non-scaling-stroke"/>'
  )
};

// src/ceval/protocol.ts
function sharedWasmMemory(lo, hi = 32767) {
  let shrink = 4;
  for (; ; ) {
    try {
      return new WebAssembly.Memory({ shared: true, initial: lo, maximum: hi });
    } catch (e) {
      if (hi <= lo || !(e instanceof RangeError)) throw e;
      hi = Math.max(lo, Math.ceil(hi - hi / shrink));
      shrink = shrink === 4 ? 3 : 4;
    }
  }
}
var StockfishProtocol = class {
  /**
   * Load Stockfish 18 (smallnet) from baseUrl and begin the UCI handshake.
   * baseUrl is the URL prefix where sf_18_smallnet.{js,wasm} and the NNUE
   * file are served (e.g. "/stockfish-web").
   *
   * Uses dynamic import() — esbuild leaves variable-string imports as-is and
   * does not try to bundle them, so the engine JS is loaded at runtime only.
   *
   * Adapted from lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts boot()
   */
  async init(baseUrl) {
    const scriptUrl = `${baseUrl}/sf_18_smallnet.js`;
    const { default: makeModule } = await import(scriptUrl);
    const wasmMemory = sharedWasmMemory(1536);
    this.module = await makeModule({
      wasmMemory,
      // Tell Emscripten where to find the .wasm and any other assets it needs.
      locateFile: (file) => `${baseUrl}/${file}`,
      // Emscripten passes this URL to the pthreads workers it spawns, so each
      // thread can load the same Stockfish module.
      mainScriptUrlOrBlob: scriptUrl
    });
    this.module.listen = (line) => this.received(line);
    this.module.onError = (msg) => {
      console.error("[ceval] engine error:", msg);
    };
    const nnueName = this.module.getRecommendedNnue(0);
    if (nnueName) {
      console.log("[ceval] loading NNUE:", nnueName);
      const resp = await fetch(`${baseUrl}/${nnueName}`);
      if (resp.ok) {
        this.module.setNnueBuffer(new Uint8Array(await resp.arrayBuffer()), 0);
        console.log("[ceval] NNUE loaded");
      } else {
        console.warn("[ceval] NNUE fetch failed:", resp.status, nnueName);
      }
    }
    this.send("uci");
  }
  /** Register a callback that fires for every raw UCI line from the engine. */
  onMessage(cb) {
    this.onLine = cb;
  }
  /**
   * Send a FEN position to the engine.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts swapWork position command.
   */
  setPosition(fen) {
    this.send(`position fen ${fen}`);
  }
  /**
   * Start a fixed-depth search on the current position.
   * multiPv controls how many candidate lines the engine returns.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts swapWork go command.
   */
  go(depth, multiPv2 = 1) {
    this.send(`setoption name MultiPV value ${multiPv2}`);
    this.send(`go depth ${depth}`);
  }
  /** Interrupt a running search. */
  stop() {
    this.send("stop");
  }
  /** Shut down the engine. */
  destroy() {
    this.send("quit");
    this.module = void 0;
  }
  send(cmd) {
    this.module?.uci(cmd);
  }
  /**
   * Handle a raw UCI line from the engine.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts received
   */
  received(line) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "id" && parts[1] === "name") {
      this.engineName = parts.slice(2).join(" ");
    } else if (parts[0] === "uciok") {
      this.send("setoption name UCI_AnalyseMode value true");
      this.send("setoption name Analysis Contempt value Off");
      const cores = navigator.hardwareConcurrency ?? 2;
      const threads = Math.max(1, cores - 1);
      this.send(`setoption name Threads value ${threads}`);
      console.log(`[ceval] Stockfish 18 \u2014 ${threads} threads`);
      this.send("setoption name Hash value 256");
      this.send("ucinewgame");
      this.send("isready");
    }
    this.onLine?.(line);
  }
};

// src/puzzles/runtime.ts
var activePuzzleCtrl;
function getActivePuzzleCtrl() {
  return activePuzzleCtrl;
}
function setActivePuzzleCtrl(ctrl2) {
  activePuzzleCtrl = ctrl2;
}
function puzzleHidesAnalysis() {
  return activePuzzleCtrl !== void 0;
}

// src/engine/winchances.ts
var WIN_CHANCE_MULTIPLIER = -368208e-8;
function rawWinChances(cp) {
  return 2 / (1 + Math.exp(WIN_CHANCE_MULTIPLIER * cp)) - 1;
}
var LOSS_THRESHOLDS = {
  inaccuracy: 0.025,
  mistake: 0.06,
  blunder: 0.14
};
function classifyLoss(loss) {
  if (loss >= LOSS_THRESHOLDS.blunder) return "blunder";
  if (loss >= LOSS_THRESHOLDS.mistake) return "mistake";
  if (loss >= LOSS_THRESHOLDS.inaccuracy) return "inaccuracy";
  return null;
}
function evalWinChances(ev) {
  if (ev.mate !== void 0) {
    const cp = (21 - Math.min(10, Math.abs(ev.mate))) * 100;
    return rawWinChances(cp * (ev.mate > 0 ? 1 : -1));
  }
  if (ev.cp !== void 0) {
    return rawWinChances(Math.min(Math.max(-1e3, ev.cp), 1e3));
  }
  return void 0;
}

// src/analyse/evalView.ts
function formatScore(ev) {
  if (ev.mate !== void 0) {
    if (ev.mate === 0) return "#KO!";
    return `#${ev.mate}`;
  }
  if (ev.cp !== void 0) {
    const e = Math.max(Math.min(Math.round(ev.cp / 10) / 10, 99), -99);
    return (e > 0 ? "+" : "") + e.toFixed(1);
  }
  return "\u2026";
}
function moveAccuracyFromDiff(diff2) {
  if (diff2 < 0) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff2) + -3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}
function aggregateAccuracy(accs) {
  const n = accs.length;
  if (n < 2) return null;
  const window2 = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const weights = [];
  for (let s = 0; s + window2 <= n; s++) {
    const slice = accs.slice(s, s + window2);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    weights.push(Math.max(0.5, Math.min(12, Math.sqrt(variance))));
  }
  const pairLen = weights.length;
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < pairLen; i++) {
    weightedSum += accs[i] * weights[i];
    totalWeight += weights[i];
  }
  const weightedMean = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const harmonicMean = n / accs.reduce((acc, a) => acc + 1 / Math.max(a, 1e-3), 0);
  return Math.max(0, Math.min(100, (weightedMean + harmonicMean) / 2));
}
function computeAnalysisSummary(mainline, evalCache2) {
  if (evalCache2.size === 0) return null;
  const whiteAccs = [];
  const blackAccs = [];
  let wBlunders = 0, wMistakes = 0, wInaccuracies = 0;
  let bBlunders = 0, bMistakes = 0, bInaccuracies = 0;
  let path = "";
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i];
    path += node.id;
    const parentPath = path.slice(0, -2);
    const nodeEval = evalCache2.get(path);
    const parentEval = evalCache2.get(parentPath);
    if (!nodeEval || !parentEval) continue;
    const nodeWc = evalWinChances(nodeEval);
    const parentWc = evalWinChances(parentEval);
    if (nodeWc === void 0 || parentWc === void 0) continue;
    const nodeWp = (nodeWc + 1) / 2 * 100;
    const parentWp = (parentWc + 1) / 2 * 100;
    const isWhiteMove = node.ply % 2 === 1;
    const diff2 = isWhiteMove ? parentWp - nodeWp : nodeWp - parentWp;
    const acc = moveAccuracyFromDiff(diff2);
    if (isWhiteMove) {
      whiteAccs.push(acc);
    } else {
      blackAccs.push(acc);
    }
    const playedBest = node.uci !== void 0 && node.uci === parentEval.best;
    const label = !playedBest ? nodeEval.label ?? (nodeEval.loss !== void 0 ? classifyLoss(nodeEval.loss) : null) : null;
    if (isWhiteMove) {
      if (label === "blunder") wBlunders++;
      else if (label === "mistake") wMistakes++;
      else if (label === "inaccuracy") wInaccuracies++;
    } else {
      if (label === "blunder") bBlunders++;
      else if (label === "mistake") bMistakes++;
      else if (label === "inaccuracy") bInaccuracies++;
    }
  }
  if (whiteAccs.length === 0 && blackAccs.length === 0) return null;
  return {
    white: { accuracy: aggregateAccuracy(whiteAccs), blunders: wBlunders, mistakes: wMistakes, inaccuracies: wInaccuracies },
    black: { accuracy: aggregateAccuracy(blackAccs), blunders: bBlunders, mistakes: bMistakes, inaccuracies: bInaccuracies }
  };
}
function renderAnalysisSummary(analysisComplete2, evalCache2, mainline, whiteName, blackName) {
  if (!analysisComplete2 && evalCache2.size < 4) return h("div");
  const summary = computeAnalysisSummary(mainline, evalCache2);
  if (!summary) return h("div");
  function playerCol(name, data, color) {
    const accText = data.accuracy !== null ? `${Math.round(data.accuracy)}%` : "\u2014";
    const breakdown = [];
    if (data.blunders > 0) breakdown.push(h("span.summary__blunder", `${data.blunders} blunder${data.blunders !== 1 ? "s" : ""}`));
    if (data.mistakes > 0) breakdown.push(h("span.summary__mistake", `${data.mistakes} mistake${data.mistakes !== 1 ? "s" : ""}`));
    if (data.inaccuracies > 0) breakdown.push(h("span.summary__inaccuracy", `${data.inaccuracies} inaccurac${data.inaccuracies !== 1 ? "ies" : "y"}`));
    return h("div.summary__col", [
      h("div.summary__name", [
        h("span.summary__color-icon", { class: { "summary__color-icon--white": color === "white", "summary__color-icon--black": color === "black" } }),
        name
      ]),
      h("div.summary__accuracy", accText),
      breakdown.length > 0 ? h("div.summary__breakdown", breakdown) : h("div.summary__breakdown", "\u2014")
    ]);
  }
  return h("div.analysis-summary", [
    playerCol(whiteName, summary.white, "white"),
    playerCol(blackName, summary.black, "black")
  ]);
}
function evalPct(currentEval2, fen) {
  if (currentEval2.mate !== void 0) {
    if (currentEval2.mate === 0) {
      const stm = fen?.split(" ")[1];
      return stm === "b" ? 100 : 0;
    }
    return currentEval2.mate > 0 ? 100 : 0;
  }
  if (currentEval2.cp !== void 0) {
    const pct = 50 + currentEval2.cp / 20;
    return Math.max(0, Math.min(100, pct));
  }
  return 50;
}
var EVAL_BAR_TICKS = [...Array(8).keys()].map(
  (i) => h(i === 3 ? "div.eval-bar__tick.zero" : "div.eval-bar__tick", {
    attrs: { style: `height: ${(i + 1) * 12.5}%` }
  })
);
function renderEvalBar(engineEnabled2, currentEval2, fen) {
  if (!engineEnabled2) return h("div.eval-bar.eval-bar--off");
  const pct = evalPct(currentEval2, fen);
  const scorePct = Math.max(8, Math.min(92, pct));
  const hasScore = currentEval2.cp !== void 0 || currentEval2.mate !== void 0;
  const score = hasScore ? formatScore(currentEval2) : "";
  return h("div.eval-bar", [
    h("div.eval-bar__fill", { attrs: { style: `height: ${pct}%` } }),
    score ? h("div.eval-bar__score", { attrs: { style: `bottom: ${scorePct}%` } }, score) : null,
    ...EVAL_BAR_TICKS
  ]);
}
var GRAPH_W = 600;
var GRAPH_H = 80;
var GRAPH_HEIGHT_MIN = 100;
var GRAPH_HEIGHT_MAX = 300;
var evalGraphScrubPointerId = null;
var evalGraphLastScrubPath = null;
var graphHeightRaw = Number.parseInt(localStorage.getItem("patzer.evalGraphHeightPct") ?? "", 10);
var graphHeightPct = Number.isFinite(graphHeightRaw) ? Math.min(GRAPH_HEIGHT_MAX, Math.max(GRAPH_HEIGHT_MIN, graphHeightRaw)) : GRAPH_HEIGHT_MIN;
function setEvalGraphHeightPct(value) {
  graphHeightPct = Math.min(GRAPH_HEIGHT_MAX, Math.max(GRAPH_HEIGHT_MIN, Math.round(value)));
  localStorage.setItem("patzer.evalGraphHeightPct", String(graphHeightPct));
}
function renderEvalGraph(mainline, currentPath, evalCache2, navigate2, redraw2, userColor, userOnly) {
  const n = mainline.length - 1;
  const renderedGraphHeight = Math.round(GRAPH_H * graphHeightPct / 100);
  if (n < 2) {
    return h("div.eval-graph", [
      h("div.eval-graph__empty", {
        attrs: { style: `height:${renderedGraphHeight}px` }
      }, n === 0 ? "No moves to graph." : "Analyze game to see graph."),
      h("div.eval-graph__resize-handle", {
        attrs: {
          title: "Drag to resize eval graph",
          role: "slider",
          "aria-label": "Eval graph height",
          "aria-valuemin": String(GRAPH_HEIGHT_MIN),
          "aria-valuemax": String(GRAPH_HEIGHT_MAX),
          "aria-valuenow": String(graphHeightPct)
        },
        hook: {
          insert: (vnode3) => bindEvalGraphResize(vnode3.elm, redraw2),
          update: (_old, vnode3) => bindEvalGraphResize(vnode3.elm, redraw2)
        }
      })
    ]);
  }
  const shouldShowReviewAnnotation2 = (nodePly) => {
    if (!userOnly || userColor === null) return true;
    const isWhiteMove = nodePly % 2 === 1;
    return userColor === "white" && isWhiteMove || userColor === "black" && !isWhiteMove;
  };
  const pts = [];
  let path = "";
  for (let i = 1; i <= n; i++) {
    const node = mainline[i];
    path += node.id;
    const parentPath = path.slice(0, -2);
    const cached = evalCache2.get(path);
    const parentCached = evalCache2.get(parentPath);
    const wc = cached?.mate === 0 ? node.fen.split(" ")[1] === "b" ? 1 : -1 : cached !== void 0 ? evalWinChances(cached) : void 0;
    if (wc !== void 0) {
      const playedBest = node.uci !== void 0 && node.uci === parentCached?.best;
      const label = !playedBest && shouldShowReviewAnnotation2(node.ply) ? cached.label ?? (cached.loss !== void 0 ? classifyLoss(cached.loss) : null) : null;
      pts.push({
        x: (i - 1) / (n - 1) * GRAPH_W,
        y: (1 - wc) / 2 * GRAPH_H,
        // wc=+1 → top, wc=0 → middle, wc=−1 → bottom
        path,
        label,
        hasMate: cached?.mate !== void 0
      });
    } else {
      pts.push(null);
    }
  }
  const valid = pts.filter((p) => p !== null);
  if (valid.length < 2) {
    return h("div.eval-graph", [
      h("div.eval-graph__empty", "Analyze game to see graph.")
    ]);
  }
  const cy = GRAPH_H / 2;
  const svgNodes = [];
  const hideHover = (svg) => {
    const hl = svg?.querySelector("[data-hover]");
    if (hl) hl.setAttribute("opacity", "0");
  };
  const showHover = (svg, pt) => {
    const hl = svg?.querySelector("[data-hover]");
    if (!hl || !pt) return;
    hl.setAttribute("x1", String(pt.x));
    hl.setAttribute("x2", String(pt.x));
    hl.setAttribute("opacity", "0.55");
  };
  const nearestPointForClientX = (svg, clientX) => {
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const graphX = Math.max(0, Math.min(GRAPH_W, (clientX - rect.left) / rect.width * GRAPH_W));
    let nearest = valid[0];
    let nearestDist = Math.abs(nearest.x - graphX);
    for (let i = 1; i < valid.length; i++) {
      const pt = valid[i];
      const dist2 = Math.abs(pt.x - graphX);
      if (dist2 < nearestDist) {
        nearest = pt;
        nearestDist = dist2;
      }
    }
    return nearest;
  };
  const updateHoverAndMaybeScrub = (target, clientX, scrub) => {
    const svg = target instanceof SVGElement ? target.ownerSVGElement ?? target : null;
    const pt = nearestPointForClientX(svg, clientX);
    showHover(svg, pt);
    if (scrub && pt && pt.path !== evalGraphLastScrubPath) {
      evalGraphLastScrubPath = pt.path;
      navigate2(pt.path);
    }
  };
  const polyPts = [
    `${valid[0].x},${GRAPH_H}`,
    ...valid.map((p) => `${p.x},${p.y}`),
    `${valid[valid.length - 1].x},${GRAPH_H}`
  ].join(" ");
  svgNodes.push(h("polygon", {
    attrs: {
      points: polyPts,
      fill: "rgba(255,255,255,0.3)",
      stroke: "none"
    }
  }));
  svgNodes.push(h("line", { attrs: { x1: 0, y1: cy, x2: GRAPH_W, y2: cy, stroke: "#444", "stroke-width": 1 } }));
  svgNodes.push(h("polyline", { attrs: {
    points: valid.map((p) => `${p.x},${p.y}`).join(" "),
    fill: "none",
    stroke: "#d85000",
    "stroke-width": 1,
    "stroke-linejoin": "round",
    "stroke-linecap": "round"
  } }));
  const curPt = valid.find((p) => p.path === currentPath);
  if (curPt) {
    svgNodes.push(h("line", { attrs: {
      x1: curPt.x,
      y1: 0,
      x2: curPt.x,
      y2: GRAPH_H,
      stroke: "#4a8",
      "stroke-width": 1,
      opacity: "0.55"
    } }));
  }
  svgNodes.push(h("line", {
    attrs: {
      "data-hover": "1",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: GRAPH_H,
      stroke: "#aaa",
      "stroke-width": 1.5,
      opacity: "0",
      "pointer-events": "none"
    }
  }));
  for (const pt of valid) {
    const isCurrent = pt.path === currentPath;
    const dotColor = isCurrent ? "#4a8" : pt.hasMate ? "hsl(307,80%,70%)" : pt.label === "blunder" ? "hsl(0,69%,60%)" : pt.label === "mistake" ? "hsl(41,100%,45%)" : pt.label === "inaccuracy" ? "hsl(202,78%,62%)" : "#888";
    const dotR = isCurrent ? 3.5 : pt.label ? 2.5 : 2;
    svgNodes.push(h("circle", { attrs: {
      cx: pt.x,
      cy: pt.y,
      r: dotR,
      fill: dotColor,
      stroke: isCurrent ? "#fff" : "none",
      "stroke-width": 1,
      "pointer-events": "none"
    } }));
  }
  svgNodes.push(h("rect", {
    attrs: {
      x: 0,
      y: 0,
      width: GRAPH_W,
      height: GRAPH_H,
      fill: "transparent"
    },
    on: {
      pointerdown: (e) => {
        evalGraphScrubPointerId = e.pointerId;
        evalGraphLastScrubPath = currentPath;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        updateHoverAndMaybeScrub(e.currentTarget, e.clientX, true);
        e.preventDefault();
      },
      pointermove: (e) => {
        updateHoverAndMaybeScrub(e.currentTarget, e.clientX, evalGraphScrubPointerId === e.pointerId);
      },
      pointerup: (e) => {
        if (evalGraphScrubPointerId === e.pointerId) {
          evalGraphScrubPointerId = null;
          evalGraphLastScrubPath = null;
        }
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      },
      pointercancel: (e) => {
        if (evalGraphScrubPointerId === e.pointerId) {
          evalGraphScrubPointerId = null;
          evalGraphLastScrubPath = null;
        }
        hideHover(e.currentTarget.ownerSVGElement);
      },
      pointerleave: (e) => {
        if (evalGraphScrubPointerId !== e.pointerId) hideHover(e.currentTarget.ownerSVGElement);
      }
    }
  }));
  return h("div.eval-graph", {
    on: {
      mouseleave: (e) => hideHover(e.currentTarget.querySelector("svg"))
    }
  }, [
    h("svg", { attrs: {
      viewBox: `0 0 ${GRAPH_W} ${GRAPH_H}`,
      width: "100%",
      height: renderedGraphHeight,
      preserveAspectRatio: "none"
    } }, svgNodes),
    h("div.eval-graph__resize-handle", {
      attrs: {
        title: "Drag to resize eval graph",
        role: "slider",
        "aria-label": "Eval graph height",
        "aria-valuemin": String(GRAPH_HEIGHT_MIN),
        "aria-valuemax": String(GRAPH_HEIGHT_MAX),
        "aria-valuenow": String(graphHeightPct)
      },
      hook: {
        insert: (vnode3) => bindEvalGraphResize(vnode3.elm, redraw2),
        update: (_old, vnode3) => bindEvalGraphResize(vnode3.elm, redraw2)
      }
    })
  ]);
}
function bindEvalGraphResize(handle, redraw2) {
  if (handle.dataset.bound === "true") return;
  handle.dataset.bound = "true";
  const eventPos = (e) => {
    if ("clientX" in e) return [e.clientX, e.clientY];
    if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return void 0;
  };
  const startResize = (start4) => {
    start4.preventDefault();
    const startPos = eventPos(start4);
    if (!startPos) return;
    const startHeight = graphHeightPct;
    const mousemoveEvent = "targetTouches" in start4 ? "touchmove" : "mousemove";
    const mouseupEvent = "targetTouches" in start4 ? "touchend" : "mouseup";
    const resize = (move3) => {
      const pos = eventPos(move3);
      if (!pos) return;
      const delta = pos[1] - startPos[1];
      setEvalGraphHeightPct(startHeight + delta);
      redraw2();
    };
    document.body.classList.add("resizing");
    document.addEventListener(mousemoveEvent, resize, { passive: false });
    document.addEventListener(mouseupEvent, () => {
      document.removeEventListener(mousemoveEvent, resize);
      document.body.classList.remove("resizing");
    }, { once: true });
  };
  handle.addEventListener("mousedown", startResize, { passive: false });
  handle.addEventListener("touchstart", startResize, { passive: false });
}

// src/engine/ctrl.ts
var _getCtrl = () => {
  throw new Error("engine not initialised");
};
var _getCgInstance = () => void 0;
var _redraw = () => {
};
function initEngine(deps) {
  _getCtrl = deps.getCtrl;
  _getCgInstance = deps.getCgInstance;
  _redraw = deps.redraw;
}
var _isBatchActive = () => false;
var _onBatchBestmove = null;
function setIsBatchActive(fn) {
  _isBatchActive = fn;
}
function setOnBatchBestmove(fn) {
  _onBatchBestmove = fn;
}
var protocol = new StockfishProtocol();
var engineEnabled = false;
var engineReady = false;
var engineInitialized = false;
var currentEval = {};
var evalCache = /* @__PURE__ */ new Map();
var evalNodeId = "";
var evalNodePath = "";
var evalNodePly = 0;
var evalParentPath = "";
var engineSearchActive = false;
var pendingStopCount = 0;
var pendingEval = false;
function storedInt(key, def, min, max) {
  const v = parseInt(localStorage.getItem(key) ?? "", 10);
  return !isNaN(v) && v >= min && v <= max ? v : def;
}
var multiPv = storedInt("patzer.multiPv", 1, 1, 5);
var analysisDepth = storedInt("patzer.analysisDepth", 30, 18, 30);
var showEngineArrows = true;
var arrowAllLines = true;
var showPlayedArrow = true;
var showArrowLabels = localStorage.getItem("patzer.showArrowLabels") === "true";
var showReviewLabels = localStorage.getItem("patzer.showReviewLabels") !== "false";
var showBoardReviewGlyphs = localStorage.getItem("patzer.showBoardReviewGlyphs") !== "false";
var pendingLines = [];
var arrowDebounceTimer = null;
var arrowSuppressUntil = 0;
var ARROW_SETTLE_MS = 500;
var lastAutoShapesHash = null;
var lastAutoShapesCg;
var LIVE_ENGINE_UI_THROTTLE_MS = 200;
var liveEngineUiTimer = null;
var liveEngineUiLastFlushAt = 0;
var liveEngineUiNeedsRetroCheck = false;
var threatMode = false;
var evalIsThreat = false;
var threatEval = {};
function resetCurrentEval() {
  currentEval = {};
}
function setCurrentEval(ev) {
  currentEval = { ...ev };
}
function clearEvalCache() {
  evalCache.clear();
}
function setMultiPv(v) {
  multiPv = v;
  localStorage.setItem("patzer.multiPv", String(v));
}
function setAnalysisDepth(v) {
  analysisDepth = v;
  localStorage.setItem("patzer.analysisDepth", String(v));
}
function clearPendingLines() {
  pendingLines = [];
}
function setShowEngineArrows(v) {
  showEngineArrows = v;
}
function setArrowAllLines(v) {
  arrowAllLines = v;
}
function setShowPlayedArrow(v) {
  showPlayedArrow = v;
}
function setShowArrowLabels(v) {
  showArrowLabels = v;
  localStorage.setItem("patzer.showArrowLabels", String(v));
}
function setShowReviewLabels(v) {
  showReviewLabels = v;
  localStorage.setItem("patzer.showReviewLabels", String(v));
}
function setShowBoardReviewGlyphs(v) {
  showBoardReviewGlyphs = v;
  localStorage.setItem("patzer.showBoardReviewGlyphs", String(v));
}
function incrementPendingStopCount() {
  pendingStopCount++;
}
function stopProtocol() {
  protocol.stop();
}
function buildArrowShapes() {
  const shapes = [];
  const ctrl2 = _getCtrl();
  if (_isBatchActive()) return shapes;
  if (puzzleHidesAnalysis()) return shapes;
  const retroHidden = ctrl2.retro !== void 0 && !ctrl2.retro.guidanceRevealed();
  if (engineEnabled && showEngineArrows && !retroHidden) {
    if (currentEval.best) {
      const uci = currentEval.best;
      shapes.push(buildArrowShape(uci, "paleBlue"));
      const labelShape = buildArrowLabelShape(uci, currentEval);
      if (labelShape) shapes.push(labelShape);
    }
    if (arrowAllLines) {
      const topWc = evalWinChances(currentEval) ?? 0;
      for (const line of currentEval.lines ?? []) {
        if (!line.best) continue;
        const lineWc = evalWinChances(line) ?? 0;
        const shift = Math.abs(topWc - lineWc) / 2;
        if (shift >= 0.2) continue;
        const lineWidth2 = Math.max(2, Math.round(12 - shift * 50));
        const uci = line.best;
        shapes.push(buildArrowShape(uci, "paleGrey", { lineWidth: lineWidth2 }));
        const labelShape = buildArrowLabelShape(uci, line);
        if (labelShape) shapes.push(labelShape);
      }
    }
  }
  if (engineEnabled && threatMode && threatEval.best && !retroHidden) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: "red" });
  }
  if (showBoardReviewGlyphs) {
    shapes.push(...buildCurrentNodeReviewGlyphShapes(ctrl2));
  }
  if (showPlayedArrow && pathIsMainline(ctrl2.root, ctrl2.path)) {
    const nextNode = ctrl2.node.children[0];
    if (nextNode?.uci) {
      const uci = nextNode.uci;
      const nextEval = evalCache.get(ctrl2.path + nextNode.id);
      const playedEval = currentEval.best !== uci ? nextEval : void 0;
      shapes.push(buildArrowShape(uci, "red"));
      const labelShape = buildArrowLabelShape(uci, playedEval);
      if (labelShape) shapes.push(labelShape);
    }
  }
  const koOverlay = buildKoOverlayShape(ctrl2.node.fen);
  if (koOverlay) shapes.push(koOverlay);
  return shapes;
}
function buildArrowShape(uci, brush, modifiers) {
  const shape = {
    orig: uci.slice(0, 2),
    dest: uci.slice(2, 4),
    brush
  };
  if (modifiers) shape.modifiers = modifiers;
  return shape;
}
function buildArrowLabelShape(uci, ev) {
  const labelSvg = buildArrowLabelSvg(ev);
  if (!labelSvg) return null;
  return {
    orig: uci.slice(0, 2),
    dest: uci.slice(2, 4),
    customSvg: { html: labelSvg, center: "label" }
  };
}
function buildArrowLabelSvg(ev) {
  if (!showArrowLabels || !ev) return null;
  if (ev.cp === void 0 && ev.mate === void 0) return null;
  const text = formatScore(ev);
  return `<text x="50" y="54" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="10" font-weight="400" fill="#fff" stroke="rgba(0,0,0,0.72)" stroke-width="2" paint-order="stroke">${escapeArrowLabelText(text)}</text>`;
}
function escapeArrowLabelText(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function buildCurrentNodeReviewGlyphShapes(ctrl2) {
  const glyphNode = currentNodeBoardGlyphNode(ctrl2);
  return glyphNode ? annotationShapes(glyphNode) : [];
}
function currentNodeBoardGlyphNode(ctrl2) {
  const { node, path } = ctrl2;
  if (!node.uci || !node.san) return null;
  if (node.glyphs?.length) return { uci: node.uci, san: node.san, glyphs: node.glyphs };
  const cached = evalCache.get(path);
  if (!cached) return null;
  const parentCached = evalCache.get(pathInit(path));
  const playedBest = node.uci === parentCached?.best;
  if (playedBest) return null;
  const label = cached.label ?? (cached.loss !== void 0 ? classifyLoss(cached.loss) : null);
  const symbol = labelToBoardReviewSymbol(label);
  if (!symbol) return null;
  return {
    uci: node.uci,
    san: node.san,
    glyphs: [{ id: 0, name: symbol, symbol }]
  };
}
function labelToBoardReviewSymbol(label) {
  if (label === "blunder") return "??";
  if (label === "mistake") return "?";
  if (label === "inaccuracy") return "?!";
  return null;
}
function buildKoOverlayShape(fen) {
  if (currentEval.mate !== 0) return null;
  const losingColor = fen.split(" ")[1] === "b" ? "black" : "white";
  const kingSquare = findKingSquare(fen, losingColor);
  if (!kingSquare) return null;
  return {
    orig: kingSquare,
    label: { text: "KO", fill: "#c04ccf" }
  };
}
function findKingSquare(fen, color) {
  const board = fen.split(" ")[0] ?? "";
  const target = color === "white" ? "K" : "k";
  let rank = 8;
  let file = 0;
  for (const ch of board) {
    if (ch === "/") {
      rank--;
      file = 0;
      continue;
    }
    const empty = Number.parseInt(ch, 10);
    if (!Number.isNaN(empty)) {
      file += empty;
      continue;
    }
    if (ch === target) return `${"abcdefgh"[file]}${rank}`;
    file++;
  }
  return null;
}
function syncArrow() {
  const cg = _getCgInstance();
  if (!cg) return;
  if (arrowDebounceTimer !== null) {
    clearTimeout(arrowDebounceTimer);
    arrowDebounceTimer = null;
  }
  arrowSuppressUntil = 0;
  applyAutoShapes(buildArrowShapes());
}
function syncArrowDebounced() {
  const cg = _getCgInstance();
  if (!cg) return;
  const now = Date.now();
  if (now < arrowSuppressUntil) {
    if (arrowDebounceTimer === null) {
      arrowDebounceTimer = setTimeout(() => {
        arrowDebounceTimer = null;
        arrowSuppressUntil = 0;
        applyAutoShapes(buildArrowShapes());
      }, arrowSuppressUntil - now);
    }
    return;
  }
  if (arrowDebounceTimer !== null) {
    clearTimeout(arrowDebounceTimer);
  }
  arrowDebounceTimer = setTimeout(() => {
    arrowDebounceTimer = null;
    applyAutoShapes(buildArrowShapes());
  }, 150);
}
function applyAutoShapes(shapes) {
  const cg = _getCgInstance();
  if (!cg) return;
  if (cg !== lastAutoShapesCg) {
    lastAutoShapesCg = cg;
    lastAutoShapesHash = null;
  }
  const nextHash = autoShapesHash(shapes);
  if (nextHash === lastAutoShapesHash) return;
  lastAutoShapesHash = nextHash;
  cg.setAutoShapes(shapes);
}
function autoShapesHash(shapes) {
  return shapes.map((shape) => [
    shape.orig ?? "",
    shape.dest ?? "",
    shape.brush ?? "",
    shape.piece ? `${shape.piece.color}|${shape.piece.role}|${shape.piece.scale ?? ""}` : "",
    shape.modifiers ? `${shape.modifiers.lineWidth ?? ""}|${shape.modifiers.hilite ?? ""}` : "",
    shape.customSvg ? `${shape.customSvg.center ?? ""}|${shape.customSvg.html}` : "",
    shape.label ? `${shape.label.text}|${shape.label.fill ?? ""}` : "",
    shape.below ? "1" : ""
  ].join("~")).join(";");
}
function cancelLiveEngineUiRefresh() {
  if (liveEngineUiTimer !== null) {
    clearTimeout(liveEngineUiTimer);
    liveEngineUiTimer = null;
  }
  liveEngineUiNeedsRetroCheck = false;
}
function flushLiveEngineUiRefresh() {
  liveEngineUiTimer = null;
  liveEngineUiLastFlushAt = Date.now();
  syncArrowDebounced();
  _redraw();
  if (liveEngineUiNeedsRetroCheck) _getCtrl().retro?.onCeval();
  liveEngineUiNeedsRetroCheck = false;
}
function scheduleLiveEngineUiRefresh(includeRetroCheck = false) {
  liveEngineUiNeedsRetroCheck ||= includeRetroCheck;
  const elapsed = Date.now() - liveEngineUiLastFlushAt;
  if (elapsed >= LIVE_ENGINE_UI_THROTTLE_MS && liveEngineUiTimer === null) {
    flushLiveEngineUiRefresh();
    return;
  }
  if (liveEngineUiTimer !== null) return;
  const wait = Math.max(0, LIVE_ENGINE_UI_THROTTLE_MS - elapsed);
  liveEngineUiTimer = setTimeout(flushLiveEngineUiRefresh, wait);
}
function parseEngineLine(line) {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === "info") {
    let isMate = false;
    let score;
    let best;
    let pvMoves = [];
    let pvIndex = 1;
    let depth;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === "multipv") {
        const next2 = parts[i + 1];
        if (next2 === void 0) break;
        pvIndex = parseInt(next2, 10);
        i++;
      } else if (parts[i] === "depth") {
        const next2 = parts[i + 1];
        if (next2 === void 0) break;
        depth = parseInt(next2, 10);
        i++;
      } else if (parts[i] === "score") {
        const scoreType = parts[i + 1];
        const scoreValue = parts[i + 2];
        if (scoreType === void 0 || scoreValue === void 0) break;
        isMate = scoreType === "mate";
        score = parseInt(scoreValue, 10);
        i += 2;
        if (parts[i + 1] === "lowerbound" || parts[i + 1] === "upperbound") i++;
      } else if (parts[i] === "pv") {
        pvMoves = parts.slice(i + 1);
        best = pvMoves[0];
        break;
      }
    }
    if (pvIndex === 1) {
      if (!evalIsThreat && !_isBatchActive() && evalNodePath !== _getCtrl().path) return;
      const ev = evalIsThreat ? threatEval : currentEval;
      if (score !== void 0) {
        const s = !evalIsThreat && evalNodePly % 2 === 1 ? -score : score;
        if (isMate) {
          ev.mate = s;
          delete ev.cp;
        } else {
          ev.cp = s;
          delete ev.mate;
        }
      }
      if (best) ev.best = best;
      if (pvMoves.length > 0 && !evalIsThreat) ev.moves = pvMoves;
      if (depth !== void 0 && !evalIsThreat) ev.depth = depth;
      if ((score !== void 0 || best) && !_isBatchActive()) {
        scheduleLiveEngineUiRefresh(!evalIsThreat);
      }
    } else if (!evalIsThreat && score !== void 0) {
      if (evalNodePath !== _getCtrl().path) return;
      const s = evalNodePly % 2 === 1 ? -score : score;
      const idx = pvIndex - 1;
      if (!pendingLines[idx]) pendingLines[idx] = {};
      const pl = pendingLines[idx];
      if (isMate) {
        pl.mate = s;
        delete pl.cp;
      } else {
        pl.cp = s;
        delete pl.mate;
      }
      if (best) pl.best = best;
      if (pvMoves.length > 0) pl.moves = pvMoves;
      currentEval.lines = pendingLines.slice(1).filter(Boolean);
      if (!_isBatchActive()) scheduleLiveEngineUiRefresh();
    }
  } else if (parts[0] === "bestmove") {
    cancelLiveEngineUiRefresh();
    if (pendingStopCount > 0) {
      pendingStopCount--;
      currentEval = {};
      pendingLines = [];
      if (pendingEval) {
        engineSearchActive = false;
        evalCurrentPosition();
      }
      return;
    }
    engineSearchActive = false;
    if (!parts[1] || parts[1] === "(none)") {
      if (_isBatchActive()) _onBatchBestmove?.();
      else if (pendingEval) evalCurrentPosition();
      return;
    }
    if (evalIsThreat) {
      threatEval.best = parts[1];
      evalIsThreat = false;
      syncArrow();
      _redraw();
    } else {
      if (!_isBatchActive() && evalNodePath !== _getCtrl().path) {
        pendingLines = [];
        if (pendingEval) evalCurrentPosition();
        else if (threatMode) evalThreatPosition();
        return;
      }
      currentEval.best = parts[1];
      const stored = { ...currentEval };
      pendingLines = [];
      currentEval = stored;
      if (_isBatchActive()) {
        _onBatchBestmove?.();
      } else {
        syncArrowDebounced();
        _redraw();
        if (pendingEval) {
          evalCurrentPosition();
        } else if (threatMode) {
          evalThreatPosition();
        }
      }
    }
  }
}
var _onEngineReady = null;
function setOnEngineReady(fn) {
  _onEngineReady = fn;
}
protocol.onMessage((line) => {
  if (line.trim() === "readyok") {
    engineReady = true;
    if (_onEngineReady) {
      _onEngineReady();
    } else {
      evalCurrentPosition();
    }
    _redraw();
  } else {
    if (!_isBatchActive() && (line.startsWith("info") || line.startsWith("bestmove"))) {
      console.log("[live-diag]", line.slice(0, 120));
    }
    parseEngineLine(line);
  }
});
function flipFenColor(fen) {
  const parts = fen.split(" ");
  if (parts.length >= 2) parts[1] = parts[1] === "w" ? "b" : "w";
  if (parts.length >= 4) parts[3] = "-";
  return parts.join(" ");
}
function evalThreatPosition() {
  if (!engineEnabled || !engineReady || _isBatchActive()) return;
  cancelLiveEngineUiRefresh();
  threatEval = {};
  evalIsThreat = true;
  protocol.stop();
  protocol.setPosition(flipFenColor(_getCtrl().node.fen));
  protocol.go(analysisDepth);
}
function toggleThreatMode() {
  threatMode = !threatMode;
  if (threatMode) {
    evalThreatPosition();
  } else {
    if (evalIsThreat) {
      protocol.stop();
      evalIsThreat = false;
    }
    threatEval = {};
    syncArrow();
    _redraw();
  }
}
function evalCurrentPosition() {
  if (_isBatchActive()) return;
  if (!engineEnabled || !engineReady) return;
  if (evalIsThreat) {
    pendingStopCount++;
    protocol.stop();
    evalIsThreat = false;
  }
  threatEval = {};
  const ctrl2 = _getCtrl();
  const cached = evalCache.get(ctrl2.path);
  const cachedHasLines = !!cached?.moves?.length && (cached?.lines?.length ?? 0) >= multiPv - 1;
  if (cached && cachedHasLines) {
    cancelLiveEngineUiRefresh();
    currentEval = { ...cached };
    syncArrow();
    _redraw();
    if (threatMode) evalThreatPosition();
    return;
  }
  cancelLiveEngineUiRefresh();
  currentEval = cached ? { ...cached } : {};
  pendingLines = [];
  syncArrow();
  arrowSuppressUntil = Date.now() + ARROW_SETTLE_MS;
  if (engineSearchActive) {
    if (!pendingEval) {
      pendingStopCount++;
      protocol.stop();
    }
    pendingEval = true;
    _redraw();
    return;
  }
  pendingEval = false;
  engineSearchActive = true;
  evalNodeId = ctrl2.node.id;
  evalNodePath = ctrl2.path;
  evalNodePly = ctrl2.node.ply;
  evalParentPath = ctrl2.path.length >= 2 ? ctrl2.path.slice(0, -2) : "";
  console.log("[live-diag] starting live eval \u2014 path:", evalNodePath, "ply:", evalNodePly, "multiPv:", multiPv);
  protocol.setPosition(ctrl2.node.fen);
  protocol.go(analysisDepth, multiPv);
}
function toggleEngine() {
  engineEnabled = !engineEnabled;
  if (engineEnabled) {
    if (!engineInitialized) {
      engineInitialized = true;
      void protocol.init("/stockfish-web").catch((err) => {
        console.error("[engine] failed to load:", err);
        engineEnabled = false;
        engineInitialized = false;
        _redraw();
      });
    } else if (engineReady) {
      evalCurrentPosition();
    }
  } else {
    cancelLiveEngineUiRefresh();
    protocol.stop();
    currentEval = {};
    evalIsThreat = false;
    threatEval = {};
    syncArrow();
  }
  _redraw();
}
function getEvalNodePath() {
  return evalNodePath;
}
function getEvalNodePly() {
  return evalNodePly;
}
function getEvalParentPath() {
  return evalParentPath;
}
function setEngineSearchActive(v) {
  engineSearchActive = v;
}
function setEvalNode(id, path, ply, parentPath) {
  evalNodeId = id;
  evalNodePath = path;
  evalNodePly = ply;
  evalParentPath = parentPath;
}
function isEngineSearchActive() {
  return engineSearchActive;
}

// src/idb/index.ts
var ANALYSIS_VERSION = 2;
function buildAnalysisNodes(mainline, getEval) {
  const nodes = {};
  let path = "";
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i];
    path += node.id;
    const ev = getEval(path);
    if (ev) {
      const entry = { nodeId: node.id, path, fen: node.fen };
      if (ev.cp !== void 0) entry.cp = ev.cp;
      if (ev.mate !== void 0) entry.mate = ev.mate;
      if (ev.best !== void 0) entry.best = ev.best;
      if (ev.loss !== void 0) entry.loss = ev.loss;
      if (ev.delta !== void 0) entry.delta = ev.delta;
      if (ev.moves !== void 0 && ev.moves.length > 0) entry.bestLine = ev.moves;
      const label = ev.loss !== void 0 ? classifyLoss(ev.loss) : null;
      if (label !== null) entry.label = label;
      nodes[path] = entry;
    }
  }
  return nodes;
}
var savedPuzzles = [];
function setSavedPuzzles(puzzles) {
  savedPuzzles = puzzles;
}
var _idb;
function openGameDb() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("patzer-pro", 3);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("game-library")) db.createObjectStore("game-library");
      if (!db.objectStoreNames.contains("puzzle-library")) db.createObjectStore("puzzle-library");
      if (!db.objectStoreNames.contains("analysis-library")) db.createObjectStore("analysis-library");
    };
    req.onsuccess = () => {
      _idb = req.result;
      resolve(_idb);
    };
    req.onerror = () => reject(req.error);
  });
}
async function saveGamesToIdb(games) {
  try {
    const db = await openGameDb();
    const tx = db.transaction("game-library", "readwrite");
    tx.objectStore("game-library").put(
      { games },
      "imported-games"
    );
  } catch (e) {
    console.warn("[idb] save failed", e);
  }
}
async function saveNavStateToIdb(selectedId, path) {
  try {
    const db = await openGameDb();
    const tx = db.transaction("game-library", "readwrite");
    tx.objectStore("game-library").put(
      { selectedId, path },
      "imported-nav"
    );
  } catch (e) {
    console.warn("[idb] nav-state save failed", e);
  }
}
async function loadGamesFromIdb() {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("game-library", "readonly");
      const store = tx.objectStore("game-library");
      const gamesReq = store.get("imported-games");
      const navReq = store.get("imported-nav");
      let gamesDone = false;
      let navDone = false;
      let libraryRecord;
      let navRecord;
      const maybeResolve = () => {
        if (!gamesDone || !navDone) return;
        if (!libraryRecord && !navRecord) {
          resolve(void 0);
          return;
        }
        const games = libraryRecord?.games ?? [];
        const selectedId = navRecord?.selectedId ?? (libraryRecord && "selectedId" in libraryRecord ? libraryRecord.selectedId : null);
        const path = navRecord?.path ?? (libraryRecord && "path" in libraryRecord ? libraryRecord.path : void 0);
        resolve({
          games,
          selectedId,
          ...path !== void 0 ? { path } : {}
        });
      };
      gamesReq.onsuccess = () => {
        libraryRecord = gamesReq.result;
        gamesDone = true;
        maybeResolve();
      };
      navReq.onsuccess = () => {
        navRecord = navReq.result;
        navDone = true;
        maybeResolve();
      };
      gamesReq.onerror = () => reject(gamesReq.error);
      navReq.onerror = () => reject(navReq.error);
    });
  } catch (e) {
    console.warn("[idb] load failed", e);
    return void 0;
  }
}
async function saveAnalysisToIdb(status, gameId, nodes, depth) {
  try {
    const db = await openGameDb();
    const record = {
      gameId,
      analysisVersion: ANALYSIS_VERSION,
      analysisDepth: depth,
      status,
      updatedAt: Date.now(),
      nodes
    };
    const tx = db.transaction("analysis-library", "readwrite");
    tx.objectStore("analysis-library").put(record, gameId);
  } catch (e) {
    console.warn("[idb] analysis save failed", e);
  }
}
async function loadAnalysisFromIdb(gameId) {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction("analysis-library", "readonly").objectStore("analysis-library").get(gameId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[idb] analysis load failed", e);
    return void 0;
  }
}
async function clearAnalysisFromIdb(gameId) {
  try {
    const db = await openGameDb();
    const tx = db.transaction("analysis-library", "readwrite");
    tx.objectStore("analysis-library").delete(gameId);
  } catch (e) {
    console.warn("[idb] analysis clear failed", e);
  }
}
async function clearAllIdbData() {
  try {
    const db = await openGameDb();
    const tx = db.transaction(["game-library", "puzzle-library", "analysis-library"], "readwrite");
    tx.objectStore("game-library").clear();
    tx.objectStore("puzzle-library").clear();
    tx.objectStore("analysis-library").clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[idb] clearAllIdbData failed", e);
  }
}
async function savePuzzlesToIdb() {
  try {
    const db = await openGameDb();
    const tx = db.transaction("puzzle-library", "readwrite");
    tx.objectStore("puzzle-library").put(savedPuzzles, "saved-puzzles");
  } catch (e) {
    console.warn("[idb] puzzle save failed", e);
  }
}
async function loadPuzzlesFromIdb() {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction("puzzle-library", "readonly").objectStore("puzzle-library").get("saved-puzzles");
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[idb] puzzle load failed", e);
    return [];
  }
}
function savePuzzle(c, redraw2) {
  const already = savedPuzzles.some((p) => p.gameId === c.gameId && p.path === c.path);
  if (already) return;
  savedPuzzles = [...savedPuzzles, c];
  void savePuzzlesToIdb();
  redraw2();
}
async function savePuzzleSessionToIdb(session) {
  try {
    const db = await openGameDb();
    const tx = db.transaction("puzzle-library", "readwrite");
    tx.objectStore("puzzle-library").put(session, "puzzle-session");
  } catch (e) {
    console.warn("[idb] puzzle session save failed", e);
  }
}
async function loadPuzzleSessionFromIdb() {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction("puzzle-library", "readonly").objectStore("puzzle-library").get("puzzle-session");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[idb] puzzle session load failed", e);
    return void 0;
  }
}

// src/engine/batch.ts
var _getCtrl2 = () => {
  throw new Error("batch not initialised");
};
var _getSelectedGameId = () => null;
var _getImportedGames = () => [];
var _analyzedGameIds;
var _missedTacticGameIds;
var _analyzedGameAccuracy;
var _getUserColor;
var _redraw2 = () => {
};
function initBatch(deps) {
  _getCtrl2 = deps.getCtrl;
  _getSelectedGameId = deps.getSelectedGameId;
  _getImportedGames = deps.getImportedGames;
  _analyzedGameIds = deps.analyzedGameIds;
  _missedTacticGameIds = deps.missedTacticGameIds;
  _analyzedGameAccuracy = deps.analyzedGameAccuracy;
  _getUserColor = deps.getUserColor;
  _redraw2 = deps.redraw;
  setIsBatchActive(() => batchAnalyzing);
  setOnBatchBestmove(onBatchBestmove);
  setOnEngineReady(() => {
    if (pendingBatchOnReady) {
      pendingBatchOnReady = false;
      startBatchAnalysis();
    } else {
      evalCurrentPosition();
    }
  });
}
var batchQueue = [];
var batchDone = 0;
var batchAnalyzing = false;
var batchState = "idle";
var analysisRunning = false;
var analysisComplete = false;
function storedInt2(key, def, min, max) {
  const v = parseInt(localStorage.getItem(key) ?? "", 10);
  return !isNaN(v) && v >= min && v <= max ? v : def;
}
var reviewDepth = storedInt2("patzer.reviewDepth", 16, 12, 20);
var pendingBatchOnReady = false;
var MISSED_TACTIC_THRESHOLD = 0.1;
var MISSED_TACTIC_MAX_PLY = 60;
function setReviewDepth(v) {
  reviewDepth = v;
  localStorage.setItem("patzer.reviewDepth", String(v));
}
function setBatchAnalyzing(v) {
  batchAnalyzing = v;
}
function setBatchState(v) {
  batchState = v;
}
function setAnalysisRunning(v) {
  analysisRunning = v;
}
function setAnalysisComplete(v) {
  analysisComplete = v;
}
function resetBatchState() {
  batchQueue = [];
  batchDone = 0;
  batchAnalyzing = false;
  batchState = "idle";
  analysisRunning = false;
  analysisComplete = false;
}
function detectMissedTactics(userColor) {
  const ctrl2 = _getCtrl2();
  let path = "";
  for (let i = 1; i < ctrl2.mainline.length; i++) {
    const node = ctrl2.mainline[i];
    path += node.id;
    const isWhiteMove = node.ply % 2 === 1;
    const isUserMove = userColor === null || userColor === "white" && isWhiteMove || userColor === "black" && !isWhiteMove;
    if (!isUserMove) continue;
    const parentPath = path.slice(0, -2);
    const nodeEval = evalCache.get(path);
    const parentEval = evalCache.get(parentPath);
    if (!nodeEval || !parentEval || !parentEval.best) continue;
    const userParentMate = isWhiteMove ? parentEval.mate : parentEval.mate !== void 0 ? -parentEval.mate : void 0;
    if (userParentMate !== void 0 && userParentMate > 0 && userParentMate <= 3 && !nodeEval.mate) return true;
    if (node.ply >= MISSED_TACTIC_MAX_PLY) continue;
    if (nodeEval.loss !== void 0 && nodeEval.loss > MISSED_TACTIC_THRESHOLD) return true;
  }
  return false;
}
function evalBatchItem(item) {
  const wasActive = isEngineSearchActive();
  if (wasActive) incrementPendingStopCount();
  setEngineSearchActive(true);
  setEvalNode(item.nodeId, item.nodePath, item.nodePly, item.parentPath);
  resetCurrentEval();
  clearPendingLines();
  console.log("[batch]", batchDone + 1, "/", batchQueue.length, "nodeId:", item.nodeId, "path:", item.nodePath, "ply:", item.nodePly);
  if (wasActive) protocol.stop();
  protocol.setPosition(item.fen);
  protocol.go(reviewDepth);
}
function onBatchBestmove() {
  const stored = { ...currentEval };
  const nodePath = getEvalNodePath();
  const nodePly = getEvalNodePly();
  const parentPath = getEvalParentPath();
  if (stored.cp !== void 0 || stored.mate !== void 0) {
    const parentEval = evalCache.get(parentPath);
    if (parentEval?.cp !== void 0 && stored.cp !== void 0) {
      stored.delta = stored.cp - parentEval.cp;
    }
    if (parentEval) {
      const nodeWc = evalWinChances(stored);
      const parentWc = evalWinChances(parentEval);
      if (nodeWc !== void 0 && parentWc !== void 0) {
        const whiteToMove = nodePly % 2 === 1;
        const moverNodeWc = whiteToMove ? nodeWc : -nodeWc;
        const moverParentWc = whiteToMove ? parentWc : -parentWc;
        stored.loss = (moverParentWc - moverNodeWc) / 2;
      }
    }
    evalCache.set(nodePath, stored);
    console.log(
      "[review cache] path:",
      nodePath,
      "ply:",
      nodePly,
      "best:",
      stored.best,
      { cp: stored.cp, delta: stored.delta, loss: stored.loss?.toFixed(4) }
    );
  } else {
    console.log("[review cache] skip (no score) \u2014 path:", nodePath, "ply:", nodePly);
  }
  advanceBatch();
}
function advanceBatch() {
  batchDone++;
  const gameId = _getSelectedGameId();
  if (gameId) void saveAnalysisToIdb("partial", gameId, buildAnalysisNodes(_getCtrl2().mainline, (p) => evalCache.get(p)), reviewDepth);
  _redraw2();
  if (batchDone < batchQueue.length) {
    evalBatchItem(batchQueue[batchDone]);
  } else {
    batchAnalyzing = false;
    batchState = "complete";
    analysisRunning = false;
    analysisComplete = true;
    if (gameId) {
      _analyzedGameIds.add(gameId);
      const game = _getImportedGames().find((g) => g.id === gameId);
      const userColor = game ? _getUserColor(game) : null;
      if (detectMissedTactics(userColor)) _missedTacticGameIds.add(gameId);
      const liveSummary = computeAnalysisSummary(_getCtrl2().mainline, evalCache);
      if (liveSummary) {
        _analyzedGameAccuracy.set(gameId, { white: liveSummary.white.accuracy, black: liveSummary.black.accuracy });
      }
    }
    if (gameId) void saveAnalysisToIdb("complete", gameId, buildAnalysisNodes(_getCtrl2().mainline, (p) => evalCache.get(p)), reviewDepth);
    evalCache.delete(_getCtrl2().path);
    resetCurrentEval();
    clearPendingLines();
    evalCurrentPosition();
  }
}
function startBatchAnalysis() {
  if (!engineEnabled || !engineReady || batchAnalyzing) return;
  const ctrl2 = _getCtrl2();
  const queue = [];
  let path = "";
  let prevPath = "";
  for (let i = 0; i < ctrl2.mainline.length; i++) {
    const node = ctrl2.mainline[i];
    prevPath = path;
    if (i > 0) path += node.id;
    if (!evalCache.has(path)) {
      queue.push({ nodeId: node.id, nodePly: node.ply, nodePath: path, parentPath: prevPath, fen: node.fen });
    }
  }
  batchQueue = queue;
  batchDone = 0;
  batchAnalyzing = queue.length > 0;
  batchState = queue.length > 0 ? "analyzing" : "complete";
  analysisRunning = queue.length > 0;
  analysisComplete = queue.length === 0;
  syncArrow();
  _redraw2();
  if (queue.length > 0) evalBatchItem(queue[0]);
}
function startBatchWhenReady() {
  if (!engineEnabled) {
    pendingBatchOnReady = true;
    toggleEngine();
    return;
  }
  if (!engineReady) {
    pendingBatchOnReady = true;
    return;
  }
  startBatchAnalysis();
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/types.js
var colors = ["white", "black"];
var files = ["a", "b", "c", "d", "e", "f", "g", "h"];
var ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/util.js
var invRanks = [...ranks].reverse();
var allKeys = files.flatMap((f) => ranks.map((r) => f + r));
var pos2key = (pos) => pos.every((x) => x >= 0 && x <= 7) ? allKeys[8 * pos[0] + pos[1]] : void 0;
var pos2keyUnsafe = (pos) => pos2key(pos);
var key2pos = (k) => [k.charCodeAt(0) - 97, k.charCodeAt(1) - 49];
var uciToMove = (uci) => {
  if (!uci)
    return void 0;
  if (uci[1] === "@")
    return [uci.slice(2, 4)];
  return [uci.slice(0, 2), uci.slice(2, 4)];
};
var allPos = allKeys.map(key2pos);
var allPosAndKey = allKeys.map((key, i) => ({ key, pos: allPos[i] }));
function memo(f) {
  let v;
  const ret = () => {
    if (v === void 0)
      v = f();
    return v;
  };
  ret.clear = () => {
    v = void 0;
  };
  return ret;
}
var timer = () => {
  let startAt;
  return {
    start() {
      startAt = performance.now();
    },
    cancel() {
      startAt = void 0;
    },
    stop() {
      if (!startAt)
        return 0;
      const time = performance.now() - startAt;
      startAt = void 0;
      return time;
    }
  };
};
var opposite2 = (c) => c === "white" ? "black" : "white";
var distanceSq = (pos1, pos2) => (pos1[0] - pos2[0]) ** 2 + (pos1[1] - pos2[1]) ** 2;
var samePiece = (p1, p2) => p1.role === p2.role && p1.color === p2.color;
var samePos = (p1, p2) => p1[0] === p2[0] && p1[1] === p2[1];
var posToTranslate = (bounds) => (pos, asWhite) => [
  (asWhite ? pos[0] : 7 - pos[0]) * bounds.width / 8,
  (asWhite ? 7 - pos[1] : pos[1]) * bounds.height / 8
];
var translate = (el, pos) => {
  el.style.transform = `translate(${pos[0]}px,${pos[1]}px)`;
};
var translateAndScale = (el, pos, scale = 1) => {
  el.style.transform = `translate(${pos[0]}px,${pos[1]}px) scale(${scale})`;
};
var setVisible = (el, v) => {
  el.style.visibility = v ? "visible" : "hidden";
};
var eventPosition = (e) => {
  if (e.clientX || e.clientX === 0)
    return [e.clientX, e.clientY];
  if (e.targetTouches?.[0])
    return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
  return;
};
var isFireMac = memo(() => !("ontouchstart" in window) && ["macintosh", "firefox"].every((x) => navigator.userAgent.toLowerCase().includes(x)));
var isRightButton = (e) => e.button === 2 && !(e.ctrlKey && isFireMac());
var createEl = (tagName2, className) => {
  const el = document.createElement(tagName2);
  if (className)
    el.className = className;
  return el;
};
function computeSquareCenter(key, asWhite, bounds) {
  const pos = key2pos(key);
  if (!asWhite) {
    pos[0] = 7 - pos[0];
    pos[1] = 7 - pos[1];
  }
  return [
    bounds.left + bounds.width * pos[0] / 8 + bounds.width / 16,
    bounds.top + bounds.height * (7 - pos[1]) / 8 + bounds.height / 16
  ];
}
var diff = (a, b) => Math.abs(a - b);
var knightDir = (x1, y1, x2, y2) => diff(x1, x2) * diff(y1, y2) === 2;
var rookDir = (x1, y1, x2, y2) => x1 === x2 !== (y1 === y2);
var bishopDir = (x1, y1, x2, y2) => diff(x1, x2) === diff(y1, y2) && x1 !== x2;
var queenDir = (x1, y1, x2, y2) => rookDir(x1, y1, x2, y2) || bishopDir(x1, y1, x2, y2);
var kingDirNonCastling = (x1, y1, x2, y2) => Math.max(diff(x1, x2), diff(y1, y2)) === 1;
var pawnDirAdvance = (x1, y1, x2, y2, isDirectionUp) => {
  const step2 = isDirectionUp ? 1 : -1;
  return x1 === x2 && (y2 === y1 + step2 || // allow 2 squares from first two ranks, for horde
  y2 === y1 + 2 * step2 && (isDirectionUp ? y1 <= 1 : y1 >= 6));
};
var squaresBetween = (x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx && dy && Math.abs(dx) !== Math.abs(dy))
    return [];
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const squares = [];
  let x = x1 + stepX, y = y1 + stepY;
  while (x !== x2 || y !== y2) {
    squares.push([x, y]);
    x += stepX;
    y += stepY;
  }
  return squares.map(pos2key).filter((k) => k !== void 0);
};

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/premove.js
var pawn = (ctx) => diff(ctx.orig.pos[0], ctx.dest.pos[0]) <= 1 && (diff(ctx.orig.pos[0], ctx.dest.pos[0]) === 1 ? ctx.dest.pos[1] === ctx.orig.pos[1] + (ctx.color === "white" ? 1 : -1) : pawnDirAdvance(...ctx.orig.pos, ...ctx.dest.pos, ctx.color === "white"));
var knight = (ctx) => knightDir(...ctx.orig.pos, ...ctx.dest.pos);
var bishop = (ctx) => bishopDir(...ctx.orig.pos, ...ctx.dest.pos);
var rook = (ctx) => rookDir(...ctx.orig.pos, ...ctx.dest.pos);
var queen = (ctx) => bishop(ctx) || rook(ctx);
var king = (ctx) => kingDirNonCastling(...ctx.orig.pos, ...ctx.dest.pos) || ctx.orig.pos[1] === ctx.dest.pos[1] && ctx.orig.pos[1] === (ctx.color === "white" ? 0 : 7) && (ctx.orig.pos[0] === 4 && (ctx.dest.pos[0] === 2 && ctx.rookFilesFriendlies.includes(0) || ctx.dest.pos[0] === 6 && ctx.rookFilesFriendlies.includes(7)) || ctx.rookFilesFriendlies.includes(ctx.dest.pos[0]));
var mobilityByRole = { pawn, knight, bishop, rook, queen, king };
function premove(state, key) {
  const pieces = state.pieces;
  const piece = pieces.get(key);
  if (!piece || piece.color === state.turnColor)
    return [];
  const color = piece.color, friendlies = new Map([...pieces].filter(([_, p]) => p.color === color)), enemies = new Map([...pieces].filter(([_, p]) => p.color === opposite2(color))), orig = { key, pos: key2pos(key) }, mobility = (ctx) => mobilityByRole[piece.role](ctx) && state.premovable.additionalPremoveRequirements(ctx), partialCtx = {
    orig,
    role: piece.role,
    allPieces: pieces,
    friendlies,
    enemies,
    color,
    rookFilesFriendlies: Array.from(pieces).filter(([k, p]) => k[1] === (color === "white" ? "1" : "8") && p.color === color && p.role === "rook").map(([k]) => key2pos(k)[0]),
    lastMove: state.lastMove
  };
  return allPosAndKey.filter((dest) => mobility({ ...partialCtx, dest })).map((pk) => pk.key);
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/board.js
function callUserFunction(f, ...args) {
  if (f)
    setTimeout(() => f(...args), 1);
}
function toggleOrientation(state) {
  state.orientation = opposite2(state.orientation);
  state.animation.current = state.draggable.current = state.selected = void 0;
}
function setPieces(state, pieces) {
  for (const [key, piece] of pieces) {
    if (piece)
      state.pieces.set(key, piece);
    else
      state.pieces.delete(key);
  }
}
function setCheck(state, color) {
  state.check = void 0;
  if (color === true)
    color = state.turnColor;
  if (color)
    for (const [k, p] of state.pieces) {
      if (p.role === "king" && p.color === color) {
        state.check = k;
      }
    }
}
function setPremove(state, orig, dest, meta) {
  unsetPredrop(state);
  state.premovable.current = [orig, dest];
  callUserFunction(state.premovable.events.set, orig, dest, meta);
}
function unsetPremove(state) {
  if (state.premovable.current) {
    state.premovable.current = void 0;
    callUserFunction(state.premovable.events.unset);
  }
}
function setPredrop(state, role, key) {
  unsetPremove(state);
  state.predroppable.current = { role, key };
  callUserFunction(state.predroppable.events.set, role, key);
}
function unsetPredrop(state) {
  const pd = state.predroppable;
  if (pd.current) {
    pd.current = void 0;
    callUserFunction(pd.events.unset);
  }
}
function tryAutoCastle(state, orig, dest) {
  if (!state.autoCastle)
    return false;
  const king2 = state.pieces.get(orig);
  if (!king2 || king2.role !== "king")
    return false;
  const origPos = key2pos(orig);
  const destPos = key2pos(dest);
  if (origPos[1] !== 0 && origPos[1] !== 7 || origPos[1] !== destPos[1])
    return false;
  if (origPos[0] === 4 && !state.pieces.has(dest)) {
    if (destPos[0] === 6)
      dest = pos2keyUnsafe([7, destPos[1]]);
    else if (destPos[0] === 2)
      dest = pos2keyUnsafe([0, destPos[1]]);
  }
  const rook2 = state.pieces.get(dest);
  if (!rook2 || rook2.color !== king2.color || rook2.role !== "rook")
    return false;
  state.pieces.delete(orig);
  state.pieces.delete(dest);
  if (origPos[0] < destPos[0]) {
    state.pieces.set(pos2keyUnsafe([6, destPos[1]]), king2);
    state.pieces.set(pos2keyUnsafe([5, destPos[1]]), rook2);
  } else {
    state.pieces.set(pos2keyUnsafe([2, destPos[1]]), king2);
    state.pieces.set(pos2keyUnsafe([3, destPos[1]]), rook2);
  }
  return true;
}
function baseMove(state, orig, dest) {
  const origPiece = state.pieces.get(orig), destPiece = state.pieces.get(dest);
  if (orig === dest || !origPiece)
    return false;
  const captured = destPiece && destPiece.color !== origPiece.color ? destPiece : void 0;
  if (dest === state.selected)
    unselect(state);
  callUserFunction(state.events.move, orig, dest, captured);
  if (!tryAutoCastle(state, orig, dest)) {
    state.pieces.set(dest, origPiece);
    state.pieces.delete(orig);
  }
  state.lastMove = [orig, dest];
  state.check = void 0;
  callUserFunction(state.events.change);
  return captured || true;
}
function baseNewPiece(state, piece, key, force) {
  if (state.pieces.has(key)) {
    if (force)
      state.pieces.delete(key);
    else
      return false;
  }
  callUserFunction(state.events.dropNewPiece, piece, key);
  state.pieces.set(key, piece);
  state.lastMove = [key];
  state.check = void 0;
  callUserFunction(state.events.change);
  state.movable.dests = void 0;
  state.turnColor = opposite2(state.turnColor);
  return true;
}
function baseUserMove(state, orig, dest) {
  const result = baseMove(state, orig, dest);
  if (result) {
    state.movable.dests = void 0;
    state.turnColor = opposite2(state.turnColor);
    state.animation.current = void 0;
  }
  return result;
}
function userMove(state, orig, dest) {
  if (canMove(state, orig, dest)) {
    const result = baseUserMove(state, orig, dest);
    if (result) {
      const holdTime = state.hold.stop();
      unselect(state);
      const metadata = {
        premove: false,
        ctrlKey: state.stats.ctrlKey,
        holdTime
      };
      if (result !== true)
        metadata.captured = result;
      callUserFunction(state.movable.events.after, orig, dest, metadata);
      return true;
    }
  } else if (canPremove(state, orig, dest)) {
    setPremove(state, orig, dest, {
      ctrlKey: state.stats.ctrlKey
    });
    unselect(state);
    return true;
  }
  unselect(state);
  return false;
}
function dropNewPiece(state, orig, dest, force) {
  const piece = state.pieces.get(orig);
  if (piece && (canDrop(state, orig, dest) || force)) {
    state.pieces.delete(orig);
    baseNewPiece(state, piece, dest, force);
    callUserFunction(state.movable.events.afterNewPiece, piece.role, dest, {
      premove: false,
      predrop: false
    });
  } else if (piece && canPredrop(state, orig, dest)) {
    setPredrop(state, piece.role, dest);
  } else {
    unsetPremove(state);
    unsetPredrop(state);
  }
  state.pieces.delete(orig);
  unselect(state);
}
function selectSquare(state, key, force) {
  callUserFunction(state.events.select, key);
  if (state.selected) {
    if (state.selected === key && !state.draggable.enabled) {
      unselect(state);
      state.hold.cancel();
      return;
    } else if ((state.selectable.enabled || force) && state.selected !== key) {
      if (userMove(state, state.selected, key)) {
        state.stats.dragged = false;
        return;
      }
    }
  }
  if ((state.selectable.enabled || state.draggable.enabled) && (isMovable(state, key) || isPremovable(state, key))) {
    setSelected(state, key);
    state.hold.start();
  }
}
function setSelected(state, key) {
  state.selected = key;
  if (!isPremovable(state, key))
    state.premovable.dests = void 0;
  else if (!state.premovable.customDests)
    state.premovable.dests = premove(state, key);
}
function unselect(state) {
  state.selected = void 0;
  state.premovable.dests = void 0;
  state.hold.cancel();
}
function isMovable(state, orig) {
  const piece = state.pieces.get(orig);
  return !!piece && (state.movable.color === "both" || state.movable.color === piece.color && state.turnColor === piece.color);
}
var canMove = (state, orig, dest) => orig !== dest && isMovable(state, orig) && (state.movable.free || !!state.movable.dests?.get(orig)?.includes(dest));
function canDrop(state, orig, dest) {
  const piece = state.pieces.get(orig);
  return !!piece && (orig === dest || !state.pieces.has(dest)) && (state.movable.color === "both" || state.movable.color === piece.color && state.turnColor === piece.color);
}
function isPremovable(state, orig) {
  const piece = state.pieces.get(orig);
  return !!piece && state.premovable.enabled && state.movable.color === piece.color && state.turnColor !== piece.color;
}
var canPremove = (state, orig, dest) => orig !== dest && isPremovable(state, orig) && (state.premovable.customDests?.get(orig) ?? premove(state, orig)).includes(dest);
function canPredrop(state, orig, dest) {
  const piece = state.pieces.get(orig);
  const destPiece = state.pieces.get(dest);
  return !!piece && (!destPiece || destPiece.color !== state.movable.color) && state.predroppable.enabled && (piece.role !== "pawn" || dest[1] !== "1" && dest[1] !== "8") && state.movable.color === piece.color && state.turnColor !== piece.color;
}
function isDraggable(state, orig) {
  const piece = state.pieces.get(orig);
  return !!piece && state.draggable.enabled && (state.movable.color === "both" || state.movable.color === piece.color && (state.turnColor === piece.color || state.premovable.enabled));
}
function playPremove(state) {
  const move3 = state.premovable.current;
  if (!move3)
    return false;
  const orig = move3[0], dest = move3[1];
  let success = false;
  if (canMove(state, orig, dest)) {
    const result = baseUserMove(state, orig, dest);
    if (result) {
      const metadata = { premove: true };
      if (result !== true)
        metadata.captured = result;
      callUserFunction(state.movable.events.after, orig, dest, metadata);
      success = true;
    }
  }
  unsetPremove(state);
  return success;
}
function playPredrop(state, validate) {
  const drop2 = state.predroppable.current;
  let success = false;
  if (!drop2)
    return false;
  if (validate(drop2)) {
    const piece = {
      role: drop2.role,
      color: state.movable.color
    };
    if (baseNewPiece(state, piece, drop2.key)) {
      callUserFunction(state.movable.events.afterNewPiece, drop2.role, drop2.key, {
        premove: false,
        predrop: true
      });
      success = true;
    }
  }
  unsetPredrop(state);
  return success;
}
function cancelMove(state) {
  unsetPremove(state);
  unsetPredrop(state);
  unselect(state);
}
function stop(state) {
  state.movable.color = state.movable.dests = state.animation.current = void 0;
  cancelMove(state);
}
function getKeyAtDomPos(pos, asWhite, bounds) {
  let file = Math.floor(8 * (pos[0] - bounds.left) / bounds.width);
  if (!asWhite)
    file = 7 - file;
  let rank = 7 - Math.floor(8 * (pos[1] - bounds.top) / bounds.height);
  if (!asWhite)
    rank = 7 - rank;
  return file >= 0 && file < 8 && rank >= 0 && rank < 8 ? pos2key([file, rank]) : void 0;
}
function getSnappedKeyAtDomPos(orig, pos, asWhite, bounds) {
  const origPos = key2pos(orig);
  const validSnapPos = allPos.filter((pos2) => samePos(origPos, pos2) || queenDir(origPos[0], origPos[1], pos2[0], pos2[1]) || knightDir(origPos[0], origPos[1], pos2[0], pos2[1]));
  const validSnapCenters = validSnapPos.map((pos2) => computeSquareCenter(pos2keyUnsafe(pos2), asWhite, bounds));
  const validSnapDistances = validSnapCenters.map((pos2) => distanceSq(pos, pos2));
  const [, closestSnapIndex] = validSnapDistances.reduce((a, b, index) => a[0] < b ? a : [b, index], [validSnapDistances[0], 0]);
  return pos2key(validSnapPos[closestSnapIndex]);
}
var whitePov = (s) => s.orientation === "white";

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/fen.js
var initial = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
var roles = {
  p: "pawn",
  r: "rook",
  n: "knight",
  b: "bishop",
  q: "queen",
  k: "king"
};
var letters = {
  pawn: "p",
  rook: "r",
  knight: "n",
  bishop: "b",
  queen: "q",
  king: "k"
};
function read(fen) {
  if (fen === "start")
    fen = initial;
  const pieces = /* @__PURE__ */ new Map();
  let row = 7, col = 0;
  for (const c of fen) {
    switch (c) {
      case " ":
      case "[":
        return pieces;
      case "/":
        --row;
        if (row < 0)
          return pieces;
        col = 0;
        break;
      case "~": {
        const k = pos2key([col - 1, row]);
        const piece = k && pieces.get(k);
        if (piece)
          piece.promoted = true;
        break;
      }
      default: {
        const nb = c.charCodeAt(0);
        if (nb < 57)
          col += nb - 48;
        else {
          const role = c.toLowerCase();
          const key = pos2key([col, row]);
          if (key)
            pieces.set(key, {
              role: roles[role],
              color: c === role ? "black" : "white"
            });
          ++col;
        }
      }
    }
  }
  return pieces;
}
function write(pieces) {
  return invRanks.map((y) => files.map((x) => {
    const piece = pieces.get(x + y);
    if (piece) {
      let p = letters[piece.role];
      if (piece.color === "white")
        p = p.toUpperCase();
      if (piece.promoted)
        p += "~";
      return p;
    } else
      return "1";
  }).join("")).join("/").replace(/1{2,}/g, (s) => s.length.toString());
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/config.js
function applyAnimation(state, config) {
  if (config.animation) {
    deepMerge(state.animation, config.animation);
    if ((state.animation.duration || 0) < 70)
      state.animation.enabled = false;
  }
}
function configure(state, config) {
  if (config.movable?.dests)
    state.movable.dests = void 0;
  if (config.drawable?.autoShapes)
    state.drawable.autoShapes = [];
  deepMerge(state, config);
  if (config.fen) {
    state.pieces = read(config.fen);
    state.drawable.shapes = config.drawable?.shapes || [];
  }
  if ("check" in config)
    setCheck(state, config.check || false);
  if ("lastMove" in config && !config.lastMove)
    state.lastMove = void 0;
  else if (config.lastMove)
    state.lastMove = config.lastMove;
  if (state.selected)
    setSelected(state, state.selected);
  applyAnimation(state, config);
  if (!state.movable.rookCastle && state.movable.dests) {
    const rank = state.movable.color === "white" ? "1" : "8", kingStartPos = "e" + rank, dests = state.movable.dests.get(kingStartPos), king2 = state.pieces.get(kingStartPos);
    if (!dests || !king2 || king2.role !== "king")
      return;
    state.movable.dests.set(kingStartPos, dests.filter((d) => !(d === "a" + rank && dests.includes("c" + rank)) && !(d === "h" + rank && dests.includes("g" + rank))));
  }
}
function deepMerge(base, extend) {
  for (const key in extend) {
    if (key === "__proto__" || key === "constructor" || !Object.prototype.hasOwnProperty.call(extend, key))
      continue;
    if (Object.prototype.hasOwnProperty.call(base, key) && isPlainObject(base[key]) && isPlainObject(extend[key]))
      deepMerge(base[key], extend[key]);
    else
      base[key] = extend[key];
  }
}
function isPlainObject(o) {
  if (typeof o !== "object" || o === null)
    return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/anim.js
var anim = (mutation, state) => state.animation.enabled ? animate(mutation, state) : render(mutation, state);
function render(mutation, state) {
  const result = mutation(state);
  state.dom.redraw();
  return result;
}
var makePiece = (key, piece) => ({
  key,
  pos: key2pos(key),
  piece
});
var closer = (piece, pieces) => pieces.sort((p1, p2) => distanceSq(piece.pos, p1.pos) - distanceSq(piece.pos, p2.pos))[0];
function computePlan(prevPieces, current2) {
  const anims = /* @__PURE__ */ new Map(), animedOrigs = [], fadings = /* @__PURE__ */ new Map(), missings = [], news = [], prePieces = /* @__PURE__ */ new Map();
  let curP, preP, vector;
  for (const [k, p] of prevPieces) {
    prePieces.set(k, makePiece(k, p));
  }
  for (const key of allKeys) {
    curP = current2.pieces.get(key);
    preP = prePieces.get(key);
    if (curP) {
      if (preP) {
        if (!samePiece(curP, preP.piece)) {
          missings.push(preP);
          news.push(makePiece(key, curP));
        }
      } else
        news.push(makePiece(key, curP));
    } else if (preP)
      missings.push(preP);
  }
  for (const newP of news) {
    preP = closer(newP, missings.filter((p) => samePiece(newP.piece, p.piece)));
    if (preP) {
      vector = [preP.pos[0] - newP.pos[0], preP.pos[1] - newP.pos[1]];
      anims.set(newP.key, vector.concat(vector));
      animedOrigs.push(preP.key);
    }
  }
  for (const p of missings) {
    if (!animedOrigs.includes(p.key))
      fadings.set(p.key, p.piece);
  }
  return {
    anims,
    fadings
  };
}
function step(state, now) {
  const cur = state.animation.current;
  if (cur === void 0) {
    if (!state.dom.destroyed)
      state.dom.redrawNow();
    return;
  }
  const rest = 1 - (now - cur.start) * cur.frequency;
  if (rest <= 0) {
    state.animation.current = void 0;
    state.dom.redrawNow();
  } else {
    const ease = easing(rest);
    for (const cfg of cur.plan.anims.values()) {
      cfg[2] = cfg[0] * ease;
      cfg[3] = cfg[1] * ease;
    }
    state.dom.redrawNow(true);
    requestAnimationFrame((now2 = performance.now()) => step(state, now2));
  }
}
function animate(mutation, state) {
  const prevPieces = new Map(state.pieces);
  const result = mutation(state);
  const plan = computePlan(prevPieces, state);
  if (plan.anims.size || plan.fadings.size) {
    const alreadyRunning = state.animation.current && state.animation.current.start;
    state.animation.current = {
      start: performance.now(),
      frequency: 1 / state.animation.duration,
      plan
    };
    if (!alreadyRunning)
      step(state, performance.now());
  } else {
    state.dom.redraw();
  }
  return result;
}
var easing = (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/draw.js
var brushes = ["green", "red", "blue", "yellow"];
function start(state, e) {
  if (e.touches && e.touches.length > 1)
    return;
  e.stopPropagation();
  e.preventDefault();
  e.ctrlKey ? unselect(state) : cancelMove(state);
  const pos = eventPosition(e), orig = getKeyAtDomPos(pos, whitePov(state), state.dom.bounds());
  if (!orig)
    return;
  state.drawable.current = {
    orig,
    pos,
    brush: eventBrush(e),
    snapToValidMove: state.drawable.defaultSnapToValidMove
  };
  processDraw(state);
}
function processDraw(state) {
  requestAnimationFrame(() => {
    const cur = state.drawable.current;
    if (cur) {
      const keyAtDomPos = getKeyAtDomPos(cur.pos, whitePov(state), state.dom.bounds());
      if (!keyAtDomPos) {
        cur.snapToValidMove = false;
      }
      const mouseSq = cur.snapToValidMove ? getSnappedKeyAtDomPos(cur.orig, cur.pos, whitePov(state), state.dom.bounds()) : keyAtDomPos;
      if (mouseSq !== cur.mouseSq) {
        cur.mouseSq = mouseSq;
        cur.dest = mouseSq !== cur.orig ? mouseSq : void 0;
        state.dom.redrawNow();
      }
      processDraw(state);
    }
  });
}
function move(state, e) {
  if (state.drawable.current)
    state.drawable.current.pos = eventPosition(e);
}
function end(state) {
  const cur = state.drawable.current;
  if (cur) {
    if (cur.mouseSq)
      addShape(state.drawable, cur);
    cancel(state);
  }
}
function cancel(state) {
  if (state.drawable.current) {
    state.drawable.current = void 0;
    state.dom.redraw();
  }
}
function clear(state) {
  if (state.drawable.shapes.length) {
    state.drawable.shapes = [];
    state.dom.redraw();
    onChange(state.drawable);
  }
}
var sameEndpoints = (s1, s2) => s1.orig === s2.orig && s1.dest === s2.dest;
var sameColor = (s1, s2) => s1.brush === s2.brush;
function eventBrush(e) {
  const modA = (e.shiftKey || e.ctrlKey) && isRightButton(e);
  const modB = e.altKey || e.metaKey || e.getModifierState?.("AltGraph");
  return brushes[(modA ? 1 : 0) + (modB ? 2 : 0)];
}
function addShape(drawable, cur) {
  const similar = drawable.shapes.find((s) => sameEndpoints(s, cur));
  if (similar)
    drawable.shapes = drawable.shapes.filter((s) => !sameEndpoints(s, cur));
  if (!similar || !sameColor(similar, cur))
    drawable.shapes.push({
      orig: cur.orig,
      dest: cur.dest,
      brush: cur.brush
    });
  onChange(drawable);
}
function onChange(drawable) {
  if (drawable.onChange)
    drawable.onChange(drawable.shapes);
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/drag.js
function start2(s, e) {
  if (!(s.trustAllEvents || e.isTrusted))
    return;
  if (e.buttons !== void 0 && e.buttons > 1)
    return;
  if (e.touches && e.touches.length > 1)
    return;
  const bounds = s.dom.bounds(), position = eventPosition(e), orig = getKeyAtDomPos(position, whitePov(s), bounds);
  if (!orig)
    return;
  const piece = s.pieces.get(orig);
  const previouslySelected = s.selected;
  if (!previouslySelected && s.drawable.enabled && (s.drawable.eraseOnMovablePieceClick || !piece || piece.color !== s.turnColor))
    clear(s);
  if (e.cancelable !== false && (!e.touches || s.blockTouchScroll || piece || previouslySelected || pieceCloseTo(s, position)))
    e.preventDefault();
  else if (e.touches)
    return;
  const hadPremove = !!s.premovable.current;
  const hadPredrop = !!s.predroppable.current;
  s.stats.ctrlKey = e.ctrlKey;
  if (s.selected && canMove(s, s.selected, orig)) {
    anim((state) => selectSquare(state, orig), s);
  } else {
    selectSquare(s, orig);
  }
  const stillSelected = s.selected === orig;
  const element = pieceElementByKey(s, orig);
  if (piece && element && stillSelected && isDraggable(s, orig)) {
    s.draggable.current = {
      orig,
      piece,
      origPos: position,
      pos: position,
      started: s.draggable.autoDistance && s.stats.dragged,
      element,
      previouslySelected,
      originTarget: e.target,
      keyHasChanged: false
    };
    element.cgDragging = true;
    element.classList.add("dragging");
    const ghost = s.dom.elements.ghost;
    if (ghost) {
      ghost.className = `ghost ${piece.color} ${piece.role}`;
      translate(ghost, posToTranslate(bounds)(key2pos(orig), whitePov(s)));
      setVisible(ghost, true);
    }
    processDrag(s);
  } else {
    if (hadPremove)
      unsetPremove(s);
    if (hadPredrop)
      unsetPredrop(s);
  }
  s.dom.redraw();
}
function pieceCloseTo(s, pos) {
  const asWhite = whitePov(s), bounds = s.dom.bounds(), radiusSq = Math.pow(s.touchIgnoreRadius * bounds.width / 16, 2) * 2;
  for (const key of s.pieces.keys()) {
    const center = computeSquareCenter(key, asWhite, bounds);
    if (distanceSq(center, pos) <= radiusSq)
      return true;
  }
  return false;
}
function dragNewPiece(s, piece, e, force) {
  const key = "a0";
  s.pieces.set(key, piece);
  s.dom.redraw();
  const position = eventPosition(e);
  s.draggable.current = {
    orig: key,
    piece,
    origPos: position,
    pos: position,
    started: true,
    element: () => pieceElementByKey(s, key),
    originTarget: e.target,
    newPiece: true,
    force: !!force,
    keyHasChanged: false
  };
  processDrag(s);
}
function processDrag(s) {
  requestAnimationFrame(() => {
    const cur = s.draggable.current;
    if (!cur)
      return;
    if (s.animation.current?.plan.anims.has(cur.orig))
      s.animation.current = void 0;
    const origPiece = s.pieces.get(cur.orig);
    if (!origPiece || !samePiece(origPiece, cur.piece))
      cancel2(s);
    else {
      if (!cur.started && distanceSq(cur.pos, cur.origPos) >= Math.pow(s.draggable.distance, 2))
        cur.started = true;
      if (cur.started) {
        if (typeof cur.element === "function") {
          const found = cur.element();
          if (!found)
            return;
          found.cgDragging = true;
          found.classList.add("dragging");
          cur.element = found;
        }
        const bounds = s.dom.bounds();
        translate(cur.element, [
          cur.pos[0] - bounds.left - bounds.width / 16,
          cur.pos[1] - bounds.top - bounds.height / 16
        ]);
        if (s.jsHover)
          handleJsHover(s, cur);
        else
          cur.keyHasChanged || (cur.keyHasChanged = cur.orig !== getKeyAtDomPos(cur.pos, whitePov(s), bounds));
      }
    }
    processDrag(s);
  });
}
function handleJsHover(s, cur) {
  const hoveredKey = getKeyAtDomPos(cur.pos, whitePov(s), s.dom.bounds());
  if (cur.orig !== hoveredKey) {
    cur.keyHasChanged = true;
    if (hoveredKey) {
      const isValidMove = s.movable.dests?.get(cur.orig)?.includes(hoveredKey) ?? s.premovable.dests?.includes(hoveredKey);
      if (isValidMove) {
        const hoveredValidDestSquare = s.dom.elements.board.querySelector(`.move-dest[data-key="${hoveredKey}"], .premove-dest[data-key="${hoveredKey}"]`);
        if (hoveredValidDestSquare && !hoveredValidDestSquare.classList.contains("hover")) {
          resetHoverState(s);
          hoveredValidDestSquare.classList.add("hover");
        }
      } else {
        resetHoverState(s);
      }
    }
  } else {
    resetHoverState(s);
  }
}
function resetHoverState(s) {
  const squares = s.dom.elements.board.querySelectorAll(`.move-dest, .premove-dest`);
  if (squares.length > 0) {
    squares.forEach((sq) => sq.classList.remove("hover"));
  }
}
function move2(s, e) {
  if (s.draggable.current && (!e.touches || e.touches.length < 2)) {
    s.draggable.current.pos = eventPosition(e);
  }
}
function end2(s, e) {
  const cur = s.draggable.current;
  if (!cur)
    return;
  if (e.type === "touchend" && e.cancelable !== false)
    e.preventDefault();
  if (e.type === "touchend" && cur.originTarget !== e.target && !cur.newPiece) {
    s.draggable.current = void 0;
    return;
  }
  unsetPremove(s);
  unsetPredrop(s);
  const eventPos = eventPosition(e) || cur.pos;
  const dest = getKeyAtDomPos(eventPos, whitePov(s), s.dom.bounds());
  if (dest && cur.started && cur.orig !== dest) {
    if (cur.newPiece)
      dropNewPiece(s, cur.orig, dest, cur.force);
    else {
      s.stats.ctrlKey = e.ctrlKey;
      if (userMove(s, cur.orig, dest))
        s.stats.dragged = true;
    }
  } else if (cur.newPiece) {
    s.pieces.delete(cur.orig);
  } else if (s.draggable.deleteOnDropOff && !dest) {
    s.pieces.delete(cur.orig);
    callUserFunction(s.events.change);
  }
  if ((cur.orig === cur.previouslySelected || cur.keyHasChanged) && (cur.orig === dest || !dest))
    unselect(s);
  else if (!s.selectable.enabled)
    unselect(s);
  removeDragElements(s);
  s.draggable.current = void 0;
  s.dom.redraw();
}
function cancel2(s) {
  const cur = s.draggable.current;
  if (cur) {
    if (cur.newPiece)
      s.pieces.delete(cur.orig);
    s.draggable.current = void 0;
    unselect(s);
    removeDragElements(s);
    s.dom.redraw();
  }
}
function removeDragElements(s) {
  const e = s.dom.elements;
  if (e.ghost)
    setVisible(e.ghost, false);
}
function pieceElementByKey(s, key) {
  let el = s.dom.elements.board.firstChild;
  while (el) {
    if (el.cgKey === key && el.tagName === "PIECE")
      return el;
    el = el.nextSibling;
  }
  return;
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/explosion.js
function explosion(state, keys) {
  state.exploding = { stage: 1, keys };
  state.dom.redraw();
  setTimeout(() => {
    setStage(state, 2);
    setTimeout(() => setStage(state, void 0), 120);
  }, 120);
}
function setStage(state, stage) {
  if (state.exploding) {
    if (stage)
      state.exploding.stage = stage;
    else
      state.exploding = void 0;
    state.dom.redraw();
  }
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/api.js
function start3(state, redrawAll) {
  function toggleOrientation2() {
    toggleOrientation(state);
    redrawAll();
  }
  return {
    set(config) {
      if (config.orientation && config.orientation !== state.orientation)
        toggleOrientation2();
      applyAnimation(state, config);
      (config.fen ? anim : render)((state2) => configure(state2, config), state);
    },
    state,
    getFen: () => write(state.pieces),
    toggleOrientation: toggleOrientation2,
    setPieces(pieces) {
      anim((state2) => setPieces(state2, pieces), state);
    },
    selectSquare(key, force) {
      if (key)
        anim((state2) => selectSquare(state2, key, force), state);
      else if (state.selected) {
        unselect(state);
        state.dom.redraw();
      }
    },
    move(orig, dest) {
      anim((state2) => baseMove(state2, orig, dest), state);
    },
    newPiece(piece, key) {
      anim((state2) => baseNewPiece(state2, piece, key), state);
    },
    playPremove() {
      if (state.premovable.current) {
        if (anim(playPremove, state))
          return true;
        state.dom.redraw();
      }
      return false;
    },
    playPredrop(validate) {
      if (state.predroppable.current) {
        const result = playPredrop(state, validate);
        state.dom.redraw();
        return result;
      }
      return false;
    },
    cancelPremove() {
      render(unsetPremove, state);
    },
    cancelPredrop() {
      render(unsetPredrop, state);
    },
    cancelMove() {
      render((state2) => {
        cancelMove(state2);
        cancel2(state2);
      }, state);
    },
    stop() {
      render((state2) => {
        stop(state2);
        cancel2(state2);
      }, state);
    },
    explode(keys) {
      explosion(state, keys);
    },
    setAutoShapes(shapes) {
      render((state2) => state2.drawable.autoShapes = shapes, state);
    },
    setShapes(shapes) {
      render((state2) => state2.drawable.shapes = shapes.slice(), state);
    },
    getKeyAtDomPos(pos) {
      return getKeyAtDomPos(pos, whitePov(state), state.dom.bounds());
    },
    redrawAll,
    dragNewPiece(piece, event, force) {
      dragNewPiece(state, piece, event, force);
    },
    destroy() {
      stop(state);
      state.dom.unbind && state.dom.unbind();
      state.dom.destroyed = true;
    }
  };
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/state.js
function defaults() {
  return {
    pieces: read(initial),
    orientation: "white",
    turnColor: "white",
    coordinates: true,
    coordinatesOnSquares: false,
    ranksPosition: "right",
    autoCastle: true,
    viewOnly: false,
    disableContextMenu: false,
    addPieceZIndex: false,
    blockTouchScroll: false,
    touchIgnoreRadius: 1,
    pieceKey: false,
    trustAllEvents: false,
    jsHover: false,
    highlight: {
      lastMove: true,
      check: true
    },
    animation: {
      enabled: true,
      duration: 200
    },
    movable: {
      free: true,
      color: "both",
      showDests: true,
      events: {},
      rookCastle: true
    },
    premovable: {
      enabled: true,
      showDests: true,
      castle: true,
      additionalPremoveRequirements: (_) => true,
      events: {}
    },
    predroppable: {
      enabled: false,
      events: {}
    },
    draggable: {
      enabled: true,
      distance: 3,
      autoDistance: true,
      showGhost: true,
      deleteOnDropOff: false
    },
    dropmode: {
      active: false
    },
    selectable: {
      enabled: true
    },
    stats: {
      // on touchscreen, default to "tap-tap" moves
      // instead of drag
      dragged: !("ontouchstart" in window)
    },
    events: {},
    drawable: {
      enabled: true,
      // can draw
      visible: true,
      // can view
      defaultSnapToValidMove: true,
      eraseOnMovablePieceClick: true,
      shapes: [],
      autoShapes: [],
      brushes: {
        green: { key: "g", color: "#15781B", opacity: 1, lineWidth: 10 },
        red: { key: "r", color: "#882020", opacity: 1, lineWidth: 10 },
        blue: { key: "b", color: "#003088", opacity: 1, lineWidth: 10 },
        yellow: { key: "y", color: "#e68f00", opacity: 1, lineWidth: 10 },
        paleBlue: { key: "pb", color: "#003088", opacity: 0.4, lineWidth: 15 },
        paleGreen: { key: "pg", color: "#15781B", opacity: 0.4, lineWidth: 15 },
        paleRed: { key: "pr", color: "#882020", opacity: 0.4, lineWidth: 15 },
        paleGrey: {
          key: "pgr",
          color: "#4a4a4a",
          opacity: 0.35,
          lineWidth: 15
        },
        purple: { key: "purple", color: "#68217a", opacity: 0.65, lineWidth: 10 },
        pink: { key: "pink", color: "#ee2080", opacity: 0.5, lineWidth: 10 },
        white: { key: "white", color: "white", opacity: 1, lineWidth: 10 },
        paleWhite: { key: "pwhite", color: "white", opacity: 0.6, lineWidth: 10 }
      },
      prevSvgHash: ""
    },
    hold: timer()
  };
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/svg.js
function createDefs() {
  const defs = createElement2("defs");
  const filter = setAttributes(createElement2("filter"), { id: "cg-filter-blur" });
  filter.appendChild(setAttributes(createElement2("feGaussianBlur"), { stdDeviation: "0.013" }));
  defs.appendChild(filter);
  return defs;
}
function renderSvg(state, els) {
  const d = state.drawable, curD = d.current, cur = curD && curD.mouseSq ? curD : void 0, dests = /* @__PURE__ */ new Map(), bounds = state.dom.bounds(), nonPieceAutoShapes = d.autoShapes.filter((autoShape) => !autoShape.piece);
  for (const s of d.shapes.concat(nonPieceAutoShapes).concat(cur ? [cur] : [])) {
    if (!s.dest)
      continue;
    const sources = dests.get(s.dest) ?? /* @__PURE__ */ new Set(), from = pos2user(orient(key2pos(s.orig), state.orientation), bounds), to = pos2user(orient(key2pos(s.dest), state.orientation), bounds);
    sources.add(angleToSlot(moveAngle(from, to)));
    dests.set(s.dest, sources);
  }
  const shapes = [];
  const pendingEraseIdx = cur ? d.shapes.findIndex((s) => sameEndpoints(s, cur) && sameColor(s, cur)) : -1;
  for (const [idx, s] of d.shapes.concat(nonPieceAutoShapes).entries()) {
    const isPendingErase = pendingEraseIdx !== -1 && pendingEraseIdx === idx;
    shapes.push({
      shape: s,
      current: false,
      pendingErase: isPendingErase,
      hash: shapeHash(s, isShort(s.dest, dests), false, bounds, isPendingErase, angleCount(s.dest, dests))
    });
  }
  if (cur && pendingEraseIdx === -1)
    shapes.push({
      shape: cur,
      current: true,
      hash: shapeHash(cur, isShort(cur.dest, dests), true, bounds, false, angleCount(cur.dest, dests)),
      pendingErase: false
    });
  const fullHash = shapes.map((sc) => sc.hash).join(";");
  if (fullHash === state.drawable.prevSvgHash)
    return;
  state.drawable.prevSvgHash = fullHash;
  syncDefs(d, shapes, els);
  syncShapes(shapes, els, (s) => renderShape(state, s, d.brushes, dests, bounds));
}
function syncDefs(d, shapes, els) {
  for (const shapesEl of [els.shapes, els.shapesBelow]) {
    const defsEl = shapesEl.querySelector("defs");
    const thisPlane = shapes.filter((s) => shapesEl === els.shapesBelow === !!s.shape.below);
    const brushes2 = /* @__PURE__ */ new Map();
    for (const s of thisPlane.filter((s2) => s2.shape.dest && s2.shape.brush)) {
      const brush = makeCustomBrush(d.brushes[s.shape.brush], s.shape.modifiers);
      const { key, color } = hiliteOf(s.shape);
      if (key && color)
        brushes2.set(key, { key, color, opacity: 1, lineWidth: 1 });
      brushes2.set(brush.key, brush);
    }
    const keysInDom = /* @__PURE__ */ new Set();
    let el = defsEl.firstElementChild;
    while (el) {
      keysInDom.add(el.getAttribute("cgKey"));
      el = el.nextElementSibling;
    }
    for (const [key, brush] of brushes2.entries()) {
      if (!keysInDom.has(key))
        defsEl.appendChild(renderMarker(brush));
    }
  }
}
function syncShapes(shapes, els, renderShape3) {
  for (const [shapesEl, customEl] of [
    [els.shapes, els.custom],
    [els.shapesBelow, els.customBelow]
  ]) {
    const [shapesG, customG] = [shapesEl, customEl].map((el) => el.querySelector("g"));
    const thisPlane = shapes.filter((s) => shapesEl === els.shapesBelow === !!s.shape.below);
    const hashesInDom = /* @__PURE__ */ new Map();
    for (const sc of thisPlane)
      hashesInDom.set(sc.hash, false);
    for (const root of [shapesG, customG]) {
      const toRemove = [];
      let el = root.firstElementChild, elHash;
      while (el) {
        elHash = el.getAttribute("cgHash");
        if (hashesInDom.has(elHash))
          hashesInDom.set(elHash, true);
        else
          toRemove.push(el);
        el = el.nextElementSibling;
      }
      for (const el2 of toRemove)
        root.removeChild(el2);
    }
    for (const sc of thisPlane.filter((s) => !hashesInDom.get(s.hash))) {
      for (const svg of renderShape3(sc)) {
        if (svg.isCustom)
          customG.appendChild(svg.el);
        else
          shapesG.appendChild(svg.el);
      }
    }
  }
}
function shapeHash({ orig, dest, brush, piece, modifiers, customSvg, label, below }, shorten, current2, bounds, pendingErase, angleCountOfDest) {
  return [
    bounds.width,
    bounds.height,
    current2,
    pendingErase && "pendingErase",
    angleCountOfDest,
    orig,
    dest,
    brush,
    shorten && "-",
    piece && pieceHash(piece),
    modifiers && modifiersHash(modifiers),
    customSvg && `custom-${textHash(customSvg.html)},${customSvg.center?.[0] ?? "o"}`,
    label && `label-${textHash(label.text)}`,
    below && "below"
  ].filter((x) => x).join(",");
}
var pieceHash = (piece) => [piece.color, piece.role, piece.scale].filter((x) => x).join(",");
var modifiersHash = (m) => [m.lineWidth, m.hilite].filter((x) => x).join(",");
function textHash(s) {
  let h2 = 0;
  for (let i = 0; i < s.length; i++) {
    h2 = (h2 << 5) - h2 + s.charCodeAt(i) >>> 0;
  }
  return h2.toString();
}
function renderShape(state, { shape, current: current2, pendingErase, hash: hash2 }, brushes2, dests, bounds) {
  const from = pos2user(orient(key2pos(shape.orig), state.orientation), bounds), to = shape.dest ? pos2user(orient(key2pos(shape.dest), state.orientation), bounds) : from, brush = shape.brush && makeCustomBrush(brushes2[shape.brush], shape.modifiers), slots = dests.get(shape.dest), svgs = [];
  if (brush) {
    const el = setAttributes(createElement2("g"), { cgHash: hash2 });
    svgs.push({ el });
    if (from[0] !== to[0] || from[1] !== to[1])
      el.appendChild(renderArrow(shape, brush, from, to, current2, isShort(shape.dest, dests), pendingErase));
    else
      el.appendChild(renderCircle(brushes2[shape.brush], from, current2, bounds, pendingErase));
  }
  if (shape.label) {
    const label = shape.label;
    label.fill ?? (label.fill = shape.brush && brushes2[shape.brush].color);
    const corner = shape.brush ? void 0 : "tr";
    svgs.push({ el: renderLabel(label, hash2, from, to, slots, corner), isCustom: true });
  }
  if (shape.customSvg) {
    const on = shape.customSvg.center ?? "orig";
    const [x, y] = on === "label" ? labelCoords(from, to, slots).map((c) => c - 0.5) : on === "dest" ? to : from;
    const el = setAttributes(createElement2("g"), { transform: `translate(${x},${y})`, cgHash: hash2 });
    el.innerHTML = `<svg width="1" height="1" viewBox="0 0 100 100">${shape.customSvg.html}</svg>`;
    svgs.push({ el, isCustom: true });
  }
  return svgs;
}
function renderCircle(brush, at, current2, bounds, pendingErase) {
  const widths = circleWidth(), radius = (bounds.width + bounds.height) / (4 * Math.max(bounds.width, bounds.height));
  return setAttributes(createElement2("circle"), {
    stroke: brush.color,
    "stroke-width": widths[current2 ? 0 : 1],
    fill: "none",
    opacity: opacity(brush, current2, pendingErase),
    cx: at[0],
    cy: at[1],
    r: radius - widths[1] / 2
  });
}
function renderArrow(s, brush, from, to, current2, shorten, pendingErase) {
  function renderLine(isHilite) {
    const m = arrowMargin(shorten && !current2), dx = to[0] - from[0], dy = to[1] - from[1], angle = Math.atan2(dy, dx), xo = Math.cos(angle) * m, yo = Math.sin(angle) * m;
    const hilite = hiliteOf(s);
    return setAttributes(createElement2("line"), {
      stroke: isHilite ? hilite.color : brush.color,
      "stroke-width": lineWidth(brush, current2) * (isHilite ? 1.14 : 1),
      "stroke-linecap": "round",
      "marker-end": `url(#arrowhead-${isHilite ? hilite.key : brush.key})`,
      opacity: s.modifiers?.hilite && !pendingErase ? 1 : opacity(brush, current2, pendingErase),
      x1: from[0],
      y1: from[1],
      x2: to[0] - xo,
      y2: to[1] - yo
    });
  }
  if (!s.modifiers?.hilite)
    return renderLine(false);
  const g = setAttributes(createElement2("g"), { opacity: brush.opacity });
  const blurred = setAttributes(createElement2("g"), { filter: "url(#cg-filter-blur)" });
  blurred.appendChild(filterBox(from, to));
  blurred.appendChild(renderLine(true));
  g.appendChild(blurred);
  g.appendChild(renderLine(false));
  return g;
}
function renderMarker(brush) {
  const marker = setAttributes(createElement2("marker"), {
    id: "arrowhead-" + brush.key,
    orient: "auto",
    overflow: "visible",
    markerWidth: 4,
    markerHeight: 4,
    refX: brush.key.startsWith("hilite") ? 1.86 : 2.05,
    refY: 2
  });
  marker.appendChild(setAttributes(createElement2("path"), {
    d: "M0,0 V4 L3,2 Z",
    fill: brush.color
  }));
  marker.setAttribute("cgKey", brush.key);
  return marker;
}
function renderLabel(label, hash2, from, to, slots, corner) {
  const labelSize = 0.4, fontSize = labelSize * 0.75 ** label.text.length, at = labelCoords(from, to, slots), cornerOff = corner === "tr" ? 0.4 : 0, g = setAttributes(createElement2("g"), {
    transform: `translate(${at[0] + cornerOff},${at[1] - cornerOff})`,
    cgHash: hash2
  });
  g.appendChild(setAttributes(createElement2("circle"), {
    r: labelSize / 2,
    "fill-opacity": corner ? 1 : 0.8,
    "stroke-opacity": corner ? 1 : 0.7,
    "stroke-width": 0.03,
    fill: label.fill ?? "#666",
    stroke: "white"
  }));
  const labelEl = setAttributes(createElement2("text"), {
    "font-size": fontSize,
    "font-family": "Noto Sans",
    "text-anchor": "middle",
    fill: "white",
    y: 0.13 * 0.75 ** label.text.length
  });
  labelEl.innerHTML = label.text;
  g.appendChild(labelEl);
  return g;
}
var orient = (pos, color) => color === "white" ? pos : [7 - pos[0], 7 - pos[1]];
var mod = (n, m) => (n % m + m) % m;
var rotateAngleSlot = (slot, steps) => mod(slot + steps, 16);
var anyTwoCloserThan90Degrees = (slots) => [...slots].some((slot) => [-3, -2, -1, 1, 2, 3].some((i) => slots.has(rotateAngleSlot(slot, i))));
var isShort = (dest, dests) => !!dest && dests.has(dest) && anyTwoCloserThan90Degrees(dests.get(dest));
var createElement2 = (tagName2) => document.createElementNS("http://www.w3.org/2000/svg", tagName2);
var angleCount = (dest, dests) => dest && dests.has(dest) ? dests.get(dest).size : 0;
function setAttributes(el, attrs) {
  for (const key in attrs) {
    if (Object.prototype.hasOwnProperty.call(attrs, key))
      el.setAttribute(key, attrs[key]);
  }
  return el;
}
var makeCustomBrush = (base, modifiers) => !modifiers ? base : {
  color: base.color,
  opacity: Math.round(base.opacity * 10) / 10,
  lineWidth: Math.round(modifiers.lineWidth || base.lineWidth),
  key: [base.key, modifiers.lineWidth].filter((x) => x).join("")
};
var circleWidth = () => [3 / 64, 4 / 64];
var lineWidth = (brush, current2) => (brush.lineWidth || 10) * (current2 ? 0.85 : 1) / 64;
function hiliteOf(shape) {
  const hilite = shape.modifiers?.hilite;
  return { key: hilite && `hilite-${hilite.replace("#", "")}`, color: hilite };
}
var opacity = (brush, current2, pendingErase) => (brush.opacity || 1) * (pendingErase ? 0.6 : current2 ? 0.9 : 1);
var arrowMargin = (shorten) => (shorten ? 20 : 10) / 64;
function pos2user(pos, bounds) {
  const xScale = Math.min(1, bounds.width / bounds.height);
  const yScale = Math.min(1, bounds.height / bounds.width);
  return [(pos[0] - 3.5) * xScale, (3.5 - pos[1]) * yScale];
}
function filterBox(from, to) {
  const box = {
    from: [Math.floor(Math.min(from[0], to[0])), Math.floor(Math.min(from[1], to[1]))],
    to: [Math.ceil(Math.max(from[0], to[0])), Math.ceil(Math.max(from[1], to[1]))]
  };
  return setAttributes(createElement2("rect"), {
    x: box.from[0],
    y: box.from[1],
    width: box.to[0] - box.from[0],
    height: box.to[1] - box.from[1],
    fill: "none",
    stroke: "none"
  });
}
var angleToSlot = (angle) => mod(Math.round(angle * 8 / Math.PI), 16);
var moveAngle = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]) + Math.PI;
var dist = (from, to) => Math.sqrt([from[0] - to[0], from[1] - to[1]].reduce((acc, x) => acc + x * x, 0));
function labelCoords(from, to, slots) {
  let mag = dist(from, to);
  const angle = moveAngle(from, to);
  if (slots) {
    mag -= 33 / 64;
    if (anyTwoCloserThan90Degrees(slots)) {
      mag -= 10 / 64;
      const slot = angleToSlot(angle);
      if (slot & 1 && [-1, 1].some((s) => slots.has(rotateAngleSlot(slot, s))))
        mag -= 0.4;
    }
  }
  return [from[0] - Math.cos(angle) * mag, from[1] - Math.sin(angle) * mag].map((c) => c + 0.5);
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/wrap.js
function renderWrap(element, s) {
  element.innerHTML = "";
  element.classList.add("cg-wrap");
  for (const c of colors)
    element.classList.toggle("orientation-" + c, s.orientation === c);
  element.classList.toggle("manipulable", !s.viewOnly);
  const container = createEl("cg-container");
  element.appendChild(container);
  const board = createEl("cg-board");
  container.appendChild(board);
  let shapesBelow;
  let shapes;
  let customBelow;
  let custom;
  let autoPieces;
  if (s.drawable.visible) {
    [shapesBelow, shapes] = ["cg-shapes-below", "cg-shapes"].map((cls) => svgContainer(cls, true));
    [customBelow, custom] = ["cg-custom-below", "cg-custom-svgs"].map((cls) => svgContainer(cls, false));
    autoPieces = createEl("cg-auto-pieces");
    container.appendChild(shapesBelow);
    container.appendChild(customBelow);
    container.appendChild(shapes);
    container.appendChild(custom);
    container.appendChild(autoPieces);
  }
  if (s.coordinates) {
    const orientClass = s.orientation === "black" ? " black" : "";
    const ranksPositionClass = s.ranksPosition === "left" ? " left" : "";
    if (s.coordinatesOnSquares) {
      const rankN = s.orientation === "white" ? (i) => i + 1 : (i) => 8 - i;
      files.forEach((f, i) => container.appendChild(renderCoords(ranks.map((r) => f + r), "squares rank" + rankN(i) + orientClass + ranksPositionClass, i % 2 === 0 ? "black" : "white")));
    } else {
      container.appendChild(renderCoords(ranks, "ranks" + orientClass + ranksPositionClass, s.ranksPosition === "right" === (s.orientation === "white") ? "white" : "black"));
      container.appendChild(renderCoords(files, "files" + orientClass, opposite2(s.orientation)));
    }
  }
  let ghost;
  if (!s.viewOnly && s.draggable.enabled && s.draggable.showGhost) {
    ghost = createEl("piece", "ghost");
    setVisible(ghost, false);
    container.appendChild(ghost);
  }
  return { board, container, wrap: element, ghost, shapes, shapesBelow, custom, customBelow, autoPieces };
}
function svgContainer(cls, isShapes) {
  const svg = setAttributes(createElement2("svg"), {
    class: cls,
    viewBox: isShapes ? "-4 -4 8 8" : "-3.5 -3.5 8 8",
    preserveAspectRatio: "xMidYMid slice"
  });
  if (isShapes)
    svg.appendChild(createDefs());
  svg.appendChild(createElement2("g"));
  return svg;
}
function renderCoords(elems, className, firstColor) {
  const el = createEl("coords", className);
  let f;
  elems.forEach((elem, i) => {
    const light = i % 2 === (firstColor === "white" ? 0 : 1);
    f = createEl("coord", `coord-${light ? "light" : "dark"}`);
    f.textContent = elem;
    el.appendChild(f);
  });
  return el;
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/drop.js
function drop(s, e) {
  if (!s.dropmode.active)
    return;
  unsetPremove(s);
  unsetPredrop(s);
  const piece = s.dropmode.piece;
  if (piece) {
    s.pieces.set("a0", piece);
    const position = eventPosition(e);
    const dest = position && getKeyAtDomPos(position, whitePov(s), s.dom.bounds());
    if (dest)
      dropNewPiece(s, "a0", dest);
  }
  s.dom.redraw();
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/events.js
function bindBoard(s, onResize) {
  const boardEl = s.dom.elements.board;
  if ("ResizeObserver" in window)
    new ResizeObserver(onResize).observe(s.dom.elements.wrap);
  if (s.disableContextMenu || s.drawable.enabled) {
    boardEl.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  if (s.viewOnly)
    return;
  const onStart = startDragOrDraw(s);
  boardEl.addEventListener("touchstart", onStart, {
    passive: false
  });
  boardEl.addEventListener("mousedown", onStart, {
    passive: false
  });
}
function bindDocument(s, onResize) {
  const unbinds = [];
  if (!("ResizeObserver" in window))
    unbinds.push(unbindable(document.body, "chessground.resize", onResize));
  if (!s.viewOnly) {
    const onmove = dragOrDraw(s, move2, move);
    const onend = dragOrDraw(s, end2, end);
    for (const ev of ["touchmove", "mousemove"])
      unbinds.push(unbindable(document, ev, onmove));
    for (const ev of ["touchend", "mouseup"])
      unbinds.push(unbindable(document, ev, onend));
    const onScroll = () => s.dom.bounds.clear();
    unbinds.push(unbindable(document, "scroll", onScroll, { capture: true, passive: true }));
    unbinds.push(unbindable(window, "resize", onScroll, { passive: true }));
  }
  return () => unbinds.forEach((f) => f());
}
function unbindable(el, eventName, callback, options) {
  el.addEventListener(eventName, callback, options);
  return () => el.removeEventListener(eventName, callback, options);
}
var startDragOrDraw = (s) => (e) => {
  if (s.draggable.current)
    cancel2(s);
  else if (s.drawable.current)
    cancel(s);
  else if (e.shiftKey || isRightButton(e)) {
    if (s.drawable.enabled)
      start(s, e);
  } else if (!s.viewOnly) {
    if (s.dropmode.active)
      drop(s, e);
    else
      start2(s, e);
  }
};
var dragOrDraw = (s, withDrag, withDraw) => (e) => {
  if (s.drawable.current) {
    if (s.drawable.enabled)
      withDraw(s, e);
  } else if (!s.viewOnly)
    withDrag(s, e);
};

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/render.js
function render2(s) {
  const asWhite = whitePov(s), posToTranslate2 = posToTranslate(s.dom.bounds()), boardEl = s.dom.elements.board, pieces = s.pieces, curAnim = s.animation.current, anims = curAnim ? curAnim.plan.anims : /* @__PURE__ */ new Map(), fadings = curAnim ? curAnim.plan.fadings : /* @__PURE__ */ new Map(), curDrag = s.draggable.current, samePieces = /* @__PURE__ */ new Set(), movedPieces = /* @__PURE__ */ new Map(), desiredSquares = computeSquareClasses(s), availableSquares = /* @__PURE__ */ new Map();
  let k, el, pieceAtKey, elPieceName, anim2, fading, pMvdset, pMvd, sAvail;
  el = boardEl.firstChild;
  while (el) {
    k = el.cgKey;
    if (isPieceNode(el)) {
      pieceAtKey = pieces.get(k);
      anim2 = anims.get(k);
      fading = fadings.get(k);
      elPieceName = el.cgPiece;
      if (el.cgDragging && (!curDrag || curDrag.orig !== k)) {
        el.classList.remove("dragging");
        translate(el, posToTranslate2(key2pos(k), asWhite));
        el.cgDragging = false;
      }
      if (!fading && el.cgFading) {
        el.cgFading = false;
        el.classList.remove("fading");
      }
      if (pieceAtKey) {
        if (anim2 && el.cgAnimating && elPieceName === pieceNameOf(pieceAtKey)) {
          const pos = key2pos(k);
          pos[0] += anim2[2];
          pos[1] += anim2[3];
          el.classList.add("anim");
          translate(el, posToTranslate2(pos, asWhite));
        } else if (el.cgAnimating) {
          el.cgAnimating = false;
          el.classList.remove("anim");
          translate(el, posToTranslate2(key2pos(k), asWhite));
          if (s.addPieceZIndex)
            el.style.zIndex = posZIndex(key2pos(k), asWhite);
        }
        if (elPieceName === pieceNameOf(pieceAtKey) && (!fading || !el.cgFading))
          samePieces.add(k);
        else if (fading && elPieceName === pieceNameOf(fading)) {
          el.classList.add("fading");
          el.cgFading = true;
        } else
          appendValue(movedPieces, elPieceName, el);
      } else
        appendValue(movedPieces, elPieceName, el);
    } else if (isSquareNode(el)) {
      const cls = el.className;
      if (desiredSquares.get(k) === cls) {
        setVisible(el, true);
        desiredSquares.delete(k);
      } else
        appendValue(availableSquares, cls, el);
    }
    el = el.nextSibling;
  }
  for (const [sk, className] of desiredSquares) {
    sAvail = availableSquares.get(className)?.pop();
    const translation = posToTranslate2(key2pos(sk), asWhite);
    if (sAvail) {
      sAvail.cgKey = sk;
      if (s.jsHover)
        sAvail.dataset["key"] = sk;
      translate(sAvail, translation);
      setVisible(sAvail, true);
    } else {
      const squareNode = createEl("square", className);
      squareNode.cgKey = sk;
      if (s.jsHover)
        squareNode.dataset["key"] = sk;
      translate(squareNode, translation);
      boardEl.insertBefore(squareNode, boardEl.firstChild);
    }
  }
  for (const [_, nodes] of availableSquares.entries()) {
    for (const node of nodes)
      setVisible(node, false);
  }
  for (const [k2, p] of pieces) {
    anim2 = anims.get(k2);
    if (!samePieces.has(k2)) {
      pMvdset = movedPieces.get(pieceNameOf(p));
      pMvd = pMvdset && pMvdset.pop();
      if (pMvd) {
        pMvd.cgKey = k2;
        if (pMvd.cgFading) {
          pMvd.classList.remove("fading");
          pMvd.cgFading = false;
        }
        const pos = key2pos(k2);
        if (s.addPieceZIndex)
          pMvd.style.zIndex = posZIndex(pos, asWhite);
        if (anim2) {
          pMvd.cgAnimating = true;
          pMvd.classList.add("anim");
          pos[0] += anim2[2];
          pos[1] += anim2[3];
        }
        translate(pMvd, posToTranslate2(pos, asWhite));
      } else {
        const pieceName = pieceNameOf(p), pieceNode = createEl("piece", pieceName), pos = key2pos(k2);
        pieceNode.cgPiece = pieceName;
        pieceNode.cgKey = k2;
        if (anim2) {
          pieceNode.cgAnimating = true;
          pos[0] += anim2[2];
          pos[1] += anim2[3];
        }
        translate(pieceNode, posToTranslate2(pos, asWhite));
        if (s.addPieceZIndex)
          pieceNode.style.zIndex = posZIndex(pos, asWhite);
        boardEl.appendChild(pieceNode);
      }
    }
  }
  for (const nodes of movedPieces.values())
    removeNodes(s, nodes);
}
function renderResized(s) {
  const asWhite = whitePov(s), posToTranslate2 = posToTranslate(s.dom.bounds());
  let el = s.dom.elements.board.firstChild;
  while (el) {
    if (isPieceNode(el) && !el.cgAnimating || isSquareNode(el)) {
      translate(el, posToTranslate2(key2pos(el.cgKey), asWhite));
    }
    el = el.nextSibling;
  }
}
function updateBounds(s) {
  const bounds = s.dom.elements.wrap.getBoundingClientRect();
  const container = s.dom.elements.container;
  const ratio = bounds.height / bounds.width;
  const width = Math.floor(bounds.width * window.devicePixelRatio / 8) * 8 / window.devicePixelRatio;
  const height = width * ratio;
  container.style.width = width + "px";
  container.style.height = height + "px";
  s.dom.bounds.clear();
  s.addDimensionsCssVarsTo?.style.setProperty("---cg-width", width + "px");
  s.addDimensionsCssVarsTo?.style.setProperty("---cg-height", height + "px");
}
var isPieceNode = (el) => el.tagName === "PIECE";
var isSquareNode = (el) => el.tagName === "SQUARE";
function removeNodes(s, nodes) {
  for (const node of nodes)
    s.dom.elements.board.removeChild(node);
}
function posZIndex(pos, asWhite) {
  const minZ = 3;
  const rank = pos[1];
  const z = asWhite ? minZ + 7 - rank : minZ + rank;
  return `${z}`;
}
var pieceNameOf = (piece) => `${piece.color} ${piece.role}`;
var normalizeLastMoveStandardRookCastle = (s, k) => !!s.lastMove?.[1] && !s.pieces.has(s.lastMove[1]) && s.lastMove[0][0] === "e" && ["h", "a"].includes(s.lastMove[1][0]) && s.lastMove[0][1] === s.lastMove[1][1] && squaresBetween(...key2pos(s.lastMove[0]), ...key2pos(s.lastMove[1])).some((sq) => s.pieces.has(sq)) ? (k > s.lastMove[0] ? "g" : "c") + k[1] : k;
function computeSquareClasses(s) {
  const squares = /* @__PURE__ */ new Map();
  if (s.lastMove && s.highlight.lastMove)
    for (const [i, k] of s.lastMove.entries())
      addSquare(squares, i === 1 ? normalizeLastMoveStandardRookCastle(s, k) : k, "last-move");
  if (s.check && s.highlight.check)
    addSquare(squares, s.check, "check");
  if (s.selected) {
    addSquare(squares, s.selected, "selected");
    if (s.movable.showDests) {
      for (const k of s.movable.dests?.get(s.selected) ?? [])
        addSquare(squares, k, "move-dest" + (s.pieces.has(k) ? " oc" : ""));
      for (const k of s.premovable.customDests?.get(s.selected) ?? s.premovable.dests ?? [])
        addSquare(squares, k, "premove-dest" + (s.pieces.has(k) ? " oc" : ""));
    }
  }
  const premove2 = s.premovable.current;
  if (premove2)
    for (const k of premove2)
      addSquare(squares, k, "current-premove");
  else if (s.predroppable.current)
    addSquare(squares, s.predroppable.current.key, "current-premove");
  const o = s.exploding;
  if (o)
    for (const k of o.keys)
      addSquare(squares, k, "exploding" + o.stage);
  if (s.highlight.custom) {
    s.highlight.custom.forEach((v, k) => {
      addSquare(squares, k, v);
    });
  }
  return squares;
}
function addSquare(squares, key, klass) {
  const classes = squares.get(key);
  if (classes)
    squares.set(key, `${classes} ${klass}`);
  else
    squares.set(key, klass);
}
function appendValue(map, key, value) {
  const arr = map.get(key);
  if (arr)
    arr.push(value);
  else
    map.set(key, [value]);
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/sync.js
function syncShapes2(shapes, root, renderShape3) {
  const hashesInDom = /* @__PURE__ */ new Map(), toRemove = [];
  for (const sc of shapes)
    hashesInDom.set(sc.hash, false);
  let el = root.firstElementChild, elHash;
  while (el) {
    elHash = el.getAttribute("cgHash");
    if (hashesInDom.has(elHash))
      hashesInDom.set(elHash, true);
    else
      toRemove.push(el);
    el = el.nextElementSibling;
  }
  for (const el2 of toRemove)
    root.removeChild(el2);
  for (const sc of shapes) {
    if (!hashesInDom.get(sc.hash))
      root.appendChild(renderShape3(sc));
  }
}

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/autoPieces.js
function render3(state, autoPieceEl) {
  const autoPieces = state.drawable.autoShapes.filter((autoShape) => autoShape.piece);
  const autoPieceShapes = autoPieces.map((s) => {
    return {
      shape: s,
      hash: hash(s),
      current: false,
      pendingErase: false
    };
  });
  syncShapes2(autoPieceShapes, autoPieceEl, (shape) => renderShape2(state, shape, state.dom.bounds()));
}
function renderResized2(state) {
  const asWhite = whitePov(state), posToTranslate2 = posToTranslate(state.dom.bounds());
  let el = state.dom.elements.autoPieces?.firstChild;
  while (el) {
    translateAndScale(el, posToTranslate2(key2pos(el.cgKey), asWhite), el.cgScale);
    el = el.nextSibling;
  }
}
function renderShape2(state, { shape, hash: hash2 }, bounds) {
  const orig = shape.orig;
  const role = shape.piece?.role;
  const color = shape.piece?.color;
  const scale = shape.piece?.scale;
  const pieceEl = createEl("piece", `${role} ${color}`);
  pieceEl.setAttribute("cgHash", hash2);
  pieceEl.cgKey = orig;
  pieceEl.cgScale = scale;
  translateAndScale(pieceEl, posToTranslate(bounds)(key2pos(orig), whitePov(state)), scale);
  return pieceEl;
}
var hash = (autoPiece) => [autoPiece.orig, autoPiece.piece?.role, autoPiece.piece?.color, autoPiece.piece?.scale].join(",");

// node_modules/.pnpm/@lichess-org+chessground@10.1.0/node_modules/@lichess-org/chessground/dist/chessground.js
function Chessground(element, config) {
  const maybeState = defaults();
  configure(maybeState, config || {});
  function redrawAll() {
    const prevUnbind = "dom" in maybeState ? maybeState.dom.unbind : void 0;
    const elements = renderWrap(element, maybeState), bounds = memo(() => elements.board.getBoundingClientRect()), redrawNow = (skipSvg) => {
      render2(state);
      if (elements.autoPieces)
        render3(state, elements.autoPieces);
      if (!skipSvg && elements.shapes)
        renderSvg(state, elements);
    }, onResize = () => {
      updateBounds(state);
      renderResized(state);
      if (elements.autoPieces)
        renderResized2(state);
    };
    const state = maybeState;
    state.dom = {
      elements,
      bounds,
      redraw: debounceRedraw(redrawNow),
      redrawNow,
      unbind: prevUnbind
    };
    state.drawable.prevSvgHash = "";
    updateBounds(state);
    redrawNow(false);
    bindBoard(state, onResize);
    if (!prevUnbind)
      state.dom.unbind = bindDocument(state, onResize);
    state.events.insert && state.events.insert(elements);
    return state;
  }
  return start3(redrawAll(), redrawAll);
}
function debounceRedraw(redrawNow) {
  let redrawing = false;
  return () => {
    if (redrawing)
      return;
    redrawing = true;
    requestAnimationFrame(() => {
      redrawNow();
      redrawing = false;
    });
  };
}

// node_modules/.pnpm/@badrap+result@0.3.1/node_modules/@badrap/result/dist/mjs/index.mjs
var _Result = class {
  unwrap(ok, err) {
    const r = this._chain((value) => Result.ok(ok ? ok(value) : value), (error) => err ? Result.ok(err(error)) : Result.err(error));
    if (r.isErr) {
      throw r.error;
    }
    return r.value;
  }
  map(ok, err) {
    return this._chain((value) => Result.ok(ok(value)), (error) => Result.err(err ? err(error) : error));
  }
  chain(ok, err) {
    return this._chain(ok, err !== null && err !== void 0 ? err : ((error) => Result.err(error)));
  }
};
var _Ok = class extends _Result {
  constructor(value) {
    super();
    this.value = value;
    this.isOk = true;
    this.isErr = false;
  }
  _chain(ok, _err) {
    return ok(this.value);
  }
};
var _Err = class extends _Result {
  constructor(error) {
    super();
    this.error = error;
    this.isOk = false;
    this.isErr = true;
  }
  _chain(_ok, err) {
    return err(this.error);
  }
};
var Result;
(function(Result2) {
  function ok(value) {
    return new _Ok(value);
  }
  Result2.ok = ok;
  function err(error) {
    return new _Err(error || new Error());
  }
  Result2.err = err;
  function all(obj) {
    if (Array.isArray(obj)) {
      const res2 = [];
      for (let i = 0; i < obj.length; i++) {
        const item = obj[i];
        if (item.isErr) {
          return item;
        }
        res2.push(item.value);
      }
      return Result2.ok(res2);
    }
    const res = {};
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const item = obj[keys[i]];
      if (item.isErr) {
        return item;
      }
      res[keys[i]] = item.value;
    }
    return Result2.ok(res);
  }
  Result2.all = all;
})(Result || (Result = {}));

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/squareSet.js
var popcnt32 = (n) => {
  n = n - (n >>> 1 & 1431655765);
  n = (n & 858993459) + (n >>> 2 & 858993459);
  return Math.imul(n + (n >>> 4) & 252645135, 16843009) >> 24;
};
var bswap32 = (n) => {
  n = n >>> 8 & 16711935 | (n & 16711935) << 8;
  return n >>> 16 & 65535 | (n & 65535) << 16;
};
var rbit32 = (n) => {
  n = n >>> 1 & 1431655765 | (n & 1431655765) << 1;
  n = n >>> 2 & 858993459 | (n & 858993459) << 2;
  n = n >>> 4 & 252645135 | (n & 252645135) << 4;
  return bswap32(n);
};
var SquareSet = class _SquareSet {
  constructor(lo, hi) {
    this.lo = lo | 0;
    this.hi = hi | 0;
  }
  static fromSquare(square) {
    return square >= 32 ? new _SquareSet(0, 1 << square - 32) : new _SquareSet(1 << square, 0);
  }
  static fromRank(rank) {
    return new _SquareSet(255, 0).shl64(8 * rank);
  }
  static fromFile(file) {
    return new _SquareSet(16843009 << file, 16843009 << file);
  }
  static empty() {
    return new _SquareSet(0, 0);
  }
  static full() {
    return new _SquareSet(4294967295, 4294967295);
  }
  static corners() {
    return new _SquareSet(129, 2164260864);
  }
  static center() {
    return new _SquareSet(402653184, 24);
  }
  static backranks() {
    return new _SquareSet(255, 4278190080);
  }
  static backrank(color) {
    return color === "white" ? new _SquareSet(255, 0) : new _SquareSet(0, 4278190080);
  }
  static lightSquares() {
    return new _SquareSet(1437226410, 1437226410);
  }
  static darkSquares() {
    return new _SquareSet(2857740885, 2857740885);
  }
  complement() {
    return new _SquareSet(~this.lo, ~this.hi);
  }
  xor(other) {
    return new _SquareSet(this.lo ^ other.lo, this.hi ^ other.hi);
  }
  union(other) {
    return new _SquareSet(this.lo | other.lo, this.hi | other.hi);
  }
  intersect(other) {
    return new _SquareSet(this.lo & other.lo, this.hi & other.hi);
  }
  diff(other) {
    return new _SquareSet(this.lo & ~other.lo, this.hi & ~other.hi);
  }
  intersects(other) {
    return this.intersect(other).nonEmpty();
  }
  isDisjoint(other) {
    return this.intersect(other).isEmpty();
  }
  supersetOf(other) {
    return other.diff(this).isEmpty();
  }
  subsetOf(other) {
    return this.diff(other).isEmpty();
  }
  shr64(shift) {
    if (shift >= 64)
      return _SquareSet.empty();
    if (shift >= 32)
      return new _SquareSet(this.hi >>> shift - 32, 0);
    if (shift > 0)
      return new _SquareSet(this.lo >>> shift ^ this.hi << 32 - shift, this.hi >>> shift);
    return this;
  }
  shl64(shift) {
    if (shift >= 64)
      return _SquareSet.empty();
    if (shift >= 32)
      return new _SquareSet(0, this.lo << shift - 32);
    if (shift > 0)
      return new _SquareSet(this.lo << shift, this.hi << shift ^ this.lo >>> 32 - shift);
    return this;
  }
  bswap64() {
    return new _SquareSet(bswap32(this.hi), bswap32(this.lo));
  }
  rbit64() {
    return new _SquareSet(rbit32(this.hi), rbit32(this.lo));
  }
  minus64(other) {
    const lo = this.lo - other.lo;
    const c = (lo & other.lo & 1) + (other.lo >>> 1) + (lo >>> 1) >>> 31;
    return new _SquareSet(lo, this.hi - (other.hi + c));
  }
  equals(other) {
    return this.lo === other.lo && this.hi === other.hi;
  }
  size() {
    return popcnt32(this.lo) + popcnt32(this.hi);
  }
  isEmpty() {
    return this.lo === 0 && this.hi === 0;
  }
  nonEmpty() {
    return this.lo !== 0 || this.hi !== 0;
  }
  has(square) {
    return (square >= 32 ? this.hi & 1 << square - 32 : this.lo & 1 << square) !== 0;
  }
  set(square, on) {
    return on ? this.with(square) : this.without(square);
  }
  with(square) {
    return square >= 32 ? new _SquareSet(this.lo, this.hi | 1 << square - 32) : new _SquareSet(this.lo | 1 << square, this.hi);
  }
  without(square) {
    return square >= 32 ? new _SquareSet(this.lo, this.hi & ~(1 << square - 32)) : new _SquareSet(this.lo & ~(1 << square), this.hi);
  }
  toggle(square) {
    return square >= 32 ? new _SquareSet(this.lo, this.hi ^ 1 << square - 32) : new _SquareSet(this.lo ^ 1 << square, this.hi);
  }
  last() {
    if (this.hi !== 0)
      return 63 - Math.clz32(this.hi);
    if (this.lo !== 0)
      return 31 - Math.clz32(this.lo);
    return;
  }
  first() {
    if (this.lo !== 0)
      return 31 - Math.clz32(this.lo & -this.lo);
    if (this.hi !== 0)
      return 63 - Math.clz32(this.hi & -this.hi);
    return;
  }
  withoutFirst() {
    if (this.lo !== 0)
      return new _SquareSet(this.lo & this.lo - 1, this.hi);
    return new _SquareSet(0, this.hi & this.hi - 1);
  }
  moreThanOne() {
    return this.hi !== 0 && this.lo !== 0 || (this.lo & this.lo - 1) !== 0 || (this.hi & this.hi - 1) !== 0;
  }
  singleSquare() {
    return this.moreThanOne() ? void 0 : this.last();
  }
  *[Symbol.iterator]() {
    let lo = this.lo;
    let hi = this.hi;
    while (lo !== 0) {
      const idx = 31 - Math.clz32(lo & -lo);
      lo ^= 1 << idx;
      yield idx;
    }
    while (hi !== 0) {
      const idx = 31 - Math.clz32(hi & -hi);
      hi ^= 1 << idx;
      yield 32 + idx;
    }
  }
  *reversed() {
    let lo = this.lo;
    let hi = this.hi;
    while (hi !== 0) {
      const idx = 31 - Math.clz32(hi);
      hi ^= 1 << idx;
      yield 32 + idx;
    }
    while (lo !== 0) {
      const idx = 31 - Math.clz32(lo);
      lo ^= 1 << idx;
      yield idx;
    }
  }
};

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/attacks.js
var computeRange = (square, deltas) => {
  let range = SquareSet.empty();
  for (const delta of deltas) {
    const sq = square + delta;
    if (0 <= sq && sq < 64 && Math.abs(squareFile(square) - squareFile(sq)) <= 2) {
      range = range.with(sq);
    }
  }
  return range;
};
var tabulate = (f) => {
  const table = [];
  for (let square = 0; square < 64; square++)
    table[square] = f(square);
  return table;
};
var KING_ATTACKS = tabulate((sq) => computeRange(sq, [-9, -8, -7, -1, 1, 7, 8, 9]));
var KNIGHT_ATTACKS = tabulate((sq) => computeRange(sq, [-17, -15, -10, -6, 6, 10, 15, 17]));
var PAWN_ATTACKS = {
  white: tabulate((sq) => computeRange(sq, [7, 9])),
  black: tabulate((sq) => computeRange(sq, [-7, -9]))
};
var kingAttacks = (square) => KING_ATTACKS[square];
var knightAttacks = (square) => KNIGHT_ATTACKS[square];
var pawnAttacks = (color, square) => PAWN_ATTACKS[color][square];
var FILE_RANGE = tabulate((sq) => SquareSet.fromFile(squareFile(sq)).without(sq));
var RANK_RANGE = tabulate((sq) => SquareSet.fromRank(squareRank(sq)).without(sq));
var DIAG_RANGE = tabulate((sq) => {
  const diag = new SquareSet(134480385, 2151686160);
  const shift = 8 * (squareRank(sq) - squareFile(sq));
  return (shift >= 0 ? diag.shl64(shift) : diag.shr64(-shift)).without(sq);
});
var ANTI_DIAG_RANGE = tabulate((sq) => {
  const diag = new SquareSet(270549120, 16909320);
  const shift = 8 * (squareRank(sq) + squareFile(sq) - 7);
  return (shift >= 0 ? diag.shl64(shift) : diag.shr64(-shift)).without(sq);
});
var hyperbola = (bit, range, occupied) => {
  let forward = occupied.intersect(range);
  let reverse = forward.bswap64();
  forward = forward.minus64(bit);
  reverse = reverse.minus64(bit.bswap64());
  return forward.xor(reverse.bswap64()).intersect(range);
};
var fileAttacks = (square, occupied) => hyperbola(SquareSet.fromSquare(square), FILE_RANGE[square], occupied);
var rankAttacks = (square, occupied) => {
  const range = RANK_RANGE[square];
  let forward = occupied.intersect(range);
  let reverse = forward.rbit64();
  forward = forward.minus64(SquareSet.fromSquare(square));
  reverse = reverse.minus64(SquareSet.fromSquare(63 - square));
  return forward.xor(reverse.rbit64()).intersect(range);
};
var bishopAttacks = (square, occupied) => {
  const bit = SquareSet.fromSquare(square);
  return hyperbola(bit, DIAG_RANGE[square], occupied).xor(hyperbola(bit, ANTI_DIAG_RANGE[square], occupied));
};
var rookAttacks = (square, occupied) => fileAttacks(square, occupied).xor(rankAttacks(square, occupied));
var queenAttacks = (square, occupied) => bishopAttacks(square, occupied).xor(rookAttacks(square, occupied));
var attacks = (piece, square, occupied) => {
  switch (piece.role) {
    case "pawn":
      return pawnAttacks(piece.color, square);
    case "knight":
      return knightAttacks(square);
    case "bishop":
      return bishopAttacks(square, occupied);
    case "rook":
      return rookAttacks(square, occupied);
    case "queen":
      return queenAttacks(square, occupied);
    case "king":
      return kingAttacks(square);
  }
};
var ray = (a, b) => {
  const other = SquareSet.fromSquare(b);
  if (RANK_RANGE[a].intersects(other))
    return RANK_RANGE[a].with(a);
  if (ANTI_DIAG_RANGE[a].intersects(other))
    return ANTI_DIAG_RANGE[a].with(a);
  if (DIAG_RANGE[a].intersects(other))
    return DIAG_RANGE[a].with(a);
  if (FILE_RANGE[a].intersects(other))
    return FILE_RANGE[a].with(a);
  return SquareSet.empty();
};
var between = (a, b) => ray(a, b).intersect(SquareSet.full().shl64(a).xor(SquareSet.full().shl64(b))).withoutFirst();

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/board.js
var Board = class _Board {
  constructor() {
  }
  static default() {
    const board = new _Board();
    board.reset();
    return board;
  }
  /**
   * Resets all pieces to the default starting position for standard chess.
   */
  reset() {
    this.occupied = new SquareSet(65535, 4294901760);
    this.promoted = SquareSet.empty();
    this.white = new SquareSet(65535, 0);
    this.black = new SquareSet(0, 4294901760);
    this.pawn = new SquareSet(65280, 16711680);
    this.knight = new SquareSet(66, 1107296256);
    this.bishop = new SquareSet(36, 603979776);
    this.rook = new SquareSet(129, 2164260864);
    this.queen = new SquareSet(8, 134217728);
    this.king = new SquareSet(16, 268435456);
  }
  static empty() {
    const board = new _Board();
    board.clear();
    return board;
  }
  clear() {
    this.occupied = SquareSet.empty();
    this.promoted = SquareSet.empty();
    for (const color of COLORS)
      this[color] = SquareSet.empty();
    for (const role of ROLES)
      this[role] = SquareSet.empty();
  }
  clone() {
    const board = new _Board();
    board.occupied = this.occupied;
    board.promoted = this.promoted;
    for (const color of COLORS)
      board[color] = this[color];
    for (const role of ROLES)
      board[role] = this[role];
    return board;
  }
  getColor(square) {
    if (this.white.has(square))
      return "white";
    if (this.black.has(square))
      return "black";
    return;
  }
  getRole(square) {
    for (const role of ROLES) {
      if (this[role].has(square))
        return role;
    }
    return;
  }
  get(square) {
    const color = this.getColor(square);
    if (!color)
      return;
    const role = this.getRole(square);
    const promoted = this.promoted.has(square);
    return { color, role, promoted };
  }
  /**
   * Removes and returns the piece from the given `square`, if any.
   */
  take(square) {
    const piece = this.get(square);
    if (piece) {
      this.occupied = this.occupied.without(square);
      this[piece.color] = this[piece.color].without(square);
      this[piece.role] = this[piece.role].without(square);
      if (piece.promoted)
        this.promoted = this.promoted.without(square);
    }
    return piece;
  }
  /**
   * Put `piece` onto `square`, potentially replacing an existing piece.
   * Returns the existing piece, if any.
   */
  set(square, piece) {
    const old = this.take(square);
    this.occupied = this.occupied.with(square);
    this[piece.color] = this[piece.color].with(square);
    this[piece.role] = this[piece.role].with(square);
    if (piece.promoted)
      this.promoted = this.promoted.with(square);
    return old;
  }
  has(square) {
    return this.occupied.has(square);
  }
  *[Symbol.iterator]() {
    for (const square of this.occupied) {
      yield [square, this.get(square)];
    }
  }
  pieces(color, role) {
    return this[color].intersect(this[role]);
  }
  rooksAndQueens() {
    return this.rook.union(this.queen);
  }
  bishopsAndQueens() {
    return this.bishop.union(this.queen);
  }
  steppers() {
    return this.knight.union(this.pawn).union(this.king);
  }
  sliders() {
    return this.bishop.union(this.rook).union(this.queen);
  }
  /**
   * Finds the unique king of the given `color`, if any.
   */
  kingOf(color) {
    return this.pieces(color, "king").singleSquare();
  }
};

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/chess.js
var IllegalSetup;
(function(IllegalSetup2) {
  IllegalSetup2["Empty"] = "ERR_EMPTY";
  IllegalSetup2["OppositeCheck"] = "ERR_OPPOSITE_CHECK";
  IllegalSetup2["PawnsOnBackrank"] = "ERR_PAWNS_ON_BACKRANK";
  IllegalSetup2["Kings"] = "ERR_KINGS";
  IllegalSetup2["Variant"] = "ERR_VARIANT";
})(IllegalSetup || (IllegalSetup = {}));
var PositionError = class extends Error {
};
var attacksTo = (square, attacker, board, occupied) => board[attacker].intersect(rookAttacks(square, occupied).intersect(board.rooksAndQueens()).union(bishopAttacks(square, occupied).intersect(board.bishopsAndQueens())).union(knightAttacks(square).intersect(board.knight)).union(kingAttacks(square).intersect(board.king)).union(pawnAttacks(opposite(attacker), square).intersect(board.pawn)));
var Castles = class _Castles {
  constructor() {
  }
  static default() {
    const castles = new _Castles();
    castles.castlingRights = SquareSet.corners();
    castles.rook = {
      white: { a: 0, h: 7 },
      black: { a: 56, h: 63 }
    };
    castles.path = {
      white: { a: new SquareSet(14, 0), h: new SquareSet(96, 0) },
      black: { a: new SquareSet(0, 234881024), h: new SquareSet(0, 1610612736) }
    };
    return castles;
  }
  static empty() {
    const castles = new _Castles();
    castles.castlingRights = SquareSet.empty();
    castles.rook = {
      white: { a: void 0, h: void 0 },
      black: { a: void 0, h: void 0 }
    };
    castles.path = {
      white: { a: SquareSet.empty(), h: SquareSet.empty() },
      black: { a: SquareSet.empty(), h: SquareSet.empty() }
    };
    return castles;
  }
  clone() {
    const castles = new _Castles();
    castles.castlingRights = this.castlingRights;
    castles.rook = {
      white: { a: this.rook.white.a, h: this.rook.white.h },
      black: { a: this.rook.black.a, h: this.rook.black.h }
    };
    castles.path = {
      white: { a: this.path.white.a, h: this.path.white.h },
      black: { a: this.path.black.a, h: this.path.black.h }
    };
    return castles;
  }
  add(color, side, king2, rook2) {
    const kingTo = kingCastlesTo(color, side);
    const rookTo = rookCastlesTo(color, side);
    this.castlingRights = this.castlingRights.with(rook2);
    this.rook[color][side] = rook2;
    this.path[color][side] = between(rook2, rookTo).with(rookTo).union(between(king2, kingTo).with(kingTo)).without(king2).without(rook2);
  }
  static fromSetup(setup) {
    const castles = _Castles.empty();
    const rooks = setup.castlingRights.intersect(setup.board.rook);
    for (const color of COLORS) {
      const backrank = SquareSet.backrank(color);
      const king2 = setup.board.kingOf(color);
      if (!defined(king2) || !backrank.has(king2))
        continue;
      const side = rooks.intersect(setup.board[color]).intersect(backrank);
      const aSide = side.first();
      if (defined(aSide) && aSide < king2)
        castles.add(color, "a", king2, aSide);
      const hSide = side.last();
      if (defined(hSide) && king2 < hSide)
        castles.add(color, "h", king2, hSide);
    }
    return castles;
  }
  discardRook(square) {
    if (this.castlingRights.has(square)) {
      this.castlingRights = this.castlingRights.without(square);
      for (const color of COLORS) {
        for (const side of CASTLING_SIDES) {
          if (this.rook[color][side] === square)
            this.rook[color][side] = void 0;
        }
      }
    }
  }
  discardColor(color) {
    this.castlingRights = this.castlingRights.diff(SquareSet.backrank(color));
    this.rook[color].a = void 0;
    this.rook[color].h = void 0;
  }
};
var Position = class {
  constructor(rules) {
    this.rules = rules;
  }
  reset() {
    this.board = Board.default();
    this.pockets = void 0;
    this.turn = "white";
    this.castles = Castles.default();
    this.epSquare = void 0;
    this.remainingChecks = void 0;
    this.halfmoves = 0;
    this.fullmoves = 1;
  }
  setupUnchecked(setup) {
    this.board = setup.board.clone();
    this.board.promoted = SquareSet.empty();
    this.pockets = void 0;
    this.turn = setup.turn;
    this.castles = Castles.fromSetup(setup);
    this.epSquare = validEpSquare(this, setup.epSquare);
    this.remainingChecks = void 0;
    this.halfmoves = setup.halfmoves;
    this.fullmoves = setup.fullmoves;
  }
  // When subclassing overwrite at least:
  //
  // - static default()
  // - static fromSetup()
  // - static clone()
  //
  // - dests()
  // - isVariantEnd()
  // - variantOutcome()
  // - hasInsufficientMaterial()
  // - isStandardMaterial()
  kingAttackers(square, attacker, occupied) {
    return attacksTo(square, attacker, this.board, occupied);
  }
  playCaptureAt(square, captured) {
    this.halfmoves = 0;
    if (captured.role === "rook")
      this.castles.discardRook(square);
    if (this.pockets)
      this.pockets[opposite(captured.color)][captured.promoted ? "pawn" : captured.role]++;
  }
  ctx() {
    const variantEnd = this.isVariantEnd();
    const king2 = this.board.kingOf(this.turn);
    if (!defined(king2)) {
      return { king: king2, blockers: SquareSet.empty(), checkers: SquareSet.empty(), variantEnd, mustCapture: false };
    }
    const snipers = rookAttacks(king2, SquareSet.empty()).intersect(this.board.rooksAndQueens()).union(bishopAttacks(king2, SquareSet.empty()).intersect(this.board.bishopsAndQueens())).intersect(this.board[opposite(this.turn)]);
    let blockers = SquareSet.empty();
    for (const sniper of snipers) {
      const b = between(king2, sniper).intersect(this.board.occupied);
      if (!b.moreThanOne())
        blockers = blockers.union(b);
    }
    const checkers = this.kingAttackers(king2, opposite(this.turn), this.board.occupied);
    return {
      king: king2,
      blockers,
      checkers,
      variantEnd,
      mustCapture: false
    };
  }
  clone() {
    var _a, _b;
    const pos = new this.constructor();
    pos.board = this.board.clone();
    pos.pockets = (_a = this.pockets) === null || _a === void 0 ? void 0 : _a.clone();
    pos.turn = this.turn;
    pos.castles = this.castles.clone();
    pos.epSquare = this.epSquare;
    pos.remainingChecks = (_b = this.remainingChecks) === null || _b === void 0 ? void 0 : _b.clone();
    pos.halfmoves = this.halfmoves;
    pos.fullmoves = this.fullmoves;
    return pos;
  }
  validate() {
    if (this.board.occupied.isEmpty())
      return Result.err(new PositionError(IllegalSetup.Empty));
    if (this.board.king.size() !== 2)
      return Result.err(new PositionError(IllegalSetup.Kings));
    if (!defined(this.board.kingOf(this.turn)))
      return Result.err(new PositionError(IllegalSetup.Kings));
    const otherKing = this.board.kingOf(opposite(this.turn));
    if (!defined(otherKing))
      return Result.err(new PositionError(IllegalSetup.Kings));
    if (this.kingAttackers(otherKing, this.turn, this.board.occupied).nonEmpty()) {
      return Result.err(new PositionError(IllegalSetup.OppositeCheck));
    }
    if (SquareSet.backranks().intersects(this.board.pawn)) {
      return Result.err(new PositionError(IllegalSetup.PawnsOnBackrank));
    }
    return Result.ok(void 0);
  }
  dropDests(_ctx) {
    return SquareSet.empty();
  }
  dests(square, ctx) {
    ctx = ctx || this.ctx();
    if (ctx.variantEnd)
      return SquareSet.empty();
    const piece = this.board.get(square);
    if (!piece || piece.color !== this.turn)
      return SquareSet.empty();
    let pseudo, legal;
    if (piece.role === "pawn") {
      pseudo = pawnAttacks(this.turn, square).intersect(this.board[opposite(this.turn)]);
      const delta = this.turn === "white" ? 8 : -8;
      const step2 = square + delta;
      if (0 <= step2 && step2 < 64 && !this.board.occupied.has(step2)) {
        pseudo = pseudo.with(step2);
        const canDoubleStep = this.turn === "white" ? square < 16 : square >= 64 - 16;
        const doubleStep = step2 + delta;
        if (canDoubleStep && !this.board.occupied.has(doubleStep)) {
          pseudo = pseudo.with(doubleStep);
        }
      }
      if (defined(this.epSquare) && canCaptureEp(this, square, ctx)) {
        legal = SquareSet.fromSquare(this.epSquare);
      }
    } else if (piece.role === "bishop")
      pseudo = bishopAttacks(square, this.board.occupied);
    else if (piece.role === "knight")
      pseudo = knightAttacks(square);
    else if (piece.role === "rook")
      pseudo = rookAttacks(square, this.board.occupied);
    else if (piece.role === "queen")
      pseudo = queenAttacks(square, this.board.occupied);
    else
      pseudo = kingAttacks(square);
    pseudo = pseudo.diff(this.board[this.turn]);
    if (defined(ctx.king)) {
      if (piece.role === "king") {
        const occ = this.board.occupied.without(square);
        for (const to of pseudo) {
          if (this.kingAttackers(to, opposite(this.turn), occ).nonEmpty())
            pseudo = pseudo.without(to);
        }
        return pseudo.union(castlingDest(this, "a", ctx)).union(castlingDest(this, "h", ctx));
      }
      if (ctx.checkers.nonEmpty()) {
        const checker = ctx.checkers.singleSquare();
        if (!defined(checker))
          return SquareSet.empty();
        pseudo = pseudo.intersect(between(checker, ctx.king).with(checker));
      }
      if (ctx.blockers.has(square))
        pseudo = pseudo.intersect(ray(square, ctx.king));
    }
    if (legal)
      pseudo = pseudo.union(legal);
    return pseudo;
  }
  isVariantEnd() {
    return false;
  }
  variantOutcome(_ctx) {
    return;
  }
  hasInsufficientMaterial(color) {
    if (this.board[color].intersect(this.board.pawn.union(this.board.rooksAndQueens())).nonEmpty())
      return false;
    if (this.board[color].intersects(this.board.knight)) {
      return this.board[color].size() <= 2 && this.board[opposite(color)].diff(this.board.king).diff(this.board.queen).isEmpty();
    }
    if (this.board[color].intersects(this.board.bishop)) {
      const sameColor2 = !this.board.bishop.intersects(SquareSet.darkSquares()) || !this.board.bishop.intersects(SquareSet.lightSquares());
      return sameColor2 && this.board.pawn.isEmpty() && this.board.knight.isEmpty();
    }
    return true;
  }
  // The following should be identical in all subclasses
  toSetup() {
    var _a, _b;
    return {
      board: this.board.clone(),
      pockets: (_a = this.pockets) === null || _a === void 0 ? void 0 : _a.clone(),
      turn: this.turn,
      castlingRights: this.castles.castlingRights,
      epSquare: legalEpSquare(this),
      remainingChecks: (_b = this.remainingChecks) === null || _b === void 0 ? void 0 : _b.clone(),
      halfmoves: Math.min(this.halfmoves, 150),
      fullmoves: Math.min(Math.max(this.fullmoves, 1), 9999)
    };
  }
  isInsufficientMaterial() {
    return COLORS.every((color) => this.hasInsufficientMaterial(color));
  }
  hasDests(ctx) {
    ctx = ctx || this.ctx();
    for (const square of this.board[this.turn]) {
      if (this.dests(square, ctx).nonEmpty())
        return true;
    }
    return this.dropDests(ctx).nonEmpty();
  }
  isLegal(move3, ctx) {
    if (isDrop(move3)) {
      if (!this.pockets || this.pockets[this.turn][move3.role] <= 0)
        return false;
      if (move3.role === "pawn" && SquareSet.backranks().has(move3.to))
        return false;
      return this.dropDests(ctx).has(move3.to);
    } else {
      if (move3.promotion === "pawn")
        return false;
      if (move3.promotion === "king" && this.rules !== "antichess")
        return false;
      if (!!move3.promotion !== (this.board.pawn.has(move3.from) && SquareSet.backranks().has(move3.to)))
        return false;
      const dests = this.dests(move3.from, ctx);
      return dests.has(move3.to) || dests.has(normalizeMove(this, move3).to);
    }
  }
  isCheck() {
    const king2 = this.board.kingOf(this.turn);
    return defined(king2) && this.kingAttackers(king2, opposite(this.turn), this.board.occupied).nonEmpty();
  }
  isEnd(ctx) {
    if (ctx ? ctx.variantEnd : this.isVariantEnd())
      return true;
    return this.isInsufficientMaterial() || !this.hasDests(ctx);
  }
  isCheckmate(ctx) {
    ctx = ctx || this.ctx();
    return !ctx.variantEnd && ctx.checkers.nonEmpty() && !this.hasDests(ctx);
  }
  isStalemate(ctx) {
    ctx = ctx || this.ctx();
    return !ctx.variantEnd && ctx.checkers.isEmpty() && !this.hasDests(ctx);
  }
  outcome(ctx) {
    const variantOutcome = this.variantOutcome(ctx);
    if (variantOutcome)
      return variantOutcome;
    ctx = ctx || this.ctx();
    if (this.isCheckmate(ctx))
      return { winner: opposite(this.turn) };
    else if (this.isInsufficientMaterial() || this.isStalemate(ctx))
      return { winner: void 0 };
    else
      return;
  }
  allDests(ctx) {
    ctx = ctx || this.ctx();
    const d = /* @__PURE__ */ new Map();
    if (ctx.variantEnd)
      return d;
    for (const square of this.board[this.turn]) {
      d.set(square, this.dests(square, ctx));
    }
    return d;
  }
  play(move3) {
    const turn = this.turn;
    const epSquare = this.epSquare;
    const castling = castlingSide(this, move3);
    this.epSquare = void 0;
    this.halfmoves += 1;
    if (turn === "black")
      this.fullmoves += 1;
    this.turn = opposite(turn);
    if (isDrop(move3)) {
      this.board.set(move3.to, { role: move3.role, color: turn });
      if (this.pockets)
        this.pockets[turn][move3.role]--;
      if (move3.role === "pawn")
        this.halfmoves = 0;
    } else {
      const piece = this.board.take(move3.from);
      if (!piece)
        return;
      let epCapture;
      if (piece.role === "pawn") {
        this.halfmoves = 0;
        if (move3.to === epSquare) {
          epCapture = this.board.take(move3.to + (turn === "white" ? -8 : 8));
        }
        const delta = move3.from - move3.to;
        if (Math.abs(delta) === 16 && 8 <= move3.from && move3.from <= 55) {
          this.epSquare = move3.from + move3.to >> 1;
        }
        if (move3.promotion) {
          piece.role = move3.promotion;
          piece.promoted = !!this.pockets;
        }
      } else if (piece.role === "rook") {
        this.castles.discardRook(move3.from);
      } else if (piece.role === "king") {
        if (castling) {
          const rookFrom = this.castles.rook[turn][castling];
          if (defined(rookFrom)) {
            const rook2 = this.board.take(rookFrom);
            this.board.set(kingCastlesTo(turn, castling), piece);
            if (rook2)
              this.board.set(rookCastlesTo(turn, castling), rook2);
          }
        }
        this.castles.discardColor(turn);
      }
      if (!castling) {
        const capture = this.board.set(move3.to, piece) || epCapture;
        if (capture)
          this.playCaptureAt(move3.to, capture);
      }
    }
    if (this.remainingChecks) {
      if (this.isCheck())
        this.remainingChecks[turn] = Math.max(this.remainingChecks[turn] - 1, 0);
    }
  }
};
var Chess = class extends Position {
  constructor() {
    super("chess");
  }
  static default() {
    const pos = new this();
    pos.reset();
    return pos;
  }
  static fromSetup(setup) {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map((_) => pos);
  }
  clone() {
    return super.clone();
  }
};
var validEpSquare = (pos, square) => {
  if (!defined(square))
    return;
  const epRank = pos.turn === "white" ? 5 : 2;
  const forward = pos.turn === "white" ? 8 : -8;
  if (squareRank(square) !== epRank)
    return;
  if (pos.board.occupied.has(square + forward))
    return;
  const pawn2 = square - forward;
  if (!pos.board.pawn.has(pawn2) || !pos.board[opposite(pos.turn)].has(pawn2))
    return;
  return square;
};
var legalEpSquare = (pos) => {
  if (!defined(pos.epSquare))
    return;
  const ctx = pos.ctx();
  const ourPawns = pos.board.pieces(pos.turn, "pawn");
  const candidates = ourPawns.intersect(pawnAttacks(opposite(pos.turn), pos.epSquare));
  for (const candidate of candidates) {
    if (pos.dests(candidate, ctx).has(pos.epSquare))
      return pos.epSquare;
  }
  return;
};
var canCaptureEp = (pos, pawnFrom, ctx) => {
  if (!defined(pos.epSquare))
    return false;
  if (!pawnAttacks(pos.turn, pawnFrom).has(pos.epSquare))
    return false;
  if (!defined(ctx.king))
    return true;
  const delta = pos.turn === "white" ? 8 : -8;
  const captured = pos.epSquare - delta;
  return pos.kingAttackers(ctx.king, opposite(pos.turn), pos.board.occupied.toggle(pawnFrom).toggle(captured).with(pos.epSquare)).without(captured).isEmpty();
};
var castlingDest = (pos, side, ctx) => {
  if (!defined(ctx.king) || ctx.checkers.nonEmpty())
    return SquareSet.empty();
  const rook2 = pos.castles.rook[pos.turn][side];
  if (!defined(rook2))
    return SquareSet.empty();
  if (pos.castles.path[pos.turn][side].intersects(pos.board.occupied))
    return SquareSet.empty();
  const kingTo = kingCastlesTo(pos.turn, side);
  const kingPath = between(ctx.king, kingTo);
  const occ = pos.board.occupied.without(ctx.king);
  for (const sq of kingPath) {
    if (pos.kingAttackers(sq, opposite(pos.turn), occ).nonEmpty())
      return SquareSet.empty();
  }
  const rookTo = rookCastlesTo(pos.turn, side);
  const after = pos.board.occupied.toggle(ctx.king).toggle(rook2).toggle(rookTo);
  if (pos.kingAttackers(kingTo, opposite(pos.turn), after).nonEmpty())
    return SquareSet.empty();
  return SquareSet.fromSquare(rook2);
};
var pseudoDests = (pos, square, ctx) => {
  if (ctx.variantEnd)
    return SquareSet.empty();
  const piece = pos.board.get(square);
  if (!piece || piece.color !== pos.turn)
    return SquareSet.empty();
  let pseudo = attacks(piece, square, pos.board.occupied);
  if (piece.role === "pawn") {
    let captureTargets = pos.board[opposite(pos.turn)];
    if (defined(pos.epSquare))
      captureTargets = captureTargets.with(pos.epSquare);
    pseudo = pseudo.intersect(captureTargets);
    const delta = pos.turn === "white" ? 8 : -8;
    const step2 = square + delta;
    if (0 <= step2 && step2 < 64 && !pos.board.occupied.has(step2)) {
      pseudo = pseudo.with(step2);
      const canDoubleStep = pos.turn === "white" ? square < 16 : square >= 64 - 16;
      const doubleStep = step2 + delta;
      if (canDoubleStep && !pos.board.occupied.has(doubleStep)) {
        pseudo = pseudo.with(doubleStep);
      }
    }
    return pseudo;
  } else {
    pseudo = pseudo.diff(pos.board[pos.turn]);
  }
  if (square === ctx.king)
    return pseudo.union(castlingDest(pos, "a", ctx)).union(castlingDest(pos, "h", ctx));
  else
    return pseudo;
};
var castlingSide = (pos, move3) => {
  if (isDrop(move3))
    return;
  const delta = move3.to - move3.from;
  if (Math.abs(delta) !== 2 && !pos.board[pos.turn].has(move3.to))
    return;
  if (!pos.board.king.has(move3.from))
    return;
  return delta > 0 ? "h" : "a";
};
var normalizeMove = (pos, move3) => {
  const side = castlingSide(pos, move3);
  if (!side)
    return move3;
  const rookFrom = pos.castles.rook[pos.turn][side];
  return {
    from: move3.from,
    to: defined(rookFrom) ? rookFrom : move3.to
  };
};

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/compat.js
var chessgroundDests = (pos, opts) => {
  const result = /* @__PURE__ */ new Map();
  const ctx = pos.ctx();
  for (const [from, squares] of pos.allDests(ctx)) {
    if (squares.nonEmpty()) {
      const d = Array.from(squares, makeSquare);
      if (!(opts === null || opts === void 0 ? void 0 : opts.chess960) && from === ctx.king && squareFile(from) === 4) {
        if (squares.has(0))
          d.push("c1");
        else if (squares.has(56))
          d.push("c8");
        if (squares.has(7))
          d.push("g1");
        else if (squares.has(63))
          d.push("g8");
      }
      result.set(makeSquare(from), d);
    }
  }
  return result;
};
var scalachessCharPair = (move3) => isDrop(move3) ? String.fromCharCode(35 + move3.to, 35 + 64 + 8 * 5 + ["queen", "rook", "bishop", "knight", "pawn"].indexOf(move3.role)) : String.fromCharCode(35 + move3.from, move3.promotion ? 35 + 64 + 8 * ["queen", "rook", "bishop", "knight", "king"].indexOf(move3.promotion) + squareFile(move3.to) : 35 + move3.to);

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/setup.js
var MaterialSide = class _MaterialSide {
  constructor() {
  }
  static empty() {
    const m = new _MaterialSide();
    for (const role of ROLES)
      m[role] = 0;
    return m;
  }
  static fromBoard(board, color) {
    const m = new _MaterialSide();
    for (const role of ROLES)
      m[role] = board.pieces(color, role).size();
    return m;
  }
  clone() {
    const m = new _MaterialSide();
    for (const role of ROLES)
      m[role] = this[role];
    return m;
  }
  equals(other) {
    return ROLES.every((role) => this[role] === other[role]);
  }
  add(other) {
    const m = new _MaterialSide();
    for (const role of ROLES)
      m[role] = this[role] + other[role];
    return m;
  }
  subtract(other) {
    const m = new _MaterialSide();
    for (const role of ROLES)
      m[role] = this[role] - other[role];
    return m;
  }
  nonEmpty() {
    return ROLES.some((role) => this[role] > 0);
  }
  isEmpty() {
    return !this.nonEmpty();
  }
  hasPawns() {
    return this.pawn > 0;
  }
  hasNonPawns() {
    return this.knight > 0 || this.bishop > 0 || this.rook > 0 || this.queen > 0 || this.king > 0;
  }
  size() {
    return this.pawn + this.knight + this.bishop + this.rook + this.queen + this.king;
  }
};
var Material = class _Material {
  constructor(white, black) {
    this.white = white;
    this.black = black;
  }
  static empty() {
    return new _Material(MaterialSide.empty(), MaterialSide.empty());
  }
  static fromBoard(board) {
    return new _Material(MaterialSide.fromBoard(board, "white"), MaterialSide.fromBoard(board, "black"));
  }
  clone() {
    return new _Material(this.white.clone(), this.black.clone());
  }
  equals(other) {
    return this.white.equals(other.white) && this.black.equals(other.black);
  }
  add(other) {
    return new _Material(this.white.add(other.white), this.black.add(other.black));
  }
  subtract(other) {
    return new _Material(this.white.subtract(other.white), this.black.subtract(other.black));
  }
  count(role) {
    return this.white[role] + this.black[role];
  }
  size() {
    return this.white.size() + this.black.size();
  }
  isEmpty() {
    return this.white.isEmpty() && this.black.isEmpty();
  }
  nonEmpty() {
    return !this.isEmpty();
  }
  hasPawns() {
    return this.white.hasPawns() || this.black.hasPawns();
  }
  hasNonPawns() {
    return this.white.hasNonPawns() || this.black.hasNonPawns();
  }
};
var RemainingChecks = class _RemainingChecks {
  constructor(white, black) {
    this.white = white;
    this.black = black;
  }
  static default() {
    return new _RemainingChecks(3, 3);
  }
  clone() {
    return new _RemainingChecks(this.white, this.black);
  }
  equals(other) {
    return this.white === other.white && this.black === other.black;
  }
};

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/fen.js
var INITIAL_BOARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
var INITIAL_EPD = INITIAL_BOARD_FEN + " w KQkq -";
var INITIAL_FEN = INITIAL_EPD + " 0 1";
var EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8";
var EMPTY_EPD = EMPTY_BOARD_FEN + " w - -";
var EMPTY_FEN = EMPTY_EPD + " 0 1";
var InvalidFen;
(function(InvalidFen2) {
  InvalidFen2["Fen"] = "ERR_FEN";
  InvalidFen2["Board"] = "ERR_BOARD";
  InvalidFen2["Pockets"] = "ERR_POCKETS";
  InvalidFen2["Turn"] = "ERR_TURN";
  InvalidFen2["Castling"] = "ERR_CASTLING";
  InvalidFen2["EpSquare"] = "ERR_EP_SQUARE";
  InvalidFen2["RemainingChecks"] = "ERR_REMAINING_CHECKS";
  InvalidFen2["Halfmoves"] = "ERR_HALFMOVES";
  InvalidFen2["Fullmoves"] = "ERR_FULLMOVES";
})(InvalidFen || (InvalidFen = {}));
var FenError = class extends Error {
};
var nthIndexOf = (haystack, needle, n) => {
  let index = haystack.indexOf(needle);
  while (n-- > 0) {
    if (index === -1)
      break;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return index;
};
var parseSmallUint = (str) => /^\d{1,4}$/.test(str) ? parseInt(str, 10) : void 0;
var charToPiece = (ch) => {
  const role = charToRole(ch);
  return role && { role, color: ch.toLowerCase() === ch ? "black" : "white" };
};
var parseBoardFen = (boardPart) => {
  const board = Board.empty();
  let rank = 7;
  let file = 0;
  for (let i = 0; i < boardPart.length; i++) {
    const c = boardPart[i];
    if (c === "/" && file === 8) {
      file = 0;
      rank--;
    } else {
      const step2 = parseInt(c, 10);
      if (step2 > 0)
        file += step2;
      else {
        if (file >= 8 || rank < 0)
          return Result.err(new FenError(InvalidFen.Board));
        const square = file + rank * 8;
        const piece = charToPiece(c);
        if (!piece)
          return Result.err(new FenError(InvalidFen.Board));
        if (boardPart[i + 1] === "~") {
          piece.promoted = true;
          i++;
        }
        board.set(square, piece);
        file++;
      }
    }
  }
  if (rank !== 0 || file !== 8)
    return Result.err(new FenError(InvalidFen.Board));
  return Result.ok(board);
};
var parsePockets = (pocketPart) => {
  if (pocketPart.length > 64)
    return Result.err(new FenError(InvalidFen.Pockets));
  const pockets = Material.empty();
  for (const c of pocketPart) {
    const piece = charToPiece(c);
    if (!piece)
      return Result.err(new FenError(InvalidFen.Pockets));
    pockets[piece.color][piece.role]++;
  }
  return Result.ok(pockets);
};
var parseCastlingFen = (board, castlingPart) => {
  let castlingRights = SquareSet.empty();
  if (castlingPart === "-")
    return Result.ok(castlingRights);
  for (const c of castlingPart) {
    const lower = c.toLowerCase();
    const color = c === lower ? "black" : "white";
    const rank = color === "white" ? 0 : 7;
    if ("a" <= lower && lower <= "h") {
      castlingRights = castlingRights.with(squareFromCoords(lower.charCodeAt(0) - "a".charCodeAt(0), rank));
    } else if (lower === "k" || lower === "q") {
      const rooksAndKings = board[color].intersect(SquareSet.backrank(color)).intersect(board.rook.union(board.king));
      const candidate = lower === "k" ? rooksAndKings.last() : rooksAndKings.first();
      castlingRights = castlingRights.with(defined(candidate) && board.rook.has(candidate) ? candidate : squareFromCoords(lower === "k" ? 7 : 0, rank));
    } else
      return Result.err(new FenError(InvalidFen.Castling));
  }
  if (COLORS.some((color) => SquareSet.backrank(color).intersect(castlingRights).size() > 2)) {
    return Result.err(new FenError(InvalidFen.Castling));
  }
  return Result.ok(castlingRights);
};
var parseRemainingChecks = (part) => {
  const parts = part.split("+");
  if (parts.length === 3 && parts[0] === "") {
    const white = parseSmallUint(parts[1]);
    const black = parseSmallUint(parts[2]);
    if (!defined(white) || white > 3 || !defined(black) || black > 3) {
      return Result.err(new FenError(InvalidFen.RemainingChecks));
    }
    return Result.ok(new RemainingChecks(3 - white, 3 - black));
  } else if (parts.length === 2) {
    const white = parseSmallUint(parts[0]);
    const black = parseSmallUint(parts[1]);
    if (!defined(white) || white > 3 || !defined(black) || black > 3) {
      return Result.err(new FenError(InvalidFen.RemainingChecks));
    }
    return Result.ok(new RemainingChecks(white, black));
  } else
    return Result.err(new FenError(InvalidFen.RemainingChecks));
};
var parseFen = (fen) => {
  const parts = fen.split(/[\s_]+/);
  const boardPart = parts.shift();
  let board;
  let pockets = Result.ok(void 0);
  if (boardPart.endsWith("]")) {
    const pocketStart = boardPart.indexOf("[");
    if (pocketStart === -1)
      return Result.err(new FenError(InvalidFen.Fen));
    board = parseBoardFen(boardPart.slice(0, pocketStart));
    pockets = parsePockets(boardPart.slice(pocketStart + 1, -1));
  } else {
    const pocketStart = nthIndexOf(boardPart, "/", 7);
    if (pocketStart === -1)
      board = parseBoardFen(boardPart);
    else {
      board = parseBoardFen(boardPart.slice(0, pocketStart));
      pockets = parsePockets(boardPart.slice(pocketStart + 1));
    }
  }
  let turn;
  const turnPart = parts.shift();
  if (!defined(turnPart) || turnPart === "w")
    turn = "white";
  else if (turnPart === "b")
    turn = "black";
  else
    return Result.err(new FenError(InvalidFen.Turn));
  return board.chain((board2) => {
    const castlingPart = parts.shift();
    const castlingRights = defined(castlingPart) ? parseCastlingFen(board2, castlingPart) : Result.ok(SquareSet.empty());
    const epPart = parts.shift();
    let epSquare;
    if (defined(epPart) && epPart !== "-") {
      epSquare = parseSquare(epPart);
      if (!defined(epSquare))
        return Result.err(new FenError(InvalidFen.EpSquare));
    }
    let halfmovePart = parts.shift();
    let earlyRemainingChecks;
    if (defined(halfmovePart) && halfmovePart.includes("+")) {
      earlyRemainingChecks = parseRemainingChecks(halfmovePart);
      halfmovePart = parts.shift();
    }
    const halfmoves = defined(halfmovePart) ? parseSmallUint(halfmovePart) : 0;
    if (!defined(halfmoves))
      return Result.err(new FenError(InvalidFen.Halfmoves));
    const fullmovesPart = parts.shift();
    const fullmoves = defined(fullmovesPart) ? parseSmallUint(fullmovesPart) : 1;
    if (!defined(fullmoves))
      return Result.err(new FenError(InvalidFen.Fullmoves));
    const remainingChecksPart = parts.shift();
    let remainingChecks = Result.ok(void 0);
    if (defined(remainingChecksPart)) {
      if (defined(earlyRemainingChecks))
        return Result.err(new FenError(InvalidFen.RemainingChecks));
      remainingChecks = parseRemainingChecks(remainingChecksPart);
    } else if (defined(earlyRemainingChecks)) {
      remainingChecks = earlyRemainingChecks;
    }
    if (parts.length > 0)
      return Result.err(new FenError(InvalidFen.Fen));
    return pockets.chain((pockets2) => castlingRights.chain((castlingRights2) => remainingChecks.map((remainingChecks2) => {
      return {
        board: board2,
        pockets: pockets2,
        turn,
        castlingRights: castlingRights2,
        remainingChecks: remainingChecks2,
        epSquare,
        halfmoves,
        fullmoves: Math.max(1, fullmoves)
      };
    })));
  });
};
var makePiece2 = (piece) => {
  let r = roleToChar(piece.role);
  if (piece.color === "white")
    r = r.toUpperCase();
  if (piece.promoted)
    r += "~";
  return r;
};
var makeBoardFen = (board) => {
  let fen = "";
  let empty = 0;
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const square = file + rank * 8;
      const piece = board.get(square);
      if (!piece)
        empty++;
      else {
        if (empty > 0) {
          fen += empty;
          empty = 0;
        }
        fen += makePiece2(piece);
      }
      if (file === 7) {
        if (empty > 0) {
          fen += empty;
          empty = 0;
        }
        if (rank !== 0)
          fen += "/";
      }
    }
  }
  return fen;
};
var makePocket = (material) => ROLES.map((role) => roleToChar(role).repeat(material[role])).join("");
var makePockets = (pocket) => makePocket(pocket.white).toUpperCase() + makePocket(pocket.black);
var makeCastlingFen = (board, castlingRights) => {
  let fen = "";
  for (const color of COLORS) {
    const backrank = SquareSet.backrank(color);
    let king2 = board.kingOf(color);
    if (defined(king2) && !backrank.has(king2))
      king2 = void 0;
    const candidates = board.pieces(color, "rook").intersect(backrank);
    for (const rook2 of castlingRights.intersect(backrank).reversed()) {
      if (rook2 === candidates.first() && defined(king2) && rook2 < king2) {
        fen += color === "white" ? "Q" : "q";
      } else if (rook2 === candidates.last() && defined(king2) && king2 < rook2) {
        fen += color === "white" ? "K" : "k";
      } else {
        const file = FILE_NAMES[squareFile(rook2)];
        fen += color === "white" ? file.toUpperCase() : file;
      }
    }
  }
  return fen || "-";
};
var makeRemainingChecks = (checks) => `${checks.white}+${checks.black}`;
var makeFen = (setup, opts) => [
  makeBoardFen(setup.board) + (setup.pockets ? `[${makePockets(setup.pockets)}]` : ""),
  setup.turn[0],
  makeCastlingFen(setup.board, setup.castlingRights),
  defined(setup.epSquare) ? makeSquare(setup.epSquare) : "-",
  ...setup.remainingChecks ? [makeRemainingChecks(setup.remainingChecks)] : [],
  ...(opts === null || opts === void 0 ? void 0 : opts.epd) ? [] : [Math.max(0, Math.min(setup.halfmoves, 9999)), Math.max(1, Math.min(setup.fullmoves, 9999))]
].join(" ");

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/san.js
var makeSanWithoutSuffix = (pos, move3) => {
  let san = "";
  if (isDrop(move3)) {
    if (move3.role !== "pawn")
      san = roleToChar(move3.role).toUpperCase();
    san += "@" + makeSquare(move3.to);
  } else {
    const role = pos.board.getRole(move3.from);
    if (!role)
      return "--";
    if (role === "king" && (pos.board[pos.turn].has(move3.to) || Math.abs(move3.to - move3.from) === 2)) {
      san = move3.to > move3.from ? "O-O" : "O-O-O";
    } else {
      const capture = pos.board.occupied.has(move3.to) || role === "pawn" && squareFile(move3.from) !== squareFile(move3.to);
      if (role !== "pawn") {
        san = roleToChar(role).toUpperCase();
        let others;
        if (role === "king")
          others = kingAttacks(move3.to).intersect(pos.board.king);
        else if (role === "queen")
          others = queenAttacks(move3.to, pos.board.occupied).intersect(pos.board.queen);
        else if (role === "rook")
          others = rookAttacks(move3.to, pos.board.occupied).intersect(pos.board.rook);
        else if (role === "bishop")
          others = bishopAttacks(move3.to, pos.board.occupied).intersect(pos.board.bishop);
        else
          others = knightAttacks(move3.to).intersect(pos.board.knight);
        others = others.intersect(pos.board[pos.turn]).without(move3.from);
        if (others.nonEmpty()) {
          const ctx = pos.ctx();
          for (const from of others) {
            if (!pos.dests(from, ctx).has(move3.to))
              others = others.without(from);
          }
          if (others.nonEmpty()) {
            let row = false;
            let column = others.intersects(SquareSet.fromRank(squareRank(move3.from)));
            if (others.intersects(SquareSet.fromFile(squareFile(move3.from))))
              row = true;
            else
              column = true;
            if (column)
              san += FILE_NAMES[squareFile(move3.from)];
            if (row)
              san += RANK_NAMES[squareRank(move3.from)];
          }
        }
      } else if (capture)
        san = FILE_NAMES[squareFile(move3.from)];
      if (capture)
        san += "x";
      san += makeSquare(move3.to);
      if (move3.promotion)
        san += "=" + roleToChar(move3.promotion).toUpperCase();
    }
  }
  return san;
};
var makeSanAndPlay = (pos, move3) => {
  var _a;
  const san = makeSanWithoutSuffix(pos, move3);
  pos.play(move3);
  if ((_a = pos.outcome()) === null || _a === void 0 ? void 0 : _a.winner)
    return san + "#";
  if (pos.isCheck())
    return san + "+";
  return san;
};
var makeSan = (pos, move3) => makeSanAndPlay(pos.clone(), move3);
var parseSan = (pos, san) => {
  const ctx = pos.ctx();
  const match = san.match(/^([NBRQK])?([a-h])?([1-8])?[-x]?([a-h][1-8])(?:=?([nbrqkNBRQK]))?[+#]?$/);
  if (!match) {
    let castlingSide2;
    if (san === "O-O" || san === "O-O+" || san === "O-O#")
      castlingSide2 = "h";
    else if (san === "O-O-O" || san === "O-O-O+" || san === "O-O-O#")
      castlingSide2 = "a";
    if (castlingSide2) {
      const rook2 = pos.castles.rook[pos.turn][castlingSide2];
      if (!defined(ctx.king) || !defined(rook2) || !pos.dests(ctx.king, ctx).has(rook2))
        return;
      return {
        from: ctx.king,
        to: rook2
      };
    }
    const match2 = san.match(/^([pnbrqkPNBRQK])?@([a-h][1-8])[+#]?$/);
    if (!match2)
      return;
    const move3 = {
      role: match2[1] ? charToRole(match2[1]) : "pawn",
      to: parseSquare(match2[2])
    };
    return pos.isLegal(move3, ctx) ? move3 : void 0;
  }
  const role = match[1] ? charToRole(match[1]) : "pawn";
  const to = parseSquare(match[4]);
  const promotion = match[5] ? charToRole(match[5]) : void 0;
  if (!!promotion !== (role === "pawn" && SquareSet.backranks().has(to)))
    return;
  if (promotion === "king" && pos.rules !== "antichess")
    return;
  let candidates = pos.board.pieces(pos.turn, role);
  if (role === "pawn" && !match[2])
    candidates = candidates.intersect(SquareSet.fromFile(squareFile(to)));
  else if (match[2])
    candidates = candidates.intersect(SquareSet.fromFile(match[2].charCodeAt(0) - "a".charCodeAt(0)));
  if (match[3])
    candidates = candidates.intersect(SquareSet.fromRank(match[3].charCodeAt(0) - "1".charCodeAt(0)));
  const pawnAdvance = role === "pawn" ? SquareSet.fromFile(squareFile(to)) : SquareSet.empty();
  candidates = candidates.intersect(pawnAdvance.union(attacks({ color: opposite(pos.turn), role }, to, pos.board.occupied)));
  let from;
  for (const candidate of candidates) {
    if (pos.dests(candidate, ctx).has(to)) {
      if (defined(from))
        return;
      from = candidate;
    }
  }
  if (!defined(from))
    return;
  return {
    from,
    to,
    promotion
  };
};

// src/board/index.ts
var _getCtrl3 = () => {
  throw new Error("ground not initialised");
};
var _navigate = () => {
};
var _getImportedGames2 = () => [];
var _getSelectedGameId2 = () => null;
var _redraw3 = () => {
};
function initGround(deps) {
  _getCtrl3 = deps.getCtrl;
  _navigate = deps.navigate;
  _getImportedGames2 = deps.getImportedGames;
  _getSelectedGameId2 = deps.getSelectedGameId;
  _redraw3 = deps.redraw;
}
var cgInstance = void 0;
var orientation = "white";
var pendingPromotion = null;
var PUZZLE_REPLY_DELAY_MS = 500;
function setOrientation(v) {
  orientation = v;
  cgInstance?.set({ orientation: v });
}
function computeDests(fen) {
  const setup = parseFen(fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  return chessgroundDests(pos);
}
var DESTS_CACHE_MAX = 512;
var destsCache = /* @__PURE__ */ new Map();
function cachedDests(fen) {
  const cached = destsCache.get(fen);
  if (cached) return cached;
  const dests = computeDests(fen);
  destsCache.set(fen, dests);
  if (destsCache.size > DESTS_CACHE_MAX) {
    const oldest = destsCache.keys().next().value;
    if (oldest !== void 0) destsCache.delete(oldest);
  }
  return dests;
}
function uciToSan(fen, uci) {
  try {
    const move3 = parseUci(uci);
    if (!move3) return uci;
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    return makeSan(pos, move3);
  } catch {
    return uci;
  }
}
function onUserMove(orig, dest) {
  const ctrl2 = _getCtrl3();
  const setup = parseFen(ctrl2.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const fromSq = parseSquare(orig);
  const toSq = parseSquare(dest);
  if (fromSq === void 0 || toSq === void 0) return;
  const normMove = normalizeMove(pos, { from: fromSq, to: toSq });
  const normUci = makeUci(normMove);
  const puzzleCtrl = getActivePuzzleCtrl();
  if (puzzleCtrl) {
    const piece2 = pos.board.get(fromSq);
    const reachesBackRank = piece2?.role === "pawn" && (pos.turn === "white" && toSq >= 56 || pos.turn === "black" && toSq < 8);
    if (reachesBackRank) {
      const expected = puzzleCtrl.currentExpectedMove();
      if (expected?.startsWith(normUci)) {
        pendingPromotion = { orig, dest, color: pos.turn };
        _redraw3();
        return;
      }
    }
    const outcome = puzzleCtrl.submitUserMove(normUci, ctrl2.path);
    if (!outcome.accepted) {
      syncBoard();
      _redraw3();
      return;
    }
    applyMoveToTree(normMove, pos);
    cgInstance?.set({ movable: { color: void 0 } });
    setTimeout(() => {
      for (const reply of outcome.replies) playUciMove(reply);
      puzzleCtrl.setCurrentPath(_getCtrl3().path);
      syncBoard();
      _redraw3();
    }, PUZZLE_REPLY_DELAY_MS);
    return;
  }
  const existingChild = ctrl2.node.children.find((c) => c.uci === normUci || c.uci?.startsWith(normUci));
  if (existingChild) {
    _navigate(ctrl2.path + existingChild.id);
    return;
  }
  const piece = pos.board.get(fromSq);
  if (piece?.role === "pawn" && (pos.turn === "white" && toSq >= 56 || pos.turn === "black" && toSq < 8)) {
    pendingPromotion = { orig, dest, color: pos.turn };
    _redraw3();
    return;
  }
  const retro = ctrl2.retro?.isSolving() ? ctrl2.retro : void 0;
  const retroCand = retro ? retro.current() : null;
  const atRetroExercise = !!(retro && retroCand && ctrl2.path === retroCand.parentPath);
  if (atRetroExercise && retro && retroCand && normUci === retroCand.bestMove) {
    retro.onWin();
  }
  completeMove(orig, dest);
  if (atRetroExercise && retro && retroCand && normUci !== retroCand.bestMove) {
    retro.setFeedback("eval");
    retro.onCeval();
  }
}
function completeMove(orig, dest, promotion) {
  const ctrl2 = _getCtrl3();
  const setup = parseFen(ctrl2.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const fromSq = parseSquare(orig);
  const toSq = parseSquare(dest);
  if (fromSq === void 0 || toSq === void 0) return;
  const move3 = normalizeMove(
    pos,
    promotion !== void 0 ? { from: fromSq, to: toSq, promotion } : { from: fromSq, to: toSq }
  );
  applyMoveToTree(move3, pos);
}
function applyMoveToTree(move3, pos) {
  const ctrl2 = _getCtrl3();
  const normUci = makeUci(move3);
  const existingChild = ctrl2.node.children.find((c) => c.uci === normUci || c.uci?.startsWith(normUci));
  if (existingChild) {
    _navigate(ctrl2.path + existingChild.id);
    return;
  }
  const san = makeSanAndPlay(pos, move3);
  const newNode = {
    id: scalachessCharPair(move3),
    ply: ctrl2.node.ply + 1,
    san,
    uci: makeUci(move3),
    fen: makeFen(pos.toSetup()),
    children: []
  };
  addNode(ctrl2.root, ctrl2.path, newNode);
  console.log("[variation] inserted", {
    id: newNode.id,
    ply: newNode.ply,
    san: newNode.san,
    uci: newNode.uci,
    parentPath: ctrl2.path,
    newPath: ctrl2.path + newNode.id,
    parentChildCount: ctrl2.node.children.length
  });
  _navigate(ctrl2.path + newNode.id);
}
function playUciMove(uci) {
  const ctrl2 = _getCtrl3();
  const parsed = parseUci(uci);
  if (!parsed) return;
  const setup = parseFen(ctrl2.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const move3 = normalizeMove(pos, parsed);
  applyMoveToTree(move3, pos);
}
function completePromotion(role) {
  if (!pendingPromotion) return;
  const { orig, dest } = pendingPromotion;
  pendingPromotion = null;
  const puzzleCtrl = getActivePuzzleCtrl();
  if (puzzleCtrl) {
    const ctrl2 = _getCtrl3();
    const setup = parseFen(ctrl2.node.fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    const fromSq = parseSquare(orig);
    const toSq = parseSquare(dest);
    if (fromSq === void 0 || toSq === void 0) return;
    const move3 = normalizeMove(pos, { from: fromSq, to: toSq, promotion: role });
    const outcome = puzzleCtrl.submitUserMove(makeUci(move3), ctrl2.path);
    if (!outcome.accepted) {
      syncBoard();
      _redraw3();
      return;
    }
    applyMoveToTree(move3, pos);
    cgInstance?.set({ movable: { color: void 0 } });
    setTimeout(() => {
      for (const reply of outcome.replies) playUciMove(reply);
      puzzleCtrl.setCurrentPath(_getCtrl3().path);
      syncBoard();
      _redraw3();
    }, PUZZLE_REPLY_DELAY_MS);
    return;
  }
  completeMove(orig, dest, role);
}
var PROMOTION_ROLES = ["queen", "knight", "rook", "bishop"];
function renderPromotionDialog() {
  if (!pendingPromotion) return null;
  const { dest, color } = pendingPromotion;
  const [file] = key2pos(dest);
  const left = orientation === "white" ? file * 12.5 : (7 - file) * 12.5;
  const vertical = color === orientation ? "top" : "bottom";
  return h("div.cg-wrap.promotion-wrap", {
    on: { click: () => {
      pendingPromotion = null;
      syncBoard();
      _redraw3();
    } }
  }, [
    h("div#promotion-choice." + vertical, {}, PROMOTION_ROLES.map((role, i) => {
      const top = (color === orientation ? i : 7 - i) * 12.5;
      return h("square", {
        attrs: { style: `top:${top}%;left:${left}%` },
        on: { click: (e) => {
          e.stopPropagation();
          completePromotion(role);
        } }
      }, [h(`piece.${role}.${color}`)]);
    }))
  ]);
}
function syncBoard() {
  if (!cgInstance) return;
  const ctrl2 = _getCtrl3();
  const node = ctrl2.node;
  const dests = cachedDests(node.fen);
  const lastMove = uciToMove(node.uci);
  cgInstance.set({
    fen: node.fen,
    turnColor: node.ply % 2 === 0 ? "white" : "black",
    movable: {
      color: node.ply % 2 === 0 ? "white" : "black",
      dests
    },
    ...lastMove ? { lastMove } : {}
  });
}
function flip() {
  orientation = orientation === "white" ? "black" : "white";
  cgInstance?.set({ orientation });
  _redraw3();
}
var ROLE_ORDER = ["queen", "rook", "bishop", "knight", "pawn"];
var ROLE_POINTS = { queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1, king: 0 };
function getMaterialDiff(fen) {
  const diff2 = {
    white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 }
  };
  const fenBoard = fen.split(" ")[0] ?? "";
  const charToRole2 = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  for (const ch of fenBoard) {
    const lower = ch.toLowerCase();
    const role = charToRole2[lower];
    if (!role) continue;
    const color = ch === lower ? "black" : "white";
    const opp = color === "white" ? "black" : "white";
    if (diff2[opp][role] > 0) diff2[opp][role]--;
    else diff2[color][role]++;
  }
  return diff2;
}
function getMaterialScore(diff2) {
  return ROLE_ORDER.reduce((sum, role) => sum + (diff2.white[role] - diff2.black[role]) * ROLE_POINTS[role], 0);
}
function renderMaterialPieces(diff2, color, score) {
  const groups = [];
  for (const role of ROLE_ORDER) {
    const count = diff2[color][role];
    if (count <= 0) continue;
    const pieces = [];
    for (let i = 0; i < count; i++) pieces.push(h("mpiece." + role));
    groups.push(h("div", pieces));
  }
  return h("div.material", [
    ...groups,
    score > 0 ? h("score", "+" + score) : null
  ]);
}
function formatClock(centis) {
  const totalSecs = Math.floor(centis / 100);
  const hh = Math.floor(totalSecs / 3600);
  const m = Math.floor(totalSecs % 3600 / 60);
  const s = totalSecs % 60;
  const pad = (n) => n < 10 ? "0" + n : String(n);
  return hh > 0 ? `${hh}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function getClocksAtPath() {
  const nodes = _getCtrl3().nodeList;
  let white;
  let black;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!n) continue;
    if (n.clock === void 0) continue;
    if (n.ply % 2 === 1 && white === void 0) white = n.clock;
    if (n.ply % 2 === 0 && n.ply > 0 && black === void 0) black = n.clock;
    if (white !== void 0 && black !== void 0) break;
  }
  return { white, black };
}
function renderPlayerStrips() {
  const ctrl2 = _getCtrl3();
  const selectedGameId2 = _getSelectedGameId2();
  const importedGames2 = _getImportedGames2();
  const game = importedGames2.find((g) => g.id === selectedGameId2);
  const whiteName = game?.white ?? "White";
  const blackName = game?.black ?? "Black";
  const whiteRating = game?.whiteRating;
  const blackRating = game?.blackRating;
  const result = game?.result ?? "*";
  const diff2 = getMaterialDiff(ctrl2.node.fen);
  const score = getMaterialScore(diff2);
  const clocks = getClocksAtPath();
  const strip = (color) => {
    const name = color === "white" ? whiteName : blackName;
    const rating = color === "white" ? whiteRating : blackRating;
    const winner = color === "white" && result === "1-0" || color === "black" && result === "0-1";
    const loser = color === "white" && result === "0-1" || color === "black" && result === "1-0";
    const matScore = color === "white" ? score : -score;
    const centis = color === "white" ? clocks.white : clocks.black;
    return h("div.analyse__player_strip", [
      h("div.player-strip__identity", {
        class: {
          "player-strip__identity--winner": winner,
          "player-strip__identity--loser": loser,
          "player-strip__identity--draw": !winner && !loser
        }
      }, [
        h("span.player-strip__color-icon", { class: { "player-strip__color-icon--white": color === "white", "player-strip__color-icon--black": color === "black" } }),
        h("span.player-strip__name", rating !== void 0 ? `${name} (${rating})` : name)
      ]),
      renderMaterialPieces(diff2, color, matScore > 0 ? matScore : 0),
      centis !== void 0 ? h("div.analyse__clock", formatClock(centis)) : null
    ]);
  };
  const topColor = orientation === "white" ? "black" : "white";
  const bottomColor = orientation === "white" ? "white" : "black";
  return [strip(topColor), strip(bottomColor)];
}
function bindBoardResizeHandle(container) {
  const el = document.createElement("cg-resize");
  container.appendChild(el);
  const eventPos = (e) => {
    if (e.clientX !== void 0) return [e.clientX, e.clientY];
    if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return void 0;
  };
  const startResize = (start4) => {
    start4.preventDefault();
    const startPos = eventPos(start4);
    if (!startPos) return;
    const initialZoom = boardZoom;
    let zoom = initialZoom;
    let saveTimer;
    const saveZoom = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveBoardZoom(zoom), 700);
    };
    const pointerId = typeof start4.pointerId === "number" ? start4.pointerId : null;
    const usePointer = start4.type === "pointerdown";
    const mousemoveEvent = usePointer ? "pointermove" : start4.targetTouches ? "touchmove" : "mousemove";
    const mouseupEvent = usePointer ? "pointerup" : start4.targetTouches ? "touchend" : "mouseup";
    const resize = (move3) => {
      if (pointerId !== null && move3.pointerId !== void 0 && move3.pointerId !== pointerId) return;
      if (move3.cancelable) move3.preventDefault();
      const pos = eventPos(move3);
      if (!pos) return;
      const delta = pos[0] - startPos[0] + pos[1] - startPos[1];
      zoom = Math.round(Math.min(100, Math.max(0, initialZoom + delta / 10)));
      applyBoardZoom(zoom);
      window.dispatchEvent(new Event("resize"));
      saveZoom();
    };
    document.body.classList.add("resizing");
    document.addEventListener(mousemoveEvent, resize, { passive: false });
    document.addEventListener(mouseupEvent, () => {
      document.removeEventListener(mousemoveEvent, resize);
      document.body.classList.remove("resizing");
    }, { once: true });
  };
  if ("PointerEvent" in window) {
    el.addEventListener("pointerdown", startResize, { passive: false });
  } else {
    el.addEventListener("mousedown", startResize, { passive: false });
    el.addEventListener("touchstart", startResize, { passive: false });
  }
}
function renderBoard() {
  return h("div.cg-wrap", {
    key: "board",
    hook: {
      insert: (vnode3) => {
        const ctrl2 = _getCtrl3();
        const node = ctrl2.node;
        const dests = cachedDests(node.fen);
        const lastMove = uciToMove(node.uci);
        cgInstance = Chessground(vnode3.elm, {
          orientation,
          viewOnly: false,
          drawable: {
            enabled: true,
            brushes: {
              green: { key: "g", color: "#15781B", opacity: 1, lineWidth: 10 },
              blue: { key: "b", color: "#003088", opacity: 1, lineWidth: 10 },
              yellow: { key: "y", color: "#e68f00", opacity: 1, lineWidth: 10 },
              // Explicitly register all brushes used by engine arrow rendering so their
              // keys are always present in Chessground state regardless of deepMerge order.
              // Mirrors lichess-org/lila: state.ts default brushes; opacity/lineWidth values
              // kept at Chessground defaults except paleBlue which is boosted for visibility.
              paleBlue: { key: "pb", color: "#003088", opacity: 0.65, lineWidth: 15 },
              paleGrey: { key: "pgr", color: "#4a4a4a", opacity: 0.35, lineWidth: 15 },
              red: { key: "r", color: "#882020", opacity: 1, lineWidth: 10 }
            }
          },
          fen: node.fen,
          turnColor: node.ply % 2 === 0 ? "white" : "black",
          movable: {
            free: false,
            color: node.ply % 2 === 0 ? "white" : "black",
            dests,
            showDests: true
          },
          events: {
            move: onUserMove
          },
          ...lastMove ? { lastMove } : {}
        });
        bindBoardResizeHandle(vnode3.elm);
      },
      destroy: () => {
        cgInstance?.destroy();
        cgInstance = void 0;
      }
    }
  });
}
function syncBoardAndArrow() {
  syncBoard();
  syncArrow();
}

// src/ceval/view.ts
var _getCtrl4 = () => {
  throw new Error("cevalView not initialised");
};
var _navigate2 = () => {
};
var _redraw4 = () => {
};
function initCevalView(deps) {
  _getCtrl4 = deps.getCtrl;
  _navigate2 = deps.navigate;
  _redraw4 = deps.redraw;
}
var showEngineSettings = false;
var pvBoard = null;
var pvBoardPos = { x: 0, y: 0 };
var PV_BOARD_SIZE = 384;
var PV_BOARD_OFFSET = 16;
function renderCeval() {
  const hasEval = currentEval.cp !== void 0 || currentEval.mate !== void 0;
  const pearlStr = engineEnabled ? hasEval ? formatScore(currentEval) : engineReady ? "\u2026" : "" : "";
  const engineLabel = protocol.engineName ?? "Stockfish 18";
  const statusText = !engineEnabled ? "Local analysis" : !engineReady ? "Loading\u2026" : batchAnalyzing ? `Reviewing ${batchDone}/${batchQueue.length}\u2026` : "Engine on";
  return h("div.ceval", { class: { enabled: engineEnabled } }, [
    // Toggle — mirrors .cmn-toggle (flex: 0 0 40px)
    h("button.cmn-toggle", {
      class: { active: engineEnabled },
      attrs: { title: "Toggle analysis engine (L)" },
      on: { click: toggleEngine }
    }, engineEnabled ? "On" : "Off"),
    // Pearl — large eval number (flex: 1 0 auto, font-size: 1.6em, bold)
    // Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts pearl element
    h("pearl", { class: { "ceval__ko": currentEval.mate === 0 } }, pearlStr),
    // Engine name + status info (flex: 2 1 auto, small text)
    h("div.engine", [
      engineLabel,
      h("span.info", statusText)
    ]),
    // Settings gear — mirrors button.settings-gear positioning
    h("button.settings-gear", {
      class: { active: showEngineSettings },
      attrs: { title: "Engine settings" },
      on: { click: (e) => {
        e.stopPropagation();
        showEngineSettings = !showEngineSettings;
        _redraw4();
      } }
    }, "\u2699")
  ]);
}
function renderPvMoves(fen, moves) {
  const MAX_PV_MOVES = 12;
  try {
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    const first2 = [];
    const rest = [];
    let firstMoveDone = false;
    for (let i = 0; i < Math.min(moves.length, MAX_PV_MOVES); i++) {
      const numNode = pos.turn === "white" ? h("span.pv-num", `${pos.fullmoves}.`) : i === 0 ? h("span.pv-num", `${pos.fullmoves}\u2026`) : null;
      const uci = moves[i];
      const move3 = parseUci(uci);
      if (!move3) break;
      const san = makeSanAndPlay(pos, move3);
      if (san === "--") break;
      const boardFen = makeFen(pos.toSetup());
      const sanNode = h("span.pv-san", { key: `${i}|${uci}`, attrs: { "data-board": `${boardFen}|${uci}` } }, san);
      if (!firstMoveDone) {
        if (numNode) first2.push(numNode);
        first2.push(sanNode);
        firstMoveDone = true;
      } else {
        if (numNode) rest.push(numNode);
        rest.push(sanNode);
      }
    }
    return { first: first2, rest };
  } catch {
    return { first: [], rest: [] };
  }
}
function playPvUciList(ucis) {
  const ctrl2 = _getCtrl4();
  let path = ctrl2.path;
  let node = ctrl2.node;
  for (const uci of ucis) {
    const existing = node.children.find((c) => c.uci === uci);
    if (existing) {
      path += existing.id;
      node = existing;
      continue;
    }
    const move3 = parseUci(uci);
    if (!move3) break;
    try {
      const setup = parseFen(node.fen).unwrap();
      const pos = Chess.fromSetup(setup).unwrap();
      const san = makeSanAndPlay(pos, move3);
      if (san === "--") break;
      const newNode = {
        id: scalachessCharPair(move3),
        ply: node.ply + 1,
        san,
        uci: makeUci(move3),
        fen: makeFen(pos.toSetup()),
        children: []
      };
      addNode(ctrl2.root, path, newNode);
      path += newNode.id;
      node = newNode;
    } catch {
      break;
    }
  }
  _navigate2(path);
}
function renderPvBox() {
  if (!engineEnabled) return null;
  const fen = _getCtrl4().node.fen;
  function pvRowForSlot(slotIdx) {
    const ev = slotIdx === 0 ? currentEval.cp !== void 0 || currentEval.mate !== void 0 || currentEval.moves?.length ? currentEval : void 0 : currentEval.lines?.[slotIdx - 1];
    if (!ev) {
      if (slotIdx === 0) {
        const statusText = !engineReady ? "Loading engine\u2026" : batchAnalyzing ? `Reviewing ${batchDone}/${batchQueue.length}\u2026` : "\u2026";
        return h("div.pv.pv--nowrap", [h("span.ceval__info", statusText)]);
      }
      return h("div.pv.pv--nowrap.pv--empty");
    }
    const score = formatScore(ev);
    const isKo = ev.mate === 0;
    const isPositive = ev.cp !== void 0 ? ev.cp > 0 : ev.mate !== void 0 ? ev.mate > 0 : null;
    const { first: first2, rest } = ev.moves ? renderPvMoves(fen, ev.moves) : { first: [], rest: [] };
    const stm = fen.split(" ")[1];
    const cpStm = ev.cp !== void 0 ? stm === "w" ? ev.cp : -ev.cp : void 0;
    const isMassive = cpStm !== void 0 && cpStm > 200 || ev.mate !== void 0 && (stm === "w" && ev.mate > 0 || stm === "b" && ev.mate < 0);
    const children = [];
    children.push(h("strong", {
      class: {
        "pv__score--white": isPositive === true,
        "pv__score--black": isPositive === false,
        "pv__score--ko": isKo,
        "pv__score--massive": isMassive
      }
    }, score));
    if (first2.length > 0) children.push(h("span.pv-first", first2));
    if (rest.length > 0) children.push(h("span.pv-cont", rest));
    return h("div.pv.pv--nowrap", children);
  }
  const slots = [...Array(multiPv).keys()].map((i) => pvRowForSlot(i));
  return h("div.pv_box", {
    key: "pv-rows",
    hook: {
      insert: (vnode3) => {
        const el = vnode3.elm;
        el.addEventListener("mouseover", (e) => {
          const dataBoard = e.target.dataset.board;
          if (!dataBoard) return;
          const sep = dataBoard.indexOf("|");
          const newFen = dataBoard.slice(0, sep);
          const newUci = dataBoard.slice(sep + 1);
          pvBoardPos = { x: e.clientX, y: e.clientY };
          if (pvBoard?.fen === newFen && pvBoard?.uci === newUci) return;
          pvBoard = { fen: newFen, uci: newUci };
          _redraw4();
        });
        el.addEventListener("mousemove", (e) => {
          pvBoardPos = { x: e.clientX, y: e.clientY };
          const overlay = document.querySelector(".pv-board-float");
          if (overlay) {
            const left = Math.min(e.clientX + PV_BOARD_OFFSET, window.innerWidth - (PV_BOARD_SIZE + PV_BOARD_OFFSET));
            const top = Math.min(e.clientY + PV_BOARD_OFFSET, window.innerHeight - (PV_BOARD_SIZE + PV_BOARD_OFFSET));
            overlay.style.left = `${left}px`;
            overlay.style.top = `${top}px`;
          }
        });
        el.addEventListener("mouseleave", () => {
          if (!pvBoard) return;
          pvBoard = null;
          _redraw4();
        });
        el.addEventListener("click", (e) => {
          const sanSpan = e.target.closest("span.pv-san");
          if (!sanSpan) return;
          e.preventDefault();
          const pvRow = sanSpan.closest("div.pv");
          if (!pvRow) return;
          const allSans = Array.from(pvRow.querySelectorAll("span.pv-san"));
          const clickedIdx = allSans.indexOf(sanSpan);
          if (clickedIdx < 0) return;
          const ucis = [];
          for (let i = 0; i <= clickedIdx; i++) {
            const db = allSans[i].dataset.board;
            if (!db) break;
            ucis.push(db.slice(db.indexOf("|") + 1));
          }
          if (ucis.length > 0) playPvUciList(ucis);
        });
      }
    }
  }, slots);
}
function renderPvBoard() {
  if (!pvBoard) return null;
  const { fen, uci } = pvBoard;
  const left = Math.min(pvBoardPos.x + PV_BOARD_OFFSET, window.innerWidth - (PV_BOARD_SIZE + PV_BOARD_OFFSET));
  const top = Math.min(pvBoardPos.y + PV_BOARD_OFFSET, window.innerHeight - (PV_BOARD_SIZE + PV_BOARD_OFFSET));
  const arrow = uci.length >= 4 ? [{ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: "paleBlue" }] : [];
  const lastMove = uciToMove(uci);
  const cgConfig = {
    fen,
    orientation,
    coordinates: false,
    viewOnly: true,
    drawable: { enabled: false, visible: true, autoShapes: arrow },
    ...lastMove ? { lastMove } : {}
  };
  return h("div.pv-board-float", {
    key: "pv-board-float",
    attrs: { style: `left:${left}px;top:${top}px` }
  }, [
    h("div.cg-wrap", {
      hook: {
        insert: (vnode3) => {
          vnode3.elm._cg = Chessground(vnode3.elm, cgConfig);
        },
        update: (_old, vnode3) => {
          vnode3.elm._cg?.set(cgConfig);
        },
        destroy: (vnode3) => {
          vnode3.elm._cg?.destroy();
        }
      }
    })
  ]);
}
function renderEngineSettings() {
  if (!showEngineSettings) return null;
  return h("div.ceval-settings", [
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-multipv" } }, "Lines"),
      h("input#ceval-multipv", {
        attrs: { type: "range", min: 1, max: 5, step: 1, value: multiPv },
        on: {
          input: (e) => {
            setMultiPv(parseInt(e.target.value));
            clearPendingLines();
            if (engineEnabled && engineReady && !batchAnalyzing) {
              resetCurrentEval();
              evalCurrentPosition();
            }
            _redraw4();
          }
        }
      }),
      h("span.ceval-settings__val", `${multiPv} / 5`)
    ]),
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-review-depth" } }, "Review depth"),
      h("select#ceval-review-depth", {
        on: {
          change: (e) => {
            setReviewDepth(parseInt(e.target.value));
            _redraw4();
          }
        }
      }, [12, 14, 16, 18, 20].map(
        (d) => h("option", { attrs: { value: d, selected: d === reviewDepth } }, String(d))
      ))
    ]),
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-analysis-depth" } }, "Analysis depth"),
      h("select#ceval-analysis-depth", {
        on: {
          change: (e) => {
            setAnalysisDepth(parseInt(e.target.value));
            _redraw4();
          }
        }
      }, [18, 20, 24, 30].map(
        (d) => h("option", { attrs: { value: d, selected: d === analysisDepth } }, String(d))
      ))
    ]),
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-arrows" } }, "Arrows"),
      h("input#ceval-arrows", {
        attrs: { type: "checkbox", checked: showEngineArrows },
        on: {
          change: (e) => {
            setShowEngineArrows(e.target.checked);
            syncArrow();
            _redraw4();
          }
        }
      })
    ]),
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-arrow-lines" } }, "All lines"),
      h("input#ceval-arrow-lines", {
        attrs: { type: "checkbox", checked: arrowAllLines },
        on: {
          change: (e) => {
            setArrowAllLines(e.target.checked);
            syncArrow();
            _redraw4();
          }
        }
      })
    ]),
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-played-arrow" } }, "Played"),
      h("input#ceval-played-arrow", {
        attrs: { type: "checkbox", checked: showPlayedArrow },
        on: {
          change: (e) => {
            setShowPlayedArrow(e.target.checked);
            syncArrow();
            _redraw4();
          }
        }
      })
    ]),
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-arrow-labels" } }, "Labels"),
      h("input#ceval-arrow-labels", {
        attrs: { type: "checkbox", checked: showArrowLabels },
        on: {
          change: (e) => {
            setShowArrowLabels(e.target.checked);
            syncArrow();
            _redraw4();
          }
        }
      })
    ]),
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-review-labels" } }, "Review"),
      h("input#ceval-review-labels", {
        attrs: { type: "checkbox", checked: showReviewLabels },
        on: {
          change: (e) => {
            setShowReviewLabels(e.target.checked);
            _redraw4();
          }
        }
      })
    ]),
    h("div.ceval-settings__row", [
      h("label.ceval-settings__label", { attrs: { for: "ceval-board-review-glyphs" } }, "Board review"),
      h("input#ceval-board-review-glyphs", {
        attrs: { type: "checkbox", checked: showBoardReviewGlyphs },
        on: {
          change: (e) => {
            setShowBoardReviewGlyphs(e.target.checked);
            syncArrow();
            _redraw4();
          }
        }
      })
    ])
  ]);
}

// src/puzzles/extract.ts
var puzzleCandidates = [];
function clearPuzzleCandidates() {
  puzzleCandidates = [];
}
function prevMistake(currentPath) {
  const idx = puzzleCandidates.findIndex((c) => c.path === currentPath);
  if (idx > 0) return puzzleCandidates[idx - 1];
  if (idx === 0) return null;
  let last2 = null;
  for (const c of puzzleCandidates) {
    if (c.path.length < currentPath.length) last2 = c;
    else break;
  }
  return last2;
}
function nextMistake(currentPath) {
  const idx = puzzleCandidates.findIndex((c) => c.path === currentPath);
  if (idx >= 0) return puzzleCandidates[idx + 1] ?? null;
  return puzzleCandidates.find((c) => c.path.length > currentPath.length) ?? null;
}
function renderPuzzleCandidates(deps) {
  const { engineEnabled: engineEnabled2, batchAnalyzing: batchAnalyzing2, batchState: batchState2, savedPuzzles: savedPuzzles2, currentPath } = deps;
  const canExtract = engineEnabled2 && !batchAnalyzing2;
  const btnLabel = canExtract ? `Find Puzzles (${puzzleCandidates.length})` : batchAnalyzing2 ? "Find Puzzles (analyzing\u2026)" : "Find Puzzles (engine off)";
  const rows = puzzleCandidates.map((c) => {
    const moveNum = Math.ceil(c.ply / 2);
    const side = c.ply % 2 === 1 ? "" : "\u2026";
    const heading = `${moveNum}${side}. ${c.san}`;
    const lossText = `\u2212${(c.loss * 100).toFixed(0)}%`;
    const isActive = currentPath === c.path;
    const isSaved = savedPuzzles2.some((p) => p.gameId === c.gameId && p.path === c.path);
    return h("li", { attrs: { style: "display:flex;align-items:center" } }, [
      h("button.game-list__row", {
        class: { active: isActive },
        attrs: { style: "flex:1" },
        on: { click: () => deps.navigate(c.path) }
      }, [
        h("span", { attrs: { style: "font-weight:600;margin-right:8px" } }, heading),
        h("span", { attrs: { style: "color:#f88;margin-right:8px" } }, lossText),
        h("span", { attrs: { style: "color:#888;font-size:0.8rem" } }, `best: ${deps.uciToSan(c.fen, c.bestMove)}`)
      ]),
      h("button", {
        attrs: {
          style: "flex-shrink:0;padding:2px 8px;font-size:0.75rem;margin-left:4px;cursor:pointer",
          disabled: isSaved,
          title: isSaved ? "Already saved" : "Save this puzzle"
        },
        on: { click: () => {
          deps.savePuzzle(c, deps.redraw);
        } }
      }, isSaved ? "\u2713 Saved" : "Save"),
      h("a", {
        attrs: {
          href: deps.puzzleHref(c),
          style: "flex-shrink:0;padding:2px 8px;font-size:0.75rem;margin-left:4px"
        },
        on: {
          click: () => {
            if (!isSaved) deps.savePuzzle(c, deps.redraw);
          }
        }
      }, isSaved ? "Solve" : "Save & Solve")
    ]);
  });
  let navRow = null;
  if (puzzleCandidates.length > 0) {
    const currentIdx = puzzleCandidates.findIndex((c) => c.path === currentPath);
    const posLabel = currentIdx >= 0 ? `${currentIdx + 1} / ${puzzleCandidates.length}` : `\u2014 / ${puzzleCandidates.length}`;
    const prev2 = prevMistake(currentPath);
    const next2 = nextMistake(currentPath);
    navRow = h("div.pgn-import__row", { attrs: { style: "margin-bottom:4px" } }, [
      h("button", {
        attrs: { disabled: !prev2 },
        on: { click: () => {
          if (prev2) deps.navigate(prev2.path);
        } }
      }, "\u2190 Prev"),
      h("span", { attrs: { style: "margin:0 8px;font-size:0.85rem;color:#aaa" } }, posLabel),
      h("button", {
        attrs: { disabled: !next2 },
        on: { click: () => {
          if (next2) deps.navigate(next2.path);
        } }
      }, "Next \u2192")
    ]);
  }
  return h("div.game-list", [
    navRow,
    puzzleCandidates.length > 0 ? h("ul", rows) : h("div.game-list__header", batchState2 === "complete" ? "No blunder-level candidates found in this game." : "Run extraction after analysis completes.")
  ]);
}

// src/analyse/pgnExport.ts
var _getCtrl5 = () => {
  throw new Error("pgnExport not initialised");
};
var _getImportedGames3 = () => [];
var _getSelectedGameId3 = () => null;
var _clearGameAnalysis = () => {
};
var _redraw5 = () => {
};
function initPgnExport(deps) {
  _getCtrl5 = deps.getCtrl;
  _getImportedGames3 = deps.getImportedGames;
  _getSelectedGameId3 = deps.getSelectedGameId;
  _clearGameAnalysis = deps.clearGameAnalysis;
  _redraw5 = deps.redraw;
}
function buildPgn(annotated) {
  const ctrl2 = _getCtrl5();
  const importedGames2 = _getImportedGames3();
  const selectedGameId2 = _getSelectedGameId3();
  const game = importedGames2.find((g) => g.id === selectedGameId2);
  const headers = [
    ["Event", "?"],
    ["Site", "PatzerPro"],
    ["Date", game?.date ?? "????.??.??"],
    ["White", game?.white ?? "?"],
    ["Black", game?.black ?? "?"],
    ["Result", game?.result ?? "*"]
  ];
  if (annotated) headers.push(["Annotator", "PatzerPro"]);
  const headerStr = headers.map(([k, v]) => `[${k} "${v}"]`).join("\n");
  const nodes = ctrl2.mainline.slice(1);
  const parts = [];
  let needsMoveNum = true;
  let pgnPath = "";
  for (const node of nodes) {
    pgnPath += node.id;
    const isWhite = node.ply % 2 === 1;
    const moveNum = Math.ceil(node.ply / 2);
    if (isWhite || needsMoveNum) {
      parts.push(isWhite ? `${moveNum}.` : `${moveNum}...`);
    }
    parts.push(node.san ?? "?");
    if (annotated) {
      const commentParts = [];
      const ev = evalCache.get(pgnPath);
      if (ev) {
        if (ev.mate !== void 0) {
          commentParts.push(`[%eval #${ev.mate}]`);
        } else if (ev.cp !== void 0) {
          const pawns = (ev.cp / 100).toFixed(2);
          commentParts.push(`[%eval ${pawns}]`);
        }
      }
      if (node.clock !== void 0) {
        const total = Math.round(node.clock / 100);
        const hrs = Math.floor(total / 3600);
        const m = Math.floor(total % 3600 / 60);
        const s = total % 60;
        commentParts.push(`[%clk ${hrs}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}]`);
      }
      if (commentParts.length > 0) {
        parts.push(`{ ${commentParts.join(" ")} }`);
        needsMoveNum = isWhite;
      } else {
        needsMoveNum = false;
      }
    } else {
      needsMoveNum = false;
    }
  }
  parts.push(game?.result ?? "*");
  return `${headerStr}

${parts.join(" ")}
`;
}
function renderVariationPgn(nodeList, onMainline) {
  const filtered = nodeList.filter((n) => n.san);
  if (filtered.length === 0) return "";
  let out = "";
  for (let i = 0; i < filtered.length; i++) {
    const node = filtered[i];
    if (node.ply % 2 === 1) {
      out += `${Math.ceil(node.ply / 2)}. `;
    } else if (i === 0) {
      out += `${Math.ceil(node.ply / 2)}... `;
    }
    out += `${node.san} `;
  }
  return out.trimEnd();
}
function isMainlinePath(root, path) {
  return pathIsMainline(root, path);
}
function copyLinePgn(path) {
  const ctrl2 = _getCtrl5();
  const nodes = nodeListAt(ctrl2.root, path);
  const onMainline = isMainlinePath(ctrl2.root, path);
  const text = renderVariationPgn(nodes, onMainline);
  navigator.clipboard.writeText(text).catch(() => {
  });
}
function downloadPgn(annotated) {
  const pgn = buildPgn(annotated);
  const importedGames2 = _getImportedGames3();
  const selectedGameId2 = _getSelectedGameId3();
  const game = importedGames2.find((g) => g.id === selectedGameId2);
  const w = (game?.white ?? "White").replace(/\s+/g, "_");
  const b = (game?.black ?? "Black").replace(/\s+/g, "_");
  const suffix = annotated ? "_annotated" : "";
  const filename = `${w}_vs_${b}${suffix}.pgn`;
  const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  _redraw5();
}
function renderAnalysisControls(extraButtons) {
  const ctrl2 = _getCtrl5();
  const selectedGameId2 = _getSelectedGameId3();
  const hasGame = ctrl2.mainline.length > 1;
  let reviewLabel;
  let reviewTitle;
  if (batchAnalyzing) {
    const pct = batchQueue.length > 0 ? Math.round(batchDone / batchQueue.length * 100) : 0;
    reviewLabel = `${pct}%`;
    reviewTitle = "Analysis in progress \u2014 click to stop";
  } else if (analysisComplete) {
    reviewLabel = "Re-analyze";
    reviewTitle = "Clear previous analysis and run again";
  } else {
    reviewLabel = "Review";
    reviewTitle = "Analyze this game to detect mistakes and blunders";
  }
  const reviewClick = () => {
    if (batchAnalyzing) {
      incrementPendingStopCount();
      stopProtocol();
      setEngineSearchActive(false);
      setBatchAnalyzing(false);
      setBatchState("idle");
      setAnalysisRunning(false);
      if (selectedGameId2) void saveAnalysisToIdb("partial", selectedGameId2, buildAnalysisNodes(_getCtrl5().mainline, (p) => evalCache.get(p)), reviewDepth);
      syncArrow();
      _redraw5();
      return;
    }
    if (analysisComplete) {
      if (selectedGameId2) _clearGameAnalysis(selectedGameId2);
      clearEvalCache();
      resetCurrentEval();
      clearPuzzleCandidates();
      resetBatchState();
      syncArrow();
    }
    startBatchWhenReady();
  };
  const statusLine = batchAnalyzing && batchQueue.length > 0 ? h("div.analyse-review-controls__status", `Analyzing\u2026 ${batchDone} of ${batchQueue.length} moves`) : null;
  return h("div.analyse-review-controls", [
    h("div.analyse-review-controls__row", [
      h("button.btn-review", {
        class: { "btn-review--complete": analysisComplete },
        attrs: { disabled: !hasGame, title: reviewTitle },
        on: { click: reviewClick }
      }, reviewLabel),
      ...extraButtons ?? []
    ]),
    statusLine
  ]);
}

// src/keyboard.ts
var _getCtrl6 = () => {
  throw new Error("keyboard not initialised");
};
var _navigate3 = () => {
};
var _next = () => {
};
var _prev = () => {
};
var _first = () => {
};
var _last = () => {
};
var _flip = () => {
};
var _completeMove = () => {
};
var _redraw6 = () => {
};
function bindKeyboardHandlers(deps) {
  _getCtrl6 = deps.getCtrl;
  _navigate3 = deps.navigate;
  _next = deps.next;
  _prev = deps.prev;
  _first = deps.first;
  _last = deps.last;
  _flip = deps.flip;
  _completeMove = deps.completeMove;
  _redraw6 = deps.redraw;
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.shiftKey) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        previousBranch();
        _redraw6();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextBranch();
        _redraw6();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nextSibling2();
        _redraw6();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        prevSibling();
        _redraw6();
      }
      return;
    }
    if (e.key === "ArrowRight") {
      _next();
      _redraw6();
    } else if (e.key === "ArrowLeft") {
      _prev();
      _redraw6();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      _first();
      _redraw6();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      _last();
      _redraw6();
    } else if (e.key === "f" || e.key === "F") _flip();
    else if (e.key === "x" || e.key === "X") toggleThreatMode();
    else if (e.key === "l" || e.key === "L") toggleEngine();
    else if (e.key === "a" || e.key === "A") {
      setShowEngineArrows(!showEngineArrows);
      syncArrow();
      _redraw6();
    } else if (e.key === " ") {
      e.preventDefault();
      playBestMove();
    } else if (e.key === "?") {
      showKeyboardHelp = !showKeyboardHelp;
      _redraw6();
    }
  });
}
function previousBranch() {
  const ctrl2 = _getCtrl6();
  let path = pathInit(ctrl2.path);
  while (path.length > 0) {
    const parent = (() => {
      let p = ctrl2.root;
      const parts = [];
      for (let i = 0; i < path.length; i += 2) parts.push(path.slice(i, i + 2));
      for (const id of parts.slice(0, -1)) {
        const child = p.children.find((c) => c.id === id);
        if (!child) return null;
        p = child;
      }
      return p;
    })();
    if (parent && parent.children.length >= 2) {
      _navigate3(path);
      return;
    }
    path = pathInit(path);
  }
  _navigate3("");
}
function nextBranch() {
  const ctrl2 = _getCtrl6();
  let path = ctrl2.path;
  let node = ctrl2.node;
  while (node.children.length === 1) {
    const onlyChild = node.children[0];
    if (!onlyChild) break;
    path += onlyChild.id;
    node = onlyChild;
  }
  const firstChild = node.children[0];
  if (node.children.length >= 2 && firstChild) _navigate3(path + firstChild.id);
  else _last();
}
function nextSibling2() {
  const ctrl2 = _getCtrl6();
  const parentPath = pathInit(ctrl2.path);
  const parentNode2 = ctrl2.nodeList[ctrl2.nodeList.length - 2];
  if (!parentNode2 || parentNode2.children.length < 2) return;
  const idx = parentNode2.children.findIndex((c) => c.id === ctrl2.node.id);
  const next2 = parentNode2.children[(idx + 1) % parentNode2.children.length];
  if (!next2) return;
  _navigate3(parentPath + next2.id);
}
function prevSibling() {
  const ctrl2 = _getCtrl6();
  const parentPath = pathInit(ctrl2.path);
  const parentNode2 = ctrl2.nodeList[ctrl2.nodeList.length - 2];
  if (!parentNode2 || parentNode2.children.length < 2) return;
  const idx = parentNode2.children.findIndex((c) => c.id === ctrl2.node.id);
  const prev2 = parentNode2.children[(idx - 1 + parentNode2.children.length) % parentNode2.children.length];
  if (!prev2) return;
  _navigate3(parentPath + prev2.id);
}
function playBestMove() {
  const best = currentEval.best;
  if (!best || best.length < 4) return;
  const orig = best.slice(0, 2);
  const dest = best.slice(2, 4);
  const promotion = best.length > 4 ? best.slice(4) : void 0;
  _completeMove(orig, dest, promotion);
}
var showKeyboardHelp = false;
function renderKeyboardHelp() {
  if (!showKeyboardHelp) return null;
  return h("div.keyboard-help", {
    on: { click: () => {
      showKeyboardHelp = false;
      _redraw6();
    } }
  }, [
    h("div.keyboard-help__box", { on: { click: (e) => e.stopPropagation() } }, [
      h("h2", "Keyboard shortcuts"),
      h("table", [
        h("tbody", [
          ["\u2190  /  \u2192", "Previous / next move"],
          ["\u2191  /  \u2193", "First / last move"],
          ["Shift + \u2190", "Jump to previous fork"],
          ["Shift + \u2192", "Jump to next fork"],
          ["Shift + \u2191\u2193", "Switch variation at fork"],
          ["Space", "Play engine best move"],
          ["l", "Toggle engine"],
          ["a", "Toggle engine arrows"],
          ["x", "Toggle threat mode"],
          ["f", "Flip board"],
          ["?", "Show this help"]
        ].map(([key, desc]) => h("tr", [h("td", key), h("td", desc)])))
      ]),
      h("button.keyboard-help__close", {
        on: { click: () => {
          showKeyboardHelp = false;
          _redraw6();
        } }
      }, "\u2715")
    ])
  ]);
}

// src/import/types.ts
var gameIdCounter = 0;
function nextGameId() {
  return `game-${++gameIdCounter}`;
}
function restoreGameIdCounter(max) {
  if (max > gameIdCounter) gameIdCounter = max;
}
function parsePgnHeader(pgn, tag) {
  return pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))?.[1];
}
function parseRating(s) {
  if (typeof s === "number") return s > 0 ? s : void 0;
  if (!s) return void 0;
  const n = parseInt(s, 10);
  return isNaN(n) || n <= 0 ? void 0 : n;
}
function timeClassFromTimeControl(tc) {
  if (!tc || tc === "-") return void 0;
  const secs = parseInt(tc, 10);
  if (isNaN(secs)) return void 0;
  if (secs < 180) return "ultrabullet";
  if (secs < 600) return "bullet";
  if (secs < 1800) return "blitz";
  if (secs <= 10800) return "rapid";
  return "classical";
}

// src/import/filters.ts
var importFilters = {
  rated: true,
  speeds: /* @__PURE__ */ new Set(),
  // empty = all speeds
  dateRange: "1month",
  customFrom: "",
  customTo: ""
};
var SPEED_OPTIONS = [
  { value: "bullet", label: "Bullet", icon: "\uE032" },
  // licon.Bullet
  { value: "blitz", label: "Blitz", icon: "\uE008" },
  // licon.FlameBlitz
  { value: "rapid", label: "Rapid", icon: "\uE002" }
  // licon.Rabbit
];
var DATE_RANGE_OPTIONS = [
  { value: "24h", label: "24h" },
  { value: "1week", label: "1 wk" },
  { value: "1month", label: "1 mo" },
  { value: "3months", label: "3 mo" },
  { value: "1year", label: "1 yr" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" }
];
function filterGamesByDate(games) {
  if (importFilters.dateRange === "all") return games;
  if (importFilters.dateRange === "custom") {
    return games.filter((g) => {
      const d = g.date?.slice(0, 10);
      if (!d) return true;
      if (importFilters.customFrom && d < importFilters.customFrom) return false;
      if (importFilters.customTo && d > importFilters.customTo) return false;
      return true;
    });
  }
  const now = /* @__PURE__ */ new Date();
  let cutoff;
  switch (importFilters.dateRange) {
    case "24h":
      cutoff = new Date(now.getTime() - 864e5);
      break;
    case "1week":
      cutoff = new Date(now.getTime() - 7 * 864e5);
      break;
    case "1month":
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case "3months":
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 3);
      break;
    case "1year":
      cutoff = new Date(now);
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    default:
      return games;
  }
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return games.filter((g) => !g.date || g.date.slice(0, 10) >= cutoffStr);
}

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/variant.js
var Crazyhouse = class extends Position {
  constructor() {
    super("crazyhouse");
  }
  reset() {
    super.reset();
    this.pockets = Material.empty();
  }
  setupUnchecked(setup) {
    super.setupUnchecked(setup);
    this.board.promoted = setup.board.promoted.intersect(setup.board.occupied).diff(setup.board.king).diff(setup.board.pawn);
    this.pockets = setup.pockets ? setup.pockets.clone() : Material.empty();
  }
  static default() {
    const pos = new this();
    pos.reset();
    return pos;
  }
  static fromSetup(setup) {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map((_) => pos);
  }
  clone() {
    return super.clone();
  }
  validate() {
    return super.validate().chain((_) => {
      var _a, _b;
      if ((_a = this.pockets) === null || _a === void 0 ? void 0 : _a.count("king")) {
        return Result.err(new PositionError(IllegalSetup.Kings));
      }
      if ((((_b = this.pockets) === null || _b === void 0 ? void 0 : _b.size()) || 0) + this.board.occupied.size() > 64) {
        return Result.err(new PositionError(IllegalSetup.Variant));
      }
      return Result.ok(void 0);
    });
  }
  hasInsufficientMaterial(color) {
    if (!this.pockets)
      return super.hasInsufficientMaterial(color);
    return this.board.occupied.size() + this.pockets.size() <= 3 && this.board.pawn.isEmpty() && this.board.promoted.isEmpty() && this.board.rooksAndQueens().isEmpty() && this.pockets.count("pawn") <= 0 && this.pockets.count("rook") <= 0 && this.pockets.count("queen") <= 0;
  }
  dropDests(ctx) {
    var _a, _b;
    const mask = this.board.occupied.complement().intersect(((_a = this.pockets) === null || _a === void 0 ? void 0 : _a[this.turn].hasNonPawns()) ? SquareSet.full() : ((_b = this.pockets) === null || _b === void 0 ? void 0 : _b[this.turn].hasPawns()) ? SquareSet.backranks().complement() : SquareSet.empty());
    ctx = ctx || this.ctx();
    if (defined(ctx.king) && ctx.checkers.nonEmpty()) {
      const checker = ctx.checkers.singleSquare();
      if (!defined(checker))
        return SquareSet.empty();
      return mask.intersect(between(checker, ctx.king));
    } else
      return mask;
  }
};
var Atomic = class extends Position {
  constructor() {
    super("atomic");
  }
  static default() {
    const pos = new this();
    pos.reset();
    return pos;
  }
  static fromSetup(setup) {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map((_) => pos);
  }
  clone() {
    return super.clone();
  }
  validate() {
    if (this.board.occupied.isEmpty())
      return Result.err(new PositionError(IllegalSetup.Empty));
    if (this.board.king.size() > 2)
      return Result.err(new PositionError(IllegalSetup.Kings));
    const otherKing = this.board.kingOf(opposite(this.turn));
    if (!defined(otherKing))
      return Result.err(new PositionError(IllegalSetup.Kings));
    if (this.kingAttackers(otherKing, this.turn, this.board.occupied).nonEmpty()) {
      return Result.err(new PositionError(IllegalSetup.OppositeCheck));
    }
    if (SquareSet.backranks().intersects(this.board.pawn)) {
      return Result.err(new PositionError(IllegalSetup.PawnsOnBackrank));
    }
    return Result.ok(void 0);
  }
  kingAttackers(square, attacker, occupied) {
    const attackerKings = this.board.pieces(attacker, "king");
    if (attackerKings.isEmpty() || kingAttacks(square).intersects(attackerKings)) {
      return SquareSet.empty();
    }
    return super.kingAttackers(square, attacker, occupied);
  }
  playCaptureAt(square, captured) {
    super.playCaptureAt(square, captured);
    this.board.take(square);
    for (const explode of kingAttacks(square).intersect(this.board.occupied).diff(this.board.pawn)) {
      const piece = this.board.take(explode);
      if ((piece === null || piece === void 0 ? void 0 : piece.role) === "rook")
        this.castles.discardRook(explode);
      if ((piece === null || piece === void 0 ? void 0 : piece.role) === "king")
        this.castles.discardColor(piece.color);
    }
  }
  hasInsufficientMaterial(color) {
    if (this.board.pieces(opposite(color), "king").isEmpty())
      return false;
    if (this.board[color].diff(this.board.king).isEmpty())
      return true;
    if (this.board[opposite(color)].diff(this.board.king).nonEmpty()) {
      if (this.board.occupied.equals(this.board.bishop.union(this.board.king))) {
        if (!this.board.bishop.intersect(this.board.white).intersects(SquareSet.darkSquares())) {
          return !this.board.bishop.intersect(this.board.black).intersects(SquareSet.lightSquares());
        }
        if (!this.board.bishop.intersect(this.board.white).intersects(SquareSet.lightSquares())) {
          return !this.board.bishop.intersect(this.board.black).intersects(SquareSet.darkSquares());
        }
      }
      return false;
    }
    if (this.board.queen.nonEmpty() || this.board.pawn.nonEmpty())
      return false;
    if (this.board.knight.union(this.board.bishop).union(this.board.rook).size() === 1)
      return true;
    if (this.board.occupied.equals(this.board.knight.union(this.board.king))) {
      return this.board.knight.size() <= 2;
    }
    return false;
  }
  dests(square, ctx) {
    ctx = ctx || this.ctx();
    let dests = SquareSet.empty();
    for (const to of pseudoDests(this, square, ctx)) {
      const after = this.clone();
      after.play({ from: square, to });
      const ourKing = after.board.kingOf(this.turn);
      if (defined(ourKing) && (!defined(after.board.kingOf(after.turn)) || after.kingAttackers(ourKing, after.turn, after.board.occupied).isEmpty())) {
        dests = dests.with(to);
      }
    }
    return dests;
  }
  isVariantEnd() {
    return !!this.variantOutcome();
  }
  variantOutcome(_ctx) {
    for (const color of COLORS) {
      if (this.board.pieces(color, "king").isEmpty())
        return { winner: opposite(color) };
    }
    return;
  }
};
var Antichess = class extends Position {
  constructor() {
    super("antichess");
  }
  reset() {
    super.reset();
    this.castles = Castles.empty();
  }
  setupUnchecked(setup) {
    super.setupUnchecked(setup);
    this.castles = Castles.empty();
  }
  static default() {
    const pos = new this();
    pos.reset();
    return pos;
  }
  static fromSetup(setup) {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map((_) => pos);
  }
  clone() {
    return super.clone();
  }
  validate() {
    if (this.board.occupied.isEmpty())
      return Result.err(new PositionError(IllegalSetup.Empty));
    if (SquareSet.backranks().intersects(this.board.pawn)) {
      return Result.err(new PositionError(IllegalSetup.PawnsOnBackrank));
    }
    return Result.ok(void 0);
  }
  kingAttackers(_square, _attacker, _occupied) {
    return SquareSet.empty();
  }
  ctx() {
    const ctx = super.ctx();
    if (defined(this.epSquare) && pawnAttacks(opposite(this.turn), this.epSquare).intersects(this.board.pieces(this.turn, "pawn"))) {
      ctx.mustCapture = true;
      return ctx;
    }
    const enemy = this.board[opposite(this.turn)];
    for (const from of this.board[this.turn]) {
      if (pseudoDests(this, from, ctx).intersects(enemy)) {
        ctx.mustCapture = true;
        return ctx;
      }
    }
    return ctx;
  }
  dests(square, ctx) {
    ctx = ctx || this.ctx();
    const dests = pseudoDests(this, square, ctx);
    const enemy = this.board[opposite(this.turn)];
    return dests.intersect(ctx.mustCapture ? defined(this.epSquare) && this.board.getRole(square) === "pawn" ? enemy.with(this.epSquare) : enemy : SquareSet.full());
  }
  hasInsufficientMaterial(color) {
    if (this.board[color].isEmpty())
      return false;
    if (this.board[opposite(color)].isEmpty())
      return true;
    if (this.board.occupied.equals(this.board.bishop)) {
      const weSomeOnLight = this.board[color].intersects(SquareSet.lightSquares());
      const weSomeOnDark = this.board[color].intersects(SquareSet.darkSquares());
      const theyAllOnDark = this.board[opposite(color)].isDisjoint(SquareSet.lightSquares());
      const theyAllOnLight = this.board[opposite(color)].isDisjoint(SquareSet.darkSquares());
      return weSomeOnLight && theyAllOnDark || weSomeOnDark && theyAllOnLight;
    }
    if (this.board.occupied.equals(this.board.knight) && this.board.occupied.size() === 2) {
      return this.board.white.intersects(SquareSet.lightSquares()) !== this.board.black.intersects(SquareSet.darkSquares()) !== (this.turn === color);
    }
    return false;
  }
  isVariantEnd() {
    return this.board[this.turn].isEmpty();
  }
  variantOutcome(ctx) {
    ctx = ctx || this.ctx();
    if (ctx.variantEnd || this.isStalemate(ctx)) {
      return { winner: this.turn };
    }
    return;
  }
};
var KingOfTheHill = class extends Position {
  constructor() {
    super("kingofthehill");
  }
  static default() {
    const pos = new this();
    pos.reset();
    return pos;
  }
  static fromSetup(setup) {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map((_) => pos);
  }
  clone() {
    return super.clone();
  }
  hasInsufficientMaterial(_color) {
    return false;
  }
  isVariantEnd() {
    return this.board.king.intersects(SquareSet.center());
  }
  variantOutcome(_ctx) {
    for (const color of COLORS) {
      if (this.board.pieces(color, "king").intersects(SquareSet.center()))
        return { winner: color };
    }
    return;
  }
};
var ThreeCheck = class extends Position {
  constructor() {
    super("3check");
  }
  reset() {
    super.reset();
    this.remainingChecks = RemainingChecks.default();
  }
  setupUnchecked(setup) {
    var _a;
    super.setupUnchecked(setup);
    this.remainingChecks = ((_a = setup.remainingChecks) === null || _a === void 0 ? void 0 : _a.clone()) || RemainingChecks.default();
  }
  static default() {
    const pos = new this();
    pos.reset();
    return pos;
  }
  static fromSetup(setup) {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map((_) => pos);
  }
  clone() {
    return super.clone();
  }
  hasInsufficientMaterial(color) {
    return this.board.pieces(color, "king").equals(this.board[color]);
  }
  isVariantEnd() {
    return !!this.remainingChecks && (this.remainingChecks.white <= 0 || this.remainingChecks.black <= 0);
  }
  variantOutcome(_ctx) {
    if (this.remainingChecks) {
      for (const color of COLORS) {
        if (this.remainingChecks[color] <= 0)
          return { winner: color };
      }
    }
    return;
  }
};
var racingKingsBoard = () => {
  const board = Board.empty();
  board.occupied = new SquareSet(65535, 0);
  board.promoted = SquareSet.empty();
  board.white = new SquareSet(61680, 0);
  board.black = new SquareSet(3855, 0);
  board.pawn = SquareSet.empty();
  board.knight = new SquareSet(6168, 0);
  board.bishop = new SquareSet(9252, 0);
  board.rook = new SquareSet(16962, 0);
  board.queen = new SquareSet(129, 0);
  board.king = new SquareSet(33024, 0);
  return board;
};
var RacingKings = class extends Position {
  constructor() {
    super("racingkings");
  }
  reset() {
    this.board = racingKingsBoard();
    this.pockets = void 0;
    this.turn = "white";
    this.castles = Castles.empty();
    this.epSquare = void 0;
    this.remainingChecks = void 0;
    this.halfmoves = 0;
    this.fullmoves = 1;
  }
  setupUnchecked(setup) {
    super.setupUnchecked(setup);
    this.castles = Castles.empty();
  }
  static default() {
    const pos = new this();
    pos.reset();
    return pos;
  }
  static fromSetup(setup) {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map((_) => pos);
  }
  clone() {
    return super.clone();
  }
  validate() {
    if (this.isCheck() || this.board.pawn.nonEmpty())
      return Result.err(new PositionError(IllegalSetup.Variant));
    return super.validate();
  }
  dests(square, ctx) {
    ctx = ctx || this.ctx();
    if (square === ctx.king)
      return super.dests(square, ctx);
    let dests = SquareSet.empty();
    for (const to of super.dests(square, ctx)) {
      const move3 = { from: square, to };
      const after = this.clone();
      after.play(move3);
      if (!after.isCheck())
        dests = dests.with(to);
    }
    return dests;
  }
  hasInsufficientMaterial(_color) {
    return false;
  }
  isVariantEnd() {
    const goal = SquareSet.fromRank(7);
    const inGoal = this.board.king.intersect(goal);
    if (inGoal.isEmpty())
      return false;
    if (this.turn === "white" || inGoal.intersects(this.board.black))
      return true;
    const blackKing = this.board.kingOf("black");
    if (defined(blackKing)) {
      const occ = this.board.occupied.without(blackKing);
      for (const target of kingAttacks(blackKing).intersect(goal).diff(this.board.black)) {
        if (this.kingAttackers(target, "white", occ).isEmpty())
          return false;
      }
    }
    return true;
  }
  variantOutcome(ctx) {
    if (ctx ? !ctx.variantEnd : !this.isVariantEnd())
      return;
    const goal = SquareSet.fromRank(7);
    const blackInGoal = this.board.pieces("black", "king").intersects(goal);
    const whiteInGoal = this.board.pieces("white", "king").intersects(goal);
    if (blackInGoal && !whiteInGoal)
      return { winner: "black" };
    if (whiteInGoal && !blackInGoal)
      return { winner: "white" };
    return { winner: void 0 };
  }
};
var hordeBoard = () => {
  const board = Board.empty();
  board.occupied = new SquareSet(4294967295, 4294901862);
  board.promoted = SquareSet.empty();
  board.white = new SquareSet(4294967295, 102);
  board.black = new SquareSet(0, 4294901760);
  board.pawn = new SquareSet(4294967295, 16711782);
  board.knight = new SquareSet(0, 1107296256);
  board.bishop = new SquareSet(0, 603979776);
  board.rook = new SquareSet(0, 2164260864);
  board.queen = new SquareSet(0, 134217728);
  board.king = new SquareSet(0, 268435456);
  return board;
};
var Horde = class extends Position {
  constructor() {
    super("horde");
  }
  reset() {
    this.board = hordeBoard();
    this.pockets = void 0;
    this.turn = "white";
    this.castles = Castles.default();
    this.castles.discardColor("white");
    this.epSquare = void 0;
    this.remainingChecks = void 0;
    this.halfmoves = 0;
    this.fullmoves = 1;
  }
  static default() {
    const pos = new this();
    pos.reset();
    return pos;
  }
  static fromSetup(setup) {
    const pos = new this();
    pos.setupUnchecked(setup);
    return pos.validate().map((_) => pos);
  }
  clone() {
    return super.clone();
  }
  validate() {
    if (this.board.occupied.isEmpty())
      return Result.err(new PositionError(IllegalSetup.Empty));
    if (this.board.king.size() !== 1)
      return Result.err(new PositionError(IllegalSetup.Kings));
    const otherKing = this.board.kingOf(opposite(this.turn));
    if (defined(otherKing) && this.kingAttackers(otherKing, this.turn, this.board.occupied).nonEmpty()) {
      return Result.err(new PositionError(IllegalSetup.OppositeCheck));
    }
    for (const color of COLORS) {
      const backranks = this.board.pieces(color, "king").isEmpty() ? SquareSet.backrank(opposite(color)) : SquareSet.backranks();
      if (this.board.pieces(color, "pawn").intersects(backranks)) {
        return Result.err(new PositionError(IllegalSetup.PawnsOnBackrank));
      }
    }
    return Result.ok(void 0);
  }
  hasInsufficientMaterial(color) {
    if (this.board.pieces(color, "king").nonEmpty())
      return false;
    const oppositeSquareColor = (squareColor) => squareColor === "light" ? "dark" : "light";
    const coloredSquares = (squareColor) => squareColor === "light" ? SquareSet.lightSquares() : SquareSet.darkSquares();
    const hasBishopPair = (side) => {
      const bishops = this.board.pieces(side, "bishop");
      return bishops.intersects(SquareSet.darkSquares()) && bishops.intersects(SquareSet.lightSquares());
    };
    const horde = MaterialSide.fromBoard(this.board, color);
    const hordeBishops = (squareColor) => coloredSquares(squareColor).intersect(this.board.pieces(color, "bishop")).size();
    const hordeBishopColor = hordeBishops("light") >= 1 ? "light" : "dark";
    const hordeNum = horde.pawn + horde.knight + horde.rook + horde.queen + Math.min(hordeBishops("dark"), 2) + Math.min(hordeBishops("light"), 2);
    const pieces = MaterialSide.fromBoard(this.board, opposite(color));
    const piecesBishops = (squareColor) => coloredSquares(squareColor).intersect(this.board.pieces(opposite(color), "bishop")).size();
    const piecesNum = pieces.size();
    const piecesOfRoleNot = (piece) => piecesNum - piece;
    if (hordeNum === 0)
      return true;
    if (hordeNum >= 4) {
      return false;
    }
    if ((horde.pawn >= 1 || horde.queen >= 1) && hordeNum >= 2) {
      return false;
    }
    if (horde.rook >= 1 && hordeNum >= 2) {
      if (!(hordeNum === 2 && horde.rook === 1 && horde.bishop === 1 && piecesOfRoleNot(piecesBishops(hordeBishopColor)) === 1)) {
        return false;
      }
    }
    if (hordeNum === 1) {
      if (piecesNum === 1) {
        return true;
      } else if (horde.queen === 1) {
        return !(pieces.pawn >= 1 || pieces.rook >= 1 || piecesBishops("light") >= 2 || piecesBishops("dark") >= 2);
      } else if (horde.pawn === 1) {
        const pawnSquare = this.board.pieces(color, "pawn").last();
        const promoteToQueen = this.clone();
        promoteToQueen.board.set(pawnSquare, { color, role: "queen" });
        const promoteToKnight = this.clone();
        promoteToKnight.board.set(pawnSquare, { color, role: "knight" });
        return promoteToQueen.hasInsufficientMaterial(color) && promoteToKnight.hasInsufficientMaterial(color);
      } else if (horde.rook === 1) {
        return !(pieces.pawn >= 2 || pieces.rook >= 1 && pieces.pawn >= 1 || pieces.rook >= 1 && pieces.knight >= 1 || pieces.pawn >= 1 && pieces.knight >= 1);
      } else if (horde.bishop === 1) {
        return !// The king can be mated on A1 if there is a pawn/opposite-color-bishop
        // on A2 and an opposite-color-bishop on B1.
        // If black has two or more pawns, white gets the benefit of the doubt;
        // there is an outside chance that white promotes its pawns to
        // opposite-color-bishops and selfmates theirself.
        // Every other case that the king is mated by the bishop requires that
        // black has two pawns or two opposite-color-bishop or a pawn and an
        // opposite-color-bishop.
        // For example a king on A3 can be mated if there is
        // a pawn/opposite-color-bishop on A4, a pawn/opposite-color-bishop on
        // B3, a pawn/bishop/rook/queen on A2 and any other piece on B2.
        (piecesBishops(oppositeSquareColor(hordeBishopColor)) >= 2 || piecesBishops(oppositeSquareColor(hordeBishopColor)) >= 1 && pieces.pawn >= 1 || pieces.pawn >= 2);
      } else if (horde.knight === 1) {
        return !// The king on A1 can be smother mated by a knight on C2 if there is
        // a pawn/knight/bishop on B2, a knight/rook on B1 and any other piece
        // on A2.
        // Moreover, when black has four or more pieces and two of them are
        // pawns, black can promote their pawns and selfmate theirself.
        (piecesNum >= 4 && (pieces.knight >= 2 || pieces.pawn >= 2 || pieces.rook >= 1 && pieces.knight >= 1 || pieces.rook >= 1 && pieces.bishop >= 1 || pieces.knight >= 1 && pieces.bishop >= 1 || pieces.rook >= 1 && pieces.pawn >= 1 || pieces.knight >= 1 && pieces.pawn >= 1 || pieces.bishop >= 1 && pieces.pawn >= 1 || hasBishopPair(opposite(color)) && pieces.pawn >= 1) && (piecesBishops("dark") < 2 || piecesOfRoleNot(piecesBishops("dark")) >= 3) && (piecesBishops("light") < 2 || piecesOfRoleNot(piecesBishops("light")) >= 3));
      }
    } else if (hordeNum === 2) {
      if (piecesNum === 1) {
        return true;
      } else if (horde.knight === 2) {
        return pieces.pawn + pieces.bishop + pieces.knight < 1;
      } else if (hasBishopPair(color)) {
        return !// A king on A1 obstructed by a pawn/bishop on A2 is mated
        // by the bishop pair.
        (pieces.pawn >= 1 || pieces.bishop >= 1 || pieces.knight >= 1 && pieces.rook + pieces.queen >= 1);
      } else if (horde.bishop >= 1 && horde.knight >= 1) {
        return !// A king on A1 obstructed by a pawn/opposite-color-bishop on
        // A2 is mated by a knight on D2 and a bishop on C3.
        (pieces.pawn >= 1 || piecesBishops(oppositeSquareColor(hordeBishopColor)) >= 1 || piecesOfRoleNot(piecesBishops(hordeBishopColor)) >= 3);
      } else {
        return !// A king on A1 obstructed by a pawn/opposite-bishop/knight
        // on A2 and a opposite-bishop/knight on B1 is mated by two
        // bishops on B2 and C3. This position is theoretically
        // achievable even when black has two pawns or when they
        // have a pawn and an opposite color bishop.
        (pieces.pawn >= 1 && piecesBishops(oppositeSquareColor(hordeBishopColor)) >= 1 || pieces.pawn >= 1 && pieces.knight >= 1 || piecesBishops(oppositeSquareColor(hordeBishopColor)) >= 1 && pieces.knight >= 1 || piecesBishops(oppositeSquareColor(hordeBishopColor)) >= 2 || pieces.knight >= 2 || pieces.pawn >= 2);
      }
    } else if (hordeNum === 3) {
      if (horde.knight === 2 && horde.bishop === 1 || horde.knight === 3 || hasBishopPair(color)) {
        return false;
      } else {
        return piecesNum === 1;
      }
    }
    return true;
  }
  isVariantEnd() {
    return this.board.white.isEmpty() || this.board.black.isEmpty();
  }
  variantOutcome(_ctx) {
    if (this.board.white.isEmpty())
      return { winner: "black" };
    if (this.board.black.isEmpty())
      return { winner: "white" };
    return;
  }
};
var defaultPosition = (rules) => {
  switch (rules) {
    case "chess":
      return Chess.default();
    case "antichess":
      return Antichess.default();
    case "atomic":
      return Atomic.default();
    case "horde":
      return Horde.default();
    case "racingkings":
      return RacingKings.default();
    case "kingofthehill":
      return KingOfTheHill.default();
    case "3check":
      return ThreeCheck.default();
    case "crazyhouse":
      return Crazyhouse.default();
  }
};
var setupPosition = (rules, setup) => {
  switch (rules) {
    case "chess":
      return Chess.fromSetup(setup);
    case "antichess":
      return Antichess.fromSetup(setup);
    case "atomic":
      return Atomic.fromSetup(setup);
    case "horde":
      return Horde.fromSetup(setup);
    case "racingkings":
      return RacingKings.fromSetup(setup);
    case "kingofthehill":
      return KingOfTheHill.fromSetup(setup);
    case "3check":
      return ThreeCheck.fromSetup(setup);
    case "crazyhouse":
      return Crazyhouse.fromSetup(setup);
  }
};

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/pgn.js
var defaultGame = (initHeaders = defaultHeaders) => ({
  headers: initHeaders(),
  moves: new Node()
});
var Node = class {
  constructor() {
    this.children = [];
  }
  *mainlineNodes() {
    let node = this;
    while (node.children.length) {
      const child = node.children[0];
      yield child;
      node = child;
    }
  }
  *mainline() {
    for (const child of this.mainlineNodes())
      yield child.data;
  }
  end() {
    let node = this;
    while (node.children.length)
      node = node.children[0];
    return node;
  }
};
var ChildNode = class extends Node {
  constructor(data) {
    super();
    this.data = data;
  }
};
var makeOutcome = (outcome) => {
  if (!outcome)
    return "*";
  else if (outcome.winner === "white")
    return "1-0";
  else if (outcome.winner === "black")
    return "0-1";
  else
    return "1/2-1/2";
};
var parseOutcome = (s) => {
  if (s === "1-0" || s === "1\u20130" || s === "1\u20140")
    return { winner: "white" };
  else if (s === "0-1" || s === "0\u20131" || s === "0\u20141")
    return { winner: "black" };
  else if (s === "1/2-1/2" || s === "1/2\u20131/2" || s === "1/2\u20141/2")
    return { winner: void 0 };
  else
    return;
};
var defaultHeaders = () => /* @__PURE__ */ new Map([
  ["Event", "?"],
  ["Site", "?"],
  ["Date", "????.??.??"],
  ["Round", "?"],
  ["White", "?"],
  ["Black", "?"],
  ["Result", "*"]
]);
var BOM = "\uFEFF";
var isWhitespace = (line) => /^\s*$/.test(line);
var isCommentLine = (line) => line.startsWith("%");
var PgnError = class extends Error {
};
var PgnParser = class {
  constructor(emitGame, initHeaders = defaultHeaders, maxBudget = 1e6) {
    this.emitGame = emitGame;
    this.initHeaders = initHeaders;
    this.maxBudget = maxBudget;
    this.lineBuf = [];
    this.resetGame();
    this.state = 0;
  }
  resetGame() {
    this.budget = this.maxBudget;
    this.found = false;
    this.state = 1;
    this.game = defaultGame(this.initHeaders);
    this.stack = [{ parent: this.game.moves, root: true }];
    this.commentBuf = [];
  }
  consumeBudget(cost) {
    this.budget -= cost;
    if (this.budget < 0)
      throw new PgnError("ERR_PGN_BUDGET");
  }
  parse(data, options) {
    if (this.budget < 0)
      return;
    try {
      let idx = 0;
      for (; ; ) {
        const nlIdx = data.indexOf("\n", idx);
        if (nlIdx === -1) {
          break;
        }
        const crIdx = nlIdx > idx && data[nlIdx - 1] === "\r" ? nlIdx - 1 : nlIdx;
        this.consumeBudget(nlIdx - idx);
        this.lineBuf.push(data.slice(idx, crIdx));
        idx = nlIdx + 1;
        this.handleLine();
      }
      this.consumeBudget(data.length - idx);
      this.lineBuf.push(data.slice(idx));
      if (!(options === null || options === void 0 ? void 0 : options.stream)) {
        this.handleLine();
        this.emit(void 0);
      }
    } catch (err) {
      this.emit(err);
    }
  }
  handleLine() {
    let freshLine = true;
    let line = this.lineBuf.join("");
    this.lineBuf = [];
    continuedLine: for (; ; ) {
      switch (this.state) {
        case 0:
          if (line.startsWith(BOM))
            line = line.slice(BOM.length);
          this.state = 1;
        // fall through
        case 1:
          if (isWhitespace(line) || isCommentLine(line))
            return;
          this.found = true;
          this.state = 2;
        // fall through
        case 2: {
          if (isCommentLine(line))
            return;
          let moreHeaders = true;
          while (moreHeaders) {
            moreHeaders = false;
            line = line.replace(/^\s*\[([A-Za-z0-9][A-Za-z0-9_+#=:-]*)\s+"((?:[^"\\]|\\"|\\\\)*)"\]/, (_match, headerName, headerValue) => {
              this.consumeBudget(200);
              this.handleHeader(headerName, headerValue.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
              moreHeaders = true;
              freshLine = false;
              return "";
            });
          }
          if (isWhitespace(line))
            return;
          this.state = 3;
        }
        case 3: {
          if (freshLine) {
            if (isCommentLine(line))
              return;
            if (isWhitespace(line))
              return this.emit(void 0);
          }
          const tokenRegex = /(?:[NBKRQ]?[a-h]?[1-8]?[-x]?[a-h][1-8](?:=?[nbrqkNBRQK])?|[pnbrqkPNBRQK]?@[a-h][1-8]|[O0o][-–—][O0o](?:[-–—][O0o])?)[+#]?|--|Z0|0000|@@@@|{|;|\$\d{1,4}|[?!]{1,2}|\(|\)|\*|1[-–—]0|0[-–—]1|1\/2[-–—]1\/2/g;
          let match;
          while (match = tokenRegex.exec(line)) {
            const frame = this.stack[this.stack.length - 1];
            let token = match[0];
            if (token === ";")
              return;
            else if (token.startsWith("$"))
              this.handleNag(parseInt(token.slice(1), 10));
            else if (token === "!")
              this.handleNag(1);
            else if (token === "?")
              this.handleNag(2);
            else if (token === "!!")
              this.handleNag(3);
            else if (token === "??")
              this.handleNag(4);
            else if (token === "!?")
              this.handleNag(5);
            else if (token === "?!")
              this.handleNag(6);
            else if (token === "1-0" || token === "1\u20130" || token === "1\u20140" || token === "0-1" || token === "0\u20131" || token === "0\u20141" || token === "1/2-1/2" || token === "1/2\u20131/2" || token === "1/2\u20141/2" || token === "*") {
              if (this.stack.length === 1 && token !== "*")
                this.handleHeader("Result", token);
            } else if (token === "(") {
              this.consumeBudget(100);
              this.stack.push({ parent: frame.parent, root: false });
            } else if (token === ")") {
              if (this.stack.length > 1)
                this.stack.pop();
            } else if (token === "{") {
              const openIndex = tokenRegex.lastIndex;
              const beginIndex = line[openIndex] === " " ? openIndex + 1 : openIndex;
              line = line.slice(beginIndex);
              this.state = 4;
              continue continuedLine;
            } else {
              this.consumeBudget(100);
              if (token.startsWith("O") || token.startsWith("0") || token.startsWith("o")) {
                token = token.replace(/[0o]/g, "O").replace(/[–—]/g, "-");
              } else if (token === "Z0" || token === "0000" || token === "@@@@")
                token = "--";
              if (frame.node)
                frame.parent = frame.node;
              frame.node = new ChildNode({
                san: token,
                startingComments: frame.startingComments
              });
              frame.startingComments = void 0;
              frame.root = false;
              frame.parent.children.push(frame.node);
            }
          }
          return;
        }
        case 4: {
          const closeIndex = line.indexOf("}");
          if (closeIndex === -1) {
            this.commentBuf.push(line);
            return;
          } else {
            const endIndex = closeIndex > 0 && line[closeIndex - 1] === " " ? closeIndex - 1 : closeIndex;
            this.commentBuf.push(line.slice(0, endIndex));
            this.handleComment();
            line = line.slice(closeIndex);
            this.state = 3;
            freshLine = false;
          }
        }
      }
    }
  }
  handleHeader(name, value) {
    this.game.headers.set(name, name === "Result" ? makeOutcome(parseOutcome(value)) : value);
  }
  handleNag(nag) {
    var _a;
    this.consumeBudget(50);
    const frame = this.stack[this.stack.length - 1];
    if (frame.node) {
      (_a = frame.node.data).nags || (_a.nags = []);
      frame.node.data.nags.push(nag);
    }
  }
  handleComment() {
    var _a, _b;
    this.consumeBudget(100);
    const frame = this.stack[this.stack.length - 1];
    const comment = this.commentBuf.join("\n");
    this.commentBuf = [];
    if (frame.node) {
      (_a = frame.node.data).comments || (_a.comments = []);
      frame.node.data.comments.push(comment);
    } else if (frame.root) {
      (_b = this.game).comments || (_b.comments = []);
      this.game.comments.push(comment);
    } else {
      frame.startingComments || (frame.startingComments = []);
      frame.startingComments.push(comment);
    }
  }
  emit(err) {
    if (this.state === 4)
      this.handleComment();
    if (err)
      return this.emitGame(this.game, err);
    if (this.found)
      this.emitGame(this.game, void 0);
    this.resetGame();
  }
};
var parsePgn = (pgn, initHeaders = defaultHeaders) => {
  const games = [];
  new PgnParser((game) => games.push(game), initHeaders, NaN).parse(pgn);
  return games;
};
var parseVariant = (variant) => {
  switch ((variant || "chess").toLowerCase()) {
    case "chess":
    case "chess960":
    case "chess 960":
    case "standard":
    case "from position":
    case "classical":
    case "normal":
    case "fischerandom":
    // Cute Chess
    case "fischerrandom":
    case "fischer random":
    case "wild/0":
    case "wild/1":
    case "wild/2":
    case "wild/3":
    case "wild/4":
    case "wild/5":
    case "wild/6":
    case "wild/7":
    case "wild/8":
    case "wild/8a":
      return "chess";
    case "crazyhouse":
    case "crazy house":
    case "house":
    case "zh":
      return "crazyhouse";
    case "king of the hill":
    case "koth":
    case "kingofthehill":
      return "kingofthehill";
    case "three-check":
    case "three check":
    case "threecheck":
    case "three check chess":
    case "3-check":
    case "3 check":
    case "3check":
      return "3check";
    case "antichess":
    case "anti chess":
    case "anti":
      return "antichess";
    case "atomic":
    case "atom":
    case "atomic chess":
      return "atomic";
    case "horde":
    case "horde chess":
      return "horde";
    case "racing kings":
    case "racingkings":
    case "racing":
    case "race":
      return "racingkings";
    default:
      return;
  }
};
var startingPosition = (headers) => {
  const rules = parseVariant(headers.get("Variant"));
  if (!rules)
    return Result.err(new PositionError(IllegalSetup.Variant));
  const fen = headers.get("FEN");
  if (fen)
    return parseFen(fen).chain((setup) => setupPosition(rules, setup));
  else
    return Result.ok(defaultPosition(rules));
};
function parseCommentShapeColor(str) {
  switch (str) {
    case "G":
      return "green";
    case "R":
      return "red";
    case "Y":
      return "yellow";
    case "B":
      return "blue";
    default:
      return;
  }
}
var parseCommentShape = (str) => {
  const color = parseCommentShapeColor(str.slice(0, 1));
  const from = parseSquare(str.slice(1, 3));
  const to = parseSquare(str.slice(3, 5));
  if (!color || !defined(from))
    return;
  if (str.length === 3)
    return { color, from, to: from };
  if (str.length === 5 && defined(to))
    return { color, from, to };
  return;
};
var parseComment = (comment) => {
  let emt, clock, evaluation;
  const shapes = [];
  const text = comment.replace(/\s?\[%(emt|clk)\s(\d{1,5}):(\d{1,2}):(\d{1,2}(?:\.\d{0,3})?)\]\s?/g, (_, annotation, hours, minutes, seconds) => {
    const value = parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseFloat(seconds);
    if (annotation === "emt")
      emt = value;
    else if (annotation === "clk")
      clock = value;
    return "  ";
  }).replace(/\s?\[%(?:csl|cal)\s([RGYB][a-h][1-8](?:[a-h][1-8])?(?:,[RGYB][a-h][1-8](?:[a-h][1-8])?)*)\]\s?/g, (_, arrows) => {
    for (const arrow of arrows.split(",")) {
      shapes.push(parseCommentShape(arrow));
    }
    return "  ";
  }).replace(/\s?\[%eval\s(?:#([+-]?\d{1,5})|([+-]?(?:\d{1,5}|\d{0,5}\.\d{1,2})))(?:,(\d{1,5}))?\]\s?/g, (_, mate, pawns, d) => {
    const depth = d && parseInt(d, 10);
    evaluation = mate ? { mate: parseInt(mate, 10), depth } : { pawns: parseFloat(pawns), depth };
    return "  ";
  }).trim();
  return {
    text,
    shapes,
    emt,
    clock,
    evaluation
  };
};

// src/tree/pgn.ts
var NAG_GLYPHS = {
  1: { id: 1, name: "Good move", symbol: "!" },
  2: { id: 2, name: "Mistake", symbol: "?" },
  3: { id: 3, name: "Brilliant move", symbol: "!!" },
  4: { id: 4, name: "Blunder", symbol: "??" },
  5: { id: 5, name: "Speculative move", symbol: "!?" },
  6: { id: 6, name: "Dubious move", symbol: "?!" }
};
function buildNode(pgnNode, pos, ply) {
  const move3 = parseSan(pos, pgnNode.data.san);
  if (!move3) return void 0;
  const san = makeSanAndPlay(pos, move3);
  const children = pgnNode.children.map((child) => buildNode(child, pos.clone(), ply + 1)).filter((n) => n !== void 0);
  const glyphs = (pgnNode.data.nags ?? []).map((n) => NAG_GLYPHS[n]).filter((g) => g !== void 0);
  let clockCentis;
  const comments = (pgnNode.data.comments ?? []).map((raw, i) => {
    const parsed = parseComment(raw);
    if (parsed.clock !== void 0 && clockCentis === void 0) {
      clockCentis = Math.round(parsed.clock * 100);
    }
    return { id: String(i), by: "pgn", text: parsed.text };
  }).filter((c) => c.text.trim().length > 0);
  return {
    id: scalachessCharPair(move3),
    // 2-char id, same scheme as Lichess
    ply,
    san,
    uci: makeUci(move3),
    fen: makeFen(pos.toSetup()),
    // FEN after the move
    children,
    ...glyphs.length ? { glyphs } : {},
    ...comments.length ? { comments } : {},
    ...clockCentis !== void 0 ? { clock: clockCentis } : {}
  };
}
function pgnToTree(pgn) {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("No game found in PGN");
  const startPos = startingPosition(game.headers).unwrap();
  const startFen = makeFen(startPos.toSetup());
  const setup = startPos.toSetup();
  const initialPly = (setup.fullmoves - 1) * 2 + (startPos.turn === "white" ? 0 : 1);
  const children = game.moves.children.map((child) => buildNode(child, startPos.clone(), initialPly + 1)).filter((n) => n !== void 0);
  return {
    id: "",
    ply: initialPly,
    fen: startFen,
    children
  };
}

// src/import/chesscom.ts
var CHESSCOM_BASE = "https://api.chess.com/pub/player";
function archiveCutoffMonth() {
  const range = importFilters.dateRange;
  if (range === "all") return null;
  if (range === "custom") {
    return importFilters.customFrom ? importFilters.customFrom.slice(0, 7) : null;
  }
  const now = /* @__PURE__ */ new Date();
  let cutoff;
  switch (range) {
    case "24h":
      cutoff = new Date(now.getTime() - 864e5);
      break;
    case "1week":
      cutoff = new Date(now.getTime() - 7 * 864e5);
      break;
    case "1month":
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case "3months":
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 3);
      break;
    case "1year":
      cutoff = new Date(now);
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    default:
      return null;
  }
  return cutoff.toISOString().slice(0, 7);
}
var chesscom = {
  username: "LeviathanDuck",
  loading: false,
  error: null
};
function normalizeChesscomResult(whiteResult, blackResult) {
  if (whiteResult === "win") return "1-0";
  if (blackResult === "win") return "0-1";
  return "1/2-1/2";
}
async function fetchChesscomGames(username, rated, speeds) {
  const archivesRes = await fetch(`${CHESSCOM_BASE}/${username.toLowerCase()}/games/archives`);
  if (!archivesRes.ok) {
    throw new Error(archivesRes.status === 404 ? "Chess.com: user not found" : `Chess.com API error ${archivesRes.status}`);
  }
  const archivesData = await archivesRes.json();
  const archives = archivesData.archives ?? [];
  if (archives.length === 0) return [];
  const cutoffMonth = archiveCutoffMonth();
  const relevantArchives = cutoffMonth === null ? archives : archives.filter((url) => {
    const parts = url.split("/");
    const year = parts[parts.length - 2];
    const month = parts[parts.length - 1];
    if (!year || !month) return false;
    return `${year}-${month.padStart(2, "0")}` >= cutoffMonth;
  });
  if (relevantArchives.length === 0) return [];
  const archiveResponses = await Promise.all(relevantArchives.map((url) => fetch(url)));
  const rawGames = [];
  for (const res of archiveResponses) {
    if (!res.ok) throw new Error(`Chess.com API error ${res.status}`);
    const data = await res.json();
    rawGames.push(...data.games ?? []);
  }
  const result = [];
  for (let i = rawGames.length - 1; i >= 0; i--) {
    const raw = rawGames[i];
    if (raw.rules !== "chess" || raw.time_class === "daily") continue;
    if (rated && !raw.rated) continue;
    if (speeds.size > 0 && !speeds.has(raw.time_class)) continue;
    const pgn = raw.pgn ?? "";
    if (!pgn) continue;
    try {
      pgnToTree(pgn);
    } catch {
      continue;
    }
    const white = raw.white?.username;
    const black = raw.black?.username;
    const date = parsePgnHeader(pgn, "Date")?.replace(/\./g, "-");
    const timeClass = raw.time_class;
    const opening = parsePgnHeader(pgn, "Opening");
    const eco = parsePgnHeader(pgn, "ECO");
    const whiteRating = parseRating(raw.white?.rating) ?? parseRating(parsePgnHeader(pgn, "WhiteElo"));
    const blackRating = parseRating(raw.black?.rating) ?? parseRating(parsePgnHeader(pgn, "BlackElo"));
    result.push({
      id: nextGameId(),
      pgn,
      result: normalizeChesscomResult(raw.white?.result ?? "", raw.black?.result ?? ""),
      source: "chesscom",
      importedUsername: username.toLowerCase(),
      ...white ? { white } : {},
      ...black ? { black } : {},
      ...date ? { date } : {},
      ...timeClass ? { timeClass } : {},
      ...opening ? { opening } : {},
      ...eco ? { eco } : {},
      ...whiteRating !== void 0 ? { whiteRating } : {},
      ...blackRating !== void 0 ? { blackRating } : {}
    });
  }
  return result;
}
async function importChesscom(callbacks) {
  const name = chesscom.username.trim();
  if (!name || chesscom.loading) return;
  chesscom.loading = true;
  chesscom.error = null;
  callbacks.redraw();
  try {
    const games = filterGamesByDate(await fetchChesscomGames(name, importFilters.rated, importFilters.speeds));
    if (games.length === 0) {
      chesscom.error = "No games found matching current filters.";
    } else {
      callbacks.addGames(games, games[0]);
    }
  } catch (err) {
    chesscom.error = err instanceof Error ? err.message : "Import failed.";
  } finally {
    chesscom.loading = false;
    callbacks.redraw();
  }
}

// src/import/lichess.ts
var lichess = {
  username: "Leviathan_Duck",
  loading: false,
  error: null
};
async function fetchLichessGames(username, rated, speeds) {
  const params = new URLSearchParams({ max: "30" });
  if (rated) params.set("rated", "true");
  if (speeds.size > 0) params.set("perfType", [...speeds].join(","));
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;
  const res = await fetch(url, { headers: { "Accept": "application/x-chess-pgn" } });
  if (!res.ok) {
    throw new Error(res.status === 404 ? "Lichess: user not found" : `Lichess API error ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];
  const gameTexts = text.trim().split(/\n\n(?=\[Event )/).filter((s) => s.trim());
  const result = [];
  for (const pgn of gameTexts) {
    try {
      pgnToTree(pgn);
    } catch {
      continue;
    }
    const date = (parsePgnHeader(pgn, "UTCDate") ?? parsePgnHeader(pgn, "Date"))?.replace(/\./g, "-");
    const white = parsePgnHeader(pgn, "White");
    const black = parsePgnHeader(pgn, "Black");
    const resultLabel = parsePgnHeader(pgn, "Result");
    const timeClass = timeClassFromTimeControl(parsePgnHeader(pgn, "TimeControl"));
    const opening = parsePgnHeader(pgn, "Opening");
    const eco = parsePgnHeader(pgn, "ECO");
    const whiteRating = parseRating(parsePgnHeader(pgn, "WhiteElo"));
    const blackRating = parseRating(parsePgnHeader(pgn, "BlackElo"));
    result.push({
      id: nextGameId(),
      pgn,
      source: "lichess",
      importedUsername: username.toLowerCase(),
      ...white ? { white } : {},
      ...black ? { black } : {},
      ...resultLabel ? { result: resultLabel } : {},
      ...date ? { date } : {},
      ...timeClass ? { timeClass } : {},
      ...opening ? { opening } : {},
      ...eco ? { eco } : {},
      ...whiteRating !== void 0 ? { whiteRating } : {},
      ...blackRating !== void 0 ? { blackRating } : {}
    });
  }
  return result;
}
async function importLichess(callbacks) {
  const name = lichess.username.trim();
  if (!name || lichess.loading) return;
  lichess.loading = true;
  lichess.error = null;
  callbacks.redraw();
  try {
    const games = filterGamesByDate(await fetchLichessGames(name, importFilters.rated, importFilters.speeds));
    if (games.length === 0) {
      lichess.error = "No games found matching current filters.";
    } else {
      callbacks.addGames(games, games[0]);
    }
  } catch (err) {
    lichess.error = err instanceof Error ? err.message : "Import failed.";
  } finally {
    lichess.loading = false;
    callbacks.redraw();
  }
}

// src/games/view.ts
var NEW_IMPORT_WINDOW_MS = 60 * 60 * 1e3;
function isRecentlyImported(game) {
  return game.importedAt !== void 0 && Date.now() - game.importedAt < NEW_IMPORT_WINDOW_MS;
}
function getUserColor(game) {
  const knownNames = [game.importedUsername, chesscom.username, lichess.username].map((n) => n?.trim().toLowerCase()).filter((n) => !!n);
  if (knownNames.length === 0) return null;
  if (game.white && knownNames.includes(game.white.toLowerCase())) return "white";
  if (game.black && knownNames.includes(game.black.toLowerCase())) return "black";
  return null;
}
function gameResult(game) {
  const color = getUserColor(game);
  if (!game.result) return null;
  if (game.result.includes("1/2")) return "draw";
  if (!color) return null;
  if (color === "white") return game.result === "1-0" ? "win" : "loss";
  return game.result === "0-1" ? "win" : "loss";
}
function gameSourceUrl(game) {
  const link = parsePgnHeader(game.pgn, "Link");
  if (link?.startsWith("http")) return link;
  const site = parsePgnHeader(game.pgn, "Site");
  if (site?.startsWith("https://lichess.org/")) return site;
  return void 0;
}
function renderCompactGameRow(game, isAnalyzed, hasMissedTactic) {
  const result = gameResult(game);
  const userColor = getUserColor(game);
  const opponent = userColor === "white" ? game.black ?? game.id : userColor === "black" ? game.white ?? game.id : game.white && game.black ? `${game.white} vs ${game.black}` : game.id;
  const date = game.date ? game.date.slice(0, 10) : null;
  const tcIconMap = {
    ultrabullet: "\uE032",
    bullet: "\uE032",
    blitz: "\uE008",
    rapid: "\uE002"
  };
  const tcIcon = game.timeClass ? tcIconMap[game.timeClass] ?? null : null;
  const isNewImport = isRecentlyImported(game);
  const resultCls = result === "win" ? "grl__result--win" : result === "loss" ? "grl__result--loss" : result === "draw" ? "grl__result--draw" : "grl__result--unknown";
  const oppColor = userColor === "white" ? "black" : userColor === "black" ? "white" : null;
  const oppChip = oppColor ? h("span.color-chip.--" + oppColor) : null;
  const oppRating = userColor === "white" ? game.blackRating : userColor === "black" ? game.whiteRating : void 0;
  const oppLabel = oppRating !== void 0 ? `${opponent} (${oppRating})` : opponent;
  return [
    h("span.grl__result." + resultCls, "\u25CF"),
    h("span.grl__opponent", [oppLabel, oppChip]),
    date ? h("span.grl__date", date) : null,
    tcIcon ? h("span.grl__tc", { attrs: { "data-icon": tcIcon, ...game.timeClass ? { title: game.timeClass } : {} } }) : null,
    isNewImport || isAnalyzed || hasMissedTactic ? h("span.grl__badges", [
      isNewImport ? h("span.grl__badge.--new", { attrs: { title: "Newly imported" } }, "NEW") : null,
      isAnalyzed ? h("span.grl__badge.--ok", { attrs: { title: "Analyzed" } }, "\u2713") : null,
      hasMissedTactic ? h("span.grl__badge.--warn", { attrs: { title: "Missed tactic" } }, "!") : null
    ]) : null
  ];
}
var gamesFilterResults = /* @__PURE__ */ new Set();
var gamesFilterSpeeds = /* @__PURE__ */ new Set();
var gamesFilterOpponent = "";
var gamesFilterColor = "";
var gamesSortField = "date";
var gamesSortDir = "desc";
function toggleGamesSort(field, redraw2) {
  if (gamesSortField === field) {
    gamesSortDir = gamesSortDir === "desc" ? "asc" : "desc";
  } else {
    gamesSortField = field;
    gamesSortDir = "desc";
  }
  redraw2();
}
function gamesFilterActive() {
  return gamesFilterResults.size > 0 || gamesFilterSpeeds.size > 0 || gamesFilterOpponent.trim() !== "" || gamesFilterColor !== "";
}
function clearGamesFilters(redraw2) {
  gamesFilterResults = /* @__PURE__ */ new Set();
  gamesFilterSpeeds = /* @__PURE__ */ new Set();
  gamesFilterOpponent = "";
  gamesFilterColor = "";
  redraw2();
}
function filteredGames(deps) {
  let list = [...deps.importedGames];
  if (gamesFilterResults.size > 0) {
    list = list.filter((g) => {
      const r = deps.gameResult(g);
      return r !== null && gamesFilterResults.has(r);
    });
  }
  if (gamesFilterSpeeds.size > 0) {
    list = list.filter((g) => g.timeClass && gamesFilterSpeeds.has(g.timeClass));
  }
  if (gamesFilterOpponent.trim()) {
    const q = gamesFilterOpponent.trim().toLowerCase();
    list = list.filter((g) => {
      const opp = opponentName(g, deps.getUserColor)?.toLowerCase() ?? "";
      return opp.includes(q);
    });
  }
  if (gamesFilterColor) {
    list = list.filter((g) => deps.getUserColor(g) === gamesFilterColor);
  }
  list.sort((a, b) => {
    let cmp = 0;
    if (gamesSortField === "date") {
      cmp = (a.date ?? "").localeCompare(b.date ?? "");
    } else if (gamesSortField === "opponent") {
      cmp = (opponentName(a, deps.getUserColor) ?? "").localeCompare(opponentName(b, deps.getUserColor) ?? "");
    } else if (gamesSortField === "timeClass") {
      cmp = (a.timeClass ?? "").localeCompare(b.timeClass ?? "");
    } else if (gamesSortField === "result") {
      const ord = (g) => {
        const r = deps.gameResult(g);
        return r === "win" ? 0 : r === "draw" ? 1 : r === "loss" ? 2 : 3;
      };
      cmp = ord(a) - ord(b);
    }
    return gamesSortDir === "desc" ? -cmp : cmp;
  });
  return list;
}
function opponentName(game, getUserColor2) {
  const color = getUserColor2(game);
  if (color === "white") return game.black;
  if (color === "black") return game.white;
  return game.white && game.black ? `${game.white} vs ${game.black}` : void 0;
}
function renderResultIcon(r) {
  if (r === "win") return h("span.games-view__result.--win", { attrs: { title: "Win" } }, "\u25CF");
  if (r === "loss") return h("span.games-view__result.--loss", { attrs: { title: "Loss" } }, "\u25CF");
  if (r === "draw") return h("span.games-view__result.--draw", { attrs: { title: "Draw" } }, "\u25CF");
  return h("span.games-view__result", "\u2013");
}
function renderSortTh(label, field, redraw2) {
  const active = gamesSortField === field;
  const arrow = active ? gamesSortDir === "desc" ? " \u2193" : " \u2191" : "";
  return h("th", {
    class: { "games-view__th--active": active },
    on: { click: () => toggleGamesSort(field, redraw2) }
  }, label + arrow);
}
var SPEED_ICONS = {
  ultrabullet: "\uE059",
  bullet: "\uE032",
  blitz: "\uE008",
  rapid: "\uE002",
  classical: "\uE007"
  // licon.Turtle
};
function renderGameList(deps) {
  if (deps.importedGames.length === 0) return h("div");
  return h("div.game-list", [
    h("div.game-list__header", `${deps.importedGames.length} imported game${deps.importedGames.length === 1 ? "" : "s"}`),
    h("ul", deps.importedGames.map((game) => {
      const isAnalyzed = deps.analyzedGameIds.has(game.id);
      const hasMissedTactic = deps.missedTacticGameIds.has(game.id);
      const srcUrl = deps.gameSourceUrl(game);
      return h("li", [
        h("button.game-list__row", {
          class: { active: game.id === deps.selectedGameId },
          on: { click: () => deps.selectGame(game) }
        }, deps.renderCompactGameRow(game, isAnalyzed, hasMissedTactic)),
        srcUrl ? h("a.game-ext-link", {
          attrs: { href: srcUrl, target: "_blank", rel: "noopener", title: "View on source platform" }
        }) : null
      ]);
    }))
  ]);
}
function renderGamesView(deps) {
  const games = filteredGames(deps);
  const { redraw: redraw2 } = deps;
  const filterBar = h("div.games-view__controls", [
    // Result filter
    h("div.games-view__filter-group", [
      h("span.games-view__filter-label", "Result"),
      ...["win", "loss", "draw"].map(
        (r) => h("button.games-view__pill", {
          class: { active: gamesFilterResults.has(r) },
          on: { click: () => {
            const s = new Set(gamesFilterResults);
            s.has(r) ? s.delete(r) : s.add(r);
            gamesFilterResults = s;
            redraw2();
          } }
        }, r.charAt(0).toUpperCase() + r.slice(1))
      )
    ]),
    // Time class filter
    h("div.games-view__filter-group", [
      h("span.games-view__filter-label", "Time"),
      ...["bullet", "blitz", "rapid"].map(
        (tc) => h("button.games-view__pill", {
          class: { active: gamesFilterSpeeds.has(tc) },
          attrs: { "data-icon": SPEED_ICONS[tc] ?? "" },
          on: { click: () => {
            const s = new Set(gamesFilterSpeeds);
            s.has(tc) ? s.delete(tc) : s.add(tc);
            gamesFilterSpeeds = s;
            redraw2();
          } }
        }, tc.charAt(0).toUpperCase() + tc.slice(1))
      )
    ]),
    // Color filter (playing as)
    h("div.games-view__filter-group", [
      h("span.games-view__filter-label", "Color"),
      h("button.games-view__pill", {
        class: { active: gamesFilterColor === "white" },
        on: { click: () => {
          gamesFilterColor = gamesFilterColor === "white" ? "" : "white";
          redraw2();
        } }
      }, "White"),
      h("button.games-view__pill", {
        class: { active: gamesFilterColor === "black" },
        on: { click: () => {
          gamesFilterColor = gamesFilterColor === "black" ? "" : "black";
          redraw2();
        } }
      }, "Black")
    ]),
    // Opponent search
    h("div.games-view__filter-group", [
      h("span.games-view__filter-label", "Opponent"),
      h("input.games-view__search", {
        attrs: { type: "search", placeholder: "Name\u2026", value: gamesFilterOpponent },
        on: { input: (e) => {
          gamesFilterOpponent = e.target.value;
          redraw2();
        } }
      })
    ]),
    // Summary + clear
    h("div.games-view__filter-group.--right", [
      h("span.games-view__summary", `${games.length} of ${deps.importedGames.length} game${deps.importedGames.length === 1 ? "" : "s"}`),
      gamesFilterActive() ? h("button.games-view__clear", { on: { click: () => clearGamesFilters(redraw2) } }, "Clear filters") : null
    ])
  ]);
  if (deps.importedGames.length === 0) {
    return h("div.games-view", [
      filterBar,
      h("div.games-view__empty", [
        h("p", "No games imported yet."),
        h("p.games-view__empty-hint", "Use the search bar above to import from Chess.com or Lichess.")
      ])
    ]);
  }
  const table = h("div.games-view__table-wrap", [
    h("table.games-view__table", [
      h("thead", h("tr", [
        renderSortTh("Result", "result", redraw2),
        renderSortTh("Opponent", "opponent", redraw2),
        h("th.games-view__rating-th", "Rating"),
        renderSortTh("Date", "date", redraw2),
        renderSortTh("Time", "timeClass", redraw2),
        h("th", "Opening"),
        h("th.games-view__review-th", "Review"),
        h("th.games-view__puzzles-th", "Puzzles"),
        h("th")
      ])),
      h(
        "tbody",
        games.length > 0 ? games.map((game) => {
          const r = deps.gameResult(game);
          const opp = opponentName(game, deps.getUserColor) ?? "\u2013";
          const date = game.date ? game.date.slice(0, 10) : "\u2013";
          const tc = game.timeClass ?? "\u2013";
          const tcIcon = game.timeClass ? SPEED_ICONS[game.timeClass] : void 0;
          const opening = game.opening ? game.eco ? `${game.eco} ${game.opening}` : game.opening : "\u2013";
          const srcUrl = deps.gameSourceUrl(game);
          const isAnalyzed = deps.analyzedGameIds.has(game.id);
          const hasMissed = deps.missedTacticGameIds.has(game.id);
          const isNewImport = isRecentlyImported(game);
          const accEntry = deps.analyzedGameAccuracy.get(game.id);
          const userColor = deps.getUserColor(game);
          const oppRating = userColor === "white" ? game.blackRating : userColor === "black" ? game.whiteRating : void 0;
          const ratingText = (() => {
            if (oppRating !== void 0) return String(oppRating);
            if (!userColor && (game.whiteRating !== void 0 || game.blackRating !== void 0)) {
              const parts = [];
              if (game.whiteRating !== void 0) parts.push(`W:${game.whiteRating}`);
              if (game.blackRating !== void 0) parts.push(`B:${game.blackRating}`);
              return parts.join(" ");
            }
            return null;
          })();
          const ratingCell = h("td.games-view__rating", ratingText ?? "\u2013");
          let accuracyText = null;
          if (isAnalyzed && accEntry) {
            if (userColor === "white" && accEntry.white !== null) {
              accuracyText = `${Math.round(accEntry.white)}%`;
            } else if (userColor === "black" && accEntry.black !== null) {
              accuracyText = `${Math.round(accEntry.black)}%`;
            } else if (!userColor) {
              const w = accEntry.white !== null ? `W:${Math.round(accEntry.white)}%` : null;
              const b = accEntry.black !== null ? `B:${Math.round(accEntry.black)}%` : null;
              accuracyText = [w, b].filter(Boolean).join(" ") || null;
            }
          }
          const reviewCell = isAnalyzed ? h("td.games-view__review-cell", [
            h("span.games-view__reviewed", { attrs: { title: "Reviewed" } }, "\u2713"),
            hasMissed ? h("span.games-view__missed", { attrs: { title: "Missed tactic detected" } }, "!") : null,
            accuracyText ? h("span.games-view__accuracy", { attrs: { title: "Your accuracy" } }, accuracyText) : null
          ]) : h("td.games-view__review-cell", [
            h("button.games-view__review-btn", {
              on: { click: (e) => {
                e.stopPropagation();
                deps.reviewGame(game);
              } },
              attrs: { title: "Load into Analysis and start review" }
            }, "Review")
          ]);
          const puzzleCount = deps.savedPuzzles.filter((p) => p.gameId === game.id).length;
          const puzzleCell = h(
            "td.games-view__puzzles-cell",
            puzzleCount > 0 ? h("span.games-view__puzzle-count", { attrs: { title: `${puzzleCount} saved puzzle${puzzleCount !== 1 ? "s" : ""}` } }, String(puzzleCount)) : h("span.games-view__puzzle-none", "\u2013")
          );
          return h("tr.games-view__row", {
            class: { active: game.id === deps.selectedGameId },
            on: { click: () => {
              deps.selectGame(game);
              window.location.hash = "#/analysis";
            } }
          }, [
            h("td", renderResultIcon(r)),
            h("td.games-view__opponent", [
              opp,
              userColor ? h("span.color-chip.--" + (userColor === "white" ? "black" : "white")) : null,
              isNewImport ? h("span.games-view__new-import", { attrs: { title: "Newly imported" } }, "NEW") : null
            ]),
            ratingCell,
            h("td.games-view__date", date),
            h("td.games-view__tc", [
              tcIcon ? h("span", { attrs: { "data-icon": tcIcon, style: "font-family:lichess;margin-right:4px" } }) : null,
              tc.charAt(0).toUpperCase() + tc.slice(1)
            ]),
            h("td.games-view__opening", h("span", { attrs: { title: opening } }, opening)),
            reviewCell,
            puzzleCell,
            h("td.games-view__link-cell", srcUrl ? h("a.game-ext-link", {
              attrs: { href: srcUrl, target: "_blank", rel: "noopener", title: "View on source platform" },
              on: { click: (e) => e.stopPropagation() }
            }) : null)
          ]);
        }) : [h("tr", h("td", { attrs: { colspan: "9" } }, h("div.games-view__empty", "No games match current filters.")))]
      )
    ])
  ]);
  return h("div.games-view", [filterBar, table]);
}

// src/analyse/moveList.ts
function shouldShowReviewAnnotation(userColor, nodePly, userOnly) {
  if (!userOnly || userColor === null) return true;
  const isWhiteMove = nodePly % 2 === 1;
  return userColor === "white" && isWhiteMove || userColor === "black" && !isWhiteMove;
}
var GLYPH_COLORS = {
  "??": "hsl(0,69%,60%)",
  // blunder     — muted red
  "?": "hsl(41,100%,45%)",
  // mistake     — amber
  "?!": "hsl(202,78%,62%)",
  // inaccuracy  — steel blue
  "!!": "hsl(129,71%,45%)",
  // brilliant   — green
  "!": "hsl(88,62%,37%)",
  // good        — olive green
  "!?": "hsl(307,80%,70%)"
  // interesting — pink/purple
};
function renderMoveSpan(node, path, parent, showIndex, currentPath, getEval, navigate2, userColor, userOnly, contextMenuPath2, onContextMenu) {
  const cached = getEval(path);
  const parentCached = getEval(pathInit(path));
  const pgnGlyph = node.glyphs?.[0];
  const playedBest = node.uci !== void 0 && node.uci === parentCached?.best;
  const computedLabel = showReviewLabels && !playedBest && cached !== void 0 && shouldShowReviewAnnotation(userColor, node.ply, userOnly) ? cached.label ?? (cached.loss !== void 0 ? classifyLoss(cached.loss) : null) : null;
  const computedSymbol = computedLabel === "blunder" ? "??" : computedLabel === "mistake" ? "?" : computedLabel === "inaccuracy" ? "?!" : null;
  const symbol = pgnGlyph?.symbol ?? computedSymbol;
  const color = symbol ? GLYPH_COLORS[symbol] ?? "#aaa" : void 0;
  const mate = cached?.mate;
  const inner = [];
  if (showIndex) {
    const n = Math.ceil(node.ply / 2);
    inner.push(h("index", node.ply % 2 === 1 ? `${n}.` : `${n}\u2026`));
  }
  inner.push(h("san", node.san ?? ""));
  if (symbol) inner.push(h("glyph", { attrs: { style: `color:${color}` } }, symbol));
  if (mate !== void 0) inner.push(h("eval", mate === 0 ? "#KO!" : `+M${Math.abs(mate)}`));
  return h("move", {
    class: {
      active: path === currentPath,
      "context-active": contextMenuPath2 === path
    },
    attrs: { p: path },
    on: {
      click: () => navigate2(path),
      ...onContextMenu ? { contextmenu: (e) => {
        e.preventDefault();
        onContextMenu(path, e);
      } } : {}
    }
  }, inner);
}
function renderInlineNodes(nodes, parentPath, parent, needsMoveNum, currentPath, getEval, navigate2, userColor, userOnly, contextMenuPath2, onContextMenu) {
  if (nodes.length === 0) return [];
  const main = nodes[0];
  const variations = nodes.slice(1);
  const mainPath = parentPath + main.id;
  const out = [];
  const showIndex = needsMoveNum || main.ply % 2 === 1;
  out.push(renderMoveSpan(main, mainPath, parent, showIndex, currentPath, getEval, navigate2, userColor, userOnly, contextMenuPath2, onContextMenu));
  for (const variant of variations) {
    out.push(h("inline", renderInlineNodes([variant], parentPath, parent, true, currentPath, getEval, navigate2, userColor, userOnly, contextMenuPath2, onContextMenu)));
  }
  const hasVariations = variations.length > 0;
  const firstCont = main.children[0];
  const contNeedsNum = hasVariations && firstCont !== void 0 && firstCont.ply % 2 === 0;
  out.push(...renderInlineNodes(main.children, mainPath, main, contNeedsNum, currentPath, getEval, navigate2, userColor, userOnly, contextMenuPath2, onContextMenu));
  return out;
}
function renderColumnNodes(nodes, parentPath, parent, out, currentPath, getEval, navigate2, userColor, userOnly, deleteVariation2, contextMenuPath2, onContextMenu) {
  if (nodes.length === 0) return;
  const main = nodes[0];
  const variations = nodes.slice(1);
  const mainPath = parentPath + main.id;
  const isWhite = main.ply % 2 === 1;
  if (isWhite) out.push(h("index", String(Math.ceil(main.ply / 2))));
  out.push(renderMoveSpan(main, mainPath, parent, false, currentPath, getEval, navigate2, userColor, userOnly, contextMenuPath2, onContextMenu));
  if (variations.length > 0) {
    if (isWhite) out.push(h("move.empty", "\u2026"));
    const varLines = variations.map((v) => {
      const varPath = parentPath + v.id;
      const lineNodes = renderInlineNodes([v], parentPath, parent, true, currentPath, getEval, navigate2, userColor, userOnly, contextMenuPath2, onContextMenu);
      if (deleteVariation2) {
        return h("line", [
          h("button.variation-remove", {
            attrs: { title: "Remove variation" },
            on: { click: () => deleteVariation2(varPath) }
          }, "\xD7"),
          ...lineNodes
        ]);
      }
      return h("line", lineNodes);
    });
    out.push(h("interrupt", [h("lines", varLines)]));
    if (isWhite && main.children.length > 0) {
      out.push(h("index", String(Math.ceil(main.ply / 2))));
      out.push(h("move.empty", "\u2026"));
    }
  }
  renderColumnNodes(main.children, mainPath, main, out, currentPath, getEval, navigate2, userColor, userOnly, deleteVariation2, contextMenuPath2, onContextMenu);
}
function renderMoveList(root, currentPath, getEval, navigate2, userColor, userOnly, deleteVariation2, contextMenuPath2, onContextMenu) {
  const nodes = [];
  renderColumnNodes(root.children, "", root, nodes, currentPath, getEval, navigate2, userColor, userOnly, deleteVariation2, contextMenuPath2, onContextMenu);
  return h("div.move-list-inner", [h("div.tview2.tview2-column", nodes)]);
}

// src/puzzles/ctrl.ts
var altCastles = {
  e1a1: "e1c1",
  e1h1: "e1g1",
  e8a8: "e8c8",
  e8h8: "e8g8"
};
function isAltCastle(uci) {
  return uci in altCastles;
}
function sameMove(played, expected) {
  return played === expected || isAltCastle(played) && altCastles[played] === expected;
}
function makePuzzleCtrl(round, onChange3 = () => {
}) {
  let feedback = "find";
  let result = "active";
  let progressPly = 0;
  let currentPath = round.parentPath;
  const totalUserMoves = Math.ceil(round.solution.length / 2);
  function emit() {
    onChange3({
      key: round.key,
      progressPly,
      currentPath,
      feedback,
      result,
      updatedAt: Date.now()
    });
  }
  return {
    round: () => round,
    feedback: () => feedback,
    result: () => result,
    progress: () => [Math.ceil(progressPly / 2), totalUserMoves],
    progressPly: () => progressPly,
    currentPath: () => currentPath,
    currentExpectedMove: () => round.solution[progressPly] ?? null,
    setCurrentPath(path) {
      currentPath = path;
      emit();
    },
    submitUserMove(uci, path) {
      const expected = round.solution[progressPly];
      if (!expected || path !== currentPath || result !== "active" || !sameMove(uci, expected)) {
        feedback = "fail";
        emit();
        return { accepted: false, replies: [] };
      }
      progressPly += 1;
      const replies = [];
      while (progressPly < round.solution.length && progressPly % 2 === 1) {
        replies.push(round.solution[progressPly]);
        progressPly += 1;
      }
      if (progressPly >= round.solution.length) {
        feedback = "win";
        result = "solved";
      } else {
        feedback = "good";
      }
      emit();
      return { accepted: true, replies };
    },
    retry() {
      progressPly = 0;
      feedback = "find";
      result = "active";
      currentPath = round.parentPath;
      emit();
    },
    viewSolution() {
      feedback = "view";
      result = "viewed";
      progressPly = round.solution.length;
      emit();
      return [...round.solution];
    },
    restore(snapshot) {
      progressPly = Math.max(0, Math.min(snapshot.progressPly, round.solution.length));
      feedback = snapshot.feedback;
      result = snapshot.result;
      currentPath = snapshot.currentPath;
      emit();
    },
    snapshot() {
      return {
        key: round.key,
        progressPly,
        currentPath,
        feedback,
        result,
        updatedAt: Date.now()
      };
    }
  };
}

// src/puzzles/imported.ts
var IMPORTED_PUZZLE_KEY_PREFIX = "lichess::";
var IMPORTED_PUZZLE_BASE_URL = "/generated/lichess-puzzles";
var DEFAULT_IMPORTED_PAGE_SIZE = 24;
var _redraw7 = () => {
};
var manifest = null;
var manifestPromise = null;
var shardCache = /* @__PURE__ */ new Map();
var libraryState = {
  status: "idle",
  query: defaultImportedPuzzleQuery(),
  manifest: null,
  items: [],
  hasPrev: false,
  hasNext: false,
  loadedShardCount: 0
};
var libraryRequestKey = "";
var libraryRequestToken = 0;
function initImportedPuzzles(deps) {
  _redraw7 = deps.redraw;
}
function defaultImportedPuzzleFilters() {
  return {
    ratingMin: "",
    ratingMax: "",
    theme: "",
    opening: ""
  };
}
function defaultImportedPuzzleQuery() {
  return {
    page: 0,
    pageSize: DEFAULT_IMPORTED_PAGE_SIZE,
    filters: defaultImportedPuzzleFilters()
  };
}
function importedPuzzleLibraryState() {
  return libraryState;
}
function importedPuzzleKey(shardId, id) {
  return `${IMPORTED_PUZZLE_KEY_PREFIX}${shardId}::${id}`;
}
function importedPuzzleRouteId(shardId, id) {
  return encodeURIComponent(importedPuzzleKey(shardId, id));
}
function isImportedPuzzleRouteId(routeId) {
  return parseImportedPuzzleRouteId(routeId) !== null;
}
function parseImportedPuzzleRouteId(routeId) {
  let decoded = routeId;
  try {
    decoded = decodeURIComponent(routeId);
  } catch {
    decoded = routeId;
  }
  if (!decoded.startsWith(IMPORTED_PUZZLE_KEY_PREFIX)) return null;
  const body = decoded.slice(IMPORTED_PUZZLE_KEY_PREFIX.length);
  const sep = body.indexOf("::");
  if (sep < 0) return null;
  const shardId = body.slice(0, sep);
  const id = body.slice(sep + 2);
  return shardId && id ? { shardId, id } : null;
}
function queryKey(query) {
  return JSON.stringify(query);
}
async function loadManifest() {
  if (manifest !== null) return manifest;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const response = await fetch(`${IMPORTED_PUZZLE_BASE_URL}/manifest.json`, { cache: "no-store" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Manifest request failed with ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn("[puzzles] imported manifest load failed", error);
      return null;
    }
  })();
  manifest = await manifestPromise;
  return manifest;
}
function annotateShardRecords(shardId, rows) {
  return rows.map((row) => ({
    ...row,
    shardId,
    key: importedPuzzleKey(shardId, row.id),
    routeId: importedPuzzleRouteId(shardId, row.id)
  }));
}
async function loadShard(file, shardId) {
  const cached = shardCache.get(file);
  if (cached) return cached;
  const promise = (async () => {
    const response = await fetch(`${IMPORTED_PUZZLE_BASE_URL}/${file}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Shard request failed with ${response.status}`);
    const rows = await response.json();
    return annotateShardRecords(shardId, rows);
  })();
  shardCache.set(file, promise);
  return promise;
}
function normalizeTag(tag) {
  return tag.trim().toLowerCase();
}
function toOptionalNumber(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}
function recordMatchesFilters(record, filters) {
  const min = toOptionalNumber(filters.ratingMin);
  const max = toOptionalNumber(filters.ratingMax);
  if (min !== null && record.rating < min) return false;
  if (max !== null && record.rating > max) return false;
  if (filters.theme) {
    const wanted = normalizeTag(filters.theme);
    if (!record.themes.some((theme) => normalizeTag(theme) === wanted)) return false;
  }
  if (filters.opening) {
    const wanted = normalizeTag(filters.opening);
    if (!record.openingTags.some((opening) => normalizeTag(opening) === wanted)) return false;
  }
  return true;
}
function shardMayMatch(shard, filters) {
  const min = toOptionalNumber(filters.ratingMin);
  const max = toOptionalNumber(filters.ratingMax);
  if (min !== null && shard.ratingMax !== void 0 && shard.ratingMax < min) return false;
  if (max !== null && shard.ratingMin !== void 0 && shard.ratingMin > max) return false;
  if (filters.theme) {
    const wanted = normalizeTag(filters.theme);
    if (!shard.themes.some((theme) => normalizeTag(theme) === wanted)) return false;
  }
  if (filters.opening) {
    const wanted = normalizeTag(filters.opening);
    if (!shard.openings.some((opening) => normalizeTag(opening) === wanted)) return false;
  }
  return true;
}
function requestImportedPuzzleLibrary(query) {
  const nextKey = queryKey(query);
  if (libraryRequestKey === nextKey && libraryState.status !== "idle") return;
  libraryRequestKey = nextKey;
  const token = ++libraryRequestToken;
  libraryState = {
    status: "loading",
    query,
    manifest,
    items: [],
    hasPrev: query.page > 0,
    hasNext: false,
    loadedShardCount: 0
  };
  _redraw7();
  void (async () => {
    const loadedManifest = await loadManifest();
    if (token !== libraryRequestToken) return;
    if (!loadedManifest) {
      libraryState = {
        status: "missing",
        query,
        manifest: null,
        items: [],
        hasPrev: query.page > 0,
        hasNext: false,
        loadedShardCount: 0
      };
      _redraw7();
      return;
    }
    const matchingShards = loadedManifest.shards.filter((shard) => shardMayMatch(shard, query.filters));
    const start4 = query.page * query.pageSize;
    const end3 = start4 + query.pageSize;
    const target = end3 + 1;
    const matches = [];
    let loadedShardCount = 0;
    let hasMorePossible = false;
    try {
      for (let i = 0; i < matchingShards.length; i++) {
        const shard = matchingShards[i];
        const rows = await loadShard(shard.file, shard.id);
        if (token !== libraryRequestToken) return;
        loadedShardCount += 1;
        for (const row of rows) {
          if (!recordMatchesFilters(row, query.filters)) continue;
          matches.push(row);
          if (matches.length > target) break;
        }
        if (matches.length > target) {
          hasMorePossible = true;
          break;
        }
      }
    } catch (error) {
      console.warn("[puzzles] imported shard load failed", error);
      if (token !== libraryRequestToken) return;
      libraryState = {
        status: "error",
        query,
        manifest: loadedManifest,
        items: [],
        hasPrev: query.page > 0,
        hasNext: false,
        loadedShardCount,
        error: error instanceof Error ? error.message : "Imported shard load failed"
      };
      _redraw7();
      return;
    }
    const pageItems = matches.slice(start4, end3);
    const hasNext = matches.length > end3 || hasMorePossible;
    libraryState = {
      status: "ready",
      query,
      manifest: loadedManifest,
      items: pageItems,
      hasPrev: query.page > 0,
      hasNext,
      loadedShardCount
    };
    _redraw7();
  })();
}
async function findImportedPuzzleRoundByRouteId(routeId) {
  const parsed = parseImportedPuzzleRouteId(routeId);
  if (!parsed) return null;
  const loadedManifest = await loadManifest();
  if (!loadedManifest) return null;
  const shard = loadedManifest.shards.find((entry) => entry.id === parsed.shardId);
  if (!shard) return null;
  const rows = await loadShard(shard.file, shard.id);
  const record = rows.find((row) => row.id === parsed.id);
  if (!record) return null;
  const toMove = record.fen.split(" ")[1] === "b" ? "black" : "white";
  return {
    key: record.key,
    routeId: record.routeId,
    sourceKind: "imported",
    source: null,
    sourceGame: null,
    imported: record,
    parentPath: "",
    startFen: record.fen,
    solution: [...record.moves],
    toMove
  };
}

// src/puzzles/round.ts
var LOCAL_PUZZLE_GAME_ID = "local";
function puzzleKey(candidate) {
  return `${candidate.gameId ?? LOCAL_PUZZLE_GAME_ID}::${candidate.path}`;
}
function puzzleRouteIdFromKey(key) {
  return encodeURIComponent(key);
}
function decodePuzzleRouteId(routeId) {
  try {
    return decodeURIComponent(routeId);
  } catch {
    return routeId;
  }
}
function puzzleRouteHref(candidate) {
  return `#/puzzles/${puzzleRouteIdFromKey(puzzleKey(candidate))}`;
}
function findSavedPuzzleByRouteId(puzzles, routeId) {
  const decoded = decodePuzzleRouteId(routeId);
  return puzzles.find((p) => puzzleKey(p) === decoded) ?? null;
}
function getPuzzleSolutionLine(candidate, storedAnalysis) {
  const parentPath = pathInit(candidate.path);
  const persisted = storedAnalysis?.nodes[parentPath]?.bestLine ?? [];
  if (persisted.length === 0) return [candidate.bestMove];
  if (persisted[0] === candidate.bestMove) return persisted;
  return [candidate.bestMove, ...persisted];
}
function buildPuzzleRound(candidate, opts = {}) {
  const key = puzzleKey(candidate);
  return {
    key,
    routeId: puzzleRouteIdFromKey(key),
    sourceKind: "saved",
    source: candidate,
    sourceGame: opts.sourceGame ?? null,
    imported: null,
    parentPath: pathInit(candidate.path),
    startFen: candidate.fen,
    solution: getPuzzleSolutionLine(candidate, opts.storedAnalysis),
    toMove: candidate.ply % 2 === 1 ? "white" : "black"
  };
}
function buildStandalonePuzzleRoot(fen) {
  const setup = parseFen(fen).unwrap();
  const initialPly = (setup.fullmoves - 1) * 2 + (setup.turn === "white" ? 0 : 1);
  return {
    id: "",
    ply: initialPly,
    fen,
    children: []
  };
}

// src/puzzles/session.ts
var RECENT_PUZZLES_MAX = 16;
function emptyPuzzleSession() {
  return {
    current: null,
    recent: [],
    updatedAt: Date.now()
  };
}
function applyPuzzleSnapshot(session, snapshot) {
  const next2 = {
    current: snapshot,
    recent: [...session.recent],
    updatedAt: snapshot.updatedAt
  };
  if (snapshot.result !== "active") {
    const result = snapshot.result;
    next2.recent = [
      { key: snapshot.key, result, updatedAt: snapshot.updatedAt },
      ...next2.recent.filter((entry) => entry.key !== snapshot.key)
    ].slice(0, RECENT_PUZZLES_MAX);
  }
  return next2;
}
function currentPuzzleSnapshot(session, key) {
  return session.current?.key === key ? session.current : null;
}
function currentPuzzleIsActive(session, key) {
  return session.current?.key === key && session.current.result === "active";
}
function recentPuzzleResult(session, key) {
  if (session.current?.key === key && session.current.result !== "active") {
    return session.current.result;
  }
  return session.recent.find((entry) => entry.key === key)?.result ?? null;
}

// src/puzzles/view.ts
function formatLoss(loss) {
  return `\u2212${Math.round(loss * 100)}%`;
}
function formatSavedMove(round) {
  const moveNum = Math.ceil(round.source.ply / 2);
  const prefix = round.source.ply % 2 === 1 ? `${moveNum}.` : `${moveNum}\u2026`;
  return `${prefix} ${round.source.san}`;
}
function formatImportedOpening(record) {
  return record.openingTags[0] ?? "No opening tag";
}
function renderSourceSwitch(current2, onChange3) {
  return h("div.puzzle-library__sources", [
    h("button", {
      class: { active: current2 === "saved" },
      on: { click: () => onChange3("saved") }
    }, "Saved Puzzles"),
    h("button", {
      class: { active: current2 === "lichess" },
      on: { click: () => onChange3("lichess") }
    }, "Imported Lichess")
  ]);
}
function renderSavedPuzzleLibrary(deps) {
  const { rounds, currentPuzzleKey, recentResultForKey, isResumeKey } = deps;
  if (rounds.length === 0) {
    return h("div.puzzle-library__empty-body", [
      h("p", "No saved puzzles yet."),
      h("p", "Review games, save missed tactics, and they will appear here as local training rounds."),
      h("a", { attrs: { href: "#/games" } }, "Go to My Games")
    ]);
  }
  return h("ul.puzzle-library__list", rounds.map((round) => {
    const result = recentResultForKey(round.key);
    const resume = isResumeKey(round.key) || currentPuzzleKey === round.key;
    const source = round.sourceGame ? `${round.sourceGame.white ?? "White"} vs ${round.sourceGame.black ?? "Black"}` : "Source game unavailable";
    return h("li.puzzle-library__item", [
      h("div.puzzle-library__main", [
        h("div.puzzle-library__move", formatSavedMove(round)),
        h("div.puzzle-library__meta", [
          h("span", formatLoss(round.source.loss)),
          h("span", `Best: ${uciToSan(round.startFen, round.source.bestMove)}`),
          h("span", source)
        ])
      ]),
      h("div.puzzle-library__actions", [
        result ? h("span.puzzle-library__badge", result) : null,
        round.sourceGame ? h("a.button", { attrs: { href: `#/puzzles/${round.routeId}` } }, resume ? "Resume" : "Solve") : h("span.puzzle-library__badge", "Unavailable")
      ])
    ]);
  }));
}
function renderImportedPuzzleLibrary(deps) {
  const { state } = deps;
  if (state.status === "missing") {
    return h("div.puzzle-library__empty-body", [
      h("p", "No generated Lichess puzzle dataset was found in `public/generated/lichess-puzzles/`."),
      h("p", "Run the local download and shard scripts first, then reload this page.")
    ]);
  }
  if (state.status === "error") {
    return h("div.puzzle-library__empty-body", [
      h("p", "The imported puzzle dataset could not be loaded."),
      state.error ? h("p", state.error) : null
    ]);
  }
  const manifest2 = state.manifest;
  const pageLabel = `Page ${state.query.page + 1}`;
  const loadedLabel = manifest2 ? `Loaded ${state.loadedShardCount} / ${manifest2.shards.length} shards for this view` : "Loading manifest\u2026";
  const filters = h("div.puzzle-library__filters", [
    h("label", [
      h("span", "Min rating"),
      h("input", {
        attrs: { type: "number", value: state.query.filters.ratingMin, placeholder: "All" },
        on: { input: (e) => deps.onRatingMin(e.target.value) }
      })
    ]),
    h("label", [
      h("span", "Max rating"),
      h("input", {
        attrs: { type: "number", value: state.query.filters.ratingMax, placeholder: "All" },
        on: { input: (e) => deps.onRatingMax(e.target.value) }
      })
    ]),
    h("label", [
      h("span", "Theme"),
      h("select", {
        on: { change: (e) => deps.onTheme(e.target.value) }
      }, [
        h("option", { attrs: { value: "" }, props: { selected: state.query.filters.theme === "" } }, "All themes"),
        ...(manifest2?.themes ?? []).map(
          (theme) => h("option", {
            attrs: { value: theme },
            props: { selected: state.query.filters.theme === theme }
          }, theme)
        )
      ])
    ]),
    h("label", [
      h("span", "Opening"),
      h("select", {
        on: { change: (e) => deps.onOpening(e.target.value) }
      }, [
        h("option", { attrs: { value: "" }, props: { selected: state.query.filters.opening === "" } }, "All openings"),
        ...(manifest2?.openings ?? []).map(
          (opening) => h("option", {
            attrs: { value: opening },
            props: { selected: state.query.filters.opening === opening }
          }, opening)
        )
      ])
    ])
  ]);
  if (state.status === "loading") {
    return h("div", [
      filters,
      h("div.puzzle-library__empty-body", [
        h("p", "Loading imported Lichess puzzles\u2026"),
        h("p", loadedLabel)
      ])
    ]);
  }
  return h("div.puzzle-library__imported", [
    filters,
    h("div.puzzle-library__paging", [
      h("span", loadedLabel),
      h("div.puzzle-library__paging-actions", [
        h("button", { attrs: { disabled: !state.hasPrev }, on: { click: deps.onPrevPage } }, "\u2190 Prev"),
        h("span", pageLabel),
        h("button", { attrs: { disabled: !state.hasNext }, on: { click: deps.onNextPage } }, "Next \u2192")
      ])
    ]),
    state.items.length === 0 ? h("div.puzzle-library__empty-body", [
      h("p", "No imported puzzles matched the current filters.")
    ]) : h("ul.puzzle-library__list", state.items.map((item) => {
      const themeLabel = item.themes.slice(0, 3).join(", ") || "No themes";
      return h("li.puzzle-library__item", [
        h("div.puzzle-library__main", [
          h("div.puzzle-library__move", `Lichess Puzzle ${item.id}`),
          h("div.puzzle-library__meta", [
            h("span", `Rating ${item.rating}`),
            item.plays !== void 0 ? h("span", `${item.plays.toLocaleString()} plays`) : null,
            h("span", formatImportedOpening(item)),
            h("span", themeLabel)
          ])
        ]),
        h("div.puzzle-library__actions", [
          h("span.puzzle-library__badge", "imported"),
          h("a.button", { attrs: { href: `#/puzzles/${item.routeId}` } }, "Solve")
        ])
      ]);
    }))
  ]);
}
function renderPuzzleLibrary(deps) {
  const resumeKey = deps.currentPuzzleKey ?? deps.session.current?.key ?? null;
  const title = deps.source === "saved" ? `Saved Puzzles (${deps.savedRounds.length})` : `Imported Lichess Puzzles (${deps.importedState.manifest?.totalCount ?? "\u2026"})`;
  const subtitle = deps.source === "saved" ? "Local tactics extracted from your reviewed games." : "Official Lichess puzzle export, preprocessed into local browser-ready shards.";
  return h("div.puzzle-library", [
    h("div.puzzle-library__header", [
      h("div", [
        h("h2", title),
        h("p", subtitle)
      ]),
      resumeKey ? h("a.button", { attrs: { href: `#/puzzles/${encodeURIComponent(resumeKey)}` } }, "Resume Current Puzzle") : null
    ]),
    renderSourceSwitch(deps.source, deps.onSourceChange),
    deps.source === "saved" ? renderSavedPuzzleLibrary({
      rounds: deps.savedRounds,
      currentPuzzleKey: deps.currentPuzzleKey,
      recentResultForKey: deps.recentResultForKey,
      isResumeKey: deps.isResumeKey
    }) : renderImportedPuzzleLibrary({
      state: deps.importedState,
      onRatingMin: deps.onImportedRatingMin,
      onRatingMax: deps.onImportedRatingMax,
      onTheme: deps.onImportedTheme,
      onOpening: deps.onImportedOpening,
      onPrevPage: deps.onImportedPrevPage,
      onNextPage: deps.onImportedNextPage
    })
  ]);
}
function renderPuzzleRound(deps) {
  const round = deps.ctrl.round();
  const [done, total] = deps.ctrl.progress();
  const feedback = deps.ctrl.feedback();
  const result = deps.ctrl.result();
  let label = `Find the best move for ${round.toMove === "white" ? "White" : "Black"}`;
  if (feedback === "good") label = "Correct. Keep going.";
  else if (feedback === "fail") label = "Not the move. Try again or reveal the line.";
  else if (feedback === "win") label = "Solved.";
  else if (feedback === "view") label = "Solution shown.";
  const metaRows = [];
  if (round.sourceKind === "saved") {
    const sourceGame = round.sourceGame;
    const sourceLabel = sourceGame ? `${sourceGame.white ?? "White"} vs ${sourceGame.black ?? "Black"}` : "Source game unavailable";
    metaRows.push(
      h("dt", "Source game"),
      h("dd", sourceLabel),
      h("dt", "Mistake"),
      h("dd", formatSavedMove(round)),
      h("dt", "Loss"),
      h("dd", formatLoss(round.source.loss)),
      h("dt", "Best move"),
      h("dd", uciToSan(round.startFen, round.source.bestMove))
    );
    if (sourceGame?.opening || sourceGame?.eco) {
      metaRows.push(h("dt", "Opening"), h("dd", sourceGame.opening ?? sourceGame.eco ?? ""));
    }
    if (sourceGame?.date) {
      metaRows.push(h("dt", "Date"), h("dd", sourceGame.date));
    }
    if (sourceGame?.timeClass) {
      metaRows.push(h("dt", "Time control"), h("dd", sourceGame.timeClass));
    }
  } else {
    const imported = round.imported;
    metaRows.push(
      h("dt", "Source"),
      h("dd", "Imported Lichess puzzle"),
      h("dt", "Puzzle ID"),
      h("dd", imported.id),
      h("dt", "Rating"),
      h("dd", String(imported.rating)),
      h("dt", "Themes"),
      h("dd", imported.themes.join(", ") || "None"),
      h("dt", "Opening"),
      h("dd", formatImportedOpening(imported))
    );
    if (imported.plays !== void 0) {
      metaRows.push(h("dt", "Plays"), h("dd", imported.plays.toLocaleString()));
    }
    if (imported.popularity !== void 0) {
      metaRows.push(h("dt", "Popularity"), h("dd", String(imported.popularity)));
    }
  }
  return h("div.puzzle-round", [
    h("div.analyse__board.main-board.puzzle-round__board-shell", [
      deps.topStrip,
      h("div.analyse__board-inner", [deps.board, deps.promotionDialog]),
      deps.bottomStrip
    ]),
    h("aside.puzzle-round__side", [
      h(`section.puzzle-round__feedback.${feedback}`, [
        result === "solved" || result === "viewed" ? h("div.puzzle-round__after", [
          h(
            "div.puzzle-round__complete",
            result === "solved" ? "Puzzle solved!" : "Puzzle complete."
          ),
          h("button.puzzle-round__next", { on: { click: deps.onNext } }, "Continue training \u2192")
        ]) : [
          feedback === "good" || feedback === "win" ? h("div.puzzle-round__feedback-icon", "\u2713") : feedback === "fail" ? h("div.puzzle-round__feedback-icon", "\u2717") : null,
          h("div.puzzle-round__status", label),
          h("div.puzzle-round__progress", `${done} / ${total}`)
        ]
      ]),
      h("section.puzzle-round__controls", [
        h("button", { on: { click: deps.onBack } }, "Back to library"),
        h("button", { on: { click: deps.onFlip } }, "Flip"),
        result !== "solved" && result !== "viewed" && feedback === "fail" ? h("button", { on: { click: deps.onRetry } }, "Retry") : null,
        result !== "solved" && result !== "viewed" && (feedback === "find" || feedback === "good" || feedback === "fail") ? h("button", { on: { click: deps.onViewSolution } }, "View solution") : null
      ]),
      h("section.puzzle-round__meta", [
        h("h3", "Puzzle context"),
        h("dl", metaRows),
        round.sourceKind === "saved" && round.sourceGame ? h("button", { on: { click: deps.onOpenSourceGame } }, "Open source game") : null,
        round.sourceKind === "imported" && round.imported.gameUrl ? h("a.button", {
          attrs: {
            href: round.imported.gameUrl,
            target: "_blank",
            rel: "noreferrer"
          }
        }, "Open source on Lichess") : null
      ])
    ])
  ]);
}

// src/puzzles/index.ts
var _getImportedGames4 = () => [];
var _getRoute = () => ({ name: "home", params: {} });
var _getCtrlPath = () => "";
var _loadGameById = () => false;
var _navigate4 = () => {
};
var _clearRetro = () => {
};
var _redraw8 = () => {
};
var _openStandalonePuzzle = () => {
};
var _restoreStandalonePuzzleBackground = () => {
};
var _hasStandalonePuzzleBackground = () => false;
var routeState = { status: "idle" };
var puzzleSession = emptyPuzzleSession();
var librarySource = "saved";
var importedQuery = defaultImportedPuzzleQuery();
function saveSessionSnapshot() {
  const active = getActivePuzzleCtrl();
  if (!active) return;
  puzzleSession = applyPuzzleSnapshot(puzzleSession, active.snapshot());
  void savePuzzleSessionToIdb(puzzleSession);
}
function clearActivePuzzleRoute() {
  setActivePuzzleCtrl(void 0);
  syncArrow();
}
function savedPuzzleRounds() {
  const games = _getImportedGames4();
  return savedPuzzles.map(
    (candidate) => buildPuzzleRound(candidate, {
      sourceGame: candidate.gameId ? games.find((game) => game.id === candidate.gameId) ?? null : null
    })
  );
}
function setLibrarySource(source) {
  if (librarySource === source) return;
  librarySource = source;
  if (source === "lichess") requestImportedPuzzleLibrary(importedQuery);
  _redraw8();
}
function updateImportedFilters(patch2) {
  importedQuery = {
    ...importedQuery,
    page: 0,
    filters: {
      ...importedQuery.filters,
      ...patch2
    }
  };
  requestImportedPuzzleLibrary(importedQuery);
}
function stepImportedPage(delta) {
  const nextPage = Math.max(0, importedQuery.page + delta);
  if (nextPage === importedQuery.page) return;
  importedQuery = {
    ...importedQuery,
    page: nextPage
  };
  requestImportedPuzzleLibrary(importedQuery);
}
function nextPuzzleHref(round) {
  if (round.sourceKind === "saved") {
    const rounds = savedPuzzleRounds();
    const idx2 = rounds.findIndex((candidate) => candidate.key === round.key);
    const next3 = idx2 >= 0 ? rounds[idx2 + 1] : null;
    return next3 ? `#/puzzles/${next3.routeId}` : "#/puzzles";
  }
  const importedState = importedPuzzleLibraryState();
  const idx = importedState.items.findIndex((item) => item.key === round.key);
  const next2 = idx >= 0 ? importedState.items[idx + 1] : null;
  return next2 ? `#/puzzles/${next2.routeId}` : "#/puzzles";
}
function openSourceGame(round) {
  if (round.sourceKind !== "saved" || !round.source.gameId) return;
  if (!_loadGameById(round.source.gameId)) return;
  _clearRetro();
  _navigate4(round.parentPath);
  window.location.hash = `#/analysis/${round.source.gameId}`;
}
function restoreRoundBoard(round, progressPly) {
  if (round.sourceKind === "imported") {
    _openStandalonePuzzle(round.startFen);
    for (let i = 0; i < progressPly; i++) {
      const move3 = round.solution[i];
      if (!move3) break;
      playUciMove(move3);
    }
    return;
  }
  if (round.source.gameId) _loadGameById(round.source.gameId);
  _clearRetro();
  _navigate4(round.parentPath);
  for (let i = 0; i < progressPly; i++) {
    const move3 = round.solution[i];
    if (!move3) break;
    playUciMove(move3);
  }
}
function initPuzzles(deps) {
  _getImportedGames4 = deps.getImportedGames;
  _getRoute = deps.getRoute;
  _getCtrlPath = deps.getCtrlPath;
  _loadGameById = deps.loadGameById;
  _navigate4 = deps.navigate;
  _clearRetro = deps.clearRetro;
  _redraw8 = deps.redraw;
  _openStandalonePuzzle = deps.openStandalonePuzzle;
  _restoreStandalonePuzzleBackground = deps.restoreStandalonePuzzleBackground;
  _hasStandalonePuzzleBackground = deps.hasStandalonePuzzleBackground;
  initImportedPuzzles({ redraw: deps.redraw });
  void loadPuzzleSessionFromIdb().then((session) => {
    puzzleSession = session ?? emptyPuzzleSession();
    _redraw8();
    void syncPuzzleRoute(_getRoute());
  });
}
async function syncPuzzleRoute(route) {
  if (route.name !== "puzzle-round") {
    if (route.name === "puzzles") {
      routeState = { status: "library" };
    } else {
      routeState = { status: "idle" };
      if (_hasStandalonePuzzleBackground()) {
        _restoreStandalonePuzzleBackground();
      }
    }
    if (getActivePuzzleCtrl()) {
      saveSessionSnapshot();
      clearActivePuzzleRoute();
    }
    _redraw8();
    return;
  }
  const routeId = route.params["id"] ?? "";
  const active = getActivePuzzleCtrl();
  const activeSnapshot = active ? currentPuzzleSnapshot(puzzleSession, active.round().key) : null;
  if (active?.round().routeId === routeId && routeState.status === "ready" && (!activeSnapshot || active.progressPly() === activeSnapshot.progressPly)) return;
  routeState = { status: "loading", routeId };
  clearActivePuzzleRoute();
  _redraw8();
  const importedRoute = isImportedPuzzleRouteId(routeId);
  if (importedRoute) {
    librarySource = "lichess";
  } else {
    librarySource = "saved";
    if (_hasStandalonePuzzleBackground()) {
      _restoreStandalonePuzzleBackground();
    }
  }
  let round = null;
  if (importedRoute) {
    round = await findImportedPuzzleRoundByRouteId(routeId);
    if (!round) {
      routeState = { status: "missing", routeId, message: "This imported puzzle could not be loaded from the generated Lichess shards." };
      _redraw8();
      return;
    }
  } else {
    const candidate = findSavedPuzzleByRouteId(savedPuzzles, routeId);
    if (!candidate) {
      routeState = { status: "missing", routeId, message: "This saved puzzle was not found." };
      _redraw8();
      return;
    }
    if (!candidate.gameId) {
      routeState = { status: "missing", routeId, message: "This puzzle has no saved source game to load." };
      _redraw8();
      return;
    }
    const sourceGame = _getImportedGames4().find((game) => game.id === candidate.gameId) ?? null;
    if (!sourceGame) {
      routeState = { status: "missing", routeId, message: "The source game for this puzzle is no longer in the local library." };
      _redraw8();
      return;
    }
    const storedAnalysis = await loadAnalysisFromIdb(candidate.gameId);
    round = buildPuzzleRound(candidate, {
      sourceGame,
      ...storedAnalysis !== void 0 ? { storedAnalysis } : {}
    });
  }
  const ctrl2 = makePuzzleCtrl(round, (snapshot2) => {
    puzzleSession = applyPuzzleSnapshot(puzzleSession, snapshot2);
    void savePuzzleSessionToIdb(puzzleSession);
    _redraw8();
  });
  setActivePuzzleCtrl(ctrl2);
  syncArrow();
  const snapshot = currentPuzzleSnapshot(puzzleSession, round.key);
  const progressPly = snapshot?.progressPly ?? 0;
  restoreRoundBoard(round, progressPly);
  if (snapshot) ctrl2.restore(snapshot);
  ctrl2.setCurrentPath(_getCtrlPath());
  routeState = { status: "ready", routeId };
  _redraw8();
}
function renderPuzzlesRoute(route) {
  if (route.name === "puzzles") {
    if (librarySource === "lichess") requestImportedPuzzleLibrary(importedQuery);
    const rounds = savedPuzzleRounds();
    return renderPuzzleLibrary({
      source: librarySource,
      onSourceChange: setLibrarySource,
      savedRounds: rounds,
      importedState: importedPuzzleLibraryState(),
      session: puzzleSession,
      currentPuzzleKey: getActivePuzzleCtrl()?.round().key ?? null,
      recentResultForKey: (key) => recentPuzzleResult(puzzleSession, key),
      isResumeKey: (key) => currentPuzzleIsActive(puzzleSession, key),
      onImportedRatingMin: (value) => updateImportedFilters({ ratingMin: value }),
      onImportedRatingMax: (value) => updateImportedFilters({ ratingMax: value }),
      onImportedTheme: (value) => updateImportedFilters({ theme: value }),
      onImportedOpening: (value) => updateImportedFilters({ opening: value }),
      onImportedPrevPage: () => stepImportedPage(-1),
      onImportedNextPage: () => stepImportedPage(1)
    });
  }
  if (route.name !== "puzzle-round") {
    return h("div");
  }
  if (routeState.status === "loading") {
    return h("div.puzzle-library puzzle-library--empty", [
      h("h2", "Puzzles"),
      h("p", "Loading puzzle\u2026")
    ]);
  }
  if (routeState.status === "missing") {
    return h("div.puzzle-library puzzle-library--empty", [
      h("h2", "Puzzles"),
      h("p", routeState.message),
      h("a", { attrs: { href: "#/puzzles" } }, "Back to puzzle library")
    ]);
  }
  const ctrl2 = getActivePuzzleCtrl();
  if (!ctrl2) {
    return h("div.puzzle-library puzzle-library--empty", [
      h("h2", "Puzzles"),
      h("p", "Loading puzzle\u2026")
    ]);
  }
  const [topStrip, bottomStrip] = renderPlayerStrips();
  return renderPuzzleRound({
    ctrl: ctrl2,
    onBack: () => {
      window.location.hash = "#/puzzles";
    },
    onFlip: () => {
      flip();
      _redraw8();
    },
    onRetry: () => {
      ctrl2.retry();
      restoreRoundBoard(ctrl2.round(), 0);
      ctrl2.setCurrentPath(_getCtrlPath());
      syncArrow();
      _redraw8();
    },
    onViewSolution: () => {
      ctrl2.viewSolution();
      restoreRoundBoard(ctrl2.round(), ctrl2.round().solution.length);
      ctrl2.setCurrentPath(_getCtrlPath());
      syncArrow();
      _redraw8();
    },
    onNext: () => {
      window.location.hash = nextPuzzleHref(ctrl2.round());
    },
    onOpenSourceGame: () => openSourceGame(ctrl2.round()),
    board: renderBoard(),
    promotionDialog: renderPromotionDialog(),
    topStrip,
    bottomStrip
  });
}
function puzzleHrefForCandidate(gameId, path) {
  return puzzleRouteHref({ gameId, path });
}

// src/import/pgn.ts
var pgnState = {
  input: "",
  error: null,
  key: 0
  // incremented on successful import to reset the textarea via Snabbdom key
};
function importPgn(callbacks) {
  const raw = pgnState.input.trim();
  if (!raw) return;
  try {
    pgnToTree(raw);
    const white = parsePgnHeader(raw, "White");
    const black = parsePgnHeader(raw, "Black");
    const result = parsePgnHeader(raw, "Result");
    const date = parsePgnHeader(raw, "Date")?.replace(/\./g, "-");
    const timeClass = timeClassFromTimeControl(parsePgnHeader(raw, "TimeControl"));
    const opening = parsePgnHeader(raw, "Opening");
    const eco = parsePgnHeader(raw, "ECO");
    const whiteRating = parseRating(parsePgnHeader(raw, "WhiteElo"));
    const blackRating = parseRating(parsePgnHeader(raw, "BlackElo"));
    const game = {
      id: nextGameId(),
      pgn: raw,
      ...white ? { white } : {},
      ...black ? { black } : {},
      ...result ? { result } : {},
      ...date ? { date } : {},
      ...timeClass ? { timeClass } : {},
      ...opening ? { opening } : {},
      ...eco ? { eco } : {},
      ...whiteRating !== void 0 ? { whiteRating } : {},
      ...blackRating !== void 0 ? { blackRating } : {}
      // importedUsername not set: PGN paste has no reliable importing-user identity
    };
    pgnState.error = null;
    pgnState.input = "";
    pgnState.key++;
    callbacks.addGames([game], game);
  } catch (_) {
    pgnState.error = "Invalid PGN \u2014 could not parse.";
    callbacks.redraw();
  }
}

// src/header/index.ts
var importPlatform = "chesscom";
var showImportPanel = false;
var showGlobalMenu = false;
var showBoardSettings = false;
function activeSection(route) {
  switch (route.name) {
    case "analysis":
    case "analysis-game":
      return "analysis";
    case "puzzle-round":
    case "puzzles":
      return "puzzles";
    case "openings":
      return "openings";
    case "stats":
      return "stats";
    case "games":
      return "games";
    default:
      return "";
  }
}
var navLinks = [
  { label: "Analysis", href: "#/analysis", section: "analysis" },
  { label: "Games", href: "#/games", section: "games" },
  { label: "Puzzles", href: "#/puzzles", section: "puzzles" },
  { label: "Openings", href: "#/openings", section: "openings" },
  { label: "Stats", href: "#/stats", section: "stats" }
];
function renderNav(route) {
  const active = activeSection(route);
  return h("nav.header__nav", navLinks.map(
    ({ label, href, section }) => h("a", { attrs: { href }, class: { active: active === section } }, label)
  ));
}
function closeGlobalMenu(redraw2) {
  showGlobalMenu = false;
  showBoardSettings = false;
  redraw2();
}
function renderGlobalMenu(deps) {
  const { downloadPgn: downloadPgn2, resetAllData: resetAllData2, selectedGameId: selectedGameId2, redraw: redraw2 } = deps;
  const hasGame = selectedGameId2 !== null;
  return h("div.global-menu", [
    h("button.global-menu__trigger", {
      class: { active: showGlobalMenu },
      attrs: { title: "Settings" },
      on: { click: () => {
        showGlobalMenu = !showGlobalMenu;
        showBoardSettings = false;
        redraw2();
      } }
    }, "\u2699"),
    showGlobalMenu ? h("div.global-menu__backdrop", {
      on: { click: () => closeGlobalMenu(redraw2) }
    }) : null,
    showGlobalMenu ? h("div.global-menu__dropdown", {
      class: { "board-open": showBoardSettings }
    }, [
      h("button.global-menu__item", {
        on: { click: () => {
          closeGlobalMenu(redraw2);
          void resetAllData2();
        } }
      }, "Clear Local Data"),
      // Navigate to the analysis board to review the currently loaded game.
      // Disabled when no game is selected — nothing to review.
      h("button.global-menu__item", {
        attrs: { disabled: !hasGame, title: hasGame ? "Review current game on analysis board" : "Select a game first" },
        on: { click: () => {
          if (!hasGame) return;
          closeGlobalMenu(redraw2);
          window.location.hash = "#/analysis";
        } }
      }, "Game Review"),
      h("button.global-menu__item", {
        on: { click: () => {
          closeGlobalMenu(redraw2);
          downloadPgn2(true);
        } }
      }, "Export PGN (Annotated)"),
      h("button.global-menu__item", {
        on: { click: () => {
          closeGlobalMenu(redraw2);
          downloadPgn2(false);
        } }
      }, "Export PGN (Plain)"),
      h("label.global-menu__item.global-menu__item--toggle", [
        h("span", "Board Wheel Navigation"),
        h("input", {
          attrs: { type: "checkbox", checked: boardWheelNavEnabled },
          on: {
            change: (e) => {
              setBoardWheelNavEnabled(e.target.checked);
              redraw2();
            }
          }
        })
      ]),
      h("label.global-menu__item.global-menu__item--toggle", [
        h("span", "Review Dots: User Only"),
        h("input", {
          attrs: { type: "checkbox", checked: reviewDotsUserOnly },
          on: {
            change: (e) => {
              setReviewDotsUserOnly(e.target.checked);
              redraw2();
            }
          }
        })
      ]),
      h("div.global-menu__item.global-menu__item--has-sub", {
        on: { click: () => {
          showBoardSettings = !showBoardSettings;
          redraw2();
        } }
      }, [
        h("span", "Board Settings"),
        h("span.global-menu__arrow", showBoardSettings ? "\u25BE" : "\u203A")
      ]),
      showBoardSettings ? renderBoardSettings(redraw2) : null
    ]) : null
  ]);
}
function renderHeader(deps) {
  const {
    route,
    importedGames: importedGames2,
    selectedGameId: selectedGameId2,
    analyzedGameIds: analyzedGameIds2,
    missedTacticGameIds: missedTacticGameIds2,
    importCallbacks: importCallbacks2,
    onSelectGame,
    renderGameRow,
    gameSourceUrl: gameSourceUrl2,
    resetAllData: resetAllData2,
    redraw: redraw2
  } = deps;
  const loading = importPlatform === "chesscom" ? chesscom.loading : lichess.loading;
  const error = importPlatform === "chesscom" ? chesscom.error : lichess.error;
  const username = importPlatform === "chesscom" ? chesscom.username : lichess.username;
  const doImport = () => importPlatform === "chesscom" ? void importChesscom(importCallbacks2) : void importLichess(importCallbacks2);
  const hasActiveFilters = importFilters.speeds.size > 0 || importFilters.dateRange !== "1month" || !importFilters.rated;
  const panel = showImportPanel ? h("div.header__panel", [
    h("div.header__panel-section", [
      h("div.header__panel-label", "Time control"),
      h("div.header__panel-row", [
        h("button.header__pill", {
          class: { active: importFilters.speeds.size === 0 },
          on: { click: () => {
            importFilters.speeds = /* @__PURE__ */ new Set();
            redraw2();
          } }
        }, "All"),
        ...SPEED_OPTIONS.map(
          ({ value, label, icon }) => h("button.header__pill", {
            class: { active: importFilters.speeds.has(value) },
            attrs: { "data-icon": icon },
            on: { click: () => {
              const s = new Set(importFilters.speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              importFilters.speeds = s;
              redraw2();
            } }
          }, label)
        )
      ]),
      h("div.header__panel-label.--mt", "Period"),
      h("div.header__panel-row", [
        ...DATE_RANGE_OPTIONS.map(
          ({ value, label }) => h("button.header__pill", {
            class: { active: importFilters.dateRange === value },
            on: { click: () => {
              importFilters.dateRange = value;
              redraw2();
            } }
          }, label)
        )
      ]),
      importFilters.dateRange === "custom" ? h("div.header__panel-row.--mt", [
        h("span.header__panel-hint", "From"),
        h("input.header__date-input", {
          attrs: { type: "date", value: importFilters.customFrom },
          on: { change: (e) => {
            importFilters.customFrom = e.target.value;
            redraw2();
          } }
        }),
        h("span.header__panel-hint", "To"),
        h("input.header__date-input", {
          attrs: { type: "date", value: importFilters.customTo },
          on: { change: (e) => {
            importFilters.customTo = e.target.value;
            redraw2();
          } }
        })
      ]) : null,
      h("div.header__panel-row.--mt", [
        h("label.header__panel-check", [
          h("input", {
            attrs: { type: "checkbox", checked: importFilters.rated },
            on: { change: (e) => {
              importFilters.rated = e.target.checked;
              redraw2();
            } }
          }),
          "Rated only"
        ])
      ])
    ]),
    h("div.header__panel-divider"),
    h("div.header__panel-section", [
      h("div.header__panel-label", "Paste PGN"),
      h("textarea.header__pgn-input", {
        key: pgnState.key,
        attrs: { placeholder: "Paste a PGN here\u2026", rows: 3, spellcheck: false },
        on: { input: (e) => {
          pgnState.input = e.target.value;
        } }
      }),
      h("div.header__panel-row", [
        h("button.header__panel-btn", {
          on: { click: () => {
            importPgn(importCallbacks2);
            if (!pgnState.error) {
              showImportPanel = false;
            }
            redraw2();
          } }
        }, "Import PGN"),
        pgnState.error ? h("span.header__panel-error", pgnState.error) : null
      ])
    ]),
    importedGames2.length > 0 ? h("div.header__panel-section", [
      h("div.header__panel-label", `${importedGames2.length} game${importedGames2.length === 1 ? "" : "s"} imported`),
      h("div.header__games-list", importedGames2.map((game) => {
        const isAnalyzed = analyzedGameIds2.has(game.id);
        const hasMissedTactic = missedTacticGameIds2.has(game.id);
        const srcUrl = gameSourceUrl2(game);
        return h("div.header__game-item", [
          h("button.header__game-row", {
            class: { active: game.id === selectedGameId2 },
            on: { click: () => {
              onSelectGame(game.id, game.pgn);
              showImportPanel = false;
              redraw2();
            } }
          }, renderGameRow(game, isAnalyzed, hasMissedTactic)),
          srcUrl ? h("a.game-ext-link", {
            attrs: { href: srcUrl, target: "_blank", rel: "noopener", title: "View on source platform" },
            on: { click: (e) => e.stopPropagation() }
          }) : null
        ]);
      }))
    ]) : null
  ]) : null;
  const backdrop = showImportPanel ? h("div.header__backdrop", {
    on: { click: () => {
      showImportPanel = false;
      redraw2();
    } }
  }) : null;
  return h("header.header", [
    h("a.header__brand", { attrs: { href: "#/" } }, "Patzer Pro"),
    h("div.header__search", { key: "header-search" }, [
      h("div.header__bar", [
        h("div.header__platforms", [
          h("button.header__platform", {
            class: { active: importPlatform === "chesscom" },
            attrs: { title: importPlatform === "chesscom" ? "Chess.com (active)" : "Switch to Chess.com" },
            on: { click: () => {
              importPlatform = "chesscom";
              redraw2();
            } }
          }, "Chess.com"),
          h("button.header__platform", {
            class: { active: importPlatform === "lichess" },
            attrs: { title: importPlatform === "lichess" ? "Lichess (active)" : "Switch to Lichess" },
            on: { click: () => {
              importPlatform = "lichess";
              redraw2();
            } }
          }, "Lichess")
        ]),
        h("input.header__input", {
          key: `input-${importPlatform}`,
          attrs: {
            type: "search",
            placeholder: importPlatform === "chesscom" ? "Chess.com username" : "Lichess username",
            value: username,
            disabled: loading,
            autocomplete: "off",
            spellcheck: false
          },
          on: {
            input: (e) => {
              const v = e.target.value;
              if (importPlatform === "chesscom") chesscom.username = v;
              else lichess.username = v;
            },
            keydown: (e) => {
              if (e.key === "Enter" && username.trim() && !loading) doImport();
            }
          }
        }),
        h("button.header__import", {
          attrs: { disabled: loading || !username.trim() },
          on: { click: doImport }
        }, loading ? "Importing\u2026" : "Import"),
        importedGames2.length > 0 && !error ? h(
          "span.header__count",
          { on: { click: () => {
            showImportPanel = !showImportPanel;
            redraw2();
          } } },
          `${importedGames2.length} games`
        ) : null,
        error ? h("span.header__error", { attrs: { title: error } }, "\u26A0") : null,
        h("button.header__toggle", {
          class: { active: showImportPanel, "header__toggle--filtered": hasActiveFilters && !showImportPanel },
          attrs: { title: "Filters & games" },
          on: { click: () => {
            showImportPanel = !showImportPanel;
            redraw2();
          } }
        }, showImportPanel ? "\u25B4" : "\u25BE")
      ]),
      panel,
      backdrop
    ]),
    renderNav(route),
    renderGlobalMenu(deps)
  ]);
}

// src/router.ts
var routes = [
  { pattern: ["analysis", ":id"], name: "analysis-game" },
  { pattern: ["analysis"], name: "analysis" },
  { pattern: ["puzzles", ":id"], name: "puzzle-round" },
  { pattern: ["puzzles"], name: "puzzles" },
  { pattern: ["openings"], name: "openings" },
  { pattern: ["stats"], name: "stats" },
  { pattern: ["games"], name: "games" },
  { pattern: [], name: "home" }
];
function parse(hash2) {
  const path = hash2.replace(/^#\/?/, "");
  const parts = path ? path.split("/") : [];
  for (const { pattern, name } of routes) {
    if (pattern.length !== parts.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      const seg = pattern[i];
      if (!seg) {
        matched = false;
        break;
      }
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = parts[i];
      } else if (seg !== parts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { name, params };
  }
  return { name: "home", params: {} };
}
function current() {
  return parse(window.location.hash);
}
function onChange2(fn) {
  window.addEventListener("hashchange", () => fn(current()));
}

// src/analyse/retro.ts
var STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var RETRO_OPENING_CANCEL_MAX_PLY = 20;
function buildMainlineOpeningProvider(mainline, hasOpeningMetadata) {
  if (!hasOpeningMetadata) return () => void 0;
  if (mainline[0]?.fen !== STANDARD_START_FEN) return () => void 0;
  const openingMovesByFen = /* @__PURE__ */ new Map();
  for (let i = 1; i < mainline.length; i++) {
    const parent = mainline[i - 1];
    const node = mainline[i];
    if (!parent || !node?.uci) continue;
    if (node.ply > RETRO_OPENING_CANCEL_MAX_PLY) break;
    const moves = openingMovesByFen.get(parent.fen) ?? [];
    if (!moves.includes(node.uci)) moves.push(node.uci);
    openingMovesByFen.set(parent.fen, moves);
  }
  return (fen) => openingMovesByFen.get(fen);
}
function buildRetroCandidates(mainline, getEval, gameId, userColor = null, getOpeningUcis = () => void 0) {
  const candidates = [];
  let path = "";
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i];
    const parent = mainline[i - 1];
    path += node.id;
    const parentPath = path.slice(0, -2);
    const isWhiteMove = node.ply % 2 === 1;
    const playerColor = isWhiteMove ? "white" : "black";
    if (userColor !== null && playerColor !== userColor) continue;
    const nodeEval = getEval(path);
    const parentEval = getEval(parentPath);
    if (!nodeEval || !parentEval || !parentEval.best) continue;
    if (!node.uci) continue;
    const parentMatePov = isWhiteMove ? parentEval.mate : parentEval.mate !== void 0 ? -parentEval.mate : void 0;
    const isMissedMate = parentMatePov !== void 0 && parentMatePov > 0 && parentMatePov <= 3 && !nodeEval.mate;
    const loss = nodeEval.loss;
    const classification = loss !== void 0 ? classifyLoss(loss) : null;
    const qualifiesByLoss = classification === "mistake" || classification === "blunder";
    if (!qualifiesByLoss && !isMissedMate) continue;
    const openingUcis = getOpeningUcis(parent.fen);
    if (openingUcis && node.uci && openingUcis.includes(node.uci)) continue;
    let finalClassification;
    if (classification === "blunder" || classification === "mistake") {
      finalClassification = classification;
    } else {
      finalClassification = "blunder";
    }
    const candidate = {
      gameId,
      path,
      parentPath,
      fenBefore: parent.fen,
      playedMove: node.uci,
      playedMoveSan: node.san ?? "",
      bestMove: parentEval.best,
      classification: finalClassification,
      loss: loss ?? 0,
      isMissedMate,
      playerColor,
      ply: node.ply
    };
    if (parentEval.moves && parentEval.moves.length > 0) {
      candidate.bestLine = parentEval.moves;
    }
    candidates.push(candidate);
  }
  return candidates;
}

// src/analyse/retroCtrl.ts
function makeRetroCtrl(candidates, userColor = null, getNodeEval = () => void 0, getEval = () => void 0, navigateTo = () => {
}) {
  let solvedPlies = [];
  let currentIdx = -1;
  let _feedback = "find";
  let _guidanceRevealed = false;
  const isPlySolved = (ply) => solvedPlies.includes(ply);
  function findNextIdx() {
    return candidates.findIndex((c) => !isPlySolved(c.ply));
  }
  function solveCurrent() {
    const c = candidates[currentIdx];
    if (c && !isPlySolved(c.ply)) solvedPlies.push(c.ply);
  }
  function jumpToNext() {
    _feedback = "find";
    _guidanceRevealed = false;
    currentIdx = findNextIdx();
  }
  function skip() {
    solveCurrent();
    jumpToNext();
  }
  function viewSolution() {
    _feedback = "view";
    solveCurrent();
  }
  jumpToNext();
  return {
    candidates,
    userColor,
    current() {
      return currentIdx >= 0 ? candidates[currentIdx] ?? null : null;
    },
    feedback() {
      return _feedback;
    },
    setFeedback(f) {
      _feedback = f;
    },
    isSolving() {
      return _feedback === "find" || _feedback === "fail";
    },
    guidanceRevealed() {
      return _guidanceRevealed;
    },
    revealGuidance() {
      _guidanceRevealed = true;
    },
    isPlySolved,
    jumpToNext,
    skip,
    viewSolution,
    onJump(path) {
      const c = currentIdx >= 0 ? candidates[currentIdx] ?? null : null;
      if (!c) return;
      if (_feedback === "win" || _feedback === "view") {
        return;
      }
      if (_feedback === "eval" && path !== c.path) {
        _feedback = "find";
        return;
      }
      if (_feedback === "offTrack" && path === c.parentPath) {
        _feedback = "find";
      } else if ((_feedback === "find" || _feedback === "fail") && path !== c.parentPath) {
        _feedback = "offTrack";
      }
    },
    onCeval() {
      if (_feedback !== "eval") return;
      const c = currentIdx >= 0 ? candidates[currentIdx] ?? null : null;
      if (!c) return;
      const ev = getNodeEval();
      if (!ev) return;
      if (!ev.depth || ev.depth < 14) return;
      const parentEv = getEval(c.parentPath);
      if (parentEv) {
        const toColor = (wc) => c.playerColor === "white" ? wc : -wc;
        const nodeWc = toColor(evalWinChances(ev) ?? 0);
        const parentWc = toColor(evalWinChances(parentEv) ?? 0);
        const diff2 = (nodeWc - parentWc) / 2;
        if (diff2 > -0.04) {
          solveCurrent();
          _feedback = "win";
        } else {
          _feedback = "fail";
          navigateTo(c.parentPath);
        }
      } else {
        _feedback = "fail";
        navigateTo(c.parentPath);
      }
    },
    onWin() {
      solveCurrent();
      _feedback = "win";
    },
    onFail() {
      _feedback = "fail";
    },
    onMergeAnalysisData() {
      if ((_feedback === "find" || _feedback === "fail") && currentIdx < 0) jumpToNext();
    },
    completion() {
      return [solvedPlies.length, candidates.length];
    },
    reset() {
      solvedPlies = [];
      jumpToNext();
    }
  };
}

// src/analyse/retroView.ts
function renderRetroEntry(deps) {
  const { retro, analysisComplete: analysisComplete2, batchAnalyzing: batchAnalyzing2, onToggle } = deps;
  return h("button", {
    class: { active: !!retro },
    attrs: {
      disabled: !analysisComplete2 || batchAnalyzing2,
      title: retro ? "Close mistake review" : analysisComplete2 ? "Review your mistakes from this game" : "Complete game review first"
    },
    on: { click: onToggle }
  }, retro ? "Close" : "Mistakes");
}
function renderRetroStrip(deps) {
  const { retro, navigate: navigate2, redraw: redraw2, uciToSan: uciToSan2, onRevealGuidance } = deps;
  if (!retro) return null;
  const feedback = retro.feedback();
  const cand = retro.current();
  const [solved, total] = retro.completion();
  const revealed = retro.guidanceRevealed();
  const progress = h("span.retro-strip__progress", `${solved} / ${total}`);
  const buttons = [];
  if (feedback === "find" || feedback === "offTrack") {
    buttons.push(
      h("button.retro-strip__btn", {
        on: { click: () => {
          retro.viewSolution();
          if (cand) navigate2(cand.path);
        } }
      }, "Show answer"),
      h("button.retro-strip__btn", {
        on: { click: () => {
          retro.skip();
          const next2 = retro.current();
          if (next2) navigate2(next2.parentPath);
          else redraw2();
        } }
      }, "Skip")
    );
  } else if (feedback === "win") {
    buttons.push(
      h("button.retro-strip__btn.retro-strip__btn--next", {
        on: { click: () => {
          retro.jumpToNext();
          const next2 = retro.current();
          if (next2) navigate2(next2.parentPath);
          else redraw2();
        } }
      }, "Next \u2192")
    );
  } else if (feedback === "fail") {
    buttons.push(
      h("button.retro-strip__btn", {
        on: { click: () => {
          retro.setFeedback("find");
          redraw2();
        } }
      }, "Retry"),
      h("button.retro-strip__btn", {
        on: { click: () => {
          retro.viewSolution();
          if (cand) navigate2(cand.path);
        } }
      }, "Show answer")
    );
  } else if (feedback === "view") {
    const bestSan = cand ? uciToSan2(cand.fenBefore, cand.bestMove) : null;
    if (bestSan) buttons.push(h("span.retro-strip__best", `Best: ${bestSan}`));
    buttons.push(
      h("button.retro-strip__btn.retro-strip__btn--next", {
        on: { click: () => {
          retro.jumpToNext();
          const next2 = retro.current();
          if (next2) navigate2(next2.parentPath);
          else redraw2();
        } }
      }, "Next \u2192")
    );
  }
  let label;
  if (!cand) {
    label = "Review complete!";
  } else if (feedback === "win") {
    label = "Correct!";
  } else if (feedback === "fail") {
    label = "Not the best move.";
  } else if (feedback === "view") {
    label = `${cand.classification.charAt(0).toUpperCase() + cand.classification.slice(1)} on move ${Math.ceil(cand.ply / 2)}`;
  } else if (feedback === "offTrack") {
    label = "Navigate back to resume";
  } else {
    const color = cand.ply % 2 === 1 ? "White" : "Black";
    label = `Find the best move for ${color}`;
  }
  if (!revealed && cand) {
    buttons.push(
      h("button.retro-strip__btn.retro-strip__btn--engine", {
        on: { click: onRevealGuidance }
      }, "Show engine")
    );
  }
  return h("div.retro-strip", [
    h("div.retro-strip__label", label),
    h("div.retro-strip__actions", [...buttons, progress])
  ]);
}

// src/main.ts
console.log("Patzer Pro");
var patch = init([classModule, attributesModule, eventListenersModule]);
var PUBLIC_SOURCE_URL = "https://github.com/LeviathanDuck/PatzerPatzer";
var PUBLIC_LICENSE_URL = `${PUBLIC_SOURCE_URL}/blob/main/LICENSE`;
var NAV_STATE_SAVE_MS = 500;
function dedupeImportedGames(existing, incoming) {
  const seenPgns = new Set(existing.map((game) => game.pgn));
  const deduped = [];
  const importedAt = Date.now();
  for (const game of incoming) {
    if (seenPgns.has(game.pgn)) continue;
    seenPgns.add(game.pgn);
    deduped.push({ ...game, importedAt });
  }
  return deduped;
}
var importCallbacks = {
  addGames(games, _first2) {
    const dedupedGames = dedupeImportedGames(importedGames, games);
    const first2 = dedupedGames[0];
    if (!first2) {
      redraw();
      return;
    }
    importedGames = [...importedGames, ...dedupedGames];
    selectedGameId = first2.id;
    void saveGamesToIdb(importedGames);
    loadGame(first2.pgn);
  },
  redraw() {
    redraw();
  }
};
var SAMPLE_PGN = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7";
var importedGames = [];
var selectedGameId = null;
var selectedGamePgn = null;
var gamesLibraryLoaded = false;
var contextMenuPath = null;
var contextMenuPos = null;
var _contextMenuCloseListener = null;
function openContextMenu(path, e) {
  contextMenuPath = path;
  const targetRect = e.currentTarget?.getBoundingClientRect?.();
  contextMenuPos = {
    x: e.clientX || targetRect?.left || 0,
    y: e.clientY || targetRect?.top || 0
  };
  if (_contextMenuCloseListener) document.removeEventListener("click", _contextMenuCloseListener);
  _contextMenuCloseListener = () => {
    contextMenuPath = null;
    contextMenuPos = null;
    _contextMenuCloseListener = null;
    redraw();
  };
  document.addEventListener("click", _contextMenuCloseListener, { once: true });
  redraw();
}
function positionContextMenu(menu, coords) {
  const menuWidth = menu.offsetWidth + 4;
  const menuHeight = menu.offsetHeight + 4;
  const left = window.innerWidth - coords.x < menuWidth ? window.innerWidth - menuWidth : coords.x;
  const top = window.innerHeight - coords.y < menuHeight ? window.innerHeight - menuHeight : coords.y;
  menu.style.left = `${Math.max(0, left)}px`;
  menu.style.top = `${Math.max(0, top)}px`;
}
function renderContextMenu() {
  if (!contextMenuPath || !contextMenuPos) return null;
  const node = nodeAtPath(ctrl.root, contextMenuPath);
  const title = node?.san ?? contextMenuPath;
  const onMainline = isMainlinePath(ctrl.root, contextMenuPath);
  const copyLabel = onMainline ? "Copy main line PGN" : "Copy variation PGN";
  return h("div#move-ctx-menu.visible", {
    on: { contextmenu: (e) => e.preventDefault() },
    hook: {
      insert: (vnode3) => positionContextMenu(vnode3.elm, contextMenuPos),
      postpatch: (_old, vnode3) => positionContextMenu(vnode3.elm, contextMenuPos)
    }
  }, [
    h("p.title", title),
    // Copy PGN — mirrors lichess-org/lila: contextMenu.ts clipboard copy action (CCP-026)
    h("a", {
      on: { click: () => {
        copyLinePgn(contextMenuPath);
        contextMenuPath = null;
        contextMenuPos = null;
        redraw();
      } }
    }, copyLabel),
    // Delete from here — mirrors lichess-org/lila: contextMenu.ts deleteFromHere action (CCP-027)
    h("a", {
      on: { click: () => {
        const path = contextMenuPath;
        contextMenuPath = null;
        contextMenuPos = null;
        deleteVariation(path);
      } }
    }, "Delete from here"),
    // Promote variation / Make main line — mirrors lichess-org/lila: contextMenu.ts promote actions (CCP-028)
    // Only shown for non-mainline nodes: promoting a mainline node is a no-op.
    !onMainline ? h("a", {
      on: { click: () => {
        const path = contextMenuPath;
        contextMenuPath = null;
        contextMenuPos = null;
        promoteAt(ctrl.root, path, false);
        redraw();
      } }
    }, "Promote variation") : null,
    !onMainline ? h("a", {
      on: { click: () => {
        const path = contextMenuPath;
        contextMenuPath = null;
        contextMenuPos = null;
        promoteAt(ctrl.root, path, true);
        redraw();
      } }
    }, "Make main line") : null
  ]);
}
var analyzedGameIds = /* @__PURE__ */ new Set();
var missedTacticGameIds = /* @__PURE__ */ new Set();
var analyzedGameAccuracy = /* @__PURE__ */ new Map();
function getActivePgn() {
  return selectedGamePgn ?? SAMPLE_PGN;
}
var ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));
var standalonePuzzleBackground = null;
var restoreGeneration = 0;
var navStateSaveTimer = null;
function clonePositionEval(ev) {
  return {
    ...ev,
    ...ev.moves ? { moves: [...ev.moves] } : {},
    ...ev.lines ? {
      lines: ev.lines.map((line) => ({
        ...line,
        ...line.moves ? { moves: [...line.moves] } : {}
      }))
    } : {}
  };
}
function openStandalonePuzzle(fen) {
  if (!standalonePuzzleBackground) {
    standalonePuzzleBackground = {
      ctrl,
      selectedGameId,
      selectedGamePgn,
      currentEval: clonePositionEval(currentEval),
      evalEntries: [...evalCache.entries()].map(([path, ev]) => [path, clonePositionEval(ev)])
    };
  }
  contextMenuPath = null;
  contextMenuPos = null;
  selectedGameId = null;
  selectedGamePgn = null;
  ctrl = new AnalyseCtrl(buildStandalonePuzzleRoot(fen));
  resetCurrentEval();
  syncBoardAndArrow();
  redraw();
}
function restoreStandalonePuzzleBackground() {
  const snapshot = standalonePuzzleBackground;
  if (!snapshot) return;
  standalonePuzzleBackground = null;
  selectedGameId = snapshot.selectedGameId;
  selectedGamePgn = snapshot.selectedGamePgn;
  ctrl = snapshot.ctrl;
  clearEvalCache();
  for (const [path, ev] of snapshot.evalEntries) {
    evalCache.set(path, clonePositionEval(ev));
  }
  setCurrentEval(snapshot.currentEval);
  syncBoardAndArrow();
  redraw();
}
function hasStandalonePuzzleBackground() {
  return standalonePuzzleBackground !== null;
}
function scheduleNavStateSave(path = ctrl.path) {
  if (navStateSaveTimer !== null) clearTimeout(navStateSaveTimer);
  const selectedId = selectedGameId;
  navStateSaveTimer = setTimeout(() => {
    navStateSaveTimer = null;
    void saveNavStateToIdb(selectedId, path);
  }, NAV_STATE_SAVE_MS);
}
function loadGame(pgn) {
  selectedGamePgn = pgn;
  ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));
  clearEvalCache();
  resetCurrentEval();
  clearPuzzleCandidates();
  resetBatchState();
  if (selectedGameId) {
    const loadedGame = importedGames.find((g) => g.id === selectedGameId);
    if (loadedGame) {
      const userColor = getUserColor(loadedGame);
      if (userColor) setOrientation(userColor);
    }
  }
  syncBoardAndArrow();
  scheduleNavStateSave("");
  restoreGeneration++;
  if (selectedGameId) void loadAndRestoreAnalysis(selectedGameId, restoreGeneration);
  else evalCurrentPosition();
  redraw();
}
function loadGameById(gameId) {
  const game = importedGames.find((g) => g.id === gameId);
  if (!game) return false;
  selectedGameId = game.id;
  loadGame(game.pgn);
  return true;
}
async function loadAndRestoreAnalysis(gameId, generation) {
  const stored = await loadAnalysisFromIdb(gameId);
  if (generation !== restoreGeneration || selectedGameId !== gameId) return;
  if (!stored) return;
  if (stored.analysisVersion !== ANALYSIS_VERSION) return;
  if (stored.analysisDepth !== reviewDepth) return;
  for (const entry of Object.values(stored.nodes)) {
    if (!entry.path) continue;
    const ev = {};
    if (entry.cp !== void 0) ev.cp = entry.cp;
    if (entry.mate !== void 0) ev.mate = entry.mate;
    if (entry.best !== void 0) ev.best = entry.best;
    if (entry.loss !== void 0) ev.loss = entry.loss;
    if (entry.delta !== void 0) ev.delta = entry.delta;
    if (entry.label !== void 0) ev.label = entry.label;
    if (entry.bestLine !== void 0) ev.moves = entry.bestLine;
    evalCache.set(entry.path, ev);
  }
  if (stored.status === "complete") {
    analyzedGameIds.add(gameId);
    setAnalysisComplete(true);
    setBatchState("complete");
    const game = importedGames.find((g) => g.id === gameId);
    const userColor = game ? getUserColor(game) : null;
    if (detectMissedTactics(userColor)) missedTacticGameIds.add(gameId);
    const restoredSummary = computeAnalysisSummary(ctrl.mainline, evalCache);
    if (restoredSummary) {
      analyzedGameAccuracy.set(gameId, { white: restoredSummary.white.accuracy, black: restoredSummary.black.accuracy });
    }
  }
  const restoredEval = evalCache.get(ctrl.path);
  if (restoredEval) setCurrentEval(restoredEval);
  syncArrow();
  ctrl.retro?.onMergeAnalysisData();
  redraw();
}
function navigate(path) {
  if (path === ctrl.path) return;
  ctrl.setPath(path);
  ctrl.retro?.onJump(path);
  syncBoard();
  evalCurrentPosition();
  scheduleNavStateSave(ctrl.path);
  redraw();
  scrollActiveIntoView();
}
function scrollActiveIntoView() {
  requestAnimationFrame(() => {
    document.querySelector(".move.active")?.scrollIntoView({ block: "nearest" });
  });
}
function next() {
  const child = ctrl.node.children[0];
  if (!child) return;
  navigate(ctrl.path + child.id);
}
function prev() {
  if (ctrl.path === "") return;
  navigate(pathInit(ctrl.path));
}
function deleteVariation(path) {
  deleteNodeAt(ctrl.root, path);
  if (ctrl.path.startsWith(path)) {
    navigate(pathInit(path));
  } else {
    scheduleNavStateSave(ctrl.path);
    redraw();
  }
}
function first() {
  navigate("");
}
function last() {
  navigate(ctrl.mainline.slice(1).reduce((acc, n) => acc + n.id, ""));
}
function toggleRetro() {
  if (ctrl.retro) {
    delete ctrl.retro;
    syncArrow();
    redraw();
    return;
  }
  const game = importedGames.find((g) => g.id === selectedGameId);
  const userColor = game ? getUserColor(game) : null;
  const openingProvider = buildMainlineOpeningProvider(
    ctrl.mainline,
    Boolean(game?.opening || game?.eco)
  );
  const candidates = buildRetroCandidates(
    ctrl.mainline,
    (p) => evalCache.get(p),
    selectedGameId,
    userColor ?? null,
    openingProvider
  );
  ctrl.retro = makeRetroCtrl(
    candidates,
    userColor ?? null,
    () => currentEval,
    (path) => evalCache.get(path),
    navigate
  );
  const first2 = ctrl.retro.current();
  if (first2) navigate(first2.parentPath);
  else redraw();
}
function clearRetroMode() {
  if (!ctrl.retro) return;
  delete ctrl.retro;
  syncArrow();
}
function routeContent(route) {
  const deps = {
    importedGames,
    selectedGameId,
    analyzedGameIds,
    missedTacticGameIds,
    analyzedGameAccuracy,
    savedPuzzles,
    gameResult,
    getUserColor,
    gameSourceUrl,
    renderCompactGameRow,
    selectGame(game) {
      selectedGameId = game.id;
      loadGame(game.pgn);
    },
    reviewGame(game) {
      selectedGameId = game.id;
      loadGame(game.pgn);
      window.location.hash = "#/analysis";
      startBatchWhenReady();
    },
    redraw
  };
  switch (route.name) {
    case "analysis-game": {
      const gameId = route.params["id"] ?? "";
      if (!gamesLibraryLoaded) {
        return h("p", "Loading\u2026");
      }
      if (!importedGames.find((g) => g.id === gameId)) {
        return h("div", [
          h("p", `Game "${gameId}" was not found in the imported library.`),
          h("a", { attrs: { href: "#/games" } }, "View all games")
        ]);
      }
    }
    // falls through
    case "analysis":
      const currentGame = importedGames.find((g) => g.id === selectedGameId);
      const currentUserColor = currentGame ? getUserColor(currentGame) : null;
      return h("div.analyse", [
        // Board — left column (grid-area: board)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__board.main-board
        (() => {
          const [topStrip, bottomStrip] = renderPlayerStrips();
          return h("div.analyse__board.main-board", [
            topStrip,
            h("div.analyse__board-inner", [renderBoard(), renderPromotionDialog()]),
            bottomStrip
          ]);
        })(),
        // Eval gauge — between board and tools (grid-area: gauge)
        // Mirrors lichess-org/lila: ui/analyse/css/_layout.scss .eval-gauge grid-area
        renderEvalBar(engineEnabled, currentEval, ctrl.node.fen),
        // Tools — right column (grid-area: tools)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__tools
        h("div.analyse__tools", [
          // Engine header: toggle + pearl + engine-name/status + settings gear
          // Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderCeval()
          renderCeval(),
          // Engine settings panel — hidden during active retrospection.
          // Settings are irrelevant while solving; retro is a focused board mode.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts mode-gate pattern.
          ctrl.retro ? null : renderEngineSettings(),
          // PV lines — hidden whenever retrospection is active and guidance has not
          // been manually revealed for the current candidate.
          // Covers all retro states so the answer is never accidentally visible.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts
          //   showCeval && !ctrl.retro?.isSolving() && cevalView.renderPvs(ctrl)
          !ctrl.retro || ctrl.retro.guidanceRevealed() ? renderPvBox() : null,
          // Move list with internal scroll — mirrors div.analyse__moves.areplay
          h("div.analyse__moves", [
            renderMoveList(ctrl.root, ctrl.path, (p) => evalCache.get(p), navigate, currentUserColor, reviewDotsUserOnly, deleteVariation, contextMenuPath, openContextMenu)
          ]),
          // Active retrospection panel — placed after the move list, before analysis summaries.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts
          //   retroView(ctrl) || explorerView(ctrl) || practiceView(ctrl)
          renderRetroStrip({
            retro: ctrl.retro,
            navigate,
            redraw,
            uciToSan,
            onRevealGuidance: () => {
              ctrl.retro?.revealGuidance();
              syncArrow();
              redraw();
            }
          }),
          // Analysis summary and puzzle finder — hidden during active retrospection.
          // These are analysis-complete result panels; they conflict with the focused
          // retro solve mode and match the Lichess pattern of retro replacing explorer/tool panels.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts
          //   retroView(ctrl) || explorerView(ctrl) || practiceView(ctrl) — retro is exclusive.
          // Use ternary (not &&) to produce null rather than false when retro is active.
          // Raw Snabbdom h() cannot handle boolean children — false in a children array
          // throws "Cannot create property 'elm' on boolean 'false'" and corrupts the VDOM.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts LooseVNode intent.
          ctrl.retro ? null : (() => {
            const game = importedGames.find((g) => g.id === selectedGameId);
            return renderAnalysisSummary(analysisComplete, evalCache, ctrl.mainline, game?.white ?? "White", game?.black ?? "Black");
          })(),
          ctrl.retro ? null : (() => {
            const puzzleDeps = {
              mainline: ctrl.mainline,
              getEval: (p) => evalCache.get(p),
              gameId: selectedGameId,
              currentPath: ctrl.path,
              engineEnabled,
              batchAnalyzing,
              batchState,
              savedPuzzles,
              navigate,
              savePuzzle,
              puzzleHref: (c) => puzzleHrefForCandidate(c.gameId, c.path),
              uciToSan,
              redraw
            };
            return renderPuzzleCandidates(puzzleDeps);
          })()
        ]),
        // Controls — below tools (grid-area: controls)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls
        // Controls — navigation only; engine toggle + settings moved to renderCeval() header
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls (jump buttons)
        h("div.analyse__controls", [
          h("button", { on: { click: prev }, attrs: { disabled: ctrl.path === "" } }, "\u2190 Prev"),
          h("button", { on: { click: flip } }, "Flip"),
          h("button", { on: { click: next }, attrs: { disabled: !ctrl.node.children[0] } }, "Next \u2192"),
          renderAnalysisControls([
            // Mistake-review entry: available after review completes.
            // Jumps to the position before the first candidate mistake.
            // Mirrors lichess-org/lila: ui/analyse/src/retrospect/retroView.ts entry affordance.
            renderRetroEntry({
              retro: ctrl.retro,
              analysisComplete,
              batchAnalyzing,
              onToggle: toggleRetro
            })
          ])
        ]),
        // Underboard — below board (grid-area: under)
        // Import controls moved to header panel; game list appears here and in the header.
        h("div.analyse__underboard", [
          renderEvalGraph(ctrl.mainline, ctrl.path, evalCache, navigate, redraw, currentUserColor, reviewDotsUserOnly),
          renderGameList(deps)
        ]),
        renderKeyboardHelp()
      ]);
    case "games":
      return renderGamesView(deps);
    case "puzzles":
    case "puzzle-round":
      return renderPuzzlesRoute(route);
    case "openings":
      return h("h1", "Openings Page");
    case "stats":
      return h("h1", "Stats Page");
    default:
      return h("h1", "Home");
  }
}
async function resetAllData() {
  if (!confirm("Clear all local Patzer Pro data? This removes imported games, saved analysis, puzzles, and local board/settings preferences from this browser.")) return;
  await clearAllIdbData();
  clearBoardLocalData();
  window.location.reload();
}
function view(route) {
  return h("div#shell", [
    renderHeader({
      route,
      importedGames,
      selectedGameId,
      analyzedGameIds,
      missedTacticGameIds,
      importCallbacks,
      onSelectGame: (id, pgn) => {
        selectedGameId = id;
        loadGame(pgn);
      },
      renderGameRow: renderCompactGameRow,
      gameSourceUrl,
      downloadPgn,
      resetAllData,
      redraw
    }),
    h("main", [routeContent(route)]),
    renderContextMenu(),
    h("footer.app-legal", [
      h("span", "Patzer Pro source is available under AGPL-3.0-or-later."),
      h("span", "No warranty."),
      h("a", {
        attrs: {
          href: PUBLIC_SOURCE_URL,
          target: "_blank",
          rel: "noopener noreferrer"
        }
      }, "Source Code"),
      h("span.app-legal__sep", "\u2022"),
      h("a", {
        attrs: {
          href: PUBLIC_LICENSE_URL,
          target: "_blank",
          rel: "noopener noreferrer"
        }
      }, "License")
    ]),
    renderPvBoard()
  ]);
}
var wheelPixelAccum = 0;
document.addEventListener("wheel", (e) => {
  if (!boardWheelNavEnabled) return;
  if (e.ctrlKey) return;
  const boardWrap = document.querySelector(".analyse__board.main-board");
  if (!boardWrap?.contains(e.target)) return;
  e.preventDefault();
  if (e.deltaMode === 0) {
    wheelPixelAccum += e.deltaY;
    if (Math.abs(wheelPixelAccum) < 10) return;
  }
  wheelPixelAccum = 0;
  if (e.deltaY > 0) next();
  else prev();
  redraw();
}, { passive: false });
var app = document.getElementById("app");
var currentRoute = current();
var vnode2 = app;
function redraw() {
  vnode2 = patch(vnode2, view(currentRoute));
}
function clearGameAnalysis(gameId) {
  void clearAnalysisFromIdb(gameId);
  analyzedGameIds.delete(gameId);
  missedTacticGameIds.delete(gameId);
}
initGround({
  getCtrl: () => ctrl,
  navigate,
  getImportedGames: () => importedGames,
  getSelectedGameId: () => selectedGameId,
  redraw
});
initPuzzles({
  getImportedGames: () => importedGames,
  getRoute: () => currentRoute,
  getCtrlPath: () => ctrl.path,
  loadGameById,
  navigate,
  clearRetro: clearRetroMode,
  redraw,
  openStandalonePuzzle,
  restoreStandalonePuzzleBackground,
  hasStandalonePuzzleBackground
});
initCevalView({
  getCtrl: () => ctrl,
  navigate,
  redraw
});
initPgnExport({
  getCtrl: () => ctrl,
  getImportedGames: () => importedGames,
  getSelectedGameId: () => selectedGameId,
  clearGameAnalysis,
  redraw
});
initEngine({
  getCtrl: () => ctrl,
  getCgInstance: () => cgInstance,
  redraw
});
initBatch({
  getCtrl: () => ctrl,
  getSelectedGameId: () => selectedGameId,
  getImportedGames: () => importedGames,
  analyzedGameIds,
  missedTacticGameIds,
  analyzedGameAccuracy,
  getUserColor,
  redraw
});
bindKeyboardHandlers({
  getCtrl: () => ctrl,
  navigate,
  next,
  prev,
  first,
  last,
  flip,
  completeMove,
  redraw
});
onChange2((route) => {
  currentRoute = route;
  if (route.name === "analysis-game" && hasStandalonePuzzleBackground()) {
    restoreStandalonePuzzleBackground();
  }
  if (route.name === "analysis-game") {
    const id = route.params["id"] ?? "";
    const game = importedGames.find((g) => g.id === id);
    if (game && game.id !== selectedGameId) {
      selectedGameId = game.id;
      void syncPuzzleRoute(route);
      loadGame(game.pgn);
      return;
    }
  }
  void syncPuzzleRoute(route);
  vnode2 = patch(vnode2, view(currentRoute));
});
vnode2 = patch(app, view(currentRoute));
void loadPuzzlesFromIdb().then((puzzles) => {
  setSavedPuzzles(puzzles);
  redraw();
  void syncPuzzleRoute(currentRoute);
});
void loadGamesFromIdb().then((stored) => {
  gamesLibraryLoaded = true;
  if (!stored || stored.games.length === 0) {
    redraw();
    return;
  }
  importedGames = stored.games;
  const maxId = Math.max(...stored.games.map((g) => parseInt(g.id.replace("game-", "")) || 0));
  restoreGameIdCounter(maxId);
  const routeGameId = currentRoute.name === "analysis-game" ? currentRoute.params["id"] ?? null : null;
  const toLoad = (routeGameId !== null ? stored.games.find((g) => g.id === routeGameId) : void 0) ?? stored.games.find((g) => g.id === stored.selectedId) ?? stored.games[0];
  selectedGameId = toLoad.id;
  selectedGamePgn = toLoad.pgn;
  ctrl = new AnalyseCtrl(pgnToTree(toLoad.pgn));
  clearEvalCache();
  resetCurrentEval();
  if (stored.path) ctrl.setPath(stored.path);
  syncBoardAndArrow();
  redraw();
  void loadAndRestoreAnalysis(toLoad.id, restoreGeneration);
  void syncPuzzleRoute(currentRoute);
});
//# sourceMappingURL=main.js.map
