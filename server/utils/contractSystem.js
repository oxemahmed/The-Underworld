// ============================================
// The-Underworld - Smart Contracts System (Database Version)
// ============================================
const db = require('../db.js');

class SmartContractSystem {
  // إنشاء عقد جديد
  async createContract(creatorId, contractData) {
    try {
      const contractId = `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // تحضير البيانات
      const { type, target, terms, escrowAmount, expiresAt, details } = contractData;
      
      await db.query(
        `INSERT INTO contracts (
          id, type, creator_id, target_id, status, terms, escrow_amount, 
          created_at, expires_at, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)`,
        [
          contractId, type, creatorId, target || null, 'pending',
          terms || '', escrowAmount || 0, expiresAt || null,
          details ? JSON.stringify(details) : null
        ]
      );

      // جلب العقد المنشأ
      const result = await db.query('SELECT * FROM contracts WHERE id = $1', [contractId]);
      const contract = result.rows[0];

      return { success: true, message: 'تم إنشاء العقد', contractId, contract };
    } catch (err) {
      console.error('Error in createContract:', err);
      return { success: false, message: 'خطأ في قاعدة البيانات' };
    }
  }

  // قبول عقد
  async acceptContract(contractId, playerId) {
    try {
      const contract = await db.query('SELECT * FROM contracts WHERE id = $1', [contractId]);
      if (contract.rows.length === 0) {
        return { success: false, message: 'العقد غير موجود' };
      }
      const c = contract.rows[0];
      if (c.status !== 'pending') {
        return { success: false, message: 'هذا العقد لم يعد متاحاً للقبول' };
      }

      // التحقق من أن اللاعب هو الطرف المعني (حسب نوع العقد)
      // هذا يحتاج إلى منطق حسب نوع العقد، نبسطه الآن
      await db.query(
        'UPDATE contracts SET status = $1, activated_at = NOW() WHERE id = $2',
        ['active', contractId]
      );

      return { success: true, message: 'تم قبول العقد', contract: c };
    } catch (err) {
      console.error('Error in acceptContract:', err);
      return { success: false, message: 'خطأ في قاعدة البيانات' };
    }
  }

  // رفض عقد
  async rejectContract(contractId, playerId) {
    try {
      await db.query(
        'UPDATE contracts SET status = $1, rejected_at = NOW(), rejected_by = $2 WHERE id = $3',
        ['rejected', playerId, contractId]
      );
      return { success: true, message: 'تم رفض العقد' };
    } catch (err) {
      console.error('Error in rejectContract:', err);
      return { success: false, message: 'خطأ في قاعدة البيانات' };
    }
  }

  // تنفيذ عقد (مثل إثبات اغتيال)
  async executeContract(contractId, executorId, proof) {
    try {
      const contract = await db.query('SELECT * FROM contracts WHERE id = $1', [contractId]);
      if (contract.rows.length === 0) {
        return { success: false, message: 'العقد غير موجود' };
      }
      const c = contract.rows[0];
      if (c.status !== 'active') {
        return { success: false, message: 'العقد غير نشط' };
      }

      // منطق التنفيذ حسب النوع
      let result = {};
      if (c.type === 'assassination') {
        // التحقق من أن المنفذ هو القاتل المعين
        // نفترض أن التفاصيل مخزنة في details
        const details = c.details || {};
        if (executorId !== details.assassin) {
          return { success: false, message: 'أنت لست المنفذ المعين' };
        }
        // التحقق من صحة الإثبات (مبسط)
        if (!proof || !proof.targetId) {
          return { success: false, message: 'إثبات غير صالح' };
        }
        result.reward = details.reward || 0;
      }

      // تحديث العقد كمكتمل
      await db.query(
        'UPDATE contracts SET status = $1, completed_at = NOW(), result = $2 WHERE id = $3',
        ['completed', JSON.stringify(result), contractId]
      );

      // نقل العقد إلى جدول history (اختياري) يمكن حذفه من contracts وإضافته إلى contract_history
      await db.query(
        'INSERT INTO contract_history SELECT * FROM contracts WHERE id = $1',
        [contractId]
      );
      await db.query('DELETE FROM contracts WHERE id = $1', [contractId]);

      return {
        success: true,
        message: 'تم تنفيذ العقد بنجاح',
        reward: result.reward
      };
    } catch (err) {
      console.error('Error in executeContract:', err);
      return { success: false, message: 'خطأ في قاعدة البيانات' };
    }
  }

  // إلغاء عقد
  async cancelContract(contractId, playerId) {
    try {
      const contract = await db.query('SELECT * FROM contracts WHERE id = $1', [contractId]);
      if (contract.rows.length === 0) {
        return { success: false, message: 'العقد غير موجود' };
      }
      const c = contract.rows[0];
      if (c.creator_id !== playerId) {
        return { success: false, message: 'فقط منشئ العقد يمكنه إلغاؤه' };
      }
      if (c.status !== 'pending' && c.status !== 'active') {
        return { success: false, message: 'لا يمكن إلغاء هذا العقد في حالته الحالية' };
      }

      await db.query(
        'UPDATE contracts SET status = $1, cancelled_at = NOW(), cancelled_by = $2 WHERE id = $3',
        ['cancelled', playerId, contractId]
      );

      return { success: true, message: 'تم إلغاء العقد' };
    } catch (err) {
      console.error('Error in cancelContract:', err);
      return { success: false, message: 'خطأ في قاعدة البيانات' };
    }
  }

  // الحصول على عقود لاعب معين
  async getPlayerContracts(playerId, filter = 'all') {
    try {
      let query = `
        SELECT * FROM contracts 
        WHERE creator_id = $1 OR target_id = $1
      `;
      const params = [playerId];
      
      if (filter !== 'all') {
        query += ` AND status = $2`;
        params.push(filter);
      }
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('Error in getPlayerContracts:', err);
      return [];
    }
  }

  // الحصول على تفاصيل عقد
  async getContract(contractId) {
    try {
      const result = await db.query('SELECT * FROM contracts WHERE id = $1', [contractId]);
      if (result.rows.length > 0) return result.rows[0];
      // ابحث في history
      const history = await db.query('SELECT * FROM contract_history WHERE id = $1', [contractId]);
      return history.rows[0] || null;
    } catch (err) {
      console.error('Error in getContract:', err);
      return null;
    }
  }
}

module.exports = SmartContractSystem;