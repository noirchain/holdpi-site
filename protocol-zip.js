/* Append a stored configuration to our ordinary ZIP package. No ZIP64 support. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HoldZip=api;})(globalThis,function(){
  const enc=new TextEncoder();
  function crc32(data){let crc=0xffffffff;for(const x of data){crc^=x;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
  function append(bytes,name,content){
    const original=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(original.buffer,original.byteOffset,original.byteLength);
    let end=-1;for(let i=original.length-22;i>=Math.max(0,original.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===original.length){end=i;break;}
    if(end<0)throw Error('Invalid contract archive.');
    const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),offset=v.getUint32(end+16,true);
    if(count===65535||offset+size!==end||v.getUint16(end+4,true)!==0)throw Error('Unsupported contract archive.');
    const n=enc.encode(name),data=enc.encode(content),crc=crc32(data);
    const local=new Uint8Array(30+n.length+data.length),l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,n.length,true);local.set(n,30);local.set(data,30+n.length);
    const central=new Uint8Array(46+n.length),c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,n.length,true);c.setUint32(42,offset,true);central.set(n,46);
    const out=new Uint8Array(offset+local.length+size+central.length+22);out.set(original.subarray(0,offset));out.set(local,offset);out.set(original.subarray(offset,end),offset+local.length);out.set(central,offset+local.length+size);
    const e=new DataView(out.buffer,out.length-22);e.setUint32(0,0x06054b50,true);e.setUint16(8,count+1,true);e.setUint16(10,count+1,true);e.setUint32(12,size+central.length,true);e.setUint32(16,offset+local.length,true);return out;
  }
  return {append,crc32};
});
