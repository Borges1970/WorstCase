// client/src/App.js — Geeky Hobbies rules client
import React, { useEffect, useMemo, useState } from 'react';
import io from 'socket.io-client';
import { motion } from 'framer-motion';

const SERVER = process.env.REACT_APP_SERVER || 'http://localhost:4000';
const socket = io(SERVER, { transports: ['websocket'] });

const spinnerLabel = (s) => ({
  normal: 'Normal Scoring (1 point per correct match)',
  double: 'Double Points (×2)',
  triple: 'Triple Points (×3)',
  bonusMatch1: 'Bad Is Good! (+1 if you matched the Victim’s #1 chip)',
  scoreYourChips: 'Score Your Chips! (score equals chip numbers for each match)'
}[s] || s);

export default function App(){
  const [name, setName] = useState('Player');
  const [roomId, setRoomId] = useState('');
  const [me, setMe] = useState(null);

  const [room, setRoom] = useState(null);
  const [chat, setChat] = useState([]);
  const [msg, setMsg] = useState('');

  // Victim-only ranking state
  const [iAmVictim, setIAmVictim] = useState(false);
  const [victimNeedsRanking, setVictimNeedsRanking] = useState(false);
  const [victimRanking, setVictimRanking] = useState([null,null,null,null,null]);

  // Non-victim chip placement
  const [myGuess, setMyGuess] = useState([null,null,null,null,null]);

  // Reveal payload from server
  const [reveal, setReveal] = useState(null);

  const myId = me?.id;

  useEffect(() => {
    socket.on('connect', () => setMe({ id: socket.id }));
    socket.on('roomCreated', ({ roomId, room }) => { setRoomId(roomId); setRoom(room); });
    socket.on('roomUpdate', (r) => setRoom(r));
    socket.on('chatUpdate', (c) => setChat(c));

    // Round lifecycle
    socket.on('roundStarted', ({ room }) => {
      setRoom(room);
      setReveal(null);
      setVictimNeedsRanking(false);
      setVictimRanking([null,null,null,null,null]);
      setMyGuess([null,null,null,null,null]);
      setIAmVictim(room.players?.[room.victimIdx]?.id === socket.id);
    });

    socket.on('youAreVictim', ({ requireRanking }) => {
      setIAmVictim(true);
      setVictimNeedsRanking(!!requireRanking);
    });

    socket.on('placingBegan', ({ room }) => {
      setRoom(room);
      setVictimNeedsRanking(false);
      setIAmVictim(room.players?.[room.victimIdx]?.id === socket.id);
    });

    socket.on('reveal', (payload) => {
      setReveal(payload);
    });

    socket.on('gameOver', (payload) => {
      setReveal(null);
      setRoom(r => ({ ...(r||{}), stage: 'finished', final: payload }));
    });

    return () => socket.off();
  }, []);

  const isHost = useMemo(() => {
    if (!room || !room.players) return false;
    // the server tracks host, but public snapshot doesn’t include host—only host can press Start in practice
    // If you prefer, you can expose room.host in publicRoom(). For now, allow anyone to start.
    return true;
  }, [room]);

  function createRoom(){ socket.emit('createRoom', { name }); }
  function joinRoom(){ socket.emit('joinRoom', { roomId, name }); }
  function startGame(){ socket.emit('startGame', { roomId }); }
  function sendMessage(){
    if (!msg.trim()) return;
    socket.emit('sendChat', { roomId, message: msg.trim() });
    setMsg('');
  }

  function submitVictimRanking(){
    // Must be a permutation of 1..5
    if (!isPerm15(victimRanking)) { alert('Assign each number 1–5 exactly once.'); return; }
    socket.emit('victimRanking', { roomId, ranking: victimRanking });
    setVictimNeedsRanking(false);
  }

  function submitGuess(){
    if (!isPerm15(myGuess)) { alert('Place chips 1–5 (each once).'); return; }
    socket.emit('placeGuess', { roomId, guess: myGuess });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto p-4">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-indigo-600">Worst-Case Scenario — Online</h1>
          <div className="text-sm text-slate-500">Room: <span className="font-mono">{roomId || '-'}</span></div>
        </header>

        {!room && (
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex flex-wrap gap-2 items-center">
              <input className="border rounded p-2" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/>
              <button className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700" onClick={createRoom}>Create Room</button>

              <input className="border rounded p-2 ml-4" value={roomId} onChange={e=>setRoomId(e.target.value)} placeholder="Room ID"/>
              <button className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700" onClick={joinRoom}>Join Room</button>
            </div>
          </div>
        )}

        {room && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Players & rounds */}
            <aside className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Players</div>
                <div className="text-sm text-slate-500">Round {room.roundIndex}/{room.roundsToPlay}</div>
              </div>
              <ul className="space-y-2">
                {room.players.map((p,idx) => (
                  <li key={p.id} className={`flex items-center justify-between rounded px-2 py-1 ${p.id===myId?'bg-indigo-50':''}`}>
                    <span className="truncate">
                      {idx===room.victimIdx ? '🎯 ' : ''}{p.avatar} {p.name}{p.id===myId?' (you)':''}
                    </span>
                    <span className="font-mono">{p.score}</span>
                  </li>
                ))}
              </ul>

              {room.stage === 'lobby' && isHost && (
                <button onClick={startGame} className="mt-3 w-full px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700">
                  Start Game
                </button>
              )}

              {(room.stage !== 'lobby' && room.spinner) && (
                <div className="mt-4 p-3 rounded bg-slate-100">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Spinner</div>
                  <div className="text-sm font-medium">{spinnerLabel(room.spinner)}</div>
                </div>
              )}
            </aside>

            {/* Center: table & actions */}
            <main className="bg-white rounded-xl shadow p-4 lg:col-span-2">
              {['victimRank','placing','reveal','finished'].includes(room.stage) && (
                <div className="mb-3">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Scenario Cards</div>
                  <ol className="mt-2 space-y-2">
                    {room.currentCards?.map((c, i) => (
                      <li key={i} className="p-3 rounded border bg-slate-50">{i+1}. {c}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Victim ranking UI */}
              {room.stage === 'victimRank' && iAmVictim && victimNeedsRanking && (
                <div>
                  <div className="font-semibold mb-2">You are the Victim — rank the cards (1 = least bad, 5 = worst). Use each number once.</div>
                  <RankGrid
                    values={victimRanking}
                    onChange={(idx, val) => setVictimRanking(setValAt(victimRanking, idx, val))}
                  />
                  <button
                    onClick={submitVictimRanking}
                    className="mt-3 px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
                    Submit Ranking
                  </button>
                </div>
              )}

              {room.stage === 'victimRank' && !iAmVictim && (
                <div className="text-sm text-slate-500">Victim is ranking the scenarios…</div>
              )}

              {/* Non-victim placement UI */}
              {room.stage === 'placing' && !iAmVictim && (
                <div>
                  <div className="font-semibold mb-2">Place your chips (1..5, once each) to match the Victim’s ranking.</div>
                  <RankGrid
                    values={myGuess}
                    onChange={(idx, val) => setMyGuess(setValAt(myGuess, idx, val))}
                  />
                  <button
                    onClick={submitGuess}
                    className="mt-3 px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
                    Submit Chips
                  </button>
                </div>
              )}

              {room.stage === 'placing' && iAmVictim && (
                <div className="text-sm text-slate-500">Waiting for all players to place their chips…</div>
              )}

              {/* Reveal */}
              {room.stage === 'reveal' && reveal && (
                <div>
                  <div className="font-semibold mb-2">Reveal</div>
                  <div className="space-y-3">
                    {reveal.cards.map((row) => (
                      <motion.div key={row.index} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="p-3 rounded border">
                        <div className="mb-1"><span className="font-medium">Card:</span> {row.text}</div>
                        <div className="mb-2">Victim’s rank: <span className="font-mono">{row.victimRank}</span></div>
                        <div className="text-sm">
                          {row.guesses.map(g => (
                            <div key={g.playerId}>
                              {playerName(room, g.playerId)} placed <span className="font-mono">{g.chipPlaced ?? '-'}</span> — {g.match ? '✅ match' : '❌'}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-4 p-3 rounded bg-slate-100">
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Round Scores</div>
                    <ul>
                      {reveal.roundScores.map(s => (
                        <li key={s.playerId}>
                          {s.avatar} {s.name}: +{s.gained} → <span className="font-mono">{s.total}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Finished */}
              {room.stage === 'finished' && (
                <div className="text-center">
                  <h2 className="text-2xl font-bold mb-2">Game Over</h2>
                  <div className="mb-2">Winner: <strong>{room.final?.winner?.avatar} {room.final?.winner?.name}</strong> with <span className="font-mono">{room.final?.winner?.score}</span> points</div>
                  <div className="mx-auto bg-slate-100 rounded p-3 inline-block text-left">
                    <div className="font-semibold mb-1">Final Scores</div>
                    <ul>
                      {room.final?.players?.map(p => (
                        <li key={p.id}>{p.avatar} {p.name}: <span className="font-mono">{p.score}</span></li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </main>

            {/* Chat */}
            <aside className="bg-white rounded-xl shadow p-4">
              <div className="font-semibold mb-2">Chat</div>
              <div className="h-60 overflow-y-auto border rounded p-2 mb-2 bg-slate-50">
                {chat.map((c,i)=>(
                  <div key={i} className="text-sm"><span className="mr-1">{c.avatar}</span><span className="font-medium">{c.player}:</span> {c.message}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="border rounded p-2 flex-1" value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Type a message"/>
                <button onClick={sendMessage} className="px-3 py-2 rounded bg-slate-800 text-white hover:bg-slate-900">Send</button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function setValAt(arr, idx, val){
  const v = parseInt(val,10); if (!Number.isFinite(v)) return arr;
  const next = [...arr];
  next[idx] = v || null;
  return next;
}
function isPerm15(a){
  if (!Array.isArray(a) || a.length !== 5) return false;
  const s = new Set(a);
  if (s.size !== 5) return false;
  for (const n of a) if (typeof n !== 'number' || n < 1 || n > 5) return false;
  return true;
}
function playerName(room, id){
  const p = room.players.find(x=>x.id===id);
  return p ? `${p.avatar} ${p.name}` : 'Unknown';
}

/** Ranking/Chips grid control */
function RankGrid({ values, onChange }){
  // 5 rows, each row select 1..5. Client-side we allow duplicates while editing;
  // validation happens on submit (must be permutation).
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
      {values.map((v, i) => (
        <div key={i} className="p-2 rounded border">
          <div className="text-xs text-slate-500 mb-1">Card {i+1}</div>
          <select
            className="border rounded p-2 w-full"
            value={v ?? ''}
            onChange={e => onChange(i, parseInt(e.target.value || '0',10))}
          >
            <option value="">—</option>
            <option value={1}>1 (least bad)</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5 (worst)</option>
          </select>
        </div>
      ))}
    </div>
  );
}
