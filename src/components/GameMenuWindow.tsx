import React, { useEffect, useMemo, useState } from 'react';

type GameId = 'menu' | 'dice' | 'tictactoe' | 'connect4' | 'blackjack';
type Turn = { dice: number[]; locked: boolean[]; rolls: number; score: number | null };
type TicCell = 'X' | 'O' | null;
type ConnectCell = 'player' | 'cpu' | null;

const freshTurn = (): Turn => ({ dice: [1, 1, 1, 1, 1], locked: [false, false, false, false, false], rolls: 0, score: null });
const rollDie = () => Math.floor(Math.random() * 6) + 1;

function GameHeader({ eyebrow, title, onMenu, status }: { eyebrow: string; title: string; onMenu: () => void; status?: string }) {
  return <header className="gb-arcade-header"><div><span>{eyebrow}</span><h1>{title}</h1></div><div className="gb-arcade-header-actions">{status ? <strong>{status}</strong> : null}<button type="button" onClick={onMenu}>Game Menu</button></div></header>;
}

function lockShipCaptainCrew(dice: number[], previous: boolean[]) {
  const locked = [...previous];
  const lockFirst = (value: number) => {
    const index = dice.findIndex((die, dieIndex) => die === value && !locked[dieIndex]);
    if (index >= 0) locked[index] = true;
    return index >= 0;
  };
  const hasShip = locked.some((isLocked, index) => isLocked && dice[index] === 6) || lockFirst(6);
  const hasCaptain = hasShip && (locked.some((isLocked, index) => isLocked && dice[index] === 5) || lockFirst(5));
  if (hasCaptain) locked.some((isLocked, index) => isLocked && dice[index] === 4) || lockFirst(4);
  return locked;
}

function scoreTurn(turn: Turn) {
  const lockedValues = turn.dice.filter((_, index) => turn.locked[index]);
  if (![6, 5, 4].every(value => lockedValues.includes(value))) return 0;
  return turn.dice.reduce((sum, die, index) => sum + (turn.locked[index] ? 0 : die), 0);
}

function computerTurn() {
  let turn = freshTurn();
  for (let roll = 0; roll < 3; roll += 1) {
    const dice = turn.dice.map((die, index) => turn.locked[index] ? die : rollDie());
    const locked = lockShipCaptainCrew(dice, turn.locked);
    turn = { dice, locked, rolls: roll + 1, score: null };
  }
  return scoreTurn(turn);
}

function DiceGame({ onMenu }: { onMenu: () => void }) {
  const [round, setRound] = useState(1);
  const [turn, setTurn] = useState<Turn>(freshTurn);
  const [playerScores, setPlayerScores] = useState<number[]>([]);
  const [computerScores, setComputerScores] = useState<number[]>([]);
  const finished = round > 5;
  const totals = useMemo(() => ({ player: playerScores.reduce((a, b) => a + b, 0), computer: computerScores.reduce((a, b) => a + b, 0) }), [computerScores, playerScores]);

  const roll = () => {
    if (finished || turn.rolls >= 3 || turn.score != null) return;
    const dice = turn.dice.map((die, index) => turn.locked[index] ? die : rollDie());
    const locked = lockShipCaptainCrew(dice, turn.locked);
    const rolls = turn.rolls + 1;
    setTurn({ dice, locked, rolls, score: rolls === 3 ? scoreTurn({ dice, locked, rolls, score: null }) : null });
  };

  const finishRound = () => {
    const player = turn.score ?? scoreTurn(turn);
    setPlayerScores(scores => [...scores, player]);
    setComputerScores(scores => [...scores, computerTurn()]);
    setRound(value => value + 1);
    setTurn(freshTurn());
  };

  const reset = () => { setRound(1); setTurn(freshTurn()); setPlayerScores([]); setComputerScores([]); };
  const hasSet = [6, 5, 4].every(value => turn.dice.some((die, index) => die === value && turn.locked[index]));

  return <main className="gb-dice-game">
    <GameHeader eyebrow="GADGETBOY ARCADE" title="Ship, Captain & Crew" onMenu={onMenu} status={finished ? 'Final' : `Round ${round} / 5`} />
    <section className="gb-dice-scoreboard"><div><span>You</span><strong>{totals.player}</strong></div><div><span>Gidget CPU</span><strong>{totals.computer}</strong></div></section>
    <section className="gb-dice-table">
      <div className="gb-dice-objective"><span className={turn.locked.some((locked, index) => locked && turn.dice[index] === 6) ? 'ready' : ''}>6 Ship</span><span className={turn.locked.some((locked, index) => locked && turn.dice[index] === 5) ? 'ready' : ''}>5 Captain</span><span className={turn.locked.some((locked, index) => locked && turn.dice[index] === 4) ? 'ready' : ''}>4 Crew</span></div>
      <div className="gb-dice-row">{turn.dice.map((die, index) => <div key={index} className={`gb-die${turn.locked[index] ? ' locked' : ''}`} aria-label={`${die}${turn.locked[index] ? ', secured' : ''}`}>{die}</div>)}</div>
      <p>{finished ? (totals.player === totals.computer ? 'Tie game.' : totals.player > totals.computer ? 'You rule the high seas.' : 'Gidget takes this voyage.') : turn.rolls === 0 ? 'Secure 6, then 5, then 4. Your remaining dice are cargo.' : hasSet ? `Cargo: ${scoreTurn(turn)} points` : `${3 - turn.rolls} roll${3 - turn.rolls === 1 ? '' : 's'} remaining`}</p>
      <div className="gb-dice-actions">{finished ? <button type="button" onClick={reset}>Play Again</button> : <><button type="button" onClick={roll} disabled={turn.rolls >= 3 || turn.score != null}>Roll Dice</button><button type="button" className="secondary" onClick={finishRound} disabled={turn.rolls === 0}>{turn.rolls >= 3 || turn.score != null ? 'Score Round' : 'Keep Score'}</button></>}</div>
    </section>
    <footer>{playerScores.map((score, index) => <span key={index}>R{index + 1}: {score} - {computerScores[index] ?? '-'}</span>)}</footer>
  </main>;
}

const ticLines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function ticWinner(board: TicCell[]) {
  for (const [a, b, c] of ticLines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return board.every(Boolean) ? 'draw' : null;
}

function ticMinimax(board: TicCell[], maximizing: boolean): number {
  const winner = ticWinner(board);
  if (winner === 'O') return 10;
  if (winner === 'X') return -10;
  if (winner === 'draw') return 0;
  const scores: number[] = [];
  board.forEach((cell, index) => {
    if (cell) return;
    const next = [...board];
    next[index] = maximizing ? 'O' : 'X';
    scores.push(ticMinimax(next, !maximizing));
  });
  return maximizing ? Math.max(...scores) : Math.min(...scores);
}

function bestTicMove(board: TicCell[]) {
  let bestScore = -Infinity;
  let bestMove = -1;
  board.forEach((cell, index) => {
    if (cell) return;
    const next = [...board];
    next[index] = 'O';
    const score = ticMinimax(next, false);
    if (score > bestScore) { bestScore = score; bestMove = index; }
  });
  return bestMove;
}

function TicTacToeGame({ onMenu }: { onMenu: () => void }) {
  const [board, setBoard] = useState<TicCell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'player' | 'cpu'>('player');
  const winner = ticWinner(board);
  useEffect(() => {
    if (turn !== 'cpu' || winner) return;
    const timer = window.setTimeout(() => {
      const move = bestTicMove(board);
      if (move >= 0) setBoard(current => current.map((cell, index) => index === move ? 'O' : cell));
      setTurn('player');
    }, 260);
    return () => window.clearTimeout(timer);
  }, [board, turn, winner]);
  const reset = () => { setBoard(Array(9).fill(null)); setTurn('player'); };
  const status = winner === 'X' ? 'You win' : winner === 'O' ? 'CPU wins' : winner === 'draw' ? 'Draw' : turn === 'cpu' ? 'CPU thinking' : 'Your move';
  return <main className="gb-arcade-game"><GameHeader eyebrow="UNBEATABLE CPU" title="Tic-Tac-Toe" onMenu={onMenu} status={status} /><section className="gb-tic-board">{board.map((cell, index) => <button key={index} type="button" disabled={!!cell || !!winner || turn === 'cpu'} onClick={() => { const next = [...board]; next[index] = 'X'; setBoard(next); setTurn('cpu'); }} aria-label={`Square ${index + 1}${cell ? `, ${cell}` : ''}`}>{cell}</button>)}</section><button type="button" className="gb-arcade-primary" onClick={reset}>New Game</button></main>;
}

const freshConnectBoard = (): ConnectCell[][] => Array.from({ length: 6 }, () => Array(7).fill(null));
function connectWinner(board: ConnectCell[][]) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (let row = 0; row < 6; row += 1) for (let col = 0; col < 7; col += 1) {
    const cell = board[row][col];
    if (!cell) continue;
    for (const [dr, dc] of directions) if ([0,1,2,3].every(step => board[row + dr * step]?.[col + dc * step] === cell)) return cell;
  }
  return board[0].every(Boolean) ? 'draw' : null;
}

function dropConnect(board: ConnectCell[][], column: number, cell: Exclude<ConnectCell, null>) {
  const next = board.map(row => [...row]);
  for (let row = 5; row >= 0; row -= 1) if (!next[row][column]) { next[row][column] = cell; return next; }
  return null;
}

function bestConnectMove(board: ConnectCell[][]) {
  const valid = [0,1,2,3,4,5,6].filter(column => !board[0][column]);
  for (const column of valid) if (connectWinner(dropConnect(board, column, 'cpu')!) === 'cpu') return column;
  for (const column of valid) if (connectWinner(dropConnect(board, column, 'player')!) === 'player') return column;
  const scored = valid.map(column => {
    const next = dropConnect(board, column, 'cpu')!;
    let score = 7 - Math.abs(3 - column) * 2;
    for (let row = 0; row < 6; row += 1) for (let col = 0; col < 7; col += 1) if (next[row][col] === 'cpu') {
      if (next[row]?.[col - 1] === 'cpu' || next[row]?.[col + 1] === 'cpu') score += 2;
      if (next[row + 1]?.[col] === 'cpu') score += 2;
    }
    return { column, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.column ?? -1;
}

function ConnectFourGame({ onMenu }: { onMenu: () => void }) {
  const [board, setBoard] = useState<ConnectCell[][]>(freshConnectBoard);
  const [turn, setTurn] = useState<'player' | 'cpu'>('player');
  const winner = connectWinner(board);
  useEffect(() => {
    if (turn !== 'cpu' || winner) return;
    const timer = window.setTimeout(() => {
      const column = bestConnectMove(board);
      if (column >= 0) setBoard(current => dropConnect(current, column, 'cpu') || current);
      setTurn('player');
    }, 320);
    return () => window.clearTimeout(timer);
  }, [board, turn, winner]);
  const reset = () => { setBoard(freshConnectBoard()); setTurn('player'); };
  const status = winner === 'player' ? 'You win' : winner === 'cpu' ? 'CPU wins' : winner === 'draw' ? 'Draw' : turn === 'cpu' ? 'CPU thinking' : 'Choose a column';
  return <main className="gb-arcade-game"><GameHeader eyebrow="TACTICAL CPU" title="Connect Four" onMenu={onMenu} status={status} /><section className="gb-connect-board" aria-label="Connect Four board">{board.map((row, rowIndex) => row.map((cell, colIndex) => <button key={`${rowIndex}-${colIndex}`} type="button" disabled={turn === 'cpu' || !!winner || !!board[0][colIndex]} className={cell || ''} aria-label={`Column ${colIndex + 1}${cell ? `, ${cell}` : ''}`} onClick={() => { const next = dropConnect(board, colIndex, 'player'); if (next) { setBoard(next); setTurn('cpu'); } }}><i /></button>))}</section><button type="button" className="gb-arcade-primary" onClick={reset}>New Game</button></main>;
}

const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const drawCard = () => ranks[Math.floor(Math.random() * ranks.length)];
function handValue(hand: string[]) {
  let total = hand.reduce((sum, card) => sum + (card === 'A' ? 11 : ['J','Q','K'].includes(card) ? 10 : Number(card)), 0);
  let aces = hand.filter(card => card === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

function BlackjackGame({ onMenu }: { onMenu: () => void }) {
  const deal = () => ({ player: [drawCard(), drawCard()], dealer: [drawCard(), drawCard()] });
  const initial = useMemo(deal, []);
  const [player, setPlayer] = useState(initial.player);
  const [dealer, setDealer] = useState(initial.dealer);
  const [done, setDone] = useState(false);
  const playerValue = handValue(player);
  const dealerValue = handValue(dealer);
  const result = !done ? 'Your move' : playerValue > 21 ? 'Dealer wins' : dealerValue > 21 || playerValue > dealerValue ? 'You win' : playerValue === dealerValue ? 'Push' : 'Dealer wins';
  const reset = () => { const next = deal(); setPlayer(next.player); setDealer(next.dealer); setDone(false); };
  const hit = () => {
    const next = [...player, drawCard()];
    setPlayer(next);
    if (handValue(next) > 21) setDone(true);
  };
  const stand = () => {
    const next = [...dealer];
    while (handValue(next) < 17) next.push(drawCard());
    setDealer(next);
    setDone(true);
  };
  return <main className="gb-arcade-game"><GameHeader eyebrow="HOUSE-RULE CPU" title="Blackjack" onMenu={onMenu} status={result} /><section className="gb-blackjack-table"><div><span>Dealer {done ? `- ${dealerValue}` : ''}</span><div className="gb-card-row">{dealer.map((card, index) => <b key={index} className={index === 1 && !done ? 'hidden-card' : ''}>{index === 1 && !done ? '?' : card}</b>)}</div></div><div><span>You - {playerValue}</span><div className="gb-card-row">{player.map((card, index) => <b key={index}>{card}</b>)}</div></div><div className="gb-blackjack-actions">{done ? <button type="button" onClick={reset}>Deal Again</button> : <><button type="button" onClick={hit}>Hit</button><button type="button" className="secondary" onClick={stand}>Stand</button></>}</div></section></main>;
}

const games: Array<{ id: Exclude<GameId, 'menu'>; title: string; description: string; tone: string }> = [
  { id: 'dice', title: 'Ship, Captain & Crew', description: 'Five rounds against Gidget. Secure 6, 5, and 4 before scoring cargo.', tone: 'green' },
  { id: 'tictactoe', title: 'Tic-Tac-Toe', description: 'Face a minimax CPU that reads every possible board outcome.', tone: 'purple' },
  { id: 'connect4', title: 'Connect Four', description: 'Build a four-chip line before the tactical CPU blocks or counters.', tone: 'blue' },
  { id: 'blackjack', title: 'Blackjack', description: 'Play to 21 against a dealer CPU that hits through 16 and stands on 17.', tone: 'red' },
];

export default function GameMenuWindow() {
  const [game, setGame] = useState<GameId>('menu');
  if (game === 'dice') return <DiceGame onMenu={() => setGame('menu')} />;
  if (game === 'tictactoe') return <TicTacToeGame onMenu={() => setGame('menu')} />;
  if (game === 'connect4') return <ConnectFourGame onMenu={() => setGame('menu')} />;
  if (game === 'blackjack') return <BlackjackGame onMenu={() => setGame('menu')} />;
  return <main className="gb-game-menu"><header><span>SECRET SYSTEM UNLOCKED</span><h1>GAME MENU</h1><p>Pick a quick game. Scores stay inside this window and never touch shop records.</p></header><section className="gb-game-grid">{games.map(entry => <button key={entry.id} type="button" className={`tone-${entry.tone}`} onClick={() => setGame(entry.id)}><strong>{entry.title}</strong><span>{entry.description}</span></button>)}</section></main>;
}
