// server/server.js — Worst-Case Scenario rules (Geeky Hobbies)
// Flow per round:
// 1) Victim chosen & spinner spun
// 2) Victim draws 5 cards and secretly ranks them 1..5 (least bad=1, worst=5)
// 3) All other players place chips 1..5 (one per card) guessing Victim's ranks
// 4) Reveal + score:
//    - Default: 1 point per correct chip
//    - Spinner mods: double, triple, bonus +1 if matched the #1 chip,
//      or special mode "scoreYourChips" (sum chip numbers for every match)
//    - Victim scores points equal to the highest non-victim score that round
// 5) Rotate Victim, next round
//
// Rounds: 3/4/6 players = 12 rounds; 5 players = 10 rounds
// (All players should be Victim the same number of times.)

const express = require('express');
const http = require('http');
const { nanoid } = require('nanoid');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });

// Serve static files from the React build directory
const clientBuildPath = path.resolve(__dirname, '../client/build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));

  // Serve React app for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;

// ---- load cards ----
const cardsPath = path.resolve(__dirname, '../data/cards.json');
let ALL_CARDS = [];
try {
  ALL_CARDS = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
} catch (e) {
  console.error('Failed to load cards.json; using placeholder.');
  ALL_CARDS = [
    'Placeholder scenario A',
    'Placeholder scenario B',
    'Placeholder scenario C',
    'Placeholder scenario D',
    'Placeholder scenario E',
  ];
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }
function makeDeck(){ return shuffle(Array.from(ALL_CARDS)); }
function avatar(){
  const icons=["🦊","🐸","🐵","🐼","🐯","🦁","🐨","🦄","🐶","🐱"];
  return icons[Math.floor(Math.random()*icons.length)];
}

function spinnerResult(){
  // Geeky Hobbies mentions: double, triple, bonus for matching #1, Score Your Chips!
  const opts = ['normal','double','triple','bonusMatch1','scoreYourChips'];
  return opts[Math.floor(Math.random()*opts.length)];
}

function roundsForPlayerCount(n){
  if (n === 5) return 10;
  // 3,4,6 players → 12 rounds (fallback default: 12)
  return 12;
}

function publicRoom(room){
  return {
    id: room.id,
    stage: room.stage, // lobby|spinning|selecting|cardReveal|reveal|roundEnd|finished
    spinner: room.spinner,
    roundIndex: room.roundIndex,
    roundsToPlay: room.roundsToPlay,
    victimIdx: room.victimIdx,
    players: room.players.map(p => ({
      id:p.id,
      name:p.name,
      avatar:p.avatar,
      score:p.score,
      status: room.playerStatus[p.id] || { hasSubmitted: false, role: null }
    })),
    currentCards: room.currentCards, // 5 card texts (public to all)
    roundEndData: room.roundEndData, // reveal data during pause
    revealData: room.revealData, // complete reveal data for card-by-card
    cardsRevealed: room.cardsRevealed, // which cards have been revealed
  };
}

const rooms = {}; // roomId -> room object

io.on('connection', (socket) => {
  // --- LOBBY ---
  socket.on('createRoom', ({ name }) => {
    const roomId = nanoid(6);
    const room = {
      id: roomId,
      host: socket.id,
      players: [],
      deck: makeDeck(),
      discards: [],
      stage: 'lobby',
      spinner: null,
      roundIndex: 0,
      roundsToPlay: 0,
      victimIdx: 0,
      currentCards: [],
      victimRanking: null,    // array[5] of 1..5 set by victim (index = cardIdx)
      guesses: {},           // playerId -> array[5] permutation 1..5
      roundEndData: null,    // stores reveal data during pause
      playerStatus: {},      // playerId -> { hasSubmitted: boolean, role: 'victim'|'guesser' }
      revealData: null,      // stores complete reveal data for card-by-card reveal
      cardsRevealed: [],     // array of card indices that have been revealed
    };
    rooms[roomId] = room;

    socket.join(roomId);
    const p = { id: socket.id, name: name || 'Player', avatar: avatar(), score: 0 };
    room.players.push(p);

    io.to(roomId).emit('roomUpdate', publicRoom(room));
    socket.emit('roomCreated', { roomId, room: publicRoom(room) });
  });

  socket.on('joinRoom', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg','Room not found');
    if (room.stage !== 'lobby') return socket.emit('errorMsg','Game already started');
    if (room.players.length >= 6) return socket.emit('errorMsg','Room full');

    socket.join(roomId);
    room.players.push({ id: socket.id, name: name || 'Player', avatar: avatar(), score: 0 });

    // Tell the joining player they successfully joined
    socket.emit('roomJoined', { roomId, room: publicRoom(room) });
    // Tell everyone else about the new player
    socket.to(roomId).emit('roomUpdate', publicRoom(room));
  });

  // --- START GAME ---
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    if (socket.id !== room.host) return socket.emit('errorMsg','Only host can start the game');
    if (room.players.length < 3) return socket.emit('errorMsg','Need 3–6 players');

    room.deck = makeDeck();
    room.discards = [];
    room.roundIndex = 1;
    room.victimIdx = 0;
    room.roundsToPlay = roundsForPlayerCount(room.players.length);
    startRound(room);
  });

  function startRound(room){
    if (room.deck.length < 5) {
      // reshuffle discards if needed
      room.deck.push(...shuffle(room.discards));
      room.discards.length = 0;
    }
    room.spinner = null; // Will be set when victim spins
    room.stage = 'spinning'; // Victim needs to spin first
    room.currentCards = room.deck.splice(0,5);
    room.victimRanking = null;
    room.guesses = {};

    // Initialize player status for this round
    room.playerStatus = {};
    room.players.forEach(player => {
      room.playerStatus[player.id] = {
        hasSubmitted: false,
        role: room.players[room.victimIdx].id === player.id ? 'victim' : 'guesser'
      };
    });

    io.to(room.id).emit('roundStarted', { room: publicRoom(room) });

    // DM the victim (who needs to spin the wheel)
    const victim = room.players[room.victimIdx];
    io.to(victim.id).emit('youAreVictim', {
      cards: room.currentCards,
      spinner: room.spinner,
      requireSpin: true
    });
  }

  // Victim spins the wheel
  socket.on('spinWheel', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    if (room.stage !== 'spinning') return;

    const victim = room.players[room.victimIdx];
    if (victim.id !== socket.id) return socket.emit('errorMsg','Only Victim can spin the wheel');

    // Generate spinner result
    room.spinner = spinnerResult();
    room.stage = 'selecting';

    // Notify everyone about the spinner result and start selection
    io.to(room.id).emit('spinComplete', {
      spinner: room.spinner,
      room: publicRoom(room)
    });

    // DM the victim (who now needs to rank)
    io.to(victim.id).emit('youAreVictim', {
      cards: room.currentCards,
      spinner: room.spinner,
      requireRanking: true
    });
  });

  // Victim submits secret ranking: array of 5 numbers (1..5), permutation
  socket.on('victimRanking', ({ roomId, ranking }) => {
    const room = rooms[roomId]; if (!room) return;
    if (room.stage !== 'selecting') return;

    const victim = room.players[room.victimIdx];
    if (victim.id !== socket.id) return socket.emit('errorMsg','Only Victim submits ranking');

    if (!isValidPerm15(ranking)) return socket.emit('errorMsg','Ranking must be a permutation of 1..5');
    room.victimRanking = ranking.slice();

    // Mark victim as submitted
    room.playerStatus[socket.id].hasSubmitted = true;

    // Send updated room data to show victim completion
    io.to(room.id).emit('roomUpdate', publicRoom(room));

    // Check if we can proceed to reveal
    checkForRoundCompletion(room);
  });

  // Non-victims submit their chip placements: array of 5 numbers 1..5 permutation
  socket.on('placeGuess', ({ roomId, guess }) => {
    const room = rooms[roomId]; if (!room) return;
    if (room.stage !== 'selecting') return;

    const victim = room.players[room.victimIdx];
    if (socket.id === victim.id) return socket.emit('errorMsg','Victim does not guess');

    if (!isValidPerm15(guess)) return socket.emit('errorMsg','Your guesses must be 1..5, used once each');
    room.guesses[socket.id] = guess.slice();

    // Mark player as submitted
    room.playerStatus[socket.id].hasSubmitted = true;

    // Send updated room data to show completion status
    io.to(room.id).emit('roomUpdate', publicRoom(room));

    // Check if we can proceed to reveal
    checkForRoundCompletion(room);
  });

  // Check if all players have submitted and we can start card reveal
  function checkForRoundCompletion(room) {
    const victim = room.players[room.victimIdx];
    const nonVictims = room.players.filter((_, idx) => idx !== room.victimIdx);

    const victimDone = room.victimRanking !== null;
    const allPlayersDone = nonVictims.every(p => room.guesses[p.id]);

    if (victimDone && allPlayersDone) {
      startCardReveal(room);
    }
  }

  // Start the card-by-card reveal phase
  function startCardReveal(room) {
    room.stage = 'cardReveal';
    room.cardsRevealed = [];

    // Pre-calculate all reveal data
    const victimId = room.players[room.victimIdx].id;
    const vRank = room.victimRanking;
    const cardCount = room.currentCards.length;

    const revealRows = [];
    for (let i = 0; i < cardCount; i++) {
      const victRankForCard = vRank[i];
      const row = {
        cardIdx: i,
        cardText: room.currentCards[i],
        victimRank: victRankForCard,
        playerResults: []
      };

      for (const pl of room.players) {
        if (pl.id === victimId) continue;
        const g = room.guesses[pl.id];
        const chipPlaced = g ? g[i] : null;
        const match = (chipPlaced === victRankForCard);
        row.playerResults.push({
          playerId: pl.id,
          playerName: pl.name,
          playerAvatar: pl.avatar,
          chipPlaced,
          match
        });
      }
      revealRows.push(row);
    }

    room.revealData = { cards: revealRows };

    // Notify everyone that card reveal phase has started
    io.to(room.id).emit('cardRevealStarted', { room: publicRoom(room) });

    // Tell victim they can start revealing cards
    const victim = room.players[room.victimIdx];
    io.to(victim.id).emit('youCanRevealCards', {
      room: publicRoom(room)
    });
  }

  // Victim reveals a specific card
  socket.on('revealCard', ({ roomId, cardIndex }) => {
    const room = rooms[roomId]; if (!room) return;
    if (room.stage !== 'cardReveal') return;

    const victim = room.players[room.victimIdx];
    if (victim.id !== socket.id) return socket.emit('errorMsg','Only Victim can reveal cards');

    if (room.cardsRevealed.includes(cardIndex)) return; // Already revealed
    if (cardIndex < 0 || cardIndex >= room.currentCards.length) return; // Invalid index

    // Mark card as revealed
    room.cardsRevealed.push(cardIndex);

    // Send the revealed card data to everyone
    const cardData = room.revealData.cards[cardIndex];
    io.to(room.id).emit('cardRevealed', {
      cardIndex,
      cardData,
      cardsRevealed: room.cardsRevealed,
      allCardsRevealed: room.cardsRevealed.length === room.currentCards.length
    });

    // If all cards revealed, proceed to final scoring
    if (room.cardsRevealed.length === room.currentCards.length) {
      setTimeout(() => {
        scoreAndReveal(room);
      }, 2000); // Brief pause before final score summary
    }
  });

  function scoreAndReveal(room){
    room.stage = 'reveal';

    // Per rules:
    // default: 1 point per correct match
    // spinner bonus:
    //   - 'double' → *2
    //   - 'triple' → *3
    //   - 'bonusMatch1' → +1 if matched the #1 chip (the card that Victim ranked 1)
    //   - 'scoreYourChips' → score = sum of chip numbers for each match (no double/triple/bonus)
    const victimId = room.players[room.victimIdx].id;
    const vRank = room.victimRanking; // length 5, numbers 1..5
    const cardCount = room.currentCards.length;

    const revealRows = []; // [{cardIdx, victimRank, guesses:[{playerId, match, chipPlaced}]}]
    const perPlayerRoundScore = {}; // playerId -> score

    // Build per-card reveal info & compute matches
    for (let i=0;i<cardCount;i++){
      const victRankForCard = vRank[i];
      const row = { cardIdx: i, victimRank: victRankForCard, guesses: [] };
      for (const pl of room.players) {
        if (pl.id === victimId) continue;
        const g = room.guesses[pl.id];
        const chipPlaced = g ? g[i] : null;
        const match = (chipPlaced === victRankForCard);
        row.guesses.push({ playerId: pl.id, chipPlaced, match });
      }
      revealRows.push(row);
    }

    // Compute scores per player
    for (const pl of room.players) {
      if (pl.id === victimId) continue; // victim later
      const g = room.guesses[pl.id];
      if (!g) { perPlayerRoundScore[pl.id] = 0; continue; }

      let score = 0;
      if (room.spinner === 'scoreYourChips') {
        // sum chip numbers for each match
        for (let i=0;i<cardCount;i++){
          if (g[i] === vRank[i]) score += g[i];
        }
      } else {
        // default 1 per match
        let matches = 0;
        for (let i=0;i<cardCount;i++){
          if (g[i] === vRank[i]) matches++;
        }
        score = matches;

        // bonus for matching the #1 chip (Victim's least bad)
        if (room.spinner === 'bonusMatch1') {
          // find the card that the Victim ranked 1
          const idxOfOne = vRank.findIndex(x => x === 1);
          if (idxOfOne !== -1 && g[idxOfOne] === 1) score += 1;
        }

        if (room.spinner === 'double') score *= 2;
        if (room.spinner === 'triple') score *= 3;
      }

      perPlayerRoundScore[pl.id] = score;
    }

    // Victim gets the highest non-victim score
    const topScore = Math.max(0, ...Object.values(perPlayerRoundScore));
    perPlayerRoundScore[victimId] = topScore;

    // Apply to totals
    for (const pl of room.players) {
      pl.score += perPlayerRoundScore[pl.id] || 0;
    }

    // Reveal payload
    const reveal = {
      spinner: room.spinner,
      cards: room.currentCards.map((text, idx) => ({
        index: idx,
        text,
        victimRank: vRank[idx],
        guesses: room.players
          .filter(p => p.id !== victimId)
          .map(p => ({
            playerId: p.id,
            playerName: p.name,
            chipPlaced: (room.guesses[p.id]||[])[idx],
            match: (room.guesses[p.id]||[])[idx] === vRank[idx]
          }))
      })),
      roundScores: room.players.map(p => ({
        playerId: p.id, name: p.name, avatar: p.avatar,
        gained: perPlayerRoundScore[p.id] || 0, total: p.score
      }))
    };

    io.to(room.id).emit('reveal', reveal);

    // Store reveal data for round end pause
    room.roundEndData = reveal;
    room.stage = 'roundEnd';

    // Cleanup & prepare next round
    room.discards.push(...room.currentCards);
    room.roundIndex += 1;
    room.victimIdx = (room.victimIdx + 1) % room.players.length;

    // Show round end summary for 5 seconds
    setTimeout(() => {
      if (room.roundIndex > room.roundsToPlay) {
        room.stage = 'finished';
        const sorted = [...room.players].sort((a,b)=>b.score-a.score);
        io.to(room.id).emit('gameOver', {
          players: sorted.map(p => ({ id:p.id, name:p.name, avatar:p.avatar, score:p.score })),
          winner: sorted[0]
        });
      } else {
        room.roundEndData = null; // Clear previous round data
        startRound(room);
        io.to(room.id).emit('roomUpdate', publicRoom(room));
      }
    }, 5000);
  }

  // Utility
  function isValidPerm15(arr){
    if (!Array.isArray(arr) || arr.length !== 5) return false;
    const seen = new Set(arr);
    if (seen.size !== 5) return false;
    for (const n of arr) if (typeof n !== 'number' || n < 1 || n > 5) return false;
    return true;
  }

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    for (const id in rooms) {
      const room = rooms[id];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx,1);
        if (room.players.length === 0) { delete rooms[id]; continue; }
        if (room.host === socket.id) room.host = room.players[0].id;
        if (room.victimIdx >= room.players.length) room.victimIdx = 0;
        io.to(id).emit('roomUpdate', publicRoom(room));
      }
    }
  });
});

server.listen(PORT, () => console.log('Server listening', PORT));
