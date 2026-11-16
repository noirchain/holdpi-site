(() => {
  'use strict';
  const M=window.HoldProtocol,$=id=>document.getElementById(id),KEY='holdpi.protocol.v1';
  // The recovered intro locks its first layout. Release those locks on a
  // viewport change so switching between phone and desktop cannot clip text.
  window.addEventListener('resize',()=>{
    const title=document.querySelector('.hero-title');
    if(title){title.style.height='auto';title.querySelectorAll('.hl').forEach(el=>el.style.minWidth='');}
  });
  let s={...M.DEFAULTS},notice='',busy=false,archive;
  try{const saved=localStorage.getItem(KEY);if(saved)s=M.importConfig(JSON.parse(saved));}catch{}
  try{if(location.hash.startsWith('#model=')){
    if(location.hash.length>12000)throw Error('Model link is too large.');
    const b64=location.hash.slice(7).replace(/-/g,'+').replace(/_/g,'/');
    const json=new TextDecoder().decode(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)));
    s=M.importConfig(JSON.parse(json));notice='Shared model loaded. Your settings are saved on this device.';
  }}catch(e){notice='Could not load this model link. '+e.message;}
  const pct=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2})+'%';
  const bnb=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:6});
  const set=(id,text)=>{$(id).textContent=text;};
  const numKeys=Object.keys(M.DEFAULTS).filter(k=>typeof M.DEFAULTS[k]==='number');
  function graph(id,values,max,height){
    const x=d=>42+d*14.35,y=v=>height-30-v/max*(height-55);
    const path=values.map((v,d)=>(d===0?'M':'H')+x(d).toFixed(2)+(d===0?' '+y(v).toFixed(2):'V'+y(v).toFixed(2))).join(' ');
    let html='';for(let i=0;i<5;i++){const yy=y(max*i/4);html+=`<line class="grid-line" x1="42" y1="${yy}" x2="473" y2="${yy}"/><text x="1" y="${yy+4}">${id==='sell-chart'?Math.round(max*i/4*100)/100+'%':(max*i/4).toFixed(1)+'×'}</text>`;}
    for(const d of[0,7,14,21,30])html+=`<line class="grid-line" x1="${x(d)}" y1="25" x2="${x(d)}" y2="${height-30}"/><text x="${x(d)}" y="${height-9}" text-anchor="middle">${d}d</text>`;
    html+=`<path class="chart-fill" d="${path}V${height-30}H42Z"/><path class="chart-line" d="${path}"/><circle class="end-dot" cx="${x(30)}" cy="${y(values[30])}" r="3.5"/>`;
    $(id).innerHTML=html;
  }
  function syncInputs(){for(const el of document.querySelectorAll('[data-key]'))el.value=s[el.dataset.key];}
  function render(){
    const errors=M.validate(s),valid=errors.length===0;
    const sell=M.sellTable(s),weight=M.weightTable(s),r=M.result(s);
    for(const el of document.querySelectorAll('input[type=range][data-key]')){
      const k=el.dataset.key,v=s[k],min=+el.min,max=+el.max;
      el.style.setProperty('--fill',((v-min)/(max-min)*100)+'%');
      let text=['buy','sellStart','sellFloor','holders','burn','liquidity','operations','buyShare'].includes(k)?pct(v):k==='maxWeight'?v+'×':k==='roundMinutes'?v>=60&&v%60===0?v/60+'h':v+'m':v+'d';
      set('o-'+k,text);el.setAttribute('aria-valuetext',text);
    }
    document.querySelectorAll('[data-curve]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.curve===s.curve)));
    document.querySelectorAll('[data-reward-curve]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.rewardCurve===s.rewardCurve)));
    set('strip-buy',pct(s.buy));set('strip-sell',s.sellStart+' → '+pct(s.sellFloor));set('strip-holders',pct(s.holders));
    set('curve-from',pct(s.sellStart));set('curve-to',pct(s.sellFloor));set('curve-duration',s.decayDays+' DAYS');
    graph('sell-chart',sell.map(x=>x/100),10,280);graph('weight-chart',weight.map(x=>x/10000),Math.max(2,s.maxWeight),220);
    set('weight-max',s.maxWeight);set('reward-first','QUALIFIES AT DAY '+s.qualificationDays);set('reward-last','MAX AT DAY '+s.loyaltyDays);
    set('p-round-description',`Funded rounds can settle every ${s.roundMinutes} minute${s.roundMinutes===1?'':'s'}. A keeper or any user must call settlement; elapsed time alone does not send a transaction.`);
    $('daily-table').innerHTML=sell.map((v,i)=>`<tr><td>${i===30?'30+':i}</td><td>${pct(v/100)}</td><td>${(weight[i]/10000).toFixed(2)}×</td></tr>`).join('');
    const allocations=[s.holders,s.burn,s.liquidity,s.operations],total=allocations.reduce((a,b)=>a+b,0);
    document.querySelectorAll('#allocation-bar>span').forEach((el,i)=>{el.style.width=(total?allocations[i]/total*100:0)+'%';el.textContent=allocations[i]>=5?allocations[i]+'%':'';});
    $('allocation-bar').setAttribute('aria-label',allocations.map((n,i)=>['Holders','Buyback and burn','Liquidity','Operations'][i]+' '+n+' percent').join(', '));
    set('split-total',total+'% / 100%');$('split-feedback').classList.toggle('is-error',total!==100);
    set('split-feedback',total===100?'All fees allocated. Each budget is accounted for separately.':total<100?`Allocate the remaining ${100-total}%. The contract needs a total of 100%.`:`Reduce allocations by ${total-100}%. The contract cannot allocate more than it receives.`);
    set('r-payout',valid?bnb(r.payout):'CHECK SETTINGS');
    const ledger=[['Project fees / day',bnb(r.gross)+' BNB'],['After conversion costs',bnb(r.net)+' BNB'],['Holder pool',bnb(r.split[0])+' BNB'],['Buyback & burn',bnb(r.split[1])+' BNB'],['Locked liquidity',bnb(r.split[2])+' BNB'],['Operations',bnb(r.split[3])+' BNB'],['Assumed sell tax',pct(r.sellRate)],['Your weight / pool share',r.weight+'× / '+pct(r.share*100)],['Accrual per target interval',bnb(r.roundPayout)+' BNB']];
    $('result-ledger').innerHTML=ledger.map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
    set('round-state',!valid?'CONFIGURATION NEEDS CORRECTION':r.canSettle?'MODELED ROUND MEETS FUNDING MINIMUM':'FUNDS ACCUMULATE UNTIL THE MINIMUM IS MET');
    $('config-summary').replaceChildren();
    for(const [label,value] of [['Buy / fresh sell',pct(s.buy)+' / '+pct(s.sellStart)],['Floor / holding period',pct(s.sellFloor)+' / '+s.decayDays+'d'],['Payout / minimum interval','BNB / '+s.roundMinutes+'m'],['Treasury allocation',allocations.join(' / ')+'%'],['Rule changes after launch','No policy setters']]){
      const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;row.append(a,b);$('config-summary').append(row);
    }
    $('validation-errors').hidden=valid;set('validation-errors',errors.join(' '));
    $('download-pack').disabled=!valid||busy;$('download-config').disabled=!valid;$('share-config').disabled=!valid;
    set('config-preview',valid?JSON.stringify(M.exportConfig(s),null,2):errors.join('\n'));
    try{localStorage.setItem(KEY,JSON.stringify({schema:M.VERSION,settings:s}));set('p-autosave','SAVED ON THIS DEVICE');}catch{set('p-autosave','LOCAL STORAGE UNAVAILABLE');}
  }
  document.querySelectorAll('[data-key]').forEach(el=>el.addEventListener('input',()=>{
    const k=el.dataset.key;
    if(numKeys.includes(k)){const v=Number(el.value);if(!Number.isFinite(v))return;s[k]=v;}else s[k]=el.value;
    if(k==='sellStart'&&s.sellFloor>s.sellStart){s.sellFloor=s.sellStart;$('p-sellFloor').value=s.sellFloor;}
    if(k==='sellFloor'&&s.sellFloor>s.sellStart){s.sellStart=s.sellFloor;$('p-sellStart').value=s.sellStart;}
    if(k==='qualificationDays'&&s.loyaltyDays<s.qualificationDays){s.loyaltyDays=s.qualificationDays;$('p-loyaltyDays').value=s.loyaltyDays;}
    if(k==='loyaltyDays'&&s.qualificationDays>s.loyaltyDays){s.qualificationDays=s.loyaltyDays;$('p-qualificationDays').value=s.qualificationDays;}
    render();
  }));
  document.querySelectorAll('[data-curve]').forEach(el=>el.addEventListener('click',()=>{s.curve=el.dataset.curve;render();}));
  document.querySelectorAll('[data-reward-curve]').forEach(el=>el.addEventListener('click',()=>{s.rewardCurve=el.dataset.rewardCurve;render();}));
  $('p-reset').addEventListener('click',()=>{s={...M.DEFAULTS};syncInputs();render();set('export-feedback','PI example restored.');history.replaceState(null,'',location.pathname);});
  function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  $('download-config').addEventListener('click',()=>{try{download(JSON.stringify(M.exportConfig(s),null,2)+'\n',s.symbol.toLowerCase()+'-configuration.json','application/json');set('export-feedback','Configuration exported with all 31 daily checkpoints.');}catch(e){set('export-feedback',e.message);}});
  $('download-pack').addEventListener('click',async()=>{
    const snapshot=M.exportConfig(s);busy=true;render();set('export-feedback','Preparing the Solidity package with your configuration...');
    try{
      if(!archive){const response=await fetch('/review/holdpi-protocol-review.zip');if(!response.ok)throw Error('Contract package is unavailable. Please try again.');archive=new Uint8Array(await response.arrayBuffer());}
      const bytes=window.HoldZip.append(archive,'configuration.json',JSON.stringify(snapshot,null,2)+'\n');
      download(bytes,snapshot.token.symbol.toLowerCase()+'-contract-pack.zip','application/zip');
      set('export-feedback','Contract pack prepared: Solidity, tests, deployment preflight and your configuration.json.');
    }catch(e){set('export-feedback',e.message);}finally{busy=false;render();}
  });
  $('import-config').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>100000)throw Error('Configuration file is too large.');const next=M.importConfig(JSON.parse(await file.text()));s=next;syncInputs();render();set('export-feedback','Configuration imported. All previews now use these settings.');}
    catch(err){set('export-feedback','Import failed. '+err.message);}finally{e.target.value='';}
  });
  $('share-config').addEventListener('click',async()=>{
    try{const bytes=new TextEncoder().encode(JSON.stringify({schema:M.VERSION,settings:s}));const b64=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');await navigator.clipboard.writeText(location.origin+location.pathname+'#model='+b64);set('export-feedback','Model link copied. It includes these settings, not a wallet or private key.');}
    catch{set('export-feedback','Clipboard unavailable. Export the configuration JSON to share this model.');}
  });
  window.addEventListener('hashchange',()=>{
    if(!location.hash.startsWith('#model='))return;
    try{
      if(location.hash.length>12000)throw Error('Model link is too large.');
      const b64=location.hash.slice(7).replace(/-/g,'+').replace(/_/g,'/');
      const json=new TextDecoder().decode(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)));
      s=M.importConfig(JSON.parse(json));syncInputs();render();
      set('export-feedback','Shared model loaded. All previews now use these settings.');
    }catch(e){set('export-feedback','Could not load this model link. '+e.message);}
  });
  syncInputs();render();if(notice)set('export-feedback',notice);
})();
