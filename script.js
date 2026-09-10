"use strict";

/* =====================================================
   CONSTANTES
===================================================== */

const FILES = "abcdefghijklmn"; // até 14 colunas, usado no Modo Especial

const SYMBOLS = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" }
};

// Peças do Modo Especial não têm glifo de xadrez tradicional — usamos emoji
// dentro de um "chip" colorido com anel temático (ver CSS .special-piece).
const SPECIAL_SYMBOLS = { wizard: "🧙", archer: "🏹", dragon: "🐉" };

const PIECE_LETTERS = {
  king: "K", queen: "Q", rook: "R", bishop: "B", knight: "N", pawn: "",
  wizard: "M", archer: "A", dragon: "D"
};
const PIECE_NAMES_PT = {
  king: "Rei", queen: "Rainha", rook: "Torre", bishop: "Bispo", knight: "Cavalo", pawn: "Peão",
  wizard: "Mago", archer: "Arqueiro", dragon: "Dragão"
};
const PIECE_VALUES = {
  king: 0, queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1,
  wizard: 4, archer: 4, dragon: 7
};
const PROMOTION_CHOICES = ["queen", "rook", "bishop", "knight"];

// Ordem da primeira fileira no Modo Especial: as peças novas ficam nas
// bordas, "por fora" das torres — então a distância entre rei e cada
// torre é idêntica à do xadrez clássico, e o roque funciona sem mudanças.
const SPECIAL_BACK_RANK = [
  "dragon", "wizard", "archer", "rook", "knight", "bishop", "queen",
  "king", "bishop", "knight", "rook", "archer", "wizard", "dragon"
];
const CLASSIC_BACK_RANK = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

// Eventos de casa do Modo Especial: chave "linha,coluna" -> { type, pairKey? }
// portal: teleporta a peça que pousar nele até a casa-par (se ela estiver vazia)
// well: se um peão pousar nele, é promovido a Dama na hora (evento único)
// trap: qualquer peça que não seja rei é destruída ao pousar nele (evento único)
const EVENT_ICONS = { portal: "🌀", well: "💎", trap: "🔥" };
const EVENT_NAMES_PT = { portal: "Portal", well: "Poço de Energia", trap: "Armadilha" };

/* =====================================================
   ESTADO DO JOGO
===================================================== */

let board = [];
let currentPlayer = "white";
let selectedSquare = null;
let possibleMoves = [];
let gameOver = false;

let whiteTime = 600;
let blackTime = 600;
let timeControlSeconds = 600;

let enPassantTarget = null;   // {row, col} — casa que pode ser capturada en passant
let halfMoveClock = 0;        // conta lances sem captura/peão, para a regra dos 50 lances
let positionCounts = {};      // usado para detectar empate por repetição
let capturedPieces = [];      // {type, color} de cada peça capturada, em ordem
let sanHistory = [];          // notação (SAN) de cada lance
let undoStack = [];           // snapshots para desfazer
let lastMove = null;          // {from:{row,col}, to:{row,col}} — para destacar no tabuleiro
let pendingPromotion = null;  // guarda o lance aguardando escolha de peça

let specialMode = false;      // true quando o Modo Especial está ativo
let boardCols = 8;            // 8 no clássico, 14 no Modo Especial (mais peças, mesmo nº de fileiras)
let kingHomeCol = 4;          // coluna inicial do rei — usada pelo roque
let rookKingsideCol = 7;      // coluna inicial da torre do lado do rei
let rookQueensideCol = 0;     // coluna inicial da torre do lado da dama
let eventSquares = {};        // "linha,coluna" -> { type, pairKey? } — só usado no Modo Especial
let eventMessage = "";        // texto extra sobre o último evento disparado, mostrado no painel

/* =====================================================
   ELEMENTOS DO DOM
===================================================== */

const boardElement = document.getElementById("board");
const statusElement = document.getElementById("status");
const messageElement = document.getElementById("message");
const moveListElement = document.getElementById("moveList");
const whiteTimeElement = document.getElementById("whiteTime");
const blackTimeElement = document.getElementById("blackTime");
const whiteTimerBox = document.getElementById("whiteTimerBox");
const blackTimerBox = document.getElementById("blackTimerBox");
const timeControlSelect = document.getElementById("timeControl");
const gameModeSelect = document.getElementById("gameMode");
const specialLegendElement = document.getElementById("specialLegend");
const promotionOverlay = document.getElementById("promotionOverlay");
const promotionOptionsElement = document.getElementById("promotionOptions");
const capturedByWhiteElement = document.getElementById("capturedByWhite");
const capturedByBlackElement = document.getElementById("capturedByBlack");
const materialWhiteElement = document.getElementById("materialWhite");
const materialBlackElement = document.getElementById("materialBlack");

/* =====================================================
   TABULEIRO INICIAL
===================================================== */

function createInitialBoard(isSpecial) {
  const backRank = isSpecial ? SPECIAL_BACK_RANK : CLASSIC_BACK_RANK;
  const newBoard = Array.from({ length: 8 }, () => Array(boardCols).fill(null));

  for (let col = 0; col < boardCols; col++) {
    newBoard[0][col] = { type: backRank[col], color: "black", hasMoved: false };
    newBoard[1][col] = { type: "pawn", color: "black", hasMoved: false };
    newBoard[6][col] = { type: "pawn", color: "white", hasMoved: false };
    newBoard[7][col] = { type: backRank[col], color: "white", hasMoved: false };
  }

  return newBoard;
}

function createEventSquares() {
  // As casas ficam nas duas fileiras centrais (sempre vazias no início da
  // partida). As colunas são calculadas como frações da largura do
  // tabuleiro, então a disposição continua simétrica em qualquer tamanho.
  const c = n => Math.round(boardCols * n);

  return {
    [`3,${c(0.15)}`]: { type: "portal", pairKey: `4,${c(0.85)}` },
    [`4,${c(0.85)}`]: { type: "portal", pairKey: `3,${c(0.15)}` },
    [`3,${c(0.85)}`]: { type: "trap" },
    [`4,${c(0.15)}`]: { type: "trap" },
    [`3,${c(0.5)}`]: { type: "well" },
    [`4,${c(0.5)}`]: { type: "well" }
  };
}

/* =====================================================
   INICIAR / REINICIAR PARTIDA
===================================================== */

function restartGame() {
  specialMode = gameModeSelect.value === "special";
  boardCols = specialMode ? 14 : 8;

  if (specialMode) {
    kingHomeCol = SPECIAL_BACK_RANK.indexOf("king");
    rookKingsideCol = SPECIAL_BACK_RANK.lastIndexOf("rook");
    rookQueensideCol = SPECIAL_BACK_RANK.indexOf("rook");
  } else {
    kingHomeCol = CLASSIC_BACK_RANK.indexOf("king");
    rookKingsideCol = CLASSIC_BACK_RANK.lastIndexOf("rook");
    rookQueensideCol = CLASSIC_BACK_RANK.indexOf("rook");
  }

  board = createInitialBoard(specialMode);
  eventSquares = specialMode ? createEventSquares() : {};
  eventMessage = "";

  currentPlayer = "white";
  selectedSquare = null;
  possibleMoves = [];
  gameOver = false;

  enPassantTarget = null;
  halfMoveClock = 0;
  positionCounts = {};
  capturedPieces = [];
  sanHistory = [];
  undoStack = [];
  lastMove = null;
  pendingPromotion = null;

  specialLegendElement.classList.toggle("hidden", !specialMode);
  applyBoardDimensions();

  timeControlSeconds = timeControlSelect.value === "0" ? null : Number(timeControlSelect.value);
  whiteTime = timeControlSeconds;
  blackTime = timeControlSeconds;

  hidePromotionModal();
  registerPosition();
  messageElement.textContent = "Escolha uma peça.";

  renderMoveList();
  updateCapturedPanel();
  updateTimerDisplay();
  renderBoard();
}

/* =====================================================
   DESENHAR TABULEIRO
===================================================== */

function applyBoardDimensions() {
  boardElement.style.gridTemplateColumns = `repeat(${boardCols}, 1fr)`;
  boardElement.style.aspectRatio = `${boardCols} / 8`;
  boardElement.style.width = specialMode ? "min(92vw, 1120px)" : "min(75vw, 680px)";
  boardElement.style.height = "auto";
}

function renderBoard() {
  boardElement.innerHTML = "";

  const checkedKing = isKingInCheck(board, currentPlayer);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < boardCols; col++) {
      const square = document.createElement("div");
      square.classList.add("square", (row + col) % 2 === 0 ? "light" : "dark");
      square.setAttribute("role", "button");
      square.setAttribute("tabindex", "0");

      const piece = board[row][col];
      const name = squareName(row, col);
      const pieceLabel = piece ? `${piece.color === "white" ? "Branco" : "Preto"} ${PIECE_NAMES_PT[piece.type]}` : "vazia";
      square.setAttribute("aria-label", `Casa ${name}, ${pieceLabel}`);

      if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
        square.classList.add("selected");
      }

      if (lastMove && (
        (lastMove.from.row === row && lastMove.from.col === col) ||
        (lastMove.to.row === row && lastMove.to.col === col)
      )) {
        square.classList.add("last-move");
      }

      const isPossible = possibleMoves.some(move => move.row === row && move.col === col);
      if (isPossible) {
        square.classList.add(board[row][col] ? "capture" : "possible");
      }

      if (checkedKing && checkedKing.row === row && checkedKing.col === col) {
        square.classList.add("in-check");
      }

      const event = eventSquares[`${row},${col}`];

      if (piece) {
        const pieceElement = document.createElement("span");
        const isSpecialPiece = piece.type === "wizard" || piece.type === "archer" || piece.type === "dragon";

        if (isSpecialPiece) {
          pieceElement.classList.add("piece", "special-piece", piece.type, piece.color);
          pieceElement.textContent = SPECIAL_SYMBOLS[piece.type];
        } else {
          pieceElement.classList.add("piece", piece.color);
          pieceElement.textContent = SYMBOLS[piece.color][piece.type];
        }

        square.appendChild(pieceElement);
      } else if (event) {
        const eventElement = document.createElement("span");
        eventElement.classList.add("event-icon", `event-${event.type}`);
        eventElement.textContent = EVENT_ICONS[event.type];
        square.appendChild(eventElement);
        square.setAttribute("aria-label", `${square.getAttribute("aria-label")} — ${EVENT_NAMES_PT[event.type]}`);
      }

      square.addEventListener("click", () => handleSquareClick(row, col));
      square.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSquareClick(row, col);
        }
      });

      boardElement.appendChild(square);
    }
  }

  updateTurnIndicators();
}

/* =====================================================
   CLIQUE / SELEÇÃO
===================================================== */

function handleSquareClick(row, col) {
  if (gameOver || pendingPromotion) return;

  const piece = board[row][col];

  if (!selectedSquare) {
    if (!piece) return;

    if (piece.color !== currentPlayer) {
      messageElement.textContent = "Essa peça pertence ao adversário.";
      return;
    }

    selectPiece(row, col);
    return;
  }

  if (selectedSquare.row === row && selectedSquare.col === col) {
    clearSelection();
    messageElement.textContent = "Escolha uma peça.";
    renderBoard();
    return;
  }

  if (piece && piece.color === currentPlayer) {
    selectPiece(row, col);
    return;
  }

  const chosenMove = possibleMoves.find(move => move.row === row && move.col === col);

  if (!chosenMove) {
    messageElement.textContent = "Movimento inválido.";
    return;
  }

  makeMove(selectedSquare.row, selectedSquare.col, row, col, chosenMove.flag);
}

function selectPiece(row, col) {
  selectedSquare = { row, col };
  possibleMoves = getLegalMoves(board, row, col);

  if (possibleMoves.length === 0) {
    messageElement.textContent = "Essa peça não possui movimentos legais.";
    selectedSquare = null;
  } else {
    messageElement.textContent = "Escolha o destino.";
  }

  renderBoard();
}

function clearSelection() {
  selectedSquare = null;
  possibleMoves = [];
}

/* =====================================================
   GERAÇÃO DE MOVIMENTOS LEGAIS
===================================================== */

function getLegalMoves(positionBoard, row, col) {
  const piece = positionBoard[row][col];
  if (!piece) return [];

  const pseudoMoves = getPseudoMoves(positionBoard, row, col);
  const legalMoves = [];

  for (const move of pseudoMoves) {
    const testBoard = cloneBoard(positionBoard);

    if (move.flag === "archerShot") {
      // O arqueiro não se move: só remove a peça atingida à distância.
      testBoard[move.row][move.col] = null;
    } else {
      if (move.flag === "enpassant") {
        testBoard[row][move.col] = null;
      }
      testBoard[move.row][move.col] = testBoard[row][col];
      testBoard[row][col] = null;
    }

    if (!isKingInCheck(testBoard, piece.color)) {
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

function getPseudoMoves(positionBoard, row, col) {
  const piece = positionBoard[row][col];
  const moves = [];
  if (!piece) return moves;

  switch (piece.type) {
    case "pawn":
      addPawnMoves(positionBoard, row, col, piece, moves);
      break;
    case "rook":
      addSlidingMoves(positionBoard, row, col, piece, moves, ROOK_DIRECTIONS);
      break;
    case "bishop":
      addSlidingMoves(positionBoard, row, col, piece, moves, BISHOP_DIRECTIONS);
      break;
    case "queen":
      addSlidingMoves(positionBoard, row, col, piece, moves, QUEEN_DIRECTIONS);
      break;
    case "knight":
      addKnightMoves(positionBoard, row, col, piece, moves);
      break;
    case "king":
      addKingMoves(positionBoard, row, col, piece, moves);
      break;
    case "wizard":
      addWizardMoves(positionBoard, row, col, piece, moves);
      break;
    case "archer":
      addArcherMoves(positionBoard, row, col, piece, moves);
      break;
    case "dragon":
      addDragonMoves(positionBoard, row, col, piece, moves);
      break;
  }

  return moves;
}

const ROOK_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRECTIONS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const QUEEN_DIRECTIONS = [...ROOK_DIRECTIONS, ...BISHOP_DIRECTIONS];
const KNIGHT_JUMPS = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];

function addPawnMoves(positionBoard, row, col, piece, moves) {
  const direction = piece.color === "white" ? -1 : 1;
  const startRow = piece.color === "white" ? 6 : 1;
  const oneStepRow = row + direction;

  if (inside(oneStepRow, col) && !positionBoard[oneStepRow][col]) {
    moves.push({ row: oneStepRow, col });

    const twoStepRow = row + direction * 2;
    if (row === startRow && !positionBoard[twoStepRow][col]) {
      moves.push({ row: twoStepRow, col, flag: "double" });
    }
  }

  for (const dc of [-1, 1]) {
    const r = row + direction;
    const c = col + dc;
    if (!inside(r, c)) continue;

    const target = positionBoard[r][c];

    if (target && target.color !== piece.color) {
      moves.push({ row: r, col: c });
    } else if (
      !target &&
      enPassantTarget &&
      enPassantTarget.row === r &&
      enPassantTarget.col === c
    ) {
      moves.push({ row: r, col: c, flag: "enpassant" });
    }
  }
}

function addSlidingMoves(positionBoard, row, col, piece, moves, directions) {
  for (const [dr, dc] of directions) {
    let r = row + dr;
    let c = col + dc;

    while (inside(r, c)) {
      const target = positionBoard[r][c];

      if (!target) {
        moves.push({ row: r, col: c });
      } else {
        if (target.color !== piece.color) {
          moves.push({ row: r, col: c });
        }
        break;
      }

      r += dr;
      c += dc;
    }
  }
}

function addKnightMoves(positionBoard, row, col, piece, moves) {
  for (const [dr, dc] of KNIGHT_JUMPS) {
    const r = row + dr;
    const c = col + dc;
    if (!inside(r, c)) continue;

    const target = positionBoard[r][c];
    if (!target || target.color !== piece.color) {
      moves.push({ row: r, col: c });
    }
  }
}

function addKingMoves(positionBoard, row, col, piece, moves) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;

      const r = row + dr;
      const c = col + dc;
      if (!inside(r, c)) continue;

      const target = positionBoard[r][c];
      if (!target || target.color !== piece.color) {
        moves.push({ row: r, col: c });
      }
    }
  }

  addCastlingMoves(positionBoard, row, col, piece, moves);
}

function addCastlingMoves(positionBoard, row, col, piece, moves) {
  if (piece.hasMoved) return;

  const enemy = opponent(piece.color);
  if (isSquareAttackedBy(positionBoard, row, col, enemy)) return;

  const kingsideRook = positionBoard[row][rookKingsideCol];
  if (
    kingsideRook &&
    kingsideRook.type === "rook" &&
    kingsideRook.color === piece.color &&
    !kingsideRook.hasMoved &&
    isRangeEmpty(positionBoard, row, col + 1, rookKingsideCol - 1) &&
    !isSquareAttackedBy(positionBoard, row, col + 1, enemy) &&
    !isSquareAttackedBy(positionBoard, row, col + 2, enemy)
  ) {
    moves.push({ row, col: col + 2, flag: "castleK" });
  }

  const queensideRook = positionBoard[row][rookQueensideCol];
  if (
    queensideRook &&
    queensideRook.type === "rook" &&
    queensideRook.color === piece.color &&
    !queensideRook.hasMoved &&
    isRangeEmpty(positionBoard, row, rookQueensideCol + 1, col - 1) &&
    !isSquareAttackedBy(positionBoard, row, col - 1, enemy) &&
    !isSquareAttackedBy(positionBoard, row, col - 2, enemy)
  ) {
    moves.push({ row, col: col - 2, flag: "castleQ" });
  }
}

// Verifica se todas as casas entre `fromCol` e `toCol` (inclusive) estão vazias.
function isRangeEmpty(positionBoard, row, fromCol, toCol) {
  for (let c = fromCol; c <= toCol; c++) {
    if (positionBoard[row][c]) return false;
  }
  return true;
}

/* =====================================================
   PEÇAS DO MODO ESPECIAL
===================================================== */

// Mago: anda como o bispo (diagonal, qualquer distância) OU uma única casa
// na ortogonal (como uma torre bem curta).
function addWizardMoves(positionBoard, row, col, piece, moves) {
  addSlidingMoves(positionBoard, row, col, piece, moves, BISHOP_DIRECTIONS);

  for (const [dr, dc] of ROOK_DIRECTIONS) {
    const r = row + dr;
    const c = col + dc;
    if (!inside(r, c)) continue;

    const target = positionBoard[r][c];
    if (!target || target.color !== piece.color) {
      moves.push({ row: r, col: c });
    }
  }
}

// Arqueiro: anda uma casa em qualquer direção, mas só para casas vazias
// (não captura por movimento). Em vez disso, ele "atira" e captura uma
// peça inimiga exatamente 2 casas à frente em linha reta, sem se mover,
// desde que a casa do meio esteja livre (linha de tiro desobstruída).
function addArcherMoves(positionBoard, row, col, piece, moves) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (inside(r, c) && !positionBoard[r][c]) {
        moves.push({ row: r, col: c });
      }
    }
  }

  for (const { row: r, col: c } of getArcherRangedSquares(positionBoard, row, col)) {
    const target = positionBoard[r][c];
    if (target && target.color !== piece.color) {
      moves.push({ row: r, col: c, flag: "archerShot" });
    }
  }
}

// Retorna as casas a exatamente 2 de distância em linha reta (8 direções)
// com a casa intermediária livre — usada tanto para gerar o tiro do
// arqueiro quanto para saber quais casas ele ameaça (xeque).
function getArcherRangedSquares(positionBoard, row, col) {
  const squares = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;

      const midRow = row + dr;
      const midCol = col + dc;
      const farRow = row + dr * 2;
      const farCol = col + dc * 2;

      if (!inside(midRow, midCol) || !inside(farRow, farCol)) continue;
      if (positionBoard[midRow][midCol]) continue; // linha de tiro bloqueada

      squares.push({ row: farRow, col: farCol });
    }
  }

  return squares;
}

// Dragão: combina o salto do cavalo com o alcance do bispo (qualquer
// distância na diagonal) — voa por cima de outras peças ao saltar, e
// "sobrevoa" longas diagonais como se cuspisse fogo em linha reta.
function addDragonMoves(positionBoard, row, col, piece, moves) {
  addKnightMoves(positionBoard, row, col, piece, moves);
  addSlidingMoves(positionBoard, row, col, piece, moves, BISHOP_DIRECTIONS);
}

/* =====================================================
   ATAQUES / XEQUE
===================================================== */

function getAttackMoves(positionBoard, row, col) {
  const piece = positionBoard[row][col];
  if (!piece) return [];

  const moves = [];

  switch (piece.type) {
    case "pawn": {
      const direction = piece.color === "white" ? -1 : 1;
      for (const dc of [-1, 1]) {
        const r = row + direction;
        const c = col + dc;
        if (inside(r, c)) moves.push({ row: r, col: c });
      }
      break;
    }
    case "knight":
      addKnightMoves(positionBoard, row, col, piece, moves);
      break;
    case "bishop":
      addSlidingMoves(positionBoard, row, col, piece, moves, BISHOP_DIRECTIONS);
      break;
    case "rook":
      addSlidingMoves(positionBoard, row, col, piece, moves, ROOK_DIRECTIONS);
      break;
    case "queen":
      addSlidingMoves(positionBoard, row, col, piece, moves, QUEEN_DIRECTIONS);
      break;
    case "king":
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const r = row + dr;
          const c = col + dc;
          if (inside(r, c)) moves.push({ row: r, col: c });
        }
      }
      break;
    case "wizard":
      addWizardMoves(positionBoard, row, col, piece, moves);
      break;
    case "archer":
      // Só o tiro à distância ameaça — o passo de 1 casa não captura,
      // então não conta como ataque (igual ao avanço reto do peão).
      moves.push(...getArcherRangedSquares(positionBoard, row, col));
      break;
    case "dragon":
      addDragonMoves(positionBoard, row, col, piece, moves);
      break;
  }

  return moves;
}

function isSquareAttackedBy(positionBoard, row, col, attackerColor) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < boardCols; c++) {
      const piece = positionBoard[r][c];
      if (!piece || piece.color !== attackerColor) continue;

      const attacks = getAttackMoves(positionBoard, r, c);
      if (attacks.some(move => move.row === row && move.col === col)) {
        return true;
      }
    }
  }
  return false;
}

function findKing(positionBoard, color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < boardCols; col++) {
      const piece = positionBoard[row][col];
      if (piece && piece.type === "king" && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

function isKingInCheck(positionBoard, color) {
  const king = findKing(positionBoard, color);
  if (!king) return null;

  const enemy = opponent(color);
  return isSquareAttackedBy(positionBoard, king.row, king.col, enemy) ? king : null;
}

function hasLegalMoves(color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < boardCols; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        if (getLegalMoves(board, row, col).length > 0) return true;
      }
    }
  }
  return false;
}

/* =====================================================
   FAZER MOVIMENTO (com suporte a promoção assíncrona)
===================================================== */

function makeMove(fromRow, fromCol, toRow, toCol, flag) {
  const movingPiece = board[fromRow][fromCol];
  const isPromotion = movingPiece.type === "pawn" && (toRow === 0 || toRow === 7);

  if (isPromotion) {
    pendingPromotion = { fromRow, fromCol, toRow, toCol, flag };
    showPromotionModal(movingPiece.color);
    return;
  }

  commitMove(fromRow, fromCol, toRow, toCol, flag, null);
}

function commitMove(fromRow, fromCol, toRow, toCol, flag, promotionType) {
  undoStack.push(createSnapshot());

  const movingPiece = board[fromRow][fromCol];
  const isPawnMove = movingPiece.type === "pawn";
  const isArcherShot = flag === "archerShot";

  const sanCore = computeSAN(fromRow, fromCol, toRow, toCol, flag, promotionType);

  let capturedRecord = null;

  if (isArcherShot) {
    // O arqueiro atira e captura à distância, sem sair do lugar.
    capturedRecord = board[toRow][toCol];
    board[toRow][toCol] = null;
    movingPiece.hasMoved = true;
  } else {
    if (flag === "enpassant") {
      capturedRecord = board[fromRow][toCol];
      board[fromRow][toCol] = null;
    } else if (board[toRow][toCol]) {
      capturedRecord = board[toRow][toCol];
    }

    board[toRow][toCol] = movingPiece;
    board[fromRow][fromCol] = null;
    movingPiece.hasMoved = true;

    if (flag === "castleK") {
      const rook = board[fromRow][rookKingsideCol];
      board[fromRow][toCol - 1] = rook;
      board[fromRow][rookKingsideCol] = null;
      rook.hasMoved = true;
    } else if (flag === "castleQ") {
      const rook = board[fromRow][rookQueensideCol];
      board[fromRow][toCol + 1] = rook;
      board[fromRow][rookQueensideCol] = null;
      rook.hasMoved = true;
    }

    if (promotionType) {
      movingPiece.type = promotionType;
    }
  }

  if (capturedRecord) {
    capturedPieces.push({ type: capturedRecord.type, color: capturedRecord.color });
  }

  enPassantTarget = flag === "double"
    ? { row: (fromRow + toRow) / 2, col: fromCol }
    : null;

  halfMoveClock = (isPawnMove || capturedRecord) ? 0 : halfMoveClock + 1;

  lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };

  // A peça só "pousa" numa casa quando de fato se move até ela — o tiro
  // do arqueiro não conta para acionar eventos, pois ele fica parado.
  // (triggerEventSquare pode atualizar lastMove.to caso um portal dispare.)
  eventMessage = "";
  if (specialMode && !isArcherShot) {
    eventMessage = triggerEventSquare(toRow, toCol);
  }

  currentPlayer = opponent(currentPlayer);

  const opponentInCheck = isKingInCheck(board, currentPlayer);
  const opponentHasMoves = hasLegalMoves(currentPlayer);
  const suffix = opponentInCheck && !opponentHasMoves ? "#" : (opponentInCheck ? "+" : "");
  sanHistory.push(sanCore + suffix);

  clearSelection();
  pendingPromotion = null;
  hidePromotionModal();

  registerPosition();
  renderMoveList();
  updateCapturedPanel();
  checkGameState();
  renderBoard();
}

// Aplica o efeito da casa de evento em que a peça acabou de pousar (Modo
// Especial). Retorna uma descrição do que aconteceu, ou string vazia.
function triggerEventSquare(row, col) {
  const key = `${row},${col}`;
  const event = eventSquares[key];
  if (!event) return "";

  const piece = board[row][col];
  if (!piece) return "";

  if (event.type === "trap") {
    if (piece.type === "king") return ""; // o rei nunca é destruído por armadilha
    capturedPieces.push({ type: piece.type, color: piece.color });
    board[row][col] = null;
    delete eventSquares[key]; // dispara uma única vez
    return `🔥 Armadilha! ${PIECE_NAMES_PT[piece.type]} foi destruído(a).`;
  }

  if (event.type === "well") {
    if (piece.type !== "pawn") return "";
    piece.type = "queen";
    delete eventSquares[key]; // dispara uma única vez
    return "💎 Poço de energia! O peão foi promovido a Dama instantaneamente.";
  }

  if (event.type === "portal") {
    const [pairRow, pairCol] = event.pairKey.split(",").map(Number);
    if (board[pairRow][pairCol]) return ""; // casa-par ocupada: teletransporte falha

    board[pairRow][pairCol] = piece;
    board[row][col] = null;
    lastMove = { from: { row, col }, to: { row: pairRow, col: pairCol } };
    return `🌀 Portal! A peça foi teletransportada para ${squareName(pairRow, pairCol)}.`;
  }

  return "";
}

function createSnapshot() {
  return {
    board: cloneBoard(board),
    currentPlayer,
    whiteTime,
    blackTime,
    enPassantTarget: enPassantTarget ? { ...enPassantTarget } : null,
    halfMoveClock,
    positionCounts: { ...positionCounts },
    sanHistory: sanHistory.slice(),
    capturedPieces: capturedPieces.slice(),
    lastMove,
    eventSquares: { ...eventSquares }
  };
}

/* =====================================================
   NOTAÇÃO ALGÉBRICA (SAN)
===================================================== */

function computeSAN(fromRow, fromCol, toRow, toCol, flag, promotionType) {
  if (flag === "castleK") return "O-O";
  if (flag === "castleQ") return "O-O-O";

  if (flag === "archerShot") {
    // Notação própria do Modo Especial: a peça não se move, apenas atira.
    return `A${squareName(fromRow, fromCol)}»${squareName(toRow, toCol)}`;
  }

  const piece = board[fromRow][fromCol];
  const destination = squareName(toRow, toCol);
  const isCapture = !!board[toRow][toCol] || flag === "enpassant";

  if (piece.type === "pawn") {
    let san = isCapture ? `${FILES[fromCol]}x${destination}` : destination;
    if (promotionType) san += `=${PIECE_LETTERS[promotionType]}`;
    return san;
  }

  let disambiguation = "";
  const alliesReachingTarget = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < boardCols; c++) {
      if (r === fromRow && c === fromCol) continue;
      const candidate = board[r][c];

      if (candidate && candidate.type === piece.type && candidate.color === piece.color) {
        const candidateMoves = getLegalMoves(board, r, c);
        if (candidateMoves.some(m => m.row === toRow && m.col === toCol)) {
          alliesReachingTarget.push({ r, c });
        }
      }
    }
  }

  if (alliesReachingTarget.length > 0) {
    const sameFile = alliesReachingTarget.some(a => a.c === fromCol);
    const sameRank = alliesReachingTarget.some(a => a.r === fromRow);

    if (!sameFile) disambiguation = FILES[fromCol];
    else if (!sameRank) disambiguation = String(8 - fromRow);
    else disambiguation = FILES[fromCol] + String(8 - fromRow);
  }

  return PIECE_LETTERS[piece.type] + disambiguation + (isCapture ? "x" : "") + destination;
}

/* =====================================================
   ESTADO DA PARTIDA (xeque, mate, empates)
===================================================== */

function checkGameState() {
  const inCheck = isKingInCheck(board, currentPlayer);
  const canMove = hasLegalMoves(currentPlayer);

  if (inCheck && !canMove) {
    endGame("💀 XEQUE-MATE!", `${currentPlayer === "white" ? "Pretas" : "Brancas"} venceram a partida!`);
    return;
  }

  if (!inCheck && !canMove) {
    endGame("🤝 EMPATE!", "Afogamento — não existem movimentos legais.");
    return;
  }

  const key = boardToFen();
  if ((positionCounts[key] || 0) >= 3) {
    endGame("🤝 EMPATE!", "Empate por repetição tripla de posição.");
    return;
  }

  if (halfMoveClock >= 100) {
    endGame("🤝 EMPATE!", "Empate pela regra dos 50 lances sem captura ou movimento de peão.");
    return;
  }

  if (isInsufficientMaterial()) {
    endGame("🤝 EMPATE!", "Empate por material insuficiente para dar xeque-mate.");
    return;
  }

  if (inCheck) {
    const name = currentPlayer === "white" ? "Brancas" : "Pretas";
    statusElement.textContent = `⚠️ XEQUE — ${name}`;
    messageElement.textContent = withEventMessage("O rei está em xeque!");
    return;
  }

  updateStatus();
}

function withEventMessage(text) {
  return eventMessage ? `${eventMessage} ${text}` : text;
}

function endGame(status, message) {
  gameOver = true;
  statusElement.textContent = status;
  messageElement.textContent = withEventMessage(message);
}

function updateStatus() {
  if (gameOver) return;
  const name = currentPlayer === "white" ? "Brancas" : "Pretas";
  statusElement.textContent = `Vez das ${name}`;
  messageElement.textContent = withEventMessage(`Escolha uma peça.`);
}

function isInsufficientMaterial() {
  const pieces = [];
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.type !== "king") pieces.push(piece);
    }
  }

  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0].type === "bishop" || pieces[0].type === "knight")) return true;

  if (pieces.length === 2 && pieces.every(p => p.type === "bishop") && pieces[0].color !== pieces[1].color) {
    const squareShades = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < boardCols; c++) {
        if (board[r][c] && board[r][c].type === "bishop") squareShades.push((r + c) % 2);
      }
    }
    if (squareShades[0] === squareShades[1]) return true;
  }

  return false;
}

/* =====================================================
   RESIGN / EMPATE MANUAL
===================================================== */

function resignCurrentPlayer() {
  if (gameOver) return;
  const loser = currentPlayer === "white" ? "Brancas" : "Pretas";
  const winner = currentPlayer === "white" ? "Pretas" : "Brancas";
  endGame("🏳️ DESISTÊNCIA", `${winner} venceram! ${loser} desistiram da partida.`);
  renderBoard();
}

function offerDraw() {
  if (gameOver) return;
  endGame("🤝 EMPATE!", "Empate combinado entre os jogadores.");
  renderBoard();
}

/* =====================================================
   PROMOÇÃO DE PEÃO
===================================================== */

function showPromotionModal(color) {
  promotionOptionsElement.innerHTML = "";

  for (const type of PROMOTION_CHOICES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "promotion-btn";
    button.textContent = SYMBOLS[color][type];
    button.setAttribute("aria-label", `Promover para ${PIECE_NAMES_PT[type]}`);
    button.addEventListener("click", () => resolvePromotion(type));
    promotionOptionsElement.appendChild(button);
  }

  promotionOverlay.classList.remove("hidden");
}

function hidePromotionModal() {
  promotionOverlay.classList.add("hidden");
}

function resolvePromotion(type) {
  const move = pendingPromotion;
  if (!move) return;
  commitMove(move.fromRow, move.fromCol, move.toRow, move.toCol, move.flag, type);
}

/* =====================================================
   DESFAZER
===================================================== */

function undoMove() {
  if (undoStack.length === 0) return;

  const previous = undoStack.pop();

  board = previous.board;
  currentPlayer = previous.currentPlayer;
  whiteTime = previous.whiteTime;
  blackTime = previous.blackTime;
  enPassantTarget = previous.enPassantTarget;
  halfMoveClock = previous.halfMoveClock;
  positionCounts = previous.positionCounts;
  sanHistory = previous.sanHistory;
  capturedPieces = previous.capturedPieces;
  lastMove = previous.lastMove;
  eventSquares = previous.eventSquares;

  clearSelection();
  gameOver = false;
  pendingPromotion = null;
  eventMessage = "";
  hidePromotionModal();

  renderMoveList();
  updateCapturedPanel();
  renderBoard();
}

/* =====================================================
   LISTA DE MOVIMENTOS (reconstruída a partir do histórico)
===================================================== */

function renderMoveList() {
  moveListElement.innerHTML = "";

  for (let i = 0; i < sanHistory.length; i += 2) {
    const moveNumber = i / 2 + 1;
    const whiteMove = sanHistory[i] || "";
    const blackMove = sanHistory[i + 1] || "";

    const row = document.createElement("div");
    row.className = "move";
    row.innerHTML = `<span>${moveNumber}.</span><span>${whiteMove}</span><span>${blackMove}</span>`;
    moveListElement.appendChild(row);
  }

  moveListElement.scrollTop = moveListElement.scrollHeight;
}

/* =====================================================
   PAINEL DE PEÇAS CAPTURADAS
===================================================== */

function updateCapturedPanel() {
  const capturedByWhite = capturedPieces.filter(p => p.color === "black");
  const capturedByBlack = capturedPieces.filter(p => p.color === "white");

  capturedByWhiteElement.textContent = capturedByWhite.map(p => SYMBOLS.black[p.type]).join(" ");
  capturedByBlackElement.textContent = capturedByBlack.map(p => SYMBOLS.white[p.type]).join(" ");

  const whiteValue = capturedByWhite.reduce((sum, p) => sum + PIECE_VALUES[p.type], 0);
  const blackValue = capturedByBlack.reduce((sum, p) => sum + PIECE_VALUES[p.type], 0);
  const diff = whiteValue - blackValue;

  materialWhiteElement.textContent = diff > 0 ? `+${diff}` : "";
  materialBlackElement.textContent = diff < 0 ? `+${-diff}` : "";
}

/* =====================================================
   REPETIÇÃO DE POSIÇÃO (FEN simplificado)
===================================================== */

function registerPosition() {
  const key = boardToFen();
  positionCounts[key] = (positionCounts[key] || 0) + 1;
}

function boardToFen() {
  const rows = [];

  for (let r = 0; r < 8; r++) {
    let empty = 0;
    let rowText = "";

    for (let c = 0; c < boardCols; c++) {
      const piece = board[r][c];

      if (!piece) {
        empty++;
        continue;
      }

      if (empty) {
        rowText += empty;
        empty = 0;
      }

      const letter = {
        pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k",
        wizard: "w", archer: "a", dragon: "d"
      }[piece.type];
      rowText += piece.color === "white" ? letter.toUpperCase() : letter;
    }

    if (empty) rowText += empty;
    rows.push(rowText);
  }

  const ep = enPassantTarget ? squareName(enPassantTarget.row, enPassantTarget.col) : "-";
  return `${rows.join("/")} ${currentPlayer[0]} ${castlingRightsString()} ${ep}`;
}

function castlingRightsString() {
  let rights = "";
  const whiteKing = findPieceAt(7, kingHomeCol, "king", "white");
  const blackKing = findPieceAt(0, kingHomeCol, "king", "black");

  if (whiteKing && !whiteKing.hasMoved) {
    if (isUnmovedRook(7, rookKingsideCol, "white")) rights += "K";
    if (isUnmovedRook(7, rookQueensideCol, "white")) rights += "Q";
  }

  if (blackKing && !blackKing.hasMoved) {
    if (isUnmovedRook(0, rookKingsideCol, "black")) rights += "k";
    if (isUnmovedRook(0, rookQueensideCol, "black")) rights += "q";
  }

  return rights || "-";
}

function findPieceAt(row, col, type, color) {
  const piece = board[row][col];
  return piece && piece.type === type && piece.color === color ? piece : null;
}

function isUnmovedRook(row, col, color) {
  const piece = board[row][col];
  return !!(piece && piece.type === "rook" && piece.color === color && !piece.hasMoved);
}

/* =====================================================
   CRONÔMETRO
===================================================== */

function updateTimers() {
  if (gameOver || timeControlSeconds === null) return;

  if (currentPlayer === "white") {
    whiteTime--;
  } else {
    blackTime--;
  }

  if (whiteTime <= 0) {
    whiteTime = 0;
    endGame("🏆 Pretas venceram!", "Tempo das Brancas esgotado.");
  }

  if (blackTime <= 0) {
    blackTime = 0;
    endGame("🏆 Brancas venceram!", "Tempo das Pretas esgotado.");
  }

  updateTimerDisplay();
}

function updateTimerDisplay() {
  whiteTimeElement.textContent = timeControlSeconds === null ? "∞" : formatTime(whiteTime);
  blackTimeElement.textContent = timeControlSeconds === null ? "∞" : formatTime(blackTime);
  updateTurnIndicators();
}

function updateTurnIndicators() {
  whiteTimerBox.classList.toggle("active", currentPlayer === "white" && !gameOver);
  blackTimerBox.classList.toggle("active", currentPlayer === "black" && !gameOver);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/* =====================================================
   UTILITÁRIOS
===================================================== */

function inside(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < boardCols;
}

function cloneBoard(source) {
  return source.map(row => row.map(piece => (piece ? { ...piece } : null)));
}

function opponent(color) {
  return color === "white" ? "black" : "white";
}

function squareName(row, col) {
  return `${FILES[col]}${8 - row}`;
}

/* =====================================================
   EVENTOS GLOBAIS
===================================================== */

document.getElementById("restartBtn").addEventListener("click", restartGame);
document.getElementById("undoBtn").addEventListener("click", undoMove);
document.getElementById("resignBtn").addEventListener("click", resignCurrentPlayer);
document.getElementById("drawBtn").addEventListener("click", offerDraw);
timeControlSelect.addEventListener("change", restartGame);
gameModeSelect.addEventListener("change", restartGame);

/* =====================================================
   INICIAR
===================================================== */

restartGame();
setInterval(updateTimers, 1000);
