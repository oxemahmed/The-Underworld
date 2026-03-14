// ============================================
// The-Underworld - Gang System
// نظام إدارة العصابات الكامل
// ============================================

class GangSystem {
  constructor() {
    this.gangs = {}; // جميع العصابات في اللعبة
    this.gangInvitations = {}; // دعوات الانضمام
  }

  // إنشاء عصابة جديدة
  createGang(playerId, gangName, playerName) {
    // التحقق من أن اللاعب ليس لديه عصابة بالفعل
    if (this.playerHasGang(playerId)) {
      return { 
        success: false, 
        message: 'أنت بالفعل عضو في عصابة أخرى' 
      };
    }

    // التحقق من عدم وجود عصابة بنفس الاسم
    if (this.gangExists(gangName)) {
      return { 
        success: false, 
        message: 'يوجد عصابة بهذا الاسم بالفعل' 
      };
    }

    const gangId = `gang_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.gangs[gangId] = {
      id: gangId,
      name: gangName,
      leader: playerId,
      members: {
        [playerId]: {
          playerId: playerId,
          playerName: playerName,
          role: 'leader',
          joinedAt: new Date().toISOString(),
          contributions: {
            money: 0,
            reputation: 0,
            crimes: 0
          }
        }
      },
      stats: {
        level: 1,
        experience: 0,
        totalMoney: 0,
        totalReputation: 0,
        territory: 0,
        hideoutLevel: 1,
        hideoutDefense: 100
      },
      hideout: {
        level: 1,
        defense: 100,
        capacity: 5,
        treasury: 0,
        upgrades: []
      },
      enemies: [], // قائمة العصابات المعادية
      allies: [],  // قائمة العصابات المتحالفة
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };

    return {
      success: true,
      message: `تم إنشاء عصابة ${gangName} بنجاح`,
      gang: this.gangs[gangId]
    };
  }

  // إرسال دعوة للانضمام إلى عصابة
  sendInvitation(gangId, leaderId, targetPlayerId, targetPlayerName) {
    const gang = this.gangs[gangId];
    if (!gang) {
      return { success: false, message: 'العصابة غير موجودة' };
    }

    // التحقق من أن المرسل هو قائد العصابة
    if (gang.leader !== leaderId) {
      return { success: false, message: 'فقط قائد العصابة يمكنه إرسال الدعوات' };
    }

    // التحقق من أن اللاعب المستهدف ليس لديه عصابة
    if (this.playerHasGang(targetPlayerId)) {
      return { success: false, message: 'اللاعب المستهدف عضو في عصابة أخرى' };
    }

    // التحقق من سعة العصابة
    if (Object.keys(gang.members).length >= gang.hideout.capacity) {
      return { success: false, message: 'العصابة ممتلئة، قم بترقية الوكر أولاً' };
    }

    if (!this.gangInvitations[targetPlayerId]) {
      this.gangInvitations[targetPlayerId] = [];
    }

    const invitation = {
      gangId: gangId,
      gangName: gang.name,
      fromLeader: leaderId,
      sentAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 ساعة
    };

    this.gangInvitations[targetPlayerId].push(invitation);

    return {
      success: true,
      message: `تم إرسال الدعوة إلى ${targetPlayerName}`,
      invitation: invitation
    };
  }

  // قبول دعوة الانضمام
  acceptInvitation(playerId, gangId) {
    if (!this.gangInvitations[playerId]) {
      return { success: false, message: 'لا توجد دعوات لك' };
    }

    const invitationIndex = this.gangInvitations[playerId].findIndex(
      inv => inv.gangId === gangId && new Date(inv.expiresAt) > new Date()
    );

    if (invitationIndex === -1) {
      return { success: false, message: 'الدعوة غير صالحة أو منتهية' };
    }

    const gang = this.gangs[gangId];
    if (!gang) {
      return { success: false, message: 'العصابة غير موجودة' };
    }

    // التحقق من السعة مرة أخرى
    if (Object.keys(gang.members).length >= gang.hideout.capacity) {
      return { success: false, message: 'العصابة ممتلئة' };
    }

    // إضافة اللاعب إلى العصابة
    gang.members[playerId] = {
      playerId: playerId,
      playerName: `Player_${playerId}`, // سيتم تحديثه لاحقاً
      role: 'member',
      joinedAt: new Date().toISOString(),
      contributions: {
        money: 0,
        reputation: 0,
        crimes: 0
      }
    };

    // إزالة الدعوة
    this.gangInvitations[playerId].splice(invitationIndex, 1);

    gang.lastActive = new Date().toISOString();

    return {
      success: true,
      message: `انضممت إلى عصابة ${gang.name}`,
      gang: gang
    };
  }

  // رفع مستوى الوكر
  upgradeHideout(gangId, playerId, cost) {
    const gang = this.gangs[gangId];
    if (!gang) {
      return { success: false, message: 'العصابة غير موجودة' };
    }

    // التحقق من أن اللاعب هو القائد
    if (gang.leader !== playerId) {
      return { success: false, message: 'فقط القائد يمكنه ترقية الوكر' };
    }

    // التحقق من وجود نقود كافية (هذا يتم التحقق منه في gameLogic)
    const newLevel = gang.hideout.level + 1;
    const newDefense = gang.hideout.defense + 50;
    const newCapacity = gang.hideout.capacity + 2;

    gang.hideout.level = newLevel;
    gang.hideout.defense = newDefense;
    gang.hideout.capacity = newCapacity;
    gang.hideout.upgrades.push({
      level: newLevel,
      upgradedAt: new Date().toISOString(),
      cost: cost
    });

    gang.lastActive = new Date().toISOString();

    return {
      success: true,
      message: `تم ترقية الوكر إلى المستوى ${newLevel}`,
      hideout: gang.hideout
    };
  }

  // إعلان الحرب على عصابة أخرى
  declareWar(gangId, leaderId, enemyGangId) {
    const gang = this.gangs[gangId];
    const enemyGang = this.gangs[enemyGangId];

    if (!gang || !enemyGang) {
      return { success: false, message: 'إحدى العصابات غير موجودة' };
    }

    if (gang.leader !== leaderId) {
      return { success: false, message: 'فقط القائد يمكنه إعلان الحرب' };
    }

    // التحقق من أن الحرب غير موجودة بالفعل
    if (gang.enemies.includes(enemyGangId)) {
      return { success: false, message: 'أنتم بالفعل في حالة حرب مع هذه العصابة' };
    }

    gang.enemies.push(enemyGangId);
    enemyGang.enemies.push(gangId);

    return {
      success: true,
      message: `تم إعلان الحرب على عصابة ${enemyGang.name}`,
      warDeclared: true
    };
  }

  // المساهمة في خزينة العصابة
  contributeToGang(gangId, playerId, money, reputation) {
    const gang = this.gangs[gangId];
    if (!gang) {
      return { success: false, message: 'العصابة غير موجودة' };
    }

    const member = gang.members[playerId];
    if (!member) {
      return { success: false, message: 'أنت لست عضواً في هذه العصابة' };
    }

    member.contributions.money += money;
    member.contributions.reputation += reputation;
    member.contributions.crimes += 1;

    gang.hideout.treasury += money;
    gang.stats.totalMoney += money;
    gang.stats.totalReputation += reputation;

    // زيادة خبرة العصابة
    gang.stats.experience += Math.floor(money / 100) + reputation;
    
    // التحقق من رفع مستوى العصابة
    while (gang.stats.experience >= gang.stats.level * 500) {
      gang.stats.level += 1;
      gang.stats.experience -= gang.stats.level * 500;
    }

    gang.lastActive = new Date().toISOString();

    return {
      success: true,
      message: `تمت المساهمة بمبلغ ${money}$ و ${reputation} سمعة`,
      gang: gang
    };
  }

  // التحقق مما إذا كان اللاعب لديه عصابة
  playerHasGang(playerId) {
    for (let gangId in this.gangs) {
      if (this.gangs[gangId].members[playerId]) {
        return gangId;
      }
    }
    return null;
  }

  // التحقق من وجود عصابة بالاسم
  gangExists(gangName) {
    return Object.values(this.gangs).some(gang => gang.name === gangName);
  }

  // الحصول على عصابة اللاعب
  getPlayerGang(playerId) {
    for (let gangId in this.gangs) {
      if (this.gangs[gangId].members[playerId]) {
        return this.gangs[gangId];
      }
    }
    return null;
  }

  // الحصول على معلومات العصابة
  getGangInfo(gangId) {
    return this.gangs[gangId] || null;
  }

  // الحصول على إحصائيات العصابة
  getGangStats(gangId) {
    const gang = this.gangs[gangId];
    if (!gang) return null;

    return {
      name: gang.name,
      level: gang.stats.level,
      members: Object.keys(gang.members).length,
      territory: gang.stats.territory,
      hideoutLevel: gang.hideout.level,
      treasury: gang.hideout.treasury,
      enemies: gang.enemies.length,
      allies: gang.allies.length
    };
  }
}

module.exports = GangSystem;