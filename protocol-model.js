(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HoldProtocol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = 'holdpi.protocol.v1';
  const DEFAULTS = Object.freeze({
    buy:5, sellStart:10, sellFloor:1, decayDays:30, curve:'pi',
    roundMinutes:15, qualificationDays:1, loyaltyDays:30, maxWeight:2,
    rewardCurve:'pi', minFunding:'0', holders:70, burn:15, liquidity:10, operations:5,
    name:'Passive Income', symbol:'PI', supply:'1000000000', raiseBNB:'400',
    volume:100, buyShare:50, sellAge:7, conversionCost:0.5, holdingDays:7,
    holding:1000000, otherWeight:500000000
  });
  const TOKEN_TYPE = 'tuple(address core,address rewardsImplementation,address treasuryImplementation,address router,address operations,uint16 buyBps,uint16[] sellBps,uint16[] weightBps,uint32 roundSeconds,uint256 minFunding,uint16[] splitBps)';
  const INIT_TYPE = 'tuple(string name,string symbol,string tokenUri,uint256 maxSupply,uint256 saleAmount,uint256 raiseAmount,address quoteAsset,bytes32 tokenSalt,bytes tokenParams,bytes vaultParams,bytes curveParams,bytes tradeParams,bytes migrateParams,bytes customDataParams)';
  const CREATE_TYPE = 'tuple(uint256 requestId,uint256 presetId,uint256 validTimestamp,uint256 createFee,uint256 presaleQuote,bool antiSniperEnabled,address partner,' + INIT_TYPE + ' initParams)';
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  function validate(s) {
    const errors=[];
    function num(k,lo,hi,integer=false) {
      if(typeof s[k] !== 'number' || !Number.isFinite(s[k]) || s[k]<lo || s[k]>hi || (integer && !Number.isInteger(s[k]))) errors.push(k+' is outside its supported range.');
    }
    ['buy','sellStart','sellFloor'].forEach(k=>num(k,0,10));
    if(s.sellFloor>s.sellStart) errors.push('The sell floor must be at or below the starting tax.');
    num('decayDays',1,30,true); num('roundMinutes',1,1440,true);
    num('qualificationDays',1,30,true);num('loyaltyDays',1,30,true);num('maxWeight',1,5);
    if(s.loyaltyDays<s.qualificationDays)errors.push('Maximum loyalty must come after qualification.');
    if(!['pi','linear','early','late'].includes(s.curve))errors.push('Choose a supported sell curve.');
    if(!['pi','linear'].includes(s.rewardCurve))errors.push('Choose a supported reward curve.');
    ['holders','burn','liquidity','operations'].forEach(k=>num(k,0,100,true));
    if(s.holders+s.burn+s.liquidity+s.operations!==100)errors.push('Treasury allocations must add up to 100%.');
    num('volume',0,1e9);num('buyShare',0,100);num('sellAge',0,30,true);
    num('conversionCost',0,100);num('holdingDays',0,30,true);
    num('holding',0,1e18);num('otherWeight',0,1e20);
    try { const n=wei(s.minFunding);if(n<0n||n>10n**24n)throw 0; }catch {errors.push('Minimum funding must be a BNB amount between 0 and 1,000,000.');}
    if(typeof s.name!=='string'||!s.name.trim()||new TextEncoder().encode(s.name).length>64)errors.push('Use a token name of 1 to 64 UTF-8 bytes.');
    if(typeof s.symbol!=='string'||!/^[A-Za-z0-9]{1,12}$/.test(s.symbol))errors.push('Use a ticker of 1 to 12 letters or numbers.');
    if(typeof s.supply!=='string'||!/^\d+$/.test(s.supply)||BigInt(s.supply)<5n||BigInt(s.supply)>10n**12n)errors.push('Supply must be a whole number from 5 to 1 trillion tokens.');
    try {const n=wei(s.raiseBNB);if(n<=0n||n>10n**24n||n%4n)throw 0;}catch{errors.push('Use a positive BNB raise target with at most 15 decimal places.');}
    return errors;
  }
  function wei(value) {
    const s=String(value);if(!/^\d+(\.\d{1,18})?$/.test(s))throw Error('Invalid decimal');
    const [a,b='']=s.split('.');return BigInt(a)*10n**18n+BigInt(b.padEnd(18,'0'));
  }
  function interpolate(x, knots) {
    if(x<=knots[0][0])return knots[0][1];
    for(let i=1;i<knots.length;i++)if(x<=knots[i][0]){
      const [a,h]=knots[i-1],[b,l]=knots[i];return h+(l-h)*(x-a)/(b-a);
    }
    return knots.at(-1)[1];
  }
  function sellTable(s) {
    const start=Math.round(s.sellStart*100),floor=Math.round(s.sellFloor*100);
    return Array.from({length:31},(_,d)=>{
      const x=clamp(d/s.decayDays,0,1);
      const progress=s.curve==='pi'?1-interpolate(x*30,[[0,1],[1,7/9],[3,5/9],[7,3/9],[14,1/9],[30,0]]):s.curve==='early'?1-(1-x)**3:s.curve==='late'?x**3:x;
      // Round the reduction down, including a small float tolerance at exact bps.
      return clamp(start-Math.floor((start-floor)*progress+1e-9),floor,start);
    });
  }
  function weightTable(s) {
    return Array.from({length:31},(_,d)=>{
      if(d<s.qualificationDays)return 0;
      const x=s.loyaltyDays===s.qualificationDays?1:clamp((d-s.qualificationDays)/(s.loyaltyDays-s.qualificationDays),0,1);
      const progress=s.rewardCurve==='pi'?(x>=1?1:x>=6/29?.5:0):x;
      return Math.round((1+(s.maxWeight-1)*progress)*10000);
    });
  }
  function policy(s) {
    const errors=validate(s);if(errors.length)throw Error(errors.join(' '));
    return {buyBps:Math.round(s.buy*100),sellBps:sellTable(s),weightBps:weightTable(s),roundSeconds:s.roundMinutes*60,minFunding:wei(s.minFunding).toString(),splitBps:[s.holders,s.burn,s.liquidity,s.operations].map(x=>x*100)};
  }
  function result(s) {
    const sells=sellTable(s),weights=weightTable(s),age=clamp(Math.floor(s.sellAge),0,30),held=clamp(Math.floor(s.holdingDays),0,30);
    const buyVolume=Math.max(0,s.volume)*clamp(s.buyShare,0,100)/100;
    const sellVolume=Math.max(0,s.volume)-buyVolume;
    const gross=buyVolume*s.buy/100+sellVolume*sells[age]/10000;
    const net=gross*(1-clamp(s.conversionCost,0,100)/100);
    const split=[s.holders,s.burn,s.liquidity,s.operations].map(x=>net*x/100);
    const weight=Math.max(0,s.holding)*weights[held]/10000;
    const share=weight/(Math.max(0,s.otherWeight)+weight)||0;
    const roundFund=split[0]*s.roundMinutes/1440;
    return {sellRate:sells[age]/100,weight:weights[held]/10000,gross,net,split,share,payout:split[0]*share,roundFund,roundPayout:roundFund*share,canSettle:roundFund>0&&roundFund>=Number(s.minFunding)};
  }
  function exportConfig(s) {
    const p=policy(s),supply=BigInt(s.supply)*10n**18n;
    return {schema:VERSION,network:'BNB Smart Chain',chainId:56,rewardAsset:'BNB',protocolStatus:'review-source-unregistered',settings:Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,s[k]])),policy:p,token:{name:s.name.trim(),symbol:s.symbol,maxSupply:supply.toString(),saleAmount:(supply*4n/5n).toString(),raiseAmount:wei(s.raiseBNB).toString(),virtualToken:supply.toString(),virtualQuote:(wei(s.raiseBNB)/4n).toString()},semantics:{age:'max(0,floor(now/86400)-ceil(acquisition/86400))',exits:'newest-first; transfers taxed and reset recipient age',settlement:'permissionless funded rounds; user claims BNB or WBNB',policy:'fixed per token initialization; OpenFour upgrade authority remains external'}};
  }
  function importConfig(input) {
    if(input?.schema!==VERSION||!input.settings)throw Error('This is not a HoldPI protocol configuration.');
    const s={...DEFAULTS};for(const k of Object.keys(DEFAULTS))if(Object.hasOwn(input.settings,k))s[k]=input.settings[k];
    const errors=validate(s);if(errors.length)throw Error(errors.join(' '));
    for(const k of ['volume','buyShare','sellAge','conversionCost','holdingDays','holding','otherWeight'])if(!Number.isFinite(s[k])||s[k]<0)throw Error('Invalid scenario value: '+k);
    return s;
  }
  function encodeToken(ethers, config, bindings) {
    const p=config.policy;
    for(const k of ['core','rewardsImplementation','treasuryImplementation','router','operations'])if(!ethers.isAddress(bindings[k])||bindings[k]===ethers.ZeroAddress)throw Error('Missing address: '+k);
    return ethers.AbiCoder.defaultAbiCoder().encode([TOKEN_TYPE],[[bindings.core,bindings.rewardsImplementation,bindings.treasuryImplementation,bindings.router,bindings.operations,p.buyBps,p.sellBps,p.weightBps,p.roundSeconds,p.minFunding,p.splitBps]]);
  }
  function launchParams(ethers,config,bindings) {
    const t=config.token;
    return {name:t.name,symbol:t.symbol,tokenUri:bindings.tokenUri||'',maxSupply:t.maxSupply,saleAmount:t.saleAmount,raiseAmount:t.raiseAmount,quoteAsset:bindings.quoteAsset,tokenSalt:bindings.tokenSalt||ethers.ZeroHash,tokenParams:encodeToken(ethers,config,bindings),vaultParams:'0x',curveParams:ethers.AbiCoder.defaultAbiCoder().encode(['tuple(uint256 virtualToken,uint256 virtualQuote)'],[[t.virtualToken,t.virtualQuote]]),tradeParams:'0x',migrateParams:'0x',customDataParams:'0x'};
  }
  return {VERSION,DEFAULTS,TOKEN_TYPE,INIT_TYPE,CREATE_TYPE,validate,wei,sellTable,weightTable,policy,result,exportConfig,importConfig,encodeToken,launchParams};
});
