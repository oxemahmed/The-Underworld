// ============================================
// The-Underworld - Game Logic Engine
// ============================================
// هذا الملف يحتوي على القواعد الأساسية للعبة
// سنقوم بتوسيعه تدريجياً ليشمل كل الميزات
// ============================================

class Game {
  constructor(player1Id, player2Id) {
    this.players = {
      [player1Id]: this.createPlayer(player1Id),
      [player2Id]: this.createPlayer(player2Id)
    };
    this.turn = player1Id; // من يبدأ الدور
    this.phase = 'setup';   // مرحلة اللعبة (setup, main, battle, end)
    this.winner = null;
  }

  // إنشاء لاعب جديد
  createPlayer(id) {
    return {
      id: id,
      resources: {
        money: 1000,        // النقود
        reputation: 0,       // السمعة
        respect: 0          // النفوذ
      },
      gang: {
        name: '',           // اسم العصابة (يُختار لاحقاً)
        members: [],        // أعضاء العصابة
        territory: 0,       // الأراضي المسيطر عليها
        hideout: {          // الوكر
          level: 1,
          defense: 100
        }
      },
      activities: [],       // الأنشطة الحالية (مثل سرقة بنك، مهمة)
      contracts: [],        // العقود المبرمة مع لاعبين آخرين
      stats: {
        level: 1,
        xp: 0,
        crimes: 0,
        wins: 0,
        losses: 0
      }
    };
  }

  // بدء لعبة جديدة (عندما ينضم لاعبان)
  startGame() {
    this.phase = 'main';
    return {
      success: true,
      message: 'بدأت اللعبة!',
      state: this.getStateForPlayer(this.turn)
    };
  }

  // تنفيذ نشاط إجرامي
  performCrime(playerId, crimeType) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };
    
    // التحقق من أن الدور للاعب الحالي
    if (this.turn !== playerId) {
      return { success: false, message: 'ليس دورك' };
    }

    // أنواع الأنشطة المختلفة
    const crimes = {
      robbery: {           // سرقة بنك
        baseSuccess: 0.6,
        reward: { money: 500, xp: 100 },
        risk: { reputation: -10, jailRisk: 0.3 }
      },
      smuggling: {         // تهريب مخدرات
        baseSuccess: 0.7,
        reward: { money: 300, xp: 60 },
        risk: { reputation: -5, jailRisk: 0.2 }
      },
      extortion: {         // ابتزاز
        baseSuccess: 0.8,
        reward: { money: 200, xp: 40 },
        risk: { reputation: -15, jailRisk: 0.1 }
      },
      heist: {             // سرقة كبرى
        baseSuccess: 0.4,
        reward: { money: 1000, xp: 200 },
        risk: { reputation: -20, jailRisk: 0.5 }
      }
    };

    const crime = crimes[crimeType];
    if (!crime) return { success: false, message: 'نشاط غير معروف' };

    // حساب النجاح (يعتمد على مستوى اللاعب والسمعة)
    const successChance = crime.baseSuccess + (player.stats.level * 0.02) + (player.resources.reputation * 0.001);
    const isSuccess = Math.random() < successChance;

    if (isSuccess) {
      // نجاح النشاط
      player.resources.money += crime.reward.money;
      player.stats.xp += crime.reward.xp;
      player.stats.crimes += 1;
      
      // زيادة المستوى إذا وصلت الخبرة حداً معيناً
      if (player.stats.xp >= player.stats.level * 100) {
        player.stats.level += 1;
        player.stats.xp = 0;
      }

      return {
        success: true,
        message: `نجحت في ${crimeType}! حصلت على ${crime.reward.money}$ و ${crime.reward.xp} خبرة.`,
        newState: this.getStateForPlayer(playerId)
      };
    } else {
      // فشل النشاط
      player.resources.reputation += crime.risk.reputation;
      
      // احتمالية السجن
      if (Math.random() < crime.risk.jailRisk) {
        return {
          success: false,
          message: `فشلت في ${crimeType} وألقي القبض عليك! خسرت سمعة.`,
          jailed: true,
          newState: this.getStateForPlayer(playerId)
        };
      }

      return {
        success: false,
        message: `فشلت في ${crimeType}! خسرت سمعة.`,
        newState: this.getStateForPlayer(playerId)
      };
    }
  }

  // إنهاء الدور
  endTurn(playerId) {
    if (this.turn !== playerId) {
      return { success: false, message: 'ليس دورك' };
    }
    
    // تبديل الدور للاعب الآخر
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    this.turn = opponentId;
    
    return {
      success: true,
      message: 'انتهى دورك',
      newTurn: opponentId,
      state: this.getStateForPlayer(opponentId)
    };
  }

  // الحصول على حالة اللعبة للاعب معين (ما يراه)
  getStateForPlayer(playerId) {
    const player = this.players[playerId];
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];

    return {
      you: {
        resources: player.resources,
        gang: player.gang,
        stats: player.stats,
        activities: player.activities,
        contracts: player.contracts
      },
      opponent: {
        resources: opponent.resources,
        gang: {
          name: opponent.gang.name,
          territory: opponent.gang.territory
        },
        stats: {
          level: opponent.stats.level
        }
      },
      turn: this.turn,
      phase: this.phase,
      winner: this.winner
    };
  }
}

module.exports = Game;