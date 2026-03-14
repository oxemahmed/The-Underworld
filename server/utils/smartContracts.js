// ============================================
// The-Underworld - Smart Contracts System
// نظام العقود الذكية بين اللاعبين
// ============================================

class SmartContractSystem {
  constructor() {
    this.contracts = {};        // جميع العقود النشطة
    this.contractHistory = {};   // سجل العقود المنتهية
    this.contractCounter = 0;
  }

  // إنشاء عقد جديد
  createContract(creatorId, contractData) {
    const contractId = `contract_${Date.now()}_${++this.contractCounter}`;
    
    // أنواع العقود المدعومة
    const contractTypes = {
      'protection': this.createProtectionContract,
      'assassination': this.createAssassinationContract,
      'alliance': this.createAllianceContract,
      'loan': this.createLoanContract,
      'territory': this.createTerritoryContract
    };

    if (!contractTypes[contractData.type]) {
      return { success: false, message: 'نوع العقد غير مدعوم' };
    }

    const contract = {
      id: contractId,
      type: contractData.type,
      creator: creatorId,
      target: contractData.target || null, // للعقود التي تستهدف لاعباً معيناً
      terms: contractData.terms,
      status: 'pending', // pending, active, completed, cancelled, failed
      createdAt: new Date().toISOString(),
      expiresAt: contractData.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // أسبوع افتراضي
      parties: {
        [creatorId]: {
          role: 'creator',
          accepted: true,
          signedAt: new Date().toISOString()
        }
      },
      escrow: {
        amount: contractData.escrowAmount || 0,
        released: false
      },
      result: null
    };

    // إضافة الشروط الخاصة بكل نوع
    return contractTypes[contractData.type].call(this, contract, contractData);
  }

  // عقد حماية: يدفع مبلغ للطرف الآخر لعدم مهاجمته لمدة معينة
  createProtectionContract(contract, data) {
    contract.details = {
      protectedPlayer: data.target,
      protector: data.protector, // من سيوفر الحماية (يمكن أن يكون العصابة أو لاعب)
      duration: data.duration || 30, // أيام
      paymentAmount: data.paymentAmount,
      paymentSchedule: data.paymentSchedule || 'one-time', // one-time, weekly, monthly
      breachPenalty: data.breachPenalty || data.paymentAmount * 2
    };
    
    contract.terms = `عقد حماية: يدفع ${data.paymentAmount}$ لـ ${data.protector} لحماية ${data.target} لمدة ${data.duration} يوم.`;
    
    this.contracts[contract.id] = contract;
    return { success: true, message: 'تم إنشاء عقد الحماية', contractId: contract.id, contract };
  }

  // عقد اغتيال: يدفع مبلغ لقتل لاعب آخر
  createAssassinationContract(contract, data) {
    contract.details = {
      target: data.target,
      assassin: data.assassin, // من سينفذ الاغتيال
      reward: data.reward,
      deadline: data.deadline || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      proofRequired: data.proofRequired || 'kill_confirmation'
    };
    
    contract.terms = `عقد اغتيال: مكافأة ${data.reward}$ لاغتيال ${data.target} قبل ${new Date(data.deadline).toLocaleDateString()}.`;
    
    this.contracts[contract.id] = contract;
    return { success: true, message: 'تم إنشاء عقد الاغتيال', contractId: contract.id, contract };
  }

  // عقد تحالف: اتفاق بين لاعبين أو عصابة على التعاون
  createAllianceContract(contract, data) {
    contract.details = {
      partyA: data.partyA,
      partyB: data.partyB,
      sharedResources: data.sharedResources || false,
      mutualDefense: data.mutualDefense || true,
      profitSharing: data.profitSharing || 0.5, // 50% افتراضي
      territorySharing: data.territorySharing || []
    };
    
    contract.terms = `تحالف بين ${data.partyA} و ${data.partyB} مع دفاع مشترك ومشاركة أرباح بنسبة ${data.profitSharing * 100}%.`;
    
    this.contracts[contract.id] = contract;
    return { success: true, message: 'تم إنشاء عقد التحالف', contractId: contract.id, contract };
  }

  // عقد قرض: إقراض مبلغ مع فوائد
  createLoanContract(contract, data) {
    contract.details = {
      lender: data.lender,
      borrower: data.borrower,
      amount: data.amount,
      interestRate: data.interestRate || 0.1, // 10% افتراضي
      repaymentPeriod: data.repaymentPeriod || 30, // أيام
      collateral: data.collateral || null
    };
    
    contract.terms = `قرض بمبلغ ${data.amount}$ بفائدة ${data.interestRate * 100}%، يسدد خلال ${data.repaymentPeriod} يوم.`;
    
    this.contracts[contract.id] = contract;
    return { success: true, message: 'تم إنشاء عقد القرض', contractId: contract.id, contract };
  }

  // عقد تبادل أراضي
  createTerritoryContract(contract, data) {
    contract.details = {
      partyA: data.partyA,
      partyB: data.partyB,
      territoryA: data.territoryA,
      territoryB: data.territoryB,
      compensation: data.compensation || 0
    };
    
    contract.terms = `تبادل أراضي: ${data.territoryA} مقابل ${data.territoryB} مع تعويض ${data.compensation}$.`;
    
    this.contracts[contract.id] = contract;
    return { success: true, message: 'تم إنشاء عقد تبادل الأراضي', contractId: contract.id, contract };
  }

  // قبول عقد (من قبل الطرف الآخر)
  acceptContract(contractId, playerId) {
    const contract = this.contracts[contractId];
    if (!contract) {
      return { success: false, message: 'العقد غير موجود' };
    }

    if (contract.status !== 'pending') {
      return { success: false, message: 'هذا العقد لم يعد متاحاً للقبول' };
    }

    // التحقق من أن اللاعب هو الطرف المعني
    let isValidParty = false;
    switch (contract.type) {
      case 'protection':
        isValidParty = (playerId === contract.details.protector || playerId === contract.details.protectedPlayer);
        break;
      case 'assassination':
        isValidParty = (playerId === contract.details.assassin);
        break;
      case 'alliance':
        isValidParty = (playerId === contract.details.partyB);
        break;
      case 'loan':
        isValidParty = (playerId === contract.details.borrower);
        break;
      case 'territory':
        isValidParty = (playerId === contract.details.partyB);
        break;
    }

    if (!isValidParty) {
      return { success: false, message: 'ليس لديك صلاحية لقبول هذا العقد' };
    }

    contract.parties[playerId] = {
      role: 'acceptor',
      accepted: true,
      signedAt: new Date().toISOString()
    };

    contract.status = 'active';
    contract.activatedAt = new Date().toISOString();

    // إذا كان عقد اغتيال، نضيفه لقائمة العقود النشطة للقاتل
    if (contract.type === 'assassination') {
      // يمكن إضافة منطق خاص هنا
    }

    return { success: true, message: 'تم قبول العقد', contract };
  }

  // رفض عقد
  rejectContract(contractId, playerId) {
    const contract = this.contracts[contractId];
    if (!contract) {
      return { success: false, message: 'العقد غير موجود' };
    }

    if (contract.status !== 'pending') {
      return { success: false, message: 'هذا العقد لم يعد متاحاً للرفض' };
    }

    contract.status = 'rejected';
    contract.rejectedAt = new Date().toISOString();
    contract.rejectedBy = playerId;

    return { success: true, message: 'تم رفض العقد' };
  }

  // تنفيذ عقد (خاص بعقود الاغتيال والحماية)
  executeContract(contractId, executorId, proof) {
    const contract = this.contracts[contractId];
    if (!contract) {
      return { success: false, message: 'العقد غير موجود' };
    }

    if (contract.status !== 'active') {
      return { success: false, message: 'العقد غير نشط' };
    }

    let result = { success: false, message: 'لا يمكن تنفيذ هذا العقد' };

    switch (contract.type) {
      case 'assassination':
        result = this.executeAssassination(contract, executorId, proof);
        break;
      case 'protection':
        result = this.executeProtection(contract, executorId, proof);
        break;
      case 'loan':
        result = this.executeLoan(contract, executorId, proof);
        break;
      // باقي العقود قد تتطلب تنفيذ
    }

    if (result.success) {
      contract.status = 'completed';
      contract.completedAt = new Date().toISOString();
      contract.result = result;
      // نقل العقد إلى السجل
      this.contractHistory[contractId] = contract;
      delete this.contracts[contractId];
    }

    return result;
  }

  // تنفيذ عقد اغتيال
  executeAssassination(contract, assassinId, proof) {
    if (assassinId !== contract.details.assassin) {
      return { success: false, message: 'أنت لست المنفذ المعين' };
    }

    // التحقق من صحة الإثبات (يمكن أن يكون معرف جلسة القتل)
    if (!proof || !proof.targetId || proof.targetId !== contract.details.target) {
      return { success: false, message: 'إثبات غير صالح' };
    }

    // تحويل المكافأة (هذا يتم في gameLogic)
    return {
      success: true,
      message: `تم تنفيذ عقد الاغتيال بنجاح، استلمت ${contract.details.reward}$`,
      reward: contract.details.reward,
      target: contract.details.target
    };
  }

  // تنفيذ عقد حماية
  executeProtection(contract, protectorId, proof) {
    if (protectorId !== contract.details.protector) {
      return { success: false, message: 'أنت لست الحامي' };
    }

    // هنا يمكن التحقق من أن فترة الحماية انتهت دون هجوم
    return {
      success: true,
      message: `تم تنفيذ عقد الحماية بنجاح، استلمت ${contract.details.paymentAmount}$`,
      payment: contract.details.paymentAmount
    };
  }

  // تنفيذ عقد قرض (سداد)
  executeLoan(contract, payerId, proof) {
    if (payerId !== contract.details.borrower) {
      return { success: false, message: 'أنت لست المقترض' };
    }

    // تحويل المبلغ + الفائدة (يتم في gameLogic)
    const totalAmount = contract.details.amount * (1 + contract.details.interestRate);
    return {
      success: true,
      message: `تم سداد القرض بقيمة ${totalAmount}$`,
      amount: totalAmount,
      interest: contract.details.amount * contract.details.interestRate
    };
  }

  // إلغاء عقد
  cancelContract(contractId, playerId) {
    const contract = this.contracts[contractId];
    if (!contract) {
      return { success: false, message: 'العقد غير موجود' };
    }

    if (contract.creator !== playerId) {
      return { success: false, message: 'فقط منشئ العقد يمكنه إلغاؤه' };
    }

    if (contract.status !== 'pending' && contract.status !== 'active') {
      return { success: false, message: 'لا يمكن إلغاء هذا العقد في حالته الحالية' };
    }

    contract.status = 'cancelled';
    contract.cancelledAt = new Date().toISOString();
    contract.cancelledBy = playerId;

    return { success: true, message: 'تم إلغاء العقد' };
  }

  // الحصول على عقود لاعب معين
  getPlayerContracts(playerId, filter = 'all') {
    const result = {
      created: [],
      pending: [],
      active: [],
      completed: []
    };

    // البحث في العقود النشطة
    for (const contractId in this.contracts) {
      const contract = this.contracts[contractId];
      if (contract.creator === playerId) {
        result.created.push(contract);
      }
      if (contract.parties[playerId]) {
        if (contract.status === 'pending') result.pending.push(contract);
        else if (contract.status === 'active') result.active.push(contract);
      }
    }

    // البحث في السجل
    for (const contractId in this.contractHistory) {
      const contract = this.contractHistory[contractId];
      if (contract.creator === playerId || contract.parties[playerId]) {
        result.completed.push(contract);
      }
    }

    if (filter === 'all') return result;
    return result[filter] || [];
  }

  // الحصول على تفاصيل عقد
  getContract(contractId) {
    return this.contracts[contractId] || this.contractHistory[contractId] || null;
  }
}

module.exports = SmartContractSystem;