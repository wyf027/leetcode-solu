const CREDIT_LABELS = {
  30: '30 页内',
  50: '31–60 页',
  60: '31–60 页',
};
const normalizeTier = (tier) => {
  if (tier === 50) {
    return 60;
  }
  return tier;
};
function normalizeCredits(response) {
  const accounts = Array.isArray(response?.items) ? response.items : [];
  const availableAccounts = [];
  const spentByTier = new Map();
  for (const account of accounts) {
    const tier = Number(account.page_tier);
    const remaining = Number(account.balance?.available ?? 0);
    const consumed = Number(account.balance?.consumed ?? 0);
    const label = CREDIT_LABELS[account.page_tier] ?? `${account.page_tier} 页内`;
    if (remaining > 0) {
      availableAccounts.push({
        key: String(account.account_id ?? `${tier}-${account.expires_at ?? '永久'}`),
        tier,
        groupKey: normalizeTier(tier),
        label,
        remaining,
        reserved: Number(account.balance?.reserved ?? 0),
        consumed,
        expiresAt: account.expires_at ?? null,
      });
    } else if (consumed > 0) {
      const groupTier = normalizeTier(tier);
      const spentAccount = spentByTier.get(groupTier) ?? {
        key: `spent-${groupTier}`,
        tier: groupTier,
        groupKey: groupTier,
        label,
        remaining: 0,
        reserved: 0,
        consumed: 0,
        expiresAt: null,
      };
      spentAccount.consumed += consumed;
      spentByTier.set(groupTier, spentAccount);
    }
  }
  const availableTiers = new Set(availableAccounts.map((account) => normalizeTier(account.tier)));
  for (const groupTier of [...spentByTier.keys()]) {
    if (availableTiers.has(groupTier)) {
      spentByTier.delete(groupTier);
    }
  }
  return [...availableAccounts, ...spentByTier.values()].sort((left, right) => {
    if (normalizeTier(left.tier) !== normalizeTier(right.tier)) {
      return normalizeTier(left.tier) - normalizeTier(right.tier);
    }
    if ((left.remaining > 0) !== (right.remaining > 0)) {
      if (left.remaining > 0) {
        return -1;
      }
      return 1;
    }
    const leftExpiry = left.expiresAt ? Date.parse(left.expiresAt) : Infinity;
    const rightExpiry = right.expiresAt ? Date.parse(right.expiresAt) : Infinity;
    return leftExpiry - rightExpiry;
  });
}
function formatExpiry(expiresAt, now = Date.now()) {
  if (!expiresAt) {
    return null;
  }
  const expiryTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryTime)) {
    return null;
  }
  const remainingMs = expiryTime - now;
  if (remainingMs <= 0) {
    return {
      text: '已过期',
      urgent: true,
    };
  }
  const minutes = remainingMs / 60000;
  if (minutes < 60) {
    return {
      text: `剩 ${Math.max(1, Math.round(minutes))} 分钟`,
      urgent: true,
    };
  }
  const hours = remainingMs / 3600000;
  if (hours < 24) {
    return {
      text: `剩 ${Math.floor(hours)} 小时`,
      urgent: hours < 3,
    };
  }
  const days = Math.floor(hours / 24);
  if (days <= 7) {
    return {
      text: `剩 ${days} 天`,
      urgent: false,
    };
  }
  const expiryDate = new Date(expiryTime);
  return {
    text: `${expiryDate.getMonth() + 1} 月 ${expiryDate.getDate()} 日到期`,
    urgent: false,
  };
}
function getEligibleTiers(maxPages) {
  if (maxPages <= 30) {
    return [30, 50, 60];
  }
  if (maxPages <= 50) {
    return [50, 60];
  }
  return [60];
}
function getAvailableCredits(credits, maxPages) {
  const eligibleTiers = getEligibleTiers(maxPages);
  return credits
    .filter((account) => eligibleTiers.includes(account.tier))
    .reduce((acc, item) => acc + item.remaining, 0);
}
function getConsumptionLabel(credits, maxPages) {
  const matchingTier = getEligibleTiers(maxPages).find((tier) =>
    credits.some((account) => account.tier === tier && account.remaining > 0),
  );
  if (matchingTier) {
    return `${CREDIT_LABELS[matchingTier] ?? `${matchingTier} 页内`}额度 · 1 次`;
  }
  return '额度不足';
}
export {
  CREDIT_LABELS,
  normalizeTier,
  normalizeCredits,
  formatExpiry,
  getEligibleTiers,
  getAvailableCredits,
  getConsumptionLabel,
};
