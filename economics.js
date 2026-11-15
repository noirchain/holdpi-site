/* PI economic functions. No market feeds, random balances or fixed return. */
(function (root) {
  'use strict';
  const knots = [[0,1000],[1,800],[3,600],[7,400],[14,200],[30,100]];
  function sellBps(day) {
    day = Math.max(0, Math.floor(Number(day) || 0));
    for (let i = 0; i < knots.length - 1; i++) {
      const [a, high] = knots[i], [b, low] = knots[i+1];
      if (day < b) return high - Math.floor((high-low)*(day-a)/(b-a));
    }
    return 100;
  }
  const weight = day => day < 1 ? 0 : day < 7 ? 1 : day < 30 ? 1.5 : 2;
  const nonnegative = x => Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0;
  function calculate(p) {
    const holdings = Math.min(1e9, nonnegative(p.holdings)), days = nonnegative(p.days);
    const volume = Math.min(1e12, nonnegative(p.volume)), otherWeight = Math.min(2e9, nonnegative(p.otherWeight));
    const buyFraction = Math.min(1, nonnegative(p.buyFraction));
    const averageSell = Math.min(1000, Math.max(100, nonnegative(p.averageSellBps)));
    const conversionLoss = Math.min(1, nonnegative(p.conversionLoss));
    const userWeight = holdings * weight(days);
    const totalWeight = otherWeight + userWeight;
    const share = totalWeight > 0 ? userWeight / totalWeight : 0;
    const gross = volume * (buyFraction*500 + (1-buyFraction)*averageSell) / 10000;
    const received = gross * (1-conversionLoss);
    return {days, weight:weight(days), sellBps:sellBps(days), share, gross, received,
      holderPool:received*.70, buyback:received*.15, liquidity:received*.10,
      operations:received*.05, payout:received*.70*share};
  }
  const api = Object.freeze({knots, sellBps, weight, calculate});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PIEconomics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
