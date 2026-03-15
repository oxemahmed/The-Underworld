// ============================================
// The-Underworld - Battle System
// ============================================
const db = require('../db.js');

class BattleSystem {
  // التحقق من إمكانية الهجوم
  async canAttack(attackerId, defenderId) {
    try {
      const players = await db.query(
        'SELECT id, level, money FROM players WHERE id = ANY($1)',
        [[attackerId, defenderId]]
      );
      if (players.rows.length < 2) {
        return { allowed: false, message: 'أحد اللاعبين غير موجود' };
      }
      return { allowed: true, message: 'يمكنك الهجوم' };
    } catch (err) {
      console.error('❌ Error in canAttack:', err);
      return { 
        allowed: false, 
        message: 'خطأ في قاعدة البيانات',
        error: err.message,
        detail: err.detail 
      };
    }
  }

  // تنفيذ هجوم
  async attack(attackerId, defenderId) {
    try {
      console.log(`⚔️ Starting attack: ${attackerId} vs ${defenderId}`);

      // جلب بيانات المهاجم والمدافع
      const [attacker, defender] = await Promise.all([
        db.query('SELECT * FROM players WHERE id = $1', [attackerId]),
        db.query('SELECT * FROM players WHERE id = $1', [defenderId])
      ]);

      if (attacker.rows.length === 0 || defender.rows.length === 0) {
        return { success: false, message: 'أحد اللاعبين غير موجود' };
      }

      const a = attacker.rows[0];
      const d = defender.rows[0];
      console.log(`📊 Attacker: ${a.username}, Defender: ${d.username}`);

      // جلب أسلحة المهاجم من المخزون (إذا كان يملك أسلحة)
      let weapons = { rows: [] };
      try {
        weapons = await db.query(
          'SELECT item_data FROM player_items WHERE player_id = $1 AND item_data->>\'type\' = \'weapon\'',
          [attackerId]
        );
        console.log(`🔫 Found ${weapons.rows.length} weapons`);
      } catch (weaponErr) {
        console.warn('⚠️ Could not fetch weapons:', weaponErr.message);
        // تجاهل الخطأ، استمر بدون أسلحة
      }

      // حساب قوة الهجوم
      let attackPower = a.level * 10;
      let weaponBonus = 0;
      let weaponUsed = null;

      if (weapons.rows.length > 0) {
        const randomWeapon = weapons.rows[Math.floor(Math.random() * weapons.rows.length)];
        
        // معالجة بيانات السلاح بأمان (قد تكون مخزنة كنص JSON أو كائن)
        let weaponData;
        if (typeof randomWeapon.item_data === 'string') {
          try {
            weaponData = JSON.parse(randomWeapon.item_data);
          } catch (parseErr) {
            console.warn('⚠️ Could not parse weapon data, using default:', randomWeapon.item_data);
            weaponData = { damage: 0, name: 'سلاح تالف' };
          }
        } else if (typeof randomWeapon.item_data === 'object' && randomWeapon.item_data !== null) {
          // إذا كان already an object (مخزن كـ JSONB وأعيد ككائن)
          weaponData = randomWeapon.item_data;
        } else {
          weaponData = { damage: 0, name: 'سلاح غير معروف' };
        }

        weaponBonus = weaponData.damage || 0;
        weaponUsed = weaponData;
      }

      const defense = d.level * 8;
      const randomFactor = 0.6 + Math.random() * 0.8;
      const totalAttack = (attackPower + weaponBonus) * randomFactor;

      let damage = Math.max(0, Math.floor(totalAttack - defense));
      const successChance = Math.min(0.9, 0.5 + (attackPower - defense) / 200);
      const isSuccess = Math.random() < successChance;

      if (!isSuccess) {
        damage = Math.floor(damage / 2);
      }

      console.log(`⚡ Attack power: ${attackPower}, Weapon: ${weaponBonus}, Damage: ${damage}, Success: ${isSuccess}`);

      // جلب نقاط حياة المدافع
      const defenderHP = d.hp !== undefined ? d.hp : 100;
      const newHP = Math.max(0, defenderHP - damage);

      // تحديث نقاط حياة المدافع
      await db.query('UPDATE players SET hp = $1 WHERE id = $2', [newHP, defenderId]);

      // تسجيل نتيجة المعركة
      const battleResult = {
        attackerId,
        defenderId,
        damage,
        newHP,
        success: isSuccess,
        timestamp: new Date().toISOString(),
        weaponUsed: weaponUsed ? weaponUsed.name : 'بدون سلاح'
      };

      // إضافة سجل المعركة إلى قاعدة البيانات
      try {
        await db.query(
          `INSERT INTO battles 
           (attacker_id, defender_id, damage, new_hp, success, weapon_used, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [attackerId, defenderId, damage, newHP, isSuccess, battleResult.weaponUsed]
        );
        console.log('📝 Battle record inserted');
      } catch (battleErr) {
        console.error('❌ Failed to insert battle record:', battleErr.message);
        // استمر بدون تسجيل (يمكن تسجيلها لاحقًا)
      }

      // مكافآت وعقوبات
      if (newHP === 0) {
        // المدافع يخسر
        await db.query(
          'UPDATE players SET money = money - 500, reputation = reputation - 20 WHERE id = $1',
          [defenderId]
        );
        await db.query(
          'UPDATE players SET money = money + 800, wins = wins + 1 WHERE id = $1',
          [attackerId]
        );
        battleResult.killed = true;
        console.log('💀 Defender defeated!');
      } else {
        if (isSuccess) {
          await db.query(
            'UPDATE players SET money = money + 200, xp = xp + 50 WHERE id = $1',
            [attackerId]
          );
          console.log('💰 Attacker rewarded');
        }
      }

      return {
        success: true,
        message: isSuccess ? 'هجوم ناجح!' : 'هجوم فاشل!',
        battle: battleResult
      };
    } catch (err) {
      console.error('❌ FATAL ERROR in attack:', err);
      return {
        success: false,
        message: 'خطأ في قاعدة البيانات',
        error: err.message,
        stack: err.stack
      };
    }
  }

  // استعادة نقاط الحياة
  async heal(playerId, amount) {
    try {
      await db.query(
        'UPDATE players SET hp = LEAST(100, hp + $1) WHERE id = $2',
        [amount, playerId]
      );
      return { success: true, message: `تم استعادة ${amount} نقطة حياة` };
    } catch (err) {
      console.error('❌ Error in heal:', err);
      return { 
        success: false, 
        message: 'خطأ في قاعدة البيانات',
        error: err.message 
      };
    }
  }

  // الحصول على سجل معارك اللاعب
  async getBattleHistory(playerId) {
    try {
      const result = await db.query(
        `SELECT * FROM battles 
         WHERE attacker_id = $1 OR defender_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [playerId]
      );
      return result.rows;
    } catch (err) {
      console.error('❌ Error in getBattleHistory:', err);
      return [];
    }
  }

  // الحصول على حالة اللاعب
  async getPlayerStatus(playerId) {
    try {
      const result = await db.query(
        'SELECT id, username, money, level, hp, reputation FROM players WHERE id = $1',
        [playerId]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('❌ Error in getPlayerStatus:', err);
      return null;
    }
  }
}

module.exports = BattleSystem;