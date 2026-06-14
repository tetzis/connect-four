import { useState, useEffect, useCallback, useRef } from "react";

const EMPTY = null;
const PLAYER1 = "pink";
const PLAYER2 = "blue";
const STORAGE_KEY = "connect-four-save";

const COLORS = {
  pink: {
    fill: "#FF9CC2", glow: "#FF6FA8", shadow: "rgba(255,111,168,0.7)",
    label: "Rosa", gradient: "linear-gradient(135deg, #FFB3D1 0%, #FF6FA8 100%)",
  },
  blue: {
    fill: "#7EC8E3", glow: "#4AACCC", shadow: "rgba(74,172,204,0.7)",
    label: "Hellblau", gradient: "linear-gradient(135deg, #A8DCEF 0%, #4AACCC 100%)",
  },
};

const BOARD_SIZES = {
  small:    { rows: 5, cols: 6, label: "Klein", sub: "6 × 5" },
  standard: { rows: 6, cols: 7, label: "Standard", sub: "7 × 6" },
  large:    { rows: 7, cols: 9, label: "Groß", sub: "9 × 7" },
};

const DEFAULT_CONFIG = {
  sizeKey: "standard",
  rows: BOARD_SIZES.standard.rows,
  cols: BOARD_SIZES.standard.cols,
  names: { pink: "Rosa", blue: "Hellblau" },
};

function createBoard(rows, cols) {
  return Array(rows).fill(null).map(() => Array(cols).fill(EMPTY));
}

function checkWinner(board) {
  const rows = board.length, cols = board[0].length;
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (!cell) continue;
      for (const [dr, dc] of directions) {
        const cells = [[r, c]];
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || board[nr][nc] !== cell) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return { winner: cell, cells };
      }
    }
  }
  return null;
}

function isDraw(board) {
  return board[0].every(cell => cell !== EMPTY);
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

// --- Storage helpers using localStorage ---
function saveToStorage(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

function isStorageAvailable() {
  try {
    localStorage.setItem("__test__", "1");
    localStorage.removeItem("__test__");
    return true;
  } catch (e) {
    return false;
  }
}

export default function ConnectFour() {
  const [view, setView] = useState("setup"); // "setup" | "game"
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [setupConfig, setSetupConfig] = useState(DEFAULT_CONFIG);

  const [board, setBoard] = useState(() => createBoard(DEFAULT_CONFIG.rows, DEFAULT_CONFIG.cols));
  const [currentPlayer, setCurrentPlayer] = useState(PLAYER1);
  const [winResult, setWinResult] = useState(null);
  const [draw, setDraw] = useState(false);
  const [droppingCell, setDroppingCell] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [winCells, setWinCells] = useState([]);
  const [scores, setScores] = useState({ pink: 0, blue: 0 });
  const [animatingDrop, setAnimatingDrop] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [history, setHistory] = useState([]);

  const [saveStatus, setSaveStatus] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [restoreData, setRestoreData] = useState(null);
  const [storageOk] = useState(() => isStorageAvailable());

  // Ref always holds latest state for event handlers
  const stateRef = useRef({});
  stateRef.current = { board, currentPlayer, winResult, winCells, draw, scores, gameStarted, config, view };

  // On mount: look for a saved game
  useEffect(() => {
    if (!storageOk) return;
    const data = loadFromStorage();
    if (data && data.gameStarted && data.board) {
      setRestoreData(data);
      setShowRestorePrompt(true);
    }
  }, []);

  // Save on tab hide / app background (covers "aus Versehen raustippen")
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        const s = stateRef.current;
        if (s.gameStarted) saveToStorage({ ...s, savedAt: Date.now() });
      }
    };
    const handleUnload = () => {
      const s = stateRef.current;
      if (s.gameStarted) saveToStorage({ ...s, savedAt: Date.now() });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  // Show save feedback
  const showSaved = useCallback((ts) => {
    setSavedAt(ts);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus(s => s === "saved" ? null : s), 2500);
  }, []);

  const applyRestore = useCallback((data) => {
    const cfg = data.config || DEFAULT_CONFIG;
    setConfig(cfg);
    setSetupConfig(cfg);
    setBoard(data.board || createBoard(cfg.rows, cfg.cols));
    setCurrentPlayer(data.currentPlayer || PLAYER1);
    setWinResult(data.winResult || null);
    setWinCells(data.winCells || []);
    setDraw(data.draw || false);
    setScores(data.scores || { pink: 0, blue: 0 });
    setHistory([]);
    setGameStarted(true);
    setView("game");
    setSavedAt(data.savedAt || null);
    setShowRestorePrompt(false);
    setRestoreData(null);
    setSaveStatus("loaded");
    setTimeout(() => setSaveStatus(null), 2500);
  }, []);

  const startGame = useCallback(() => {
    clearStorage();
    const cfg = { ...setupConfig };
    setConfig(cfg);
    setBoard(createBoard(cfg.rows, cfg.cols));
    setCurrentPlayer(PLAYER1);
    setWinResult(null);
    setDraw(false);
    setDroppingCell(null);
    setWinCells([]);
    setAnimatingDrop(false);
    setHoverCol(null);
    setScores({ pink: 0, blue: 0 });
    setHistory([]);
    setGameStarted(true);
    setView("game");
    setShowRestorePrompt(false);
    setRestoreData(null);
    setSavedAt(null);
    setSaveStatus(null);
  }, [setupConfig]);

  // Same settings, fresh board, keep scores
  const resetGame = useCallback(() => {
    clearStorage();
    setBoard(createBoard(config.rows, config.cols));
    setCurrentPlayer(PLAYER1);
    setWinResult(null);
    setDraw(false);
    setDroppingCell(null);
    setWinCells([]);
    setAnimatingDrop(false);
    setHoverCol(null);
    setHistory([]);
    setGameStarted(true);
    setSavedAt(null);
    setSaveStatus(null);
  }, [config]);

  // Back to setup screen, reset everything
  const goToSetup = useCallback(() => {
    clearStorage();
    setView("setup");
    setGameStarted(false);
    setWinResult(null);
    setDraw(false);
    setDroppingCell(null);
    setWinCells([]);
    setAnimatingDrop(false);
    setHoverCol(null);
    setHistory([]);
    setScores({ pink: 0, blue: 0 });
    setSaveStatus(null);
    setSavedAt(null);
  }, []);

  const handleColumnClick = useCallback((col) => {
    if (winResult || draw || animatingDrop) return;
    const newBoard = board.map(r => [...r]);
    const rows = newBoard.length;
    let targetRow = -1;
    for (let r = rows - 1; r >= 0; r--) {
      if (newBoard[r][col] === EMPTY) { targetRow = r; break; }
    }
    if (targetRow === -1) return;

    // Snapshot for undo (state before this move)
    setHistory(h => [...h, { board, currentPlayer, winResult, winCells, draw, scores }]);

    setGameStarted(true);
    setAnimatingDrop(true);
    setDroppingCell({ row: targetRow, col, player: currentPlayer });

    setTimeout(() => {
      newBoard[targetRow][col] = currentPlayer;
      setBoard(newBoard);
      setDroppingCell(null);

      let newWinResult = null, newWinCells = [], newDraw = false;
      let newScores = scores;
      let newPlayer = currentPlayer === PLAYER1 ? PLAYER2 : PLAYER1;

      const result = checkWinner(newBoard);
      if (result) {
        newWinResult = result.winner;
        newWinCells = result.cells.map(([r, c]) => `${r}-${c}`);
        newScores = { ...scores, [result.winner]: scores[result.winner] + 1 };
        newPlayer = currentPlayer;
        setWinResult(newWinResult);
        setWinCells(newWinCells);
        setScores(newScores);
      } else if (isDraw(newBoard)) {
        newDraw = true;
        setDraw(true);
      } else {
        setCurrentPlayer(newPlayer);
      }
      setAnimatingDrop(false);

      // Immediately persist new state
      const payload = {
        board: newBoard, currentPlayer: newPlayer,
        winResult: newWinResult, winCells: newWinCells,
        draw: newDraw, scores: newScores,
        gameStarted: true, config, savedAt: Date.now(),
      };
      const ok = saveToStorage(payload);
      if (ok) showSaved(payload.savedAt);
      else setSaveStatus("error");
    }, 420);
  }, [board, winResult, draw, animatingDrop, currentPlayer, scores, showSaved, config]);

  // Undo: revert the last move
  const handleUndo = useCallback(() => {
    if (history.length === 0 || animatingDrop) return;
    const newHistory = [...history];
    const snapshot = newHistory.pop();
    setBoard(snapshot.board);
    setCurrentPlayer(snapshot.currentPlayer);
    setWinResult(snapshot.winResult);
    setWinCells(snapshot.winCells);
    setDraw(snapshot.draw);
    setScores(snapshot.scores);
    setHistory(newHistory);
    setDroppingCell(null);
    setAnimatingDrop(false);

    const payload = {
      board: snapshot.board, currentPlayer: snapshot.currentPlayer,
      winResult: snapshot.winResult, winCells: snapshot.winCells,
      draw: snapshot.draw, scores: snapshot.scores,
      gameStarted: true, config, savedAt: Date.now(),
    };
    const ok = saveToStorage(payload);
    if (ok) showSaved(payload.savedAt);
  }, [history, animatingDrop, config, showSaved]);

  const isWinCell = (r, c) => winCells.includes(`${r}-${c}`);

  const rows = board.length;
  const cols = board[0].length;
  const cellSize = `clamp(28px, calc((92vw - ${(cols - 1) * 6}px) / ${cols}), 52px)`;
  const innerSize = `calc(${cellSize} - 8px)`;

  const dynStyles = {
    colButtons: { display: "grid", gridTemplateColumns: `repeat(${cols}, ${cellSize})`, gap: 6, marginBottom: 4, padding: "4px 0" },
    colBtn: { width: cellSize, height: `calc(${cellSize} * 0.65)`, background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" },
    grid: { display: "grid", gridTemplateColumns: `repeat(${cols}, ${cellSize})`, gridTemplateRows: `repeat(${rows}, ${cellSize})`, gap: 6 },
    cellOuter: { width: cellSize, height: cellSize, borderRadius: "50%", background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 3px 10px rgba(0,0,0,0.5)" },
    cell: { width: innerSize, height: innerSize, borderRadius: "50%", transition: "background 0.2s" },
  };

  return (
    <div style={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');
        @keyframes dropIn {
          0%   { transform: translateY(-340px) scale(0.85); opacity: 0.7; }
          70%  { transform: translateY(8px) scale(1.07); opacity: 1; }
          85%  { transform: translateY(-4px) scale(0.97); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes winPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50%       { transform: scale(1.13); filter: brightness(1.3); }
        }
        @keyframes floatIn {
          from { opacity: 0; transform: translateY(-18px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 16px 4px rgba(255,111,168,0.3); }
          50%       { box-shadow: 0 0 32px 10px rgba(74,172,204,0.4); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-14px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes savePop {
          0%   { opacity: 0; transform: scale(0.85) translateY(4px); }
          60%  { transform: scale(1.06) translateY(-1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .col-btn { cursor: pointer; }
        .col-btn:disabled { cursor: not-allowed; }
        .action-btn { transition: opacity 0.15s, transform 0.15s; }
        .action-btn:hover { opacity: 0.85; transform: scale(1.03); }
        .action-btn:active { transform: scale(0.97); }
        .action-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
        .pill-btn { transition: all 0.15s; cursor: pointer; }
        .pill-btn:hover { transform: scale(1.03); }
        .name-input { font-family: 'Nunito', sans-serif; }
        .name-input::placeholder { color: rgba(255,255,255,0.3); }
      `}</style>

      <div style={styles.blob1} />
      <div style={styles.blob2} />

      {/* Restore Modal */}
      {showRestorePrompt && restoreData && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, animation: "slideDown 0.35s ease both" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>💾</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#fff", marginBottom: 6 }}>
              Gespeichertes Spiel gefunden
            </div>
            {restoreData.savedAt && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>
                Gespeichert am {formatDate(restoreData.savedAt)}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ color: COLORS.pink.fill }}>🌸 {restoreData.scores?.pink ?? 0} Siege</span>
              <span>·</span>
              <span style={{ color: COLORS.blue.fill }}>💙 {restoreData.scores?.blue ?? 0} Siege</span>
              <span>·</span>
              <span>am Zug: <b style={{ color: COLORS[restoreData.currentPlayer]?.fill }}>
                {(restoreData.config?.names?.[restoreData.currentPlayer]) || COLORS[restoreData.currentPlayer]?.label}
              </b></span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
              <button className="action-btn" onClick={() => applyRestore(restoreData)}
                style={{ ...styles.modalBtn, background: "linear-gradient(135deg, #FF9CC2, #7EC8E3)", color: "#1a1228" }}>
                ▶ Weiterspielen
              </button>
              <button className="action-btn" onClick={() => { clearStorage(); setShowRestorePrompt(false); setRestoreData(null); }}
                style={{ ...styles.modalBtn, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(255,255,255,0.12)" }}>
                🗑 Verwerfen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Title */}
      <div style={styles.titleArea}>
        <h1 style={styles.title}>
          <span style={{ color: "#FF9CC2" }}>VIER</span>
          <span style={{ color: "#fff", opacity: 0.4, margin: "0 6px" }}>✦</span>
          <span style={{ color: "#7EC8E3" }}>GEWINNT</span>
        </h1>
      </div>

      {view === "setup" ? (
        <SetupScreen setupConfig={setupConfig} setSetupConfig={setSetupConfig} onStart={startGame} />
      ) : (
        <>
          {/* Save status bar */}
          <div style={styles.saveBar}>
            {!storageOk && (
              <span style={{ ...styles.saveChip, background: "rgba(255,120,80,0.15)", color: "#ff9070", border: "1px solid rgba(255,120,80,0.3)" }}>
                ⚠ Speicher nicht verfügbar
              </span>
            )}
            {storageOk && saveStatus === "saved" && (
              <span style={{ ...styles.saveChip, ...styles.saveChipOk, animation: "savePop 0.3s ease both" }}>
                ✓ Gespeichert · {formatDate(savedAt)}
              </span>
            )}
            {storageOk && saveStatus === "loaded" && (
              <span style={{ ...styles.saveChip, ...styles.saveChipOk, animation: "savePop 0.3s ease both" }}>
                ✓ Spiel geladen!
              </span>
            )}
            {storageOk && saveStatus === "error" && (
              <span style={{ ...styles.saveChip, background: "rgba(255,80,80,0.15)", color: "#ff8080", border: "1px solid rgba(255,80,80,0.3)" }}>
                ⚠ Speichern fehlgeschlagen
              </span>
            )}
            {storageOk && !saveStatus && savedAt && gameStarted && (
              <span style={{ ...styles.saveChip, opacity: 0.4, fontSize: 11 }}>
                💾 {formatDate(savedAt)}
              </span>
            )}
          </div>

          {/* Scoreboard */}
          <div style={styles.scoreRow}>
            {[PLAYER1, PLAYER2].map(p => (
              <div key={p} style={{
                ...styles.scoreCard,
                background: p === currentPlayer && !winResult && !draw
                  ? `linear-gradient(135deg, ${COLORS[p].fill}33, ${COLORS[p].glow}22)`
                  : "rgba(255,255,255,0.05)",
                border: p === currentPlayer && !winResult && !draw
                  ? `2px solid ${COLORS[p].fill}` : "2px solid rgba(255,255,255,0.08)",
                animation: p === currentPlayer && !winResult && !draw ? "glowPulse 2s ease-in-out infinite" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: COLORS[p].gradient, boxShadow: `0 0 10px ${COLORS[p].shadow}` }} />
                  <span style={{ ...styles.scoreLabel, color: COLORS[p].fill }}>
                    {config.names[p]}
                  </span>
                </div>
                <span style={styles.scoreNum}>{scores[p]}</span>
                {p === currentPlayer && !winResult && !draw && (
                  <div style={{ fontSize: 11, color: COLORS[p].fill, opacity: 0.9, marginTop: 2, animation: "bounce 1.2s ease-in-out infinite" }}>▼ am Zug</div>
                )}
              </div>
            ))}
          </div>

          {/* Board */}
          <div style={styles.boardWrapper}>
            <div style={styles.board}>
              <div style={dynStyles.colButtons}>
                {Array(cols).fill(null).map((_, c) => (
                  <button key={c} className="col-btn"
                    disabled={!!winResult || draw || animatingDrop}
                    onClick={() => handleColumnClick(c)}
                    onMouseEnter={() => setHoverCol(c)}
                    onMouseLeave={() => setHoverCol(null)}
                    style={dynStyles.colBtn} aria-label={`Spalte ${c + 1}`}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: COLORS[currentPlayer]?.gradient,
                      boxShadow: `0 0 14px ${COLORS[currentPlayer]?.shadow}`,
                      opacity: hoverCol === c && !winResult && !draw && !animatingDrop ? 1 : 0,
                      transform: hoverCol === c ? "translateY(0)" : "translateY(-6px)",
                      transition: "opacity 0.18s, transform 0.18s", margin: "0 auto",
                    }} />
                  </button>
                ))}
              </div>
              <div style={dynStyles.grid}>
                {board.map((row, r) => row.map((cell, c) => {
                  const isDropping = droppingCell && droppingCell.row === r && droppingCell.col === c;
                  const isWin = isWinCell(r, c);
                  const player = isDropping ? droppingCell.player : cell;
                  return (
                    <div key={`${r}-${c}`} style={dynStyles.cellOuter}>
                      <div style={{
                        ...dynStyles.cell,
                        background: player ? COLORS[player].gradient : "rgba(255,255,255,0.04)",
                        boxShadow: player
                          ? isWin ? `0 0 24px 8px ${COLORS[player].shadow}, inset 0 -3px 8px rgba(0,0,0,0.2)`
                                   : `0 4px 16px ${COLORS[player].shadow}60, inset 0 -3px 6px rgba(0,0,0,0.15)`
                          : "inset 0 2px 8px rgba(0,0,0,0.25)",
                        animation: isDropping ? "dropIn 0.42s cubic-bezier(0.22,1.2,0.36,1) forwards"
                                 : isWin ? "winPulse 0.7s ease-in-out infinite" : "none",
                        border: isWin ? `2.5px solid ${COLORS[player].fill}` : "2px solid rgba(255,255,255,0.06)",
                        transform: isWin ? "scale(1.08)" : "scale(1)",
                      }} />
                    </div>
                  );
                }))}
              </div>
            </div>
          </div>

          {/* Status banner */}
          {(winResult || draw) && (
            <div style={{ ...styles.banner, animation: "floatIn 0.4s ease forwards" }}>
              {winResult ? (
                <><span style={{ fontSize: 28 }}>🎉</span>
                  <span style={{ color: COLORS[winResult].fill, fontWeight: 900, fontSize: 20 }}>{config.names[winResult]} gewinnt!</span>
                  <span style={{ fontSize: 28 }}>🎉</span></>
              ) : (
                <><span style={{ fontSize: 24 }}>🤝</span>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Unentschieden!</span></>
              )}
            </div>
          )}

          {/* Buttons */}
          <div style={styles.btnRow}>
            <button className="action-btn" onClick={resetGame}
              style={{ ...styles.actionBtn, background: "linear-gradient(135deg, #FF9CC2, #7EC8E3)", color: "#1a1228" }}>
              🔄 Neues Spiel
            </button>
            <button className="action-btn" onClick={handleUndo}
              disabled={history.length === 0 || animatingDrop}
              style={{ ...styles.actionBtn, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.15)" }}>
              ↩ Rückgängig
            </button>
            <button className="action-btn" onClick={goToSetup}
              style={{ ...styles.actionBtn, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)", border: "1.5px solid rgba(255,255,255,0.15)" }}>
              ⚙ Einstellungen
            </button>
          </div>

          {/* Turn indicator */}
          {!winResult && !draw && gameStarted && (
            <div style={styles.turnHint}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: COLORS[currentPlayer].gradient, display: "inline-block", marginRight: 8, boxShadow: `0 0 10px ${COLORS[currentPlayer].shadow}` }} />
              <span style={{ color: COLORS[currentPlayer].fill }}>{config.names[currentPlayer]}</span>
              <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 6 }}>ist dran – klick auf eine Spalte!</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SetupScreen({ setupConfig, setSetupConfig, onStart }) {
  const update = (patch) => setSetupConfig(c => ({ ...c, ...patch }));
  const updateName = (color, name) => setSetupConfig(c => ({ ...c, names: { ...c.names, [color]: name } }));

  const pill = (selected, accent) => ({
    ...styles.pillBtn,
    background: selected ? `linear-gradient(135deg, ${accent}33, ${accent}22)` : "rgba(255,255,255,0.05)",
    border: selected ? `2px solid ${accent}` : "2px solid rgba(255,255,255,0.1)",
    color: selected ? accent : "rgba(255,255,255,0.6)",
  });

  return (
    <div style={styles.setupCard}>
      {/* Board size */}
      <div style={styles.setupSection}>
        <div style={styles.setupLabel}>Spielfeldgröße</div>
        <div style={styles.setupOptions}>
          {Object.entries(BOARD_SIZES).map(([key, size]) => (
            <button key={key} className="pill-btn"
              onClick={() => update({ sizeKey: key, rows: size.rows, cols: size.cols })}
              style={pill(setupConfig.sizeKey === key, "#FF9CC2")}>
              <div style={{ fontWeight: 800 }}>{size.label}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{size.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Player names */}
      <div style={styles.setupSection}>
        <div style={styles.setupLabel}>Spielernamen</div>
        <div style={styles.setupOptions}>
          {[PLAYER1, PLAYER2].map(p => (
            <div key={p} style={styles.nameField}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: COLORS[p].gradient, boxShadow: `0 0 8px ${COLORS[p].shadow}`, flexShrink: 0 }} />
              <input className="name-input" value={setupConfig.names[p]}
                maxLength={14}
                placeholder={COLORS[p].label}
                onChange={e => updateName(p, e.target.value)}
                style={styles.nameInput} />
            </div>
          ))}
        </div>
      </div>

      <button className="action-btn" onClick={onStart}
        style={{ ...styles.actionBtn, ...styles.startBtn, background: "linear-gradient(135deg, #FF9CC2, #7EC8E3)", color: "#1a1228" }}>
        ▶ Spiel starten
      </button>
    </div>
  );
}

const styles = {
  root: { minHeight: "100vh", background: "linear-gradient(145deg, #1a1228 0%, #211535 50%, #151c30 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px 40px", fontFamily: "'Nunito', sans-serif", position: "relative", overflow: "hidden" },
  blob1: { position: "absolute", top: -80, left: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,111,168,0.12) 0%, transparent 70%)", pointerEvents: "none" },
  blob2: { position: "absolute", bottom: -60, right: -60, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(74,172,204,0.12) 0%, transparent 70%)", pointerEvents: "none" },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 100, background: "rgba(10,6,20,0.78)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "linear-gradient(160deg, #2a1f45 0%, #1e1638 100%)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "32px 36px", textAlign: "center", maxWidth: 360, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" },
  modalBtn: { border: "none", borderRadius: 50, padding: "11px 24px", fontWeight: 900, fontSize: 14, fontFamily: "'Nunito', sans-serif", cursor: "pointer", letterSpacing: "0.04em" },
  titleArea: { marginBottom: 4, animation: "fadeUp 0.6s ease both" },
  title: { fontSize: "clamp(26px, 6vw, 42px)", fontWeight: 900, letterSpacing: "0.18em", margin: 0, textShadow: "0 2px 20px rgba(0,0,0,0.5)" },
  saveBar: { height: 26, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  saveChip: { fontSize: 12, fontWeight: 700, padding: "3px 12px", borderRadius: 50, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" },
  saveChipOk: { background: "rgba(126,200,227,0.13)", color: "#7EC8E3", border: "1px solid rgba(126,200,227,0.25)" },
  scoreRow: { display: "flex", gap: "clamp(8px, 3vw, 16px)", marginBottom: 20, animation: "fadeUp 0.65s ease both" },
  scoreCard: { padding: "12px clamp(12px, 4vw, 22px)", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: "clamp(96px, 30vw, 110px)", transition: "border 0.25s, background 0.25s" },
  scoreLabel: { fontWeight: 800, fontSize: "clamp(12px, 3.4vw, 14px)", letterSpacing: "0.05em", whiteSpace: "nowrap", maxWidth: "30vw", overflow: "hidden", textOverflow: "ellipsis" },
  scoreNum: { fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1 },
  boardWrapper: { animation: "fadeUp 0.7s ease both", filter: "drop-shadow(0 20px 60px rgba(0,0,0,0.5))", maxWidth: "100%" },
  board: { background: "linear-gradient(160deg, #2a1f45 0%, #1e1638 100%)", borderRadius: 24, padding: "8px 10px 14px", border: "2px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)" },
  banner: { marginTop: 20, display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 28px", backdropFilter: "blur(10px)", textAlign: "center", flexWrap: "wrap", justifyContent: "center" },
  btnRow: { marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", animation: "fadeUp 0.8s ease both" },
  actionBtn: { border: "none", borderRadius: 50, padding: "12px 22px", fontWeight: 900, fontSize: "clamp(12px, 3.4vw, 14px)", fontFamily: "'Nunito', sans-serif", cursor: "pointer", letterSpacing: "0.04em", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" },
  turnHint: { marginTop: 14, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.9, animation: "fadeUp 0.85s ease both", textAlign: "center", flexWrap: "wrap" },

  // Setup screen
  setupCard: { background: "linear-gradient(160deg, #2a1f45 0%, #1e1638 100%)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "24px clamp(16px, 5vw, 32px)", width: "min(92vw, 420px)", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", animation: "fadeUp 0.65s ease both" },
  setupSection: { marginBottom: 18 },
  setupLabel: { fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,0.55)", letterSpacing: "0.06em", marginBottom: 8, textTransform: "uppercase" },
  setupOptions: { display: "flex", gap: 8, flexWrap: "wrap" },
  pillBtn: { borderRadius: 14, padding: "10px 14px", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 13, flex: "1 1 auto", textAlign: "center", minWidth: 78 },
  nameField: { display: "flex", alignItems: "center", gap: 8, flex: "1 1 140px" },
  nameInput: { flex: 1, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 10px", color: "#fff", fontSize: 13, fontWeight: 700, minWidth: 0 },
  startBtn: { width: "100%", padding: "14px 22px", fontSize: 15, marginTop: 4 },
};
