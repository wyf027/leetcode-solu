import React from 'react';
import { formatExpiry } from '../../domain/credits.js';
function Wallet({ wallet }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const refreshTimer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(refreshTimer);
  }, []);
  const description = wallet.length
    ? wallet
        .map((account) => {
          const expiry = formatExpiry(account.expiresAt, now);
          return `${account.label}剩余 ${account.remaining} 次${expiry ? `，${expiry.text}` : ''}`;
        })
        .join('；')
    : '当前没有可用额度';
  return (
    <div className="entitlement-wallet" aria-label={description}>
      <span className="entitlement-wallet__status" aria-hidden="true" />
      {wallet.length === 0 && (
        <span className="entitlement-tier entitlement-tier--standard">
          <span>可用额度</span>
          <strong>
            0<small>次</small>
          </strong>
        </span>
      )}
      {wallet.map((account, index) => {
        const expiry = formatExpiry(account.expiresAt, now);
        const sameGroup = index > 0 && wallet[index - 1].groupKey === account.groupKey;
        return (
          <span
            key={account.key}
            className={`entitlement-tier entitlement-tier--${account.tier === 30 ? 'standard' : 'long'}`}
          >
            {!sameGroup && <span>{account.label}</span>}
            <strong>
              {account.remaining}
              <small>次</small>
            </strong>
            {expiry && (
              <em className={`entitlement-tier__expiry${expiry.urgent ? ' is-urgent' : ''}`}>
                {expiry.text}
              </em>
            )}
          </span>
        );
      })}
    </div>
  );
}
export { Wallet };
