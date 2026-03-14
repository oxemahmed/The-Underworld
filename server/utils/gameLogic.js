// ============================================
// The-Underworld - Game Logic Engine
// ============================================
// هذا الملف يحتوي على القواعد الأساسية للعبة
// تم دمج نظام العصابات ونظام العقود الذكية
// ============================================

const GangSystem = require('./gangSystem.js');
const SmartContractSystem = require('./smartContracts.js');

class Game {
  constructor(player1Id, player2Id) {
    this.gangSystem = new GangSystem();          // نظام العصابات
    this.contractSystem = new SmartContractSystem(); // نظام العقود الذكية
    this.players = {
      [player1Id]: this.createPlayer(player1Id),
      [player2Id]: this.createPlayer(player2Id)
    };
    this.turn = player1Id; // من يبدأ الدور
    this.phase = 'setup';   // مرحلة اللعبة (setup, main, battle, end)
    this.winner = null;
    this.gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        id: null,           // معرف العصابة (إذا كان عضوًا)
        name: '',           // اسم العصابة (يُختار لاحقاً)
        members: [],        // أعضاء العصابة
        territory: 0,       // الأراضي المسيطر عليها
        hideout: {          // الوكر
          level: 1,
          defense: 100
        }
      },
      activities: [],       // الأنشطة الحالية (مثل سرقة بنك، مهمة)
      contracts: [],        // العقود المبرمة مع لاعبين آخرين (سيتم ملؤها من contractSystem)
      stats: {
        level: 1,
        xp: 0,
        crimes: 0,
        wins: 0,
        losses: 0
      },
      gangInvitations: []   // دعوات الانضمام للعصابات
    };
  }

  // بدء لعبة جديدة (عندما ينضم لاعبان)
  startGame() {
    this.phase = 'main';
    return {
      success: true,
      message: 'بدأت اللعبة!',
      gameId: this.gameId,
      state: this.getStateForPlayer(this.turn)
    };
  }

  // ========== دوال الأنشطة الإجرامية ==========

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
      this.checkLevelUp(player);

      // إذا كان اللاعب في عصابة، ساهم في خزينة العصابة
      if (player.gang.id) {
        const gang = this.gangSystem.getGangInfo(player.gang.id);
        if (gang) {
          this.gangSystem.contributeToGang(
            player.gang.id, 
            playerId, 
            Math.floor(crime.reward.money * 0.1), // 10% للعصابة
            0
          );
        }
      }

      return {
        success: true,
        message: `نجحت في ${this.getCrimeArabicName(crimeType)}! حصلت على ${crime.reward.money}$ و ${crime.reward.xp} خبرة.`,
        newState: this.getStateForPlayer(playerId)
      };
    } else {
      // فشل النشاط
      player.resources.reputation += crime.risk.reputation;
      
      // احتمالية السجن
      if (Math.random() < crime.risk.jailRisk) {
        // اللاعب يدخل السجن (لا يستطيع اللعب لدورتين)
        player.jailed = true;
        player.jailTurns = 2;
        
        return {
          success: false,
          message: `فشلت في ${this.getCrimeArabicName(crimeType)} وألقي القبض عليك! خسرت سمعة وستبقى في السجن دورتين.`,
          jailed: true,
          newState: this.getStateForPlayer(playerId)
        };
      }

      return {
        success: false,
        message: `فشلت في ${this.getCrimeArabicName(crimeType)}! خسرت سمعة.`,
        newState: this.getStateForPlayer(playerId)
      };
    }
  }

  // الحصول على الاسم العربي للنشاط
  getCrimeArabicName(crimeType) {
    const names = {
      robbery: 'سرقة بنك',
      smuggling: 'تهريب',
      extortion: 'ابتزاز',
      heist: 'سرقة كبرى'
    };
    return names[crimeType] || crimeType;
  }

  // التحقق من زيادة المستوى
  checkLevelUp(player) {
    while (player.stats.xp >= player.stats.level * 100) {
      player.stats.level += 1;
      player.stats.xp -= player.stats.level * 100;
      // مكافأة رفع المستوى
      player.resources.money += 200;
      player.resources.reputation += 10;
    }
  }

  // ========== دوال العصابات ==========

  // إنشاء عصابة جديدة
  createGang(playerId, gangName, playerName) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };

    // التحقق من أن اللاعب ليس لديه عصابة
    if (player.gang.id) {
      return { success: false, message: 'أنت بالفعل عضو في عصابة أخرى' };
    }

    const result = this.gangSystem.createGang(playerId, gangName, playerName);
    
    if (result.success) {
      // ربط العصابة باللاعب
      player.gang.id = result.gang.id;
      player.gang.name = result.gang.name;
    }

    return result;
  }

  // إرسال دعوة للانضمام إلى عصابة
  sendGangInvitation(gangId, leaderId, targetPlayerId, targetPlayerName) {
    const leader = this.players[leaderId];
    const target = this.players[targetPlayerId];

    if (!leader || !target) {
      return { success: false, message: 'أحد اللاعبين غير موجود' };
    }

    // التحقق من أن المرسل هو قائد العصابة
    const gang = this.gangSystem.getGangInfo(gangId);
    if (!gang || gang.leader !== leaderId) {
      return { success: false, message: 'فقط قائد العصابة يمكنه إرسال الدعوات' };
    }

    const result = this.gangSystem.sendInvitation(gangId, leaderId, targetPlayerId, targetPlayerName);
    
    if (result.success) {
      // إضافة الدعوة للاعب المستهدف
      target.gangInvitations.push(result.invitation);
    }

    return result;
  }

  // قبول دعوة انضمام
  acceptGangInvitation(playerId, gangId) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };

    // التحقق من وجود الدعوة
    const invitation = player.gangInvitations.find(inv => inv.gangId === gangId);
    if (!invitation) {
      return { success: false, message: 'لا توجد دعوة بهذا المعرف' };
    }

    const result = this.gangSystem.acceptInvitation(playerId, gangId);
    
    if (result.success) {
      // ربط العصابة باللاعب
      player.gang.id = gangId;
      player.gang.name = result.gang.name;
      // إزالة الدعوة
      player.gangInvitations = player.gangInvitations.filter(inv => inv.gangId !== gangId);
    }

    return result;
  }

  // المساهمة في خزينة العصابة
  contributeToGang(playerId, amount) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };
    if (!player.gang.id) return { success: false, message: 'أنت لست عضواً في أي عصابة' };
    if (player.resources.money < amount) {
      return { success: false, message: 'لا تملك هذا المبلغ' };
    }

    const result = this.gangSystem.contributeToGang(player.gang.id, playerId, amount, 0);
    
    if (result.success) {
      player.resources.money -= amount;
    }

    return result;
  }

  // ========== دوال العقود الذكية (Smart Contracts) ==========

  // إنشاء عقد جديد
  createContract(playerId, contractData) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };

    // التحقق من أن اللاعب لديه المال الكافي للضمان
    if (contractData.escrowAmount && player.resources.money < contractData.escrowAmount) {
      return { success: false, message: 'لا تملك المال الكافي للضمان' };
    }

    const result = this.contractSystem.createContract(playerId, contractData);
    
    if (result.success && contractData.escrowAmount) {
      // خصم مبلغ الضمان من اللاعب
      player.resources.money -= contractData.escrowAmount;
      // يمكن إضافة العقد إلى قائمة عقود اللاعب إذا أردت
    }

    return result;
  }

  // قبول عقد
  acceptContract(playerId, contractId) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };

    const result = this.contractSystem.acceptContract(contractId, playerId);
    
    // إذا كان العقد يتطلب ضمان من الطرف الآخر (يمكن إضافة منطق خصم)
    // if (result.success) { ... }

    return result;
  }

  // رفض عقد
  rejectContract(playerId, contractId) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };
    return this.contractSystem.rejectContract(contractId, playerId);
  }

  // تنفيذ عقد (مثل إثبات اغتيال)
  executeContract(playerId, contractId, proof) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };

    const result = this.contractSystem.executeContract(contractId, playerId, proof);
    
    if (result.success) {
      // معالجة المكافآت بناءً على نوع العقد
      if (result.reward) {
        player.resources.money += result.reward;
        player.stats.xp += 200; // مكافأة خبرة للاغتيال
        this.checkLevelUp(player);
      }
      if (result.payment) {
        player.resources.money += result.payment;
      }
    }

    return result;
  }

  // إلغاء عقد
  cancelContract(playerId, contractId) {
    const player = this.players[playerId];
    if (!player) return { success: false, message: 'لاعب غير موجود' };

    const result = this.contractSystem.cancelContract(contractId, playerId);
    
    if (result.success) {
      // استرجاع الضمان إذا كان العقد لا يزال pending
      const contract = this.contractSystem.getContract(contractId);
      if (contract && contract.escrow.amount > 0 && contract.creator === playerId) {
        player.resources.money += contract.escrow.amount;
      }
    }

    return result;
  }

  // الحصول على عقود اللاعب
  getPlayerContracts(playerId, filter = 'all') {
    return this.contractSystem.getPlayerContracts(playerId, filter);
  }

  // ========== دوال إنهاء الدور والتحقق من الفائز ==========

  // إنهاء الدور
  endTurn(playerId) {
    if (this.turn !== playerId) {
      return { success: false, message: 'ليس دورك' };
    }

    // معالجة تأثيرات السجن
    const currentPlayer = this.players[playerId];
    if (currentPlayer.jailed) {
      currentPlayer.jailTurns -= 1;
      if (currentPlayer.jailTurns <= 0) {
        currentPlayer.jailed = false;
      }
    }
    
    // تبديل الدور للاعب الآخر
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    this.turn = opponentId;

    // تحديث وقت النشاط للعصابة
    if (currentPlayer.gang.id) {
      const gang = this.gangSystem.getGangInfo(currentPlayer.gang.id);
      if (gang) {
        gang.lastActive = new Date().toISOString();
      }
    }
    
    return {
      success: true,
      message: 'انتهى دورك',
      newTurn: opponentId,
      state: this.getStateForPlayer(opponentId)
    };
  }

  // التحقق من وجود فائز
  checkWinner() {
    // TODO: تطوير شروط الفوز
    return null;
  }

  // ========== دوال الحصول على المعلومات ==========

  // الحصول على حالة اللعبة للاعب معين (ما يراه)
  getStateForPlayer(playerId) {
    const player = this.players[playerId];
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];

    // الحصول على معلومات العصابة للاعب
    let gangInfo = null;
    if (player.gang.id) {
      gangInfo = this.gangSystem.getGangStats(player.gang.id);
    }

    // الحصول على عقود اللاعب من نظام العقود (اختياري)
    const playerContracts = this.contractSystem.getPlayerContracts(playerId);

    return {
      gameId: this.gameId,
      you: {
        resources: { ...player.resources },
        gang: {
          id: player.gang.id,
          name: player.gang.name,
          territory: player.gang.territory,
          stats: gangInfo
        },
        stats: { ...player.stats },
        activities: [...player.activities],
        contracts: playerContracts,  // استخدام العقود من النظام
        jailed: player.jailed || false,
        jailTurns: player.jailTurns || 0,
        invitations: [...player.gangInvitations]
      },
      opponent: {
        resources: {
          money: opponent.resources.money,
          reputation: opponent.resources.reputation
        },
        gang: {
          name: opponent.gang.name,
          territory: opponent.gang.territory
        },
        stats: {
          level: opponent.stats.level
        },
        jailed: opponent.jailed || false
      },
      turn: this.turn,
      phase: this.phase,
      winner: this.winner
    };
  }

  // الحصول على معلومات عصابة معينة
  getGangInfo(gangId) {
    return this.gangSystem.getGangInfo(gangId);
  }
}

module.exports = Game;