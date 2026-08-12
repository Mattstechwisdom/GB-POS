import React, { useMemo, useState } from 'react';

type Turn = { dice: number[]; locked: boolean[]; rolls: number; score: number | null };

const freshTurn = (): Turn => ({ dice: [1, 1, 1, 1, 1], locked: [false, false, false, false, false], rolls: 0, score: null });
const rollDie = () => Math.floor(Math.random() * 6) + 1;

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

function DiceGame() {
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
    <header><div><span>GADGETBOY ARCADE</span><h1>Ship, Captain & Crew</h1></div><strong>{finished ? 'Final' : `Round ${round} / 5`}</strong></header>
    <section className="gb-dice-scoreboard"><div><span>You</span><strong>{totals.player}</strong></div><div><span>Gidget</span><strong>{totals.computer}</strong></div></section>
    <section className="gb-dice-table">
      <div className="gb-dice-objective"><span className={turn.locked.some((locked, index) => locked && turn.dice[index] === 6) ? 'ready' : ''}>6 Ship</span><span className={turn.locked.some((locked, index) => locked && turn.dice[index] === 5) ? 'ready' : ''}>5 Captain</span><span className={turn.locked.some((locked, index) => locked && turn.dice[index] === 4) ? 'ready' : ''}>4 Crew</span></div>
      <div className="gb-dice-row">{turn.dice.map((die, index) => <div key={index} className={`gb-die${turn.locked[index] ? ' locked' : ''}`} aria-label={`${die}${turn.locked[index] ? ', secured' : ''}`}>{die}</div>)}</div>
      <p>{finished ? (totals.player === totals.computer ? 'Tie game.' : totals.player > totals.computer ? 'You rule the high seas.' : 'Gidget takes this voyage.') : turn.rolls === 0 ? 'Secure 6, then 5, then 4. Your remaining dice are cargo.' : hasSet ? `Cargo: ${scoreTurn(turn)} points` : `${3 - turn.rolls} roll${3 - turn.rolls === 1 ? '' : 's'} remaining`}</p>
      <div className="gb-dice-actions">{finished ? <button type="button" onClick={reset}>Play Again</button> : <><button type="button" onClick={roll} disabled={turn.rolls >= 3 || turn.score != null}>Roll Dice</button><button type="button" className="secondary" onClick={finishRound} disabled={turn.rolls === 0}>{turn.rolls >= 3 || turn.score != null ? 'Score Round' : 'Keep Score'}</button></>}</div>
    </section>
    <footer>{playerScores.map((score, index) => <span key={index}>R{index + 1}: {score} - {computerScores[index] ?? '-'}</span>)}</footer>
  </main>;
}

export default function GameMenuWindow() {
  const [game, setGame] = useState<'menu' | 'dice'>('menu');
  if (game === 'dice') return <DiceGame />;
  return <main className="gb-game-menu"><header><span>SECRET SYSTEM UNLOCKED</span><h1>GAME MENU</h1><p>Pick a quick game. Scores stay inside this window and never touch shop records.</p></header><button type="button" onClick={() => setGame('dice')}><strong>Ship, Captain & Crew</strong><span>Five dice. Three rolls. Secure 6, 5, and 4 before scoring your cargo.</span></button></main>;
}
