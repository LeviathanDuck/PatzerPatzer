var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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
var opposite = (c) => c === "white" ? "black" : "white";
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
  const color = piece.color, friendlies = new Map([...pieces].filter(([_, p]) => p.color === color)), enemies = new Map([...pieces].filter(([_, p]) => p.color === opposite(color))), orig = { key, pos: key2pos(key) }, mobility = (ctx) => mobilityByRole[piece.role](ctx) && state.premovable.additionalPremoveRequirements(ctx), partialCtx = {
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
  state.orientation = opposite(state.orientation);
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
  state.turnColor = opposite(state.turnColor);
  return true;
}
function baseUserMove(state, orig, dest) {
  const result = baseMove(state, orig, dest);
  if (result) {
    state.movable.dests = void 0;
    state.turnColor = opposite(state.turnColor);
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
  const defs = createElement("defs");
  const filter = setAttributes(createElement("filter"), { id: "cg-filter-blur" });
  filter.appendChild(setAttributes(createElement("feGaussianBlur"), { stdDeviation: "0.013" }));
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
    const el = setAttributes(createElement("g"), { cgHash: hash2 });
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
    const el = setAttributes(createElement("g"), { transform: `translate(${x},${y})`, cgHash: hash2 });
    el.innerHTML = `<svg width="1" height="1" viewBox="0 0 100 100">${shape.customSvg.html}</svg>`;
    svgs.push({ el, isCustom: true });
  }
  return svgs;
}
function renderCircle(brush, at, current2, bounds, pendingErase) {
  const widths = circleWidth(), radius = (bounds.width + bounds.height) / (4 * Math.max(bounds.width, bounds.height));
  return setAttributes(createElement("circle"), {
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
    return setAttributes(createElement("line"), {
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
  const g = setAttributes(createElement("g"), { opacity: brush.opacity });
  const blurred = setAttributes(createElement("g"), { filter: "url(#cg-filter-blur)" });
  blurred.appendChild(filterBox(from, to));
  blurred.appendChild(renderLine(true));
  g.appendChild(blurred);
  g.appendChild(renderLine(false));
  return g;
}
function renderMarker(brush) {
  const marker = setAttributes(createElement("marker"), {
    id: "arrowhead-" + brush.key,
    orient: "auto",
    overflow: "visible",
    markerWidth: 4,
    markerHeight: 4,
    refX: brush.key.startsWith("hilite") ? 1.86 : 2.05,
    refY: 2
  });
  marker.appendChild(setAttributes(createElement("path"), {
    d: "M0,0 V4 L3,2 Z",
    fill: brush.color
  }));
  marker.setAttribute("cgKey", brush.key);
  return marker;
}
function renderLabel(label, hash2, from, to, slots, corner) {
  const labelSize = 0.4, fontSize = labelSize * 0.75 ** label.text.length, at = labelCoords(from, to, slots), cornerOff = corner === "tr" ? 0.4 : 0, g = setAttributes(createElement("g"), {
    transform: `translate(${at[0] + cornerOff},${at[1] - cornerOff})`,
    cgHash: hash2
  });
  g.appendChild(setAttributes(createElement("circle"), {
    r: labelSize / 2,
    "fill-opacity": corner ? 1 : 0.8,
    "stroke-opacity": corner ? 1 : 0.7,
    "stroke-width": 0.03,
    fill: label.fill ?? "#666",
    stroke: "white"
  }));
  const labelEl = setAttributes(createElement("text"), {
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
var createElement = (tagName2) => document.createElementNS("http://www.w3.org/2000/svg", tagName2);
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
  return setAttributes(createElement("rect"), {
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
      container.appendChild(renderCoords(files, "files" + orientClass, opposite(s.orientation)));
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
  const svg = setAttributes(createElement("svg"), {
    class: cls,
    viewBox: isShapes ? "-4 -4 8 8" : "-3.5 -3.5 8 8",
    preserveAspectRatio: "xMidYMid slice"
  });
  if (isShapes)
    svg.appendChild(createDefs());
  svg.appendChild(createElement("g"));
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

// node_modules/.pnpm/snabbdom@3.6.3/node_modules/snabbdom/build/htmldomapi.js
function createElement2(tagName2, options) {
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
  createElement: createElement2,
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
function childById(node, id) {
  return node.children.find((c) => c.id === id);
}
function nodeAtPath(root, path) {
  if (path === "") return root;
  const child = childById(root, pathHead(path));
  return child ? nodeAtPath(child, pathTail(path)) : void 0;
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
function mainlineNodeList(root) {
  const nodes = [];
  let node = root;
  while (node) {
    nodes.push(node);
    node = node.children[0];
  }
  return nodes;
}

// src/analyse/ctrl.ts
var AnalyseCtrl = class {
  constructor(root) {
    __publicField(this, "root");
    // Current tree cursor — updated together as a unit (mirrors Lichess setPath)
    __publicField(this, "path");
    __publicField(this, "node");
    __publicField(this, "nodeList");
    __publicField(this, "mainline");
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

// src/ceval/protocol.ts
var StockfishProtocol = class {
  constructor() {
    __publicField(this, "worker");
    __publicField(this, "onLine");
    /** Human-readable engine name received from the "id name" response. */
    __publicField(this, "engineName");
  }
  /**
   * Spin up the worker and begin the UCI handshake.
   * workerUrl points to the Stockfish JS file served as a static asset.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/engines/simpleEngine.ts (start)
   */
  init(workerUrl) {
    this.worker = new Worker(workerUrl);
    this.worker.addEventListener("message", (e) => this.received(e.data));
    this.worker.addEventListener("error", (e) => {
      console.error("[ceval] worker error \u2014 url:", workerUrl, "| message:", e.message || "(none)", "| file:", e.filename || "(none)", "| line:", e.lineno);
    });
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
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts swapWork go command.
   */
  go(depth) {
    this.send(`go depth ${depth}`);
  }
  /** Interrupt a running search. */
  stop() {
    this.send("stop");
  }
  /** Shut down the engine and terminate the worker. */
  destroy() {
    this.send("quit");
    this.worker?.terminate();
    this.worker = void 0;
  }
  send(cmd) {
    this.worker?.postMessage(cmd);
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
      this.send("ucinewgame");
      this.send("isready");
    }
    this.onLine?.(line);
  }
};

// src/router.ts
var routes = [
  { pattern: ["analysis", ":id"], name: "analysis-game" },
  { pattern: ["analysis"], name: "analysis" },
  { pattern: ["puzzles"], name: "puzzles" },
  { pattern: ["openings"], name: "openings" },
  { pattern: ["stats"], name: "stats" },
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

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/types.js
var FILE_NAMES = ["a", "b", "c", "d", "e", "f", "g", "h"];
var RANK_NAMES = ["1", "2", "3", "4", "5", "6", "7", "8"];
var COLORS = ["white", "black"];
var ROLES = ["pawn", "knight", "bishop", "rook", "queen", "king"];
var CASTLING_SIDES = ["a", "h"];
var isDrop = (v) => "role" in v;

// node_modules/.pnpm/chessops@0.15.0/node_modules/chessops/dist/esm/util.js
var defined = (v) => v !== void 0;
var opposite2 = (color) => color === "white" ? "black" : "white";
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
var makeUci = (move3) => isDrop(move3) ? `${roleToChar(move3.role).toUpperCase()}@${makeSquare(move3.to)}` : makeSquare(move3.from) + makeSquare(move3.to) + (move3.promotion ? roleToChar(move3.promotion) : "");
var kingCastlesTo = (color, side) => color === "white" ? side === "a" ? 2 : 6 : side === "a" ? 58 : 62;
var rookCastlesTo = (color, side) => color === "white" ? side === "a" ? 3 : 5 : side === "a" ? 59 : 61;

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
var attacksTo = (square, attacker, board, occupied) => board[attacker].intersect(rookAttacks(square, occupied).intersect(board.rooksAndQueens()).union(bishopAttacks(square, occupied).intersect(board.bishopsAndQueens())).union(knightAttacks(square).intersect(board.knight)).union(kingAttacks(square).intersect(board.king)).union(pawnAttacks(opposite2(attacker), square).intersect(board.pawn)));
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
      this.pockets[opposite2(captured.color)][captured.promoted ? "pawn" : captured.role]++;
  }
  ctx() {
    const variantEnd = this.isVariantEnd();
    const king2 = this.board.kingOf(this.turn);
    if (!defined(king2)) {
      return { king: king2, blockers: SquareSet.empty(), checkers: SquareSet.empty(), variantEnd, mustCapture: false };
    }
    const snipers = rookAttacks(king2, SquareSet.empty()).intersect(this.board.rooksAndQueens()).union(bishopAttacks(king2, SquareSet.empty()).intersect(this.board.bishopsAndQueens())).intersect(this.board[opposite2(this.turn)]);
    let blockers = SquareSet.empty();
    for (const sniper of snipers) {
      const b = between(king2, sniper).intersect(this.board.occupied);
      if (!b.moreThanOne())
        blockers = blockers.union(b);
    }
    const checkers = this.kingAttackers(king2, opposite2(this.turn), this.board.occupied);
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
    const otherKing = this.board.kingOf(opposite2(this.turn));
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
      pseudo = pawnAttacks(this.turn, square).intersect(this.board[opposite2(this.turn)]);
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
          if (this.kingAttackers(to, opposite2(this.turn), occ).nonEmpty())
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
      return this.board[color].size() <= 2 && this.board[opposite2(color)].diff(this.board.king).diff(this.board.queen).isEmpty();
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
    return defined(king2) && this.kingAttackers(king2, opposite2(this.turn), this.board.occupied).nonEmpty();
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
      return { winner: opposite2(this.turn) };
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
    this.turn = opposite2(turn);
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
  if (!pos.board.pawn.has(pawn2) || !pos.board[opposite2(pos.turn)].has(pawn2))
    return;
  return square;
};
var legalEpSquare = (pos) => {
  if (!defined(pos.epSquare))
    return;
  const ctx = pos.ctx();
  const ourPawns = pos.board.pieces(pos.turn, "pawn");
  const candidates = ourPawns.intersect(pawnAttacks(opposite2(pos.turn), pos.epSquare));
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
  return pos.kingAttackers(ctx.king, opposite2(pos.turn), pos.board.occupied.toggle(pawnFrom).toggle(captured).with(pos.epSquare)).without(captured).isEmpty();
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
    if (pos.kingAttackers(sq, opposite2(pos.turn), occ).nonEmpty())
      return SquareSet.empty();
  }
  const rookTo = rookCastlesTo(pos.turn, side);
  const after = pos.board.occupied.toggle(ctx.king).toggle(rook2).toggle(rookTo);
  if (pos.kingAttackers(kingTo, opposite2(pos.turn), after).nonEmpty())
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
    let captureTargets = pos.board[opposite2(pos.turn)];
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
var scalachessCharPair = (move3) => isDrop(move3) ? String.fromCharCode(35 + move3.to, 35 + 64 + 8 * 5 + ["queen", "rook", "bishop", "knight", "pawn"].indexOf(move3.role)) : String.fromCharCode(35 + move3.from, move3.promotion ? 35 + 64 + 8 * ["queen", "rook", "bishop", "knight", "king"].indexOf(move3.promotion) + squareFile(move3.to) : 35 + move3.to);

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
  candidates = candidates.intersect(pawnAdvance.union(attacks({ color: opposite2(pos.turn), role }, to, pos.board.occupied)));
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
    const otherKing = this.board.kingOf(opposite2(this.turn));
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
    if (this.board.pieces(opposite2(color), "king").isEmpty())
      return false;
    if (this.board[color].diff(this.board.king).isEmpty())
      return true;
    if (this.board[opposite2(color)].diff(this.board.king).nonEmpty()) {
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
        return { winner: opposite2(color) };
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
    if (defined(this.epSquare) && pawnAttacks(opposite2(this.turn), this.epSquare).intersects(this.board.pieces(this.turn, "pawn"))) {
      ctx.mustCapture = true;
      return ctx;
    }
    const enemy = this.board[opposite2(this.turn)];
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
    const enemy = this.board[opposite2(this.turn)];
    return dests.intersect(ctx.mustCapture ? defined(this.epSquare) && this.board.getRole(square) === "pawn" ? enemy.with(this.epSquare) : enemy : SquareSet.full());
  }
  hasInsufficientMaterial(color) {
    if (this.board[color].isEmpty())
      return false;
    if (this.board[opposite2(color)].isEmpty())
      return true;
    if (this.board.occupied.equals(this.board.bishop)) {
      const weSomeOnLight = this.board[color].intersects(SquareSet.lightSquares());
      const weSomeOnDark = this.board[color].intersects(SquareSet.darkSquares());
      const theyAllOnDark = this.board[opposite2(color)].isDisjoint(SquareSet.lightSquares());
      const theyAllOnLight = this.board[opposite2(color)].isDisjoint(SquareSet.darkSquares());
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
    const otherKing = this.board.kingOf(opposite2(this.turn));
    if (defined(otherKing) && this.kingAttackers(otherKing, this.turn, this.board.occupied).nonEmpty()) {
      return Result.err(new PositionError(IllegalSetup.OppositeCheck));
    }
    for (const color of COLORS) {
      const backranks = this.board.pieces(color, "king").isEmpty() ? SquareSet.backrank(opposite2(color)) : SquareSet.backranks();
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
    const pieces = MaterialSide.fromBoard(this.board, opposite2(color));
    const piecesBishops = (squareColor) => coloredSquares(squareColor).intersect(this.board.pieces(opposite2(color), "bishop")).size();
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
        (piecesNum >= 4 && (pieces.knight >= 2 || pieces.pawn >= 2 || pieces.rook >= 1 && pieces.knight >= 1 || pieces.rook >= 1 && pieces.bishop >= 1 || pieces.knight >= 1 && pieces.bishop >= 1 || pieces.rook >= 1 && pieces.pawn >= 1 || pieces.knight >= 1 && pieces.pawn >= 1 || pieces.bishop >= 1 && pieces.pawn >= 1 || hasBishopPair(opposite2(color)) && pieces.pawn >= 1) && (piecesBishops("dark") < 2 || piecesOfRoleNot(piecesBishops("dark")) >= 3) && (piecesBishops("light") < 2 || piecesOfRoleNot(piecesBishops("light")) >= 3));
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

// src/tree/pgn.ts
function buildNode(pgnNode, pos, ply) {
  const move3 = parseSan(pos, pgnNode.data.san);
  if (!move3) return void 0;
  const san = makeSanAndPlay(pos, move3);
  const children = pgnNode.children.map((child) => buildNode(child, pos.clone(), ply + 1)).filter((n) => n !== void 0);
  return {
    id: scalachessCharPair(move3),
    // 2-char id, same scheme as Lichess
    ply,
    san,
    uci: makeUci(move3),
    fen: makeFen(pos.toSetup()),
    // FEN after the move
    children
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

// src/main.ts
console.log("Patzer Pro");
var patch = init([classModule, attributesModule, eventListenersModule]);
var SAMPLE_PGN = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7";
var importedGames = [];
var selectedGameId = null;
var selectedGamePgn = null;
function getActivePgn() {
  return selectedGamePgn ?? SAMPLE_PGN;
}
var ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));
function loadGame(pgn) {
  selectedGamePgn = pgn;
  ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));
  evalCache.clear();
  currentEval = {};
  syncBoard();
  syncArrow();
  evalCurrentPosition();
  redraw();
}
var _idb;
function openGameDb() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("patzer-pro", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("game-library");
    req.onsuccess = () => {
      _idb = req.result;
      resolve(_idb);
    };
    req.onerror = () => reject(req.error);
  });
}
async function saveGamesToIdb() {
  try {
    const db = await openGameDb();
    const tx = db.transaction("game-library", "readwrite");
    tx.objectStore("game-library").put(
      { games: importedGames, selectedId: selectedGameId, path: ctrl.path },
      "imported-games"
    );
  } catch (e) {
    console.warn("[idb] save failed", e);
  }
}
async function loadGamesFromIdb() {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction("game-library", "readonly").objectStore("game-library").get("imported-games");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[idb] load failed", e);
    return void 0;
  }
}
var WIN_CHANCE_MULTIPLIER = -368208e-8;
function rawWinChances(cp) {
  return 2 / (1 + Math.exp(WIN_CHANCE_MULTIPLIER * cp)) - 1;
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
var engineEnabled = false;
var engineReady = false;
var engineInitialized = false;
var currentEval = {};
var evalCache = /* @__PURE__ */ new Map();
var evalNodeId = "";
var evalNodePly = 0;
var evalParentNodeId = "";
var protocol = new StockfishProtocol();
function parseEngineLine(line) {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === "info") {
    let isMate = false;
    let score;
    let best;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === "score") {
        isMate = parts[++i] === "mate";
        score = parseInt(parts[++i]);
        if (parts[i + 1] === "lowerbound" || parts[i + 1] === "upperbound") i++;
      } else if (parts[i] === "pv") {
        best = parts[i + 1];
        break;
      }
    }
    if (score !== void 0) {
      if (isMate) {
        currentEval.mate = score;
        currentEval.cp = void 0;
      } else {
        currentEval.cp = score;
        currentEval.mate = void 0;
      }
    }
    if (best) currentEval.best = best;
    if (score !== void 0 || best) {
      console.log("[eval]", { ...currentEval });
      syncArrow();
      redraw();
    }
  } else if (parts[0] === "bestmove" && parts[1] && parts[1] !== "(none)") {
    currentEval.best = parts[1];
    const stored = { ...currentEval };
    const parentEval = evalCache.get(evalParentNodeId);
    if (parentEval?.cp !== void 0 && stored.cp !== void 0) {
      stored.delta = stored.cp - parentEval.cp;
    }
    if (parentEval) {
      const nodeWc = evalWinChances(stored);
      const parentWc = evalWinChances(parentEval);
      if (nodeWc !== void 0 && parentWc !== void 0) {
        const whiteToMove = evalNodePly % 2 === 1;
        const moverNodeWc = whiteToMove ? nodeWc : -nodeWc;
        const moverParentWc = whiteToMove ? parentWc : -parentWc;
        stored.loss = (moverParentWc - moverNodeWc) / 2;
      }
    }
    evalCache.set(evalNodeId, stored);
    currentEval = stored;
    console.log("[eval cache]", evalNodeId, { cp: stored.cp, delta: stored.delta, loss: stored.loss?.toFixed(4) });
    syncArrow();
    redraw();
  }
}
protocol.onMessage((line) => {
  if (line.trim() === "readyok") {
    engineReady = true;
    evalCurrentPosition();
    redraw();
  } else {
    parseEngineLine(line);
  }
});
function evalCurrentPosition() {
  if (!engineEnabled || !engineReady) return;
  const cached = evalCache.get(ctrl.node.id);
  if (cached) {
    currentEval = { ...cached };
    syncArrow();
    redraw();
    return;
  }
  evalNodeId = ctrl.node.id;
  evalNodePly = ctrl.node.ply;
  evalParentNodeId = ctrl.nodeList[ctrl.nodeList.length - 2]?.id ?? "";
  currentEval = {};
  syncArrow();
  protocol.stop();
  protocol.setPosition(ctrl.node.fen);
  protocol.go(10);
}
function syncArrow() {
  if (!cgInstance) return;
  const shapes = [];
  if (engineEnabled && currentEval.best) {
    const uci = currentEval.best;
    shapes.push({
      orig: uci.slice(0, 2),
      dest: uci.slice(2, 4),
      brush: "paleBlue"
    });
  }
  cgInstance.set({ drawable: { autoShapes: shapes } });
}
function toggleEngine() {
  engineEnabled = !engineEnabled;
  if (engineEnabled) {
    if (!engineInitialized) {
      engineInitialized = true;
      protocol.init("stockfish/stockfish-nnue-16-single.js");
    } else if (engineReady) {
      evalCurrentPosition();
    }
  } else {
    protocol.stop();
    currentEval = {};
    syncArrow();
  }
  redraw();
}
function syncBoard() {
  if (!cgInstance) return;
  const node = ctrl.node;
  cgInstance.set({
    fen: node.fen,
    lastMove: uciToMove(node.uci),
    turnColor: node.ply % 2 === 0 ? "white" : "black"
  });
}
function next() {
  const child = ctrl.node.children[0];
  if (!child) return;
  ctrl.setPath(ctrl.path + child.id);
  syncBoard();
  evalCurrentPosition();
  void saveGamesToIdb();
  redraw();
}
function prev() {
  if (ctrl.path === "") return;
  ctrl.setPath(pathInit(ctrl.path));
  syncBoard();
  evalCurrentPosition();
  void saveGamesToIdb();
  redraw();
}
function activeSection(route) {
  switch (route.name) {
    case "analysis":
    case "analysis-game":
      return "analysis";
    case "puzzles":
      return "puzzles";
    case "openings":
      return "openings";
    case "stats":
      return "stats";
    default:
      return "";
  }
}
var navLinks = [
  { label: "Analysis", href: "#/analysis", section: "analysis" },
  { label: "Puzzles", href: "#/puzzles", section: "puzzles" },
  { label: "Openings", href: "#/openings", section: "openings" },
  { label: "Stats", href: "#/stats", section: "stats" }
];
function renderNav(route) {
  const active = activeSection(route);
  return h("nav", navLinks.map(
    ({ label, href, section }) => h("a", { attrs: { href }, class: { active: active === section } }, label)
  ));
}
var cgInstance;
var orientation = "white";
function flip() {
  orientation = orientation === "white" ? "black" : "white";
  cgInstance?.set({ orientation });
  redraw();
}
function renderBoard() {
  return h("div.cg-wrap", {
    key: "board",
    hook: {
      insert: (vnode3) => {
        cgInstance = Chessground(vnode3.elm, {
          orientation,
          viewOnly: false,
          drawable: { enabled: true },
          fen: ctrl.node.fen,
          lastMove: uciToMove(ctrl.node.uci),
          turnColor: ctrl.node.ply % 2 === 0 ? "white" : "black"
        });
      },
      destroy: () => {
        cgInstance?.destroy();
        cgInstance = void 0;
      }
    }
  });
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
function renderMoveList() {
  const moves = [];
  let path = "";
  for (let i = 1; i < ctrl.mainline.length; i++) {
    const node = ctrl.mainline[i];
    path += node.id;
    const nodePath = path;
    const isWhite = node.ply % 2 === 1;
    if (isWhite) {
      moves.push(h("span.move-num", `${Math.ceil(node.ply / 2)}.`));
    }
    const cached = evalCache.get(node.id);
    const label = cached?.loss !== void 0 ? classifyLoss(cached.loss) : null;
    moves.push(h("span.move", {
      class: { active: nodePath === ctrl.path },
      on: { click: () => {
        ctrl.setPath(nodePath);
        syncBoard();
        evalCurrentPosition();
        void saveGamesToIdb();
        redraw();
      } }
    }, label ? `${node.san} ${label}` : node.san ?? ""));
  }
  return h("div.move-list", moves);
}
function evalPct() {
  if (!engineEnabled) return 50;
  if (currentEval.mate !== void 0) return currentEval.mate > 0 ? 100 : 0;
  if (currentEval.cp !== void 0) {
    const pct = 50 + currentEval.cp / 20;
    return Math.max(0, Math.min(100, pct));
  }
  return 50;
}
function renderEvalBar() {
  const pct = evalPct();
  return h("div.eval-bar", [
    h("div.eval-bar__fill", { attrs: { style: `height: ${pct}%` } })
  ]);
}
function renderEval() {
  if (!engineEnabled) return h("div.eval-display");
  const score = currentEval.mate !== void 0 ? `Mate in ${Math.abs(currentEval.mate)}` : currentEval.cp !== void 0 ? `Eval: ${currentEval.cp >= 0 ? "+" : ""}${(currentEval.cp / 100).toFixed(2)}` : "Evaluating\u2026";
  const best = currentEval.best ? ` | Best: ${currentEval.best}` : "";
  return h("div.eval-display", score + best);
}
var chesscomUsername = "";
var chesscomLoading = false;
var chesscomError = null;
var CHESSCOM_BASE = "https://api.chess.com/pub/player";
function normalizeChesscomResult(whiteResult, blackResult) {
  if (whiteResult === "win") return "1-0";
  if (blackResult === "win") return "0-1";
  return "1/2-1/2";
}
async function fetchChesscomGames(username) {
  const archivesRes = await fetch(`${CHESSCOM_BASE}/${username.toLowerCase()}/games/archives`);
  if (!archivesRes.ok) {
    throw new Error(archivesRes.status === 404 ? "Chess.com: user not found" : `Chess.com API error ${archivesRes.status}`);
  }
  const archivesData = await archivesRes.json();
  const archives = archivesData.archives ?? [];
  if (archives.length === 0) return [];
  const latestUrl = archives[archives.length - 1];
  const gamesRes = await fetch(latestUrl);
  if (!gamesRes.ok) throw new Error(`Chess.com API error ${gamesRes.status}`);
  const gamesData = await gamesRes.json();
  const rawGames = gamesData.games ?? [];
  const result = [];
  for (let i = rawGames.length - 1; i >= 0; i--) {
    const raw = rawGames[i];
    if (!raw.rated || raw.rules !== "chess" || raw.time_class === "daily") continue;
    const pgn = raw.pgn ?? "";
    if (!pgn) continue;
    try {
      pgnToTree(pgn);
    } catch {
      continue;
    }
    result.push({
      id: `game-${++gameIdCounter}`,
      pgn,
      white: raw.white?.username ?? void 0,
      black: raw.black?.username ?? void 0,
      result: normalizeChesscomResult(raw.white?.result ?? "", raw.black?.result ?? ""),
      date: parsePgnHeader(pgn, "Date")?.replace(/\./g, "-")
    });
  }
  return result;
}
async function importChesscom() {
  const name = chesscomUsername.trim();
  if (!name || chesscomLoading) return;
  chesscomLoading = true;
  chesscomError = null;
  redraw();
  try {
    const games = await fetchChesscomGames(name);
    if (games.length === 0) {
      chesscomError = "No recent rated games found.";
    } else {
      importedGames = [...importedGames, ...games];
      selectedGameId = games[0].id;
      void saveGamesToIdb();
      loadGame(games[0].pgn);
    }
  } catch (err) {
    chesscomError = err instanceof Error ? err.message : "Import failed.";
  } finally {
    chesscomLoading = false;
    redraw();
  }
}
function renderChesscomImport() {
  return h("div.pgn-import", [
    h("div.pgn-import__row", [
      h("input", {
        attrs: { placeholder: "Chess.com username", type: "text", disabled: chesscomLoading },
        on: { input: (e) => {
          chesscomUsername = e.target.value;
        } }
      }),
      h("button", {
        attrs: { disabled: chesscomLoading || !chesscomUsername.trim() },
        on: { click: () => {
          void importChesscom();
        } }
      }, chesscomLoading ? "Importing\u2026" : "Import Chess.com")
    ]),
    chesscomError ? h("span.pgn-import__error", chesscomError) : h("span")
  ]);
}
var lichessUsername = "";
var lichessLoading = false;
var lichessError = null;
async function fetchLichessGames(username) {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=30&rated=true`;
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
    result.push({
      id: `game-${++gameIdCounter}`,
      pgn,
      white: parsePgnHeader(pgn, "White"),
      black: parsePgnHeader(pgn, "Black"),
      result: parsePgnHeader(pgn, "Result"),
      date
    });
  }
  return result;
}
async function importLichess() {
  const name = lichessUsername.trim();
  if (!name || lichessLoading) return;
  lichessLoading = true;
  lichessError = null;
  redraw();
  try {
    const games = await fetchLichessGames(name);
    if (games.length === 0) {
      lichessError = "No recent rated games found.";
    } else {
      importedGames = [...importedGames, ...games];
      selectedGameId = games[0].id;
      void saveGamesToIdb();
      loadGame(games[0].pgn);
    }
  } catch (err) {
    lichessError = err instanceof Error ? err.message : "Import failed.";
  } finally {
    lichessLoading = false;
    redraw();
  }
}
function renderLichessImport() {
  return h("div.pgn-import", [
    h("div.pgn-import__row", [
      h("input", {
        attrs: { placeholder: "Lichess username", type: "text", disabled: lichessLoading },
        on: { input: (e) => {
          lichessUsername = e.target.value;
        } }
      }),
      h("button", {
        attrs: { disabled: lichessLoading || !lichessUsername.trim() },
        on: { click: () => {
          void importLichess();
        } }
      }, lichessLoading ? "Importing\u2026" : "Import Lichess")
    ]),
    lichessError ? h("span.pgn-import__error", lichessError) : h("span")
  ]);
}
var pgnInput = "";
var pgnError = null;
var pgnKey = 0;
var gameIdCounter = 0;
function parsePgnHeader(pgn, tag) {
  return pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))?.[1];
}
function importPgn() {
  const raw = pgnInput.trim();
  if (!raw) return;
  try {
    pgnToTree(raw);
    const game = {
      id: `game-${++gameIdCounter}`,
      pgn: raw,
      white: parsePgnHeader(raw, "White"),
      black: parsePgnHeader(raw, "Black"),
      result: parsePgnHeader(raw, "Result"),
      date: parsePgnHeader(raw, "Date")?.replace(/\./g, "-")
    };
    importedGames = [...importedGames, game];
    selectedGameId = game.id;
    pgnError = null;
    pgnInput = "";
    pgnKey++;
    void saveGamesToIdb();
    loadGame(game.pgn);
  } catch (_) {
    pgnError = "Invalid PGN \u2014 could not parse.";
    redraw();
  }
}
function renderPgnImport() {
  return h("div.pgn-import", [
    h("textarea.pgn-import__input", {
      key: pgnKey,
      attrs: { placeholder: "Paste PGN here\u2026", rows: 4 },
      on: { input: (e) => {
        pgnInput = e.target.value;
      } }
    }),
    h("div.pgn-import__row", [
      h("button", { on: { click: importPgn } }, "Import PGN"),
      pgnError ? h("span.pgn-import__error", pgnError) : h("span")
    ])
  ]);
}
function renderGameList() {
  if (importedGames.length === 0) return h("div");
  return h("div.game-list", [
    h("div.game-list__header", `${importedGames.length} imported game${importedGames.length === 1 ? "" : "s"}`),
    h("ul", importedGames.map((game) => {
      const label = game.white && game.black ? `${game.white} vs ${game.black}${game.result ? " \xB7 " + game.result : ""}${game.date ? " \xB7 " + game.date.slice(0, 10) : ""}` : game.id;
      return h("li", h("button.game-list__row", {
        class: { active: game.id === selectedGameId },
        on: { click: () => {
          selectedGameId = game.id;
          loadGame(game.pgn);
        } }
      }, label));
    }))
  ]);
}
function routeContent(route) {
  switch (route.name) {
    case "analysis-game":
      return h("h1", `Analysis Game: ${route.params["id"]}`);
    case "analysis":
      return h("div.analyse", [
        h("h1", "Analysis Page"),
        renderEval(),
        h("div.controls", [
          h("button", { on: { click: prev }, attrs: { disabled: ctrl.path === "" } }, "\u2190 Prev"),
          h("button", { on: { click: flip } }, "Flip Board"),
          h("button", { on: { click: next }, attrs: { disabled: !ctrl.node.children[0] } }, "Next \u2192"),
          h(
            "button",
            { on: { click: toggleEngine }, class: { active: engineEnabled } },
            engineEnabled ? engineReady ? "Engine: On" : "Engine: Loading\u2026" : "Engine: Off"
          )
        ]),
        h("div.analyse__board-wrap", [renderEvalBar(), h("div.analyse__board", [renderBoard()])]),
        renderMoveList(),
        renderChesscomImport(),
        renderLichessImport(),
        renderPgnImport(),
        renderGameList()
      ]);
    case "puzzles":
      return h("h1", "Puzzles Page");
    case "openings":
      return h("h1", "Openings Page");
    case "stats":
      return h("h1", "Stats Page");
    default:
      return h("h1", "Home");
  }
}
function view(route) {
  return h("div#shell", [
    h("header", [h("span", "Patzer Pro"), renderNav(route)]),
    h("main", [routeContent(route)])
  ]);
}
document.addEventListener("keydown", (e) => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") prev();
});
var app = document.getElementById("app");
var currentRoute = current();
var vnode2 = patch(app, view(currentRoute));
function redraw() {
  vnode2 = patch(vnode2, view(currentRoute));
}
onChange2((route) => {
  currentRoute = route;
  vnode2 = patch(vnode2, view(currentRoute));
});
void loadGamesFromIdb().then((stored) => {
  if (!stored || stored.games.length === 0) return;
  importedGames = stored.games;
  const toLoad = stored.games.find((g) => g.id === stored.selectedId) ?? stored.games[0];
  selectedGameId = toLoad.id;
  selectedGamePgn = toLoad.pgn;
  ctrl = new AnalyseCtrl(pgnToTree(toLoad.pgn));
  evalCache.clear();
  currentEval = {};
  if (stored.path) ctrl.setPath(stored.path);
  syncBoard();
  syncArrow();
  redraw();
});
//# sourceMappingURL=main.js.map
