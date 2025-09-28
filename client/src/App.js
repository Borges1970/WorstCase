// client/src/App.js — Geeky Hobbies rules client
import React, { useEffect, useMemo, useState } from 'react';
import io from 'socket.io-client';
import { motion } from 'framer-motion';

const SERVER = process.env.REACT_APP_SERVER || window.location.origin;
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
  const [shareableLink, setShareableLink] = useState('');

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
    // Check URL for room ID on component mount
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get('room');
    if (urlRoomId) {
      setRoomId(urlRoomId);
    }

    socket.on('connect', () => setMe({ id: socket.id }));
    socket.on('roomCreated', ({ roomId, room }) => {
      setRoomId(roomId);
      setRoom(room);
      const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      setShareableLink(link);
      // Update URL without page reload
      window.history.pushState({}, '', link);
    });
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

  function copyShareableLink(){
    navigator.clipboard.writeText(shareableLink).then(() => {
      alert('Room link copied to clipboard!');
    });
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

              {shareableLink && room.stage === 'lobby' && (
                <div className="mb-3 p-3 rounded bg-blue-50 border border-blue-200">
                  <div className="text-xs uppercase tracking-wider text-blue-600 mb-1">Share Room</div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 text-xs font-mono p-1 border rounded bg-white"
                      value={shareableLink}
                      readOnly
                    />
                    <button
                      onClick={copyShareableLink}
                      className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
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
              {['victimRank','placing','reveal','roundEnd','finished'].includes(room.stage) && (
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
                  <div className="font-semibold mb-4">You are the Victim — drag cards to rank them (1 = least bad, 5 = worst).</div>
                  <DragDropRanking
                    cards={room.currentCards}
                    ranking={victimRanking}
                    onChange={setVictimRanking}
                    mode="ranking"
                  />
                  <button
                    onClick={submitVictimRanking}
                    className="mt-4 px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
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
                  <div className="font-semibold mb-4">Drag chips (1-5) to cards to match the Victim's ranking.</div>
                  <DragDropRanking
                    cards={room.currentCards}
                    ranking={myGuess}
                    onChange={setMyGuess}
                    mode="chips"
                  />
                  <button
                    onClick={submitGuess}
                    className="mt-4 px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
                    Submit Chips
                  </button>
                </div>
              )}

              {room.stage === 'placing' && iAmVictim && (
                <div className="text-sm text-slate-500">Waiting for all players to place their chips…</div>
              )}

              {/* Round End Summary */}
              {room.stage === 'roundEnd' && room.roundEndData && (
                <div>
                  <div className="text-center mb-4">
                    <div className="text-xl font-bold text-emerald-600">Round {room.roundIndex - 1} Complete!</div>
                    <div className="text-sm text-slate-500 mt-1">Next round starting soon...</div>
                  </div>

                  <div className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-lg font-semibold mb-2 text-center">Round Scores</div>
                    <div className="grid gap-2">
                      {room.roundEndData.roundScores.map(s => (
                        <div key={s.playerId} className="flex justify-between items-center py-1">
                          <span>{s.avatar} {s.name}</span>
                          <div className="text-right">
                            <span className="text-emerald-600 font-medium">+{s.gained}</span>
                            <span className="mx-2">→</span>
                            <span className="font-mono font-bold">{s.total}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
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

/** Drag and Drop Ranking Interface */
function DragDropRanking({ cards, ranking, onChange, mode }) {
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedType, setDraggedType] = useState(null); // 'card' or 'chip'

  const handleDragStart = (e, item, type) => {
    setDraggedItem(item);
    setDraggedType(type);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropZone, dropIndex) => {
    e.preventDefault();

    if (draggedType === 'card') {
      // Dragging a card to a ranking position
      const newRanking = [...ranking];
      newRanking[draggedItem] = dropZone;
      onChange(newRanking);
    } else if (draggedType === 'chip') {
      // Dragging a chip to a card position
      const newRanking = [...ranking];
      newRanking[dropIndex] = draggedItem;
      onChange(newRanking);
    }

    setDraggedItem(null);
    setDraggedType(null);
  };

  const removeRanking = (cardIdx) => {
    const newRanking = [...ranking];
    newRanking[cardIdx] = null;
    onChange(newRanking);
  };

  const getRankingForCard = (cardIdx) => ranking[cardIdx];
  const getCardForRanking = (rank) => ranking.findIndex(r => r === rank);

  return (
    <div className="space-y-6">
      {/* Cards with assigned rankings */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-600">Scenario Cards</div>
        {cards.map((cardText, cardIdx) => (
          <div
            key={cardIdx}
            className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, null, cardIdx)}
          >
            <div className="text-sm font-medium text-slate-500 min-w-[60px]">
              Card {cardIdx + 1}:
            </div>
            <div className="flex-1 text-sm">{cardText}</div>

            {/* Drop zone for this card */}
            <div className="flex items-center gap-2">
              {getRankingForCard(cardIdx) ? (
                <div className="flex items-center gap-1">
                  <div className={`px-3 py-1 rounded-full text-white font-medium ${
                    mode === 'ranking'
                      ? getRankingForCard(cardIdx) === 1 ? 'bg-green-500' :
                        getRankingForCard(cardIdx) === 2 ? 'bg-yellow-500' :
                        getRankingForCard(cardIdx) === 3 ? 'bg-orange-500' :
                        getRankingForCard(cardIdx) === 4 ? 'bg-red-500' :
                        'bg-red-700'
                      : 'bg-blue-500'
                  }`}>
                    {mode === 'ranking' ? `Rank ${getRankingForCard(cardIdx)}` : `Chip ${getRankingForCard(cardIdx)}`}
                  </div>
                  <button
                    onClick={() => removeRanking(cardIdx)}
                    className="text-slate-400 hover:text-red-500 text-lg"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="px-3 py-1 border-2 border-dashed border-slate-300 rounded text-slate-400 text-sm">
                  Drop {mode === 'ranking' ? 'rank' : 'chip'} here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Available rankings/chips to drag */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-slate-600">
          {mode === 'ranking' ? 'Available Rankings' : 'Available Chips'}
        </div>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5].map(rank => {
            const isUsed = getCardForRanking(rank) !== -1;
            return (
              <div
                key={rank}
                draggable={!isUsed}
                onDragStart={(e) => handleDragStart(e, rank, 'chip')}
                className={`px-4 py-2 rounded-lg border-2 cursor-move select-none ${
                  isUsed
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : mode === 'ranking'
                      ? rank === 1 ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' :
                        rank === 2 ? 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100' :
                        rank === 3 ? 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100' :
                        rank === 4 ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100' :
                        'bg-red-50 border-red-400 text-red-800 hover:bg-red-100'
                      : 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {mode === 'ranking'
                  ? rank === 1 ? '1 (Least Bad)' :
                    rank === 5 ? '5 (Worst)' :
                    rank.toString()
                  : `Chip ${rank}`
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Legacy Ranking/Chips grid control - kept for fallback */
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
