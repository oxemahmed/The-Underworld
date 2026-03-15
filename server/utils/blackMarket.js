// ============================================
// The-Underworld - Black Market System
// ============================================
const db = require('../db.js');

class BlackMarket {
  constructor() {
    this.items = [
      { id: 'weapon_1', name: 'مسدس صغير', type: 'weapon', price: 500, damage: 20, requiredLevel: 1 },
      { id: 'weapon_2', name: 'بندقية هجومية', type: 'weapon', price: 2000, damage: 50, requiredLevel: 3 },
      { id: 'weapon_3', name: 'قاذف صواريخ', type: 'weapon', price: 5000, damage: 100, requiredLevel: 5 },
      { id: 'armor_1', name: 'سترة واقية', type: 'armor', price: 300, defense: 15, requiredLevel: 1 },
      { id: 'armor_2', name: 'دروع ثقيلة', type: 'armor', price: 1500, defense: 40, requiredLevel: 3 },
      { id: 'drug_1', name: 'مخدرات خفيفة', type: 'drug', price: 200, profit: 100, risk: 0.2 },
      { id: 'drug_2', name: 'مخدرات ثقيلة', type: 'drug', price: 800, profit: 400, risk: 0.5 },
      { id: 'info_1', name: 'معلومات عن خصم', type: 'info', price: 1000, description: 'تكشف موقع خصم' },
    ];
  }

  // جلب جميع العناصر المتاحة
  getItems() {
    return this.items;
  }

  // شراء عنصر
  async buyItem(playerId, itemId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) {
      return { success: false, message: 'العنصر غير موجود' };
    }

    try {
      // التحقق من رصيد اللاعب ومستواه
      const player = await db.query('SELECT money, level FROM players WHERE id = $1', [playerId]);
      if (player.rows.length === 0) {
        return { success: false, message: 'اللاعب غير موجود' };
      }
      const { money, level } = player.rows[0];
      
      if (money < item.price) {
        return { success: false, message: 'لا تملك المال الكافي' };
      }
      if (item.requiredLevel && level < item.requiredLevel) {
        return { success: false, message: 'مستواك غير كافٍ لشراء هذا العنصر' };
      }

      // خصم المبلغ
      await db.query('UPDATE players SET money = money - $1 WHERE id = $2', [item.price, playerId]);

      // إضافة العنصر إلى مخزون اللاعب (سنحتاج جدول player_items)
      await db.query(
        'INSERT INTO player_items (player_id, item_id, item_data) VALUES ($1, $2, $3)',
        [playerId, itemId, JSON.stringify(item)]
      );

      return {
        success: true,
        message: `تم شراء ${item.name} بنجاح`,
        item
      };
    } catch (err) {
      console.error('Error in buyItem:', err);
      return { success: false, message: 'خطأ في قاعدة البيانات' };
    }
  }

  // بيع عنصر (اختياري)
  async sellItem(playerId, itemId) {
    try {
      // التحقق من أن اللاعب يمتلك العنصر
      const itemResult = await db.query(
        'SELECT item_data FROM player_items WHERE player_id = $1 AND item_id = $2',
        [playerId, itemId]
      );
      if (itemResult.rows.length === 0) {
        return { success: false, message: 'أنت لا تملك هذا العنصر' };
      }

      const item = JSON.parse(itemResult.rows[0].item_data);
      const sellPrice = Math.floor(item.price * 0.6); // يباع بـ 60% من سعر الشراء

      // حذف العنصر من المخزون
      await db.query(
        'DELETE FROM player_items WHERE player_id = $1 AND item_id = $2',
        [playerId, itemId]
      );

      // إضافة المال للاعب
      await db.query('UPDATE players SET money = money + $1 WHERE id = $2', [sellPrice, playerId]);

      return {
        success: true,
        message: `تم بيع ${item.name} بمبلغ ${sellPrice}$`,
        price: sellPrice
      };
    } catch (err) {
      console.error('Error in sellItem:', err);
      return { success: false, message: 'خطأ في قاعدة البيانات' };
    }
  }

  // الحصول على مخزون اللاعب
  async getPlayerInventory(playerId) {
    try {
      const result = await db.query(
        'SELECT item_id, item_data FROM player_items WHERE player_id = $1',
        [playerId]
      );
      return result.rows.map(row => ({
        id: row.item_id,
        ...JSON.parse(row.item_data)
      }));
    } catch (err) {
      console.error('Error in getPlayerInventory:', err);
      return [];
    }
  }
}

module.exports = BlackMarket;