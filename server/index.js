const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Game = require('./utils/gameLogic.js');
const GangSystem = require('./utils/gangSystem.js');
const SmartContractSystem = require('./utils/smartContracts.js');
const db = require('./db.js'); // ✅ استيراد قاعدة البيانات

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ========== البيانات المؤقتة (تم استبدال players بقاعدة بيانات) ==========
let waitingPlayers = [];         // قائمة اللاعبين المنتظرين (للبحث عن مباراة)
let activeGames = {};            // الألعاب النشطة (gameId -> Game object)
const gangSystem = new GangSystem(); // نظام العصابات
const contractSystem = new SmartContractSystem(); // نظام العقود الذكية

// ========== إدارة ربط socketId بمعرف اللاعب ==========
const socketToPlayer = new Map();   // socketId -> playerId
const playerToSocket = new Map();   // playerId -> socketId

// مفتاح سري (يُفضل وضعه في متغير بيئة)
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-it';

// ========== دوال مساعدة ==========
function getPlayerIdFromSocket(socketId) {
  return socketToPlayer.get(socketId) || null;
}

function getSocketIdFromPlayerId(playerId) {
  return playerToSocket.get(playerId) || null;
}

function registerSocket(socketId, playerId) {
  socketToPlayer.set(socketId, playerId);
  playerToSocket.set(playerId, socketId);
}

function unregisterSocket(socketId) {
  const playerId = socketToPlayer.get(socketId);
  if (playerId) {
    playerToSocket.delete(playerId);
  }
  socketToPlayer.delete(socketId);
}

// ========== WebSocket ==========
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // تسجيل الدخول عبر WebSocket (بعد المصادقة عبر REST)
  socket.on('authenticate', ({ playerId, token }) => {
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      if (decoded.id === playerId) {
        registerSocket(socket.id, playerId);
        socket.emit('authenticated', { success: true });
        console.log(`Player ${playerId} authenticated on socket ${socket.id}`);
      } else {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
      }
    } catch (err) {
      socket.emit('authenticated', { success: false, error: 'Authentication failed' });
    }
  });

  // انضمام لاعب للبحث عن مباراة
  socket.on('join-game', async ({ playerId }) => {
    try {
      const result = await db.query('SELECT id, username FROM players WHERE id = $1', [playerId]);
      if (result.rows.length === 0) {
        socket.emit('error', 'Player not found');
        return;
      }
      const player = result.rows[0];

      // إذا كان هناك لاعب منتظر
      if (waitingPlayers.length > 0) {
        const opponent = waitingPlayers.shift();
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        // إنشاء غرفة للمباراة
        socket.join(gameId);
        const opponentSocket = getSocketIdFromPlayerId(opponent.playerId);
        if (opponentSocket) {
          io.sockets.sockets.get(opponentSocket)?.join(gameId);
        }

        // إنشاء كائن اللعبة الجديد
        const game = new Game(playerId, opponent.playerId);
        game.startGame();
        activeGames[gameId] = game;

        // إرسال بداية المباراة لكل لاعب
        io.to(opponentSocket).emit('game-start', {
          gameId,
          opponent: player.username,
          yourTurn: (game.turn === opponent.playerId),
          state: game.getStateForPlayer(opponent.playerId)
        });

        io.to(socket.id).emit('game-start', {
          gameId,
          opponent: opponent.playerName,
          yourTurn: (game.turn === playerId),
          state: game.getStateForPlayer(playerId)
        });

        console.log(`Game started: ${playerId} vs ${opponent.playerId}`);
      } else {
        // لا يوجد لاعب منتظر، نضيف هذا اللاعب إلى قائمة الانتظار
        waitingPlayers.push({
          socketId: socket.id,
          playerId: playerId,
          playerName: player.username
        });
        socket.emit('waiting', 'جاري البحث عن خصم...');
      }
    } catch (err) {
      console.error(err);
      socket.emit('error', 'Database error');
    }
  });

  // تنفيذ نشاط إجرامي
  socket.on('perform-crime', ({ gameId, crimeType }) => {
    const game = activeGames[gameId];
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }

    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) {
      socket.emit('error', 'Player not authenticated');
      return;
    }

    const result = game.performCrime(playerId, crimeType);

    // إرسال النتيجة للاعب الحالي
    socket.emit('crime-result', result);

    // إرسال التحديث للاعب الخصم
    if (result.newState) {
      const opponentId = Object.keys(game.players).find(id => id !== playerId);
      const opponentSocket = getSocketIdFromPlayerId(opponentId);
      if (opponentSocket) {
        io.to(opponentSocket).emit('game-update', result.newState);
      }
    }
  });

  // إنهاء الدور
  socket.on('end-turn', ({ gameId }) => {
    const game = activeGames[gameId];
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }

    const playerId = getPlayerIdFromSocket(socket.id);
    if (!playerId) {
      socket.emit('error', 'Player not authenticated');
      return;
    }

    const result = game.endTurn(playerId);

    if (result.success) {
      // إرسال تحديث للاعب الجديد
      const newTurnPlayerSocket = getSocketIdFromPlayerId(result.newTurn);
      if (newTurnPlayerSocket) {
        io.to(newTurnPlayerSocket).emit('turn-notification', {
          message: 'إنه دورك الآن!',
          state: result.state
        });
      }

      // إعلام اللاعب القديم
      socket.emit('turn-ended', { message: result.message });
    } else {
      socket.emit('error', result.message);
    }
  });

  // قطع الاتصال
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    waitingPlayers = waitingPlayers.filter(p => p.socketId !== socket.id);
    unregisterSocket(socket.id);
    // TODO: التعامل مع انسحاب لاعب من مباراة نشطة
  });
});

// ========== مسارات API (REST) ==========

// تسجيل حساب جديد
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // التحقق من وجود المستخدم
    const existing = await db.query('SELECT id FROM players WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO players (username, password_hash, money, level, reputation) VALUES ($1, $2, 1000, 1, 0) RETURNING id, username, money, level',
      [username, hashedPassword]
    );
    const newPlayer = result.rows[0];

    res.status(201).json({
      message: 'Player created',
      player: { id: newPlayer.id, username: newPlayer.username, money: newPlayer.money, level: newPlayer.level }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await db.query('SELECT * FROM players WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const player = result.rows[0];
    const valid = await bcrypt.compare(password, player.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: player.id, username: player.username }, SECRET_KEY);
    res.json({
      token,
      player: {
        id: player.id,
        username: player.username,
        money: player.money,
        level: player.level,
        reputation: player.reputation
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// مسار محمي: الحصول على الملف الشخصي
app.get('/api/profile', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const result = await db.query('SELECT id, username, money, level FROM players WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Player not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ========== مسارات العصابات (Gang System) ==========
// ملاحظة: هذه المسارات لا تزال تستخدم gangSystem في الذاكرة.
// لتخزين العصابات في قاعدة البيانات، يجب تعديل gangSystem.js نفسه.
// سنقوم بذلك لاحقًا إذا أردت.

// إنشاء عصابة جديدة
app.post('/api/gangs/create', (req, res) => {
  const { playerId, gangName, playerName } = req.body;
  // ملاحظة: نحتاج للتحقق من وجود اللاعب في قاعدة البيانات
  // لكن gangSystem لا يزال في الذاكرة. سنتركه كما هو الآن.
  const result = gangSystem.createGang(playerId, gangName, playerName);
  res.json(result);
});

// إرسال دعوة للانضمام إلى عصابة
app.post('/api/gangs/invite', (req, res) => {
  const { gangId, leaderId, targetPlayerId, targetPlayerName } = req.body;
  const result = gangSystem.sendInvitation(gangId, leaderId, targetPlayerId, targetPlayerName);
  res.json(result);
});

// قبول دعوة
app.post('/api/gangs/accept', (req, res) => {
  const { playerId, gangId } = req.body;
  const result = gangSystem.acceptInvitation(playerId, gangId);
  res.json(result);
});

// الحصول على معلومات عصابة اللاعب
app.get('/api/gangs/player/:playerId', (req, res) => {
  const gang = gangSystem.getPlayerGang(req.params.playerId);
  if (gang) {
    res.json({ success: true, gang });
  } else {
    res.json({ success: false, message: 'اللاعب ليس عضواً في أي عصابة' });
  }
});

// الحصول على معلومات عصابة محددة
app.get('/api/gangs/:gangId', (req, res) => {
  const gang = gangSystem.getGangInfo(req.params.gangId);
  if (gang) {
    res.json({ success: true, gang });
  } else {
    res.status(404).json({ success: false, message: 'عصابة غير موجودة' });
  }
});

// الحصول على إحصائيات عصابة
app.get('/api/gangs/:gangId/stats', (req, res) => {
  const stats = gangSystem.getGangStats(req.params.gangId);
  if (stats) {
    res.json({ success: true, stats });
  } else {
    res.status(404).json({ success: false, message: 'عصابة غير موجودة' });
  }
});

// المساهمة في خزينة العصابة
app.post('/api/gangs/contribute', async (req, res) => {
  const { playerId, gangId, amount } = req.body;
  // التحقق من رصيد اللاعب في قاعدة البيانات
  try {
    const playerRes = await db.query('SELECT money FROM players WHERE id = $1', [playerId]);
    if (playerRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    const playerMoney = playerRes.rows[0].money;
    if (playerMoney < amount) {
      return res.json({ success: false, message: 'لا تملك هذا المبلغ' });
    }

    const result = gangSystem.contributeToGang(gangId, playerId, amount, 0);
    if (result.success) {
      // خصم المبلغ من اللاعب في قاعدة البيانات
      await db.query('UPDATE players SET money = money - $1 WHERE id = $2', [amount, playerId]);
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// ========== مسارات العقود الذكية (Smart Contracts) ==========
// ملاحظة: هذه المسارات لا تزال تستخدم contractSystem في الذاكرة.
// يمكن تعديلها لاحقًا لتستخدم قاعدة البيانات.

// إنشاء عقد جديد
app.post('/api/contracts/create', async (req, res) => {
  const { playerId, contractData } = req.body;
  try {
    // التحقق من رصيد اللاعب للضمان
    if (contractData.escrowAmount) {
      const playerRes = await db.query('SELECT money FROM players WHERE id = $1', [playerId]);
      if (playerRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Player not found' });
      }
      if (playerRes.rows[0].money < contractData.escrowAmount) {
        return res.json({ success: false, message: 'لا تملك المال الكافي للضمان' });
      }
    }

    const result = contractSystem.createContract(playerId, contractData);
    if (result.success && contractData.escrowAmount) {
      await db.query('UPDATE players SET money = money - $1 WHERE id = $2', [contractData.escrowAmount, playerId]);
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// قبول عقد
app.post('/api/contracts/accept', (req, res) => {
  const { playerId, contractId } = req.body;
  const result = contractSystem.acceptContract(contractId, playerId);
  res.json(result);
});

// رفض عقد
app.post('/api/contracts/reject', (req, res) => {
  const { playerId, contractId } = req.body;
  const result = contractSystem.rejectContract(contractId, playerId);
  res.json(result);
});

// تنفيذ عقد (إثبات)
app.post('/api/contracts/execute', async (req, res) => {
  const { playerId, contractId, proof } = req.body;
  const result = contractSystem.executeContract(contractId, playerId, proof);
  if (result.success && result.reward) {
    await db.query('UPDATE players SET money = money + $1 WHERE id = $2', [result.reward, playerId]);
  }
  res.json(result);
});

// إلغاء عقد
app.post('/api/contracts/cancel', async (req, res) => {
  const { playerId, contractId } = req.body;
  const result = contractSystem.cancelContract(contractId, playerId);
  if (result.success) {
    const contract = contractSystem.getContract(contractId);
    if (contract && contract.escrow.amount > 0 && contract.creator === playerId) {
      await db.query('UPDATE players SET money = money + $1 WHERE id = $2', [contract.escrow.amount, playerId]);
    }
  }
  res.json(result);
});

// الحصول على عقود لاعب معين
app.get('/api/contracts/player/:playerId', (req, res) => {
  const { filter } = req.query;
  const contracts = contractSystem.getPlayerContracts(req.params.playerId, filter || 'all');
  res.json(contracts);
});

// الحصول على تفاصيل عقد محدد
app.get('/api/contracts/:contractId', (req, res) => {
  const contract = contractSystem.getContract(req.params.contractId);
  if (contract) {
    res.json({ success: true, contract });
  } else {
    res.status(404).json({ success: false, message: 'Contract not found' });
  }
});

// الصفحة الرئيسية
app.get('/', (req, res) => res.send('The Underworld API'));

// بدء الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});