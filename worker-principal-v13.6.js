import { Buffer } from "node:buffer";

const CORS={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
 "Access-Control-Allow-Headers":"Content-Type, Accept",
 "Access-Control-Expose-Headers":"Content-Type, Content-Length"
};

const json=(d,s=200)=>new Response(JSON.stringify(d),{
 status:s,
 headers:{...CORS,"Content-Type":"application/json; charset=utf-8"}
});

function allowedMediaUrl(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:") return null;
  if(u.hostname.toLowerCase()!=="cdn.estrategiaconcursos.com.br") return null;
  return u;
 }catch{
  return null;
 }
}

function u32le(b,p){
 return (b[p]|(b[p+1]<<8)|(b[p+2]<<16)|(b[p+3]<<24))>>>0;
}

function inspectWav(b){
 if(b.length<44) return {ok:false,erro:"WAV pequeno demais."};
 if(!(b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&
      b[8]===0x57&&b[9]===0x41&&b[10]===0x56&&b[11]===0x45)){
  return {ok:false,erro:"Cabeçalho RIFF/WAVE ausente."};
 }

 let p=12,fmt=null,dataSize=0;
 while(p+8<=b.length){
  const id=String.fromCharCode(b[p],b[p+1],b[p+2],b[p+3]);
  const size=u32le(b,p+4);
  const start=p+8;
  if(start>b.length)break;

  if(id==="fmt " && size>=16 && start+16<=b.length){
   fmt={
    format:b[start]|(b[start+1]<<8),
    channels:b[start+2]|(b[start+3]<<8),
    rate:u32le(b,start+4),
    bits:b[start+14]|(b[start+15]<<8)
   };
  }else if(id==="data"){
   dataSize=Math.min(size,Math.max(0,b.length-start));
  }

  p=start+size+(size&1);
 }

 if(!fmt)return {ok:false,erro:"Chunk fmt ausente no WAV."};
 if(!dataSize)return {ok:false,erro:"WAV sem dados de áudio."};

 return {ok:true,...fmt,dataSize};
}

function toBase64(bytes){
 return Buffer
  .from(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  .toString("base64");
}

function requestLanguage(request){
 const raw=(new URL(request.url).searchParams.get("lang")||"").trim().toLowerCase();
 if(!raw||raw==="auto")return null;
 return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(raw)?raw:null;
}

function quotaEsgotada(e){
 const msg=(e?.message||String(e||"")).toLowerCase();
 return /daily free allocation|10,?000 neurons|account limited|\b4006\b/.test(msg);
}

async function runBackup(env,bytes,language){
 const url=String(env.BACKUP_WORKER_URL||"").trim();
 if(!/^https:\/\/.+/i.test(url)){
  throw new Error("BACKUP_WORKER_URL não configurada no Worker principal.");
 }

 const target=new URL(url);
 if(language)target.searchParams.set("lang",language);

 const r=await fetch(target.toString(),{
  method:"POST",
  headers:{
   "Content-Type":"audio/wav",
   "Accept":"application/json"
  },
  body:bytes
 });

 const raw=await r.text();
 let d;
 try{d=JSON.parse(raw)}catch{}

 if(!r.ok||!d?.ok){
  throw new Error(
   d?.erro||raw||`Worker reserva respondeu HTTP ${r.status}.`
  );
 }

 return {
  ...d,
  failover:true,
  worker_usado:"reserva"
 };
}

function legacySegments(words){
 if(!Array.isArray(words)||!words.length)return [];
 const out=[];
 let cur=null;

 const flush=()=>{
  if(!cur||!cur.text.trim())return;
  out.push({start:cur.start,end:cur.end,text:cur.text.trim()});
  cur=null;
 };

 for(let i=0;i<words.length;i++){
  const w=words[i]||{};
  const text=String(w.word||"").trim();
  if(!text)continue;

  const start=Number(w.start||0);
  const end=Number(w.end??start);
  const next=words[i+1]||null;
  const nextStart=next?Number(next.start??end):end;

  if(!cur)cur={start,end,text};
  else{
   cur.end=end;
   cur.text+=(/^[,.;:!?)]/.test(text)?"":" ")+text;
  }

  const duration=cur.end-cur.start;
  const pause=Math.max(0,nextStart-end);
  const punctuation=/[.!?…]["')\]]?$/.test(text);

  if(duration>=5 || pause>=1 || (punctuation&&duration>=1.2))flush();
 }
 flush();
 return out;
}

async function runTurbo(env,bytes,language){
 const input={
  audio:toBase64(bytes),
  task:"transcribe",
  vad_filter:true
 };
 if(language)input.language=language;
 return env.AI.run("@cf/openai/whisper-large-v3-turbo",input);
}

async function runLegacy(env,bytes){
 const r=await env.AI.run("@cf/openai/whisper",{
  audio:[...bytes]
 });
 return {
  text:r.text||"",
  vtt:r.vtt||"",
  segmentos:legacySegments(r.words||[])
 };
}

export default{
 async fetch(request,env){
  if(request.method==="OPTIONS"){
   return new Response(null,{status:204,headers:CORS});
  }

  const reqUrl=new URL(request.url);

  if(request.method==="GET" && reqUrl.pathname==="/proxy"){
   const target=allowedMediaUrl(reqUrl.searchParams.get("url")||"");
   if(!target){
    return new Response(
     "Link não permitido. Use um link https://cdn.estrategiaconcursos.com.br/...",
     {status:400,headers:CORS}
    );
   }

   try{
    const upstream=await fetch(target.toString(),{
     method:"GET",
     redirect:"follow",
     headers:{"Accept":"video/*,audio/*,*/*"}
    });

    if(!upstream.ok){
     upstream.body?.cancel();
     return new Response(
      `O CDN respondeu HTTP ${upstream.status}. O link pode ter expirado.`,
      {status:upstream.status,headers:CORS}
     );
    }

    const h=new Headers(CORS);
    h.set("Content-Type",upstream.headers.get("Content-Type")||"application/octet-stream");
    const len=upstream.headers.get("Content-Length");
    if(len)h.set("Content-Length",len);
    h.set("Cache-Control","no-store");

    return new Response(upstream.body,{status:200,headers:h});
   }catch(e){
    return new Response(
     `Falha ao buscar o vídeo: ${e?.message||String(e)}`,
     {status:502,headers:CORS}
    );
   }
  }

  if(request.method==="GET"){
   return json({
    ok:true,
    servico:"Transcritor de Aulas",
    principal:"@cf/openai/whisper-large-v3-turbo",
    fallback:"@cf/openai/whisper",
    versao:"13.6-primary",
    proxy:true,
    audio:"wav-pcm-16khz",
    backup_configurado:/^https:\/\//i.test(String(env.BACKUP_WORKER_URL||"")),
    recuperacao:"buffer-nativo-retry-split-failover",
     idiomas:true
   });
  }

  if(request.method!=="POST"){
   return json({ok:false,erro:"Método não permitido."},405);
  }

  const language=requestLanguage(request);

  try{
   const audio=await request.arrayBuffer();

   if(!audio.byteLength){
    return json({ok:false,erro:"Áudio vazio.",tipo:"audio_invalido"},400);
   }
   if(audio.byteLength>20*1024*1024){
    return json({ok:false,erro:"Bloco de áudio maior que 20 MB.",tipo:"audio_invalido"},413);
   }

   const bytes=new Uint8Array(audio);
   const info=inspectWav(bytes);

   if(!info.ok){
    return json({
     ok:false,
     erro:`WAV inválido antes do Whisper: ${info.erro}`,
     tipo:"audio_invalido"
    },400);
   }

   try{
    const r=await runTurbo(env,bytes,language);
    return json({
     ok:true,
     texto:r.text||"",
     vtt:r.vtt||"",
     segmentos:r.segments||[],
     modelo_usado:"whisper-large-v3-turbo",
     idioma_usado:language||"auto"
    });
   }catch(e){
    const turboMsg=e?.message||String(e);

    if(quotaEsgotada(e)){
     try{
      const b=await runBackup(env,bytes,language);
      return json(b);
     }catch(backupErr){
      return json({
       ok:false,
       erro:`Cota do Worker principal esgotada. Falha ao usar o Worker reserva: ${backupErr?.message||String(backupErr)}`,
       tipo:"backup"
      },503);
     }
    }

    const decode=/3030|failed to decode audio|valid audio format/i.test(turboMsg);

    if(!decode){
     return json({ok:false,erro:turboMsg,tipo:"workers_ai"},500);
    }

    // Para blocos grandes, deixa o frontend dividir antes do fallback local.
    if(bytes.byteLength>1500000){
     return json({ok:false,erro:turboMsg,tipo:"decode_audio"},422);
    }

    try{
     const old=await runLegacy(env,bytes);
     return json({
      ok:true,
      texto:old.text||"",
      vtt:old.vtt||"",
      segmentos:old.segmentos||[],
      modelo_usado:"whisper-fallback",
      idioma_usado:"auto-fallback",
      fallback:true
     });
    }catch(e2){
     if(quotaEsgotada(e2)){
      try{
       const b=await runBackup(env,bytes,language);
       return json(b);
      }catch(backupErr){
       return json({
        ok:false,
        erro:`Cota do Worker principal esgotada. Falha ao usar o Worker reserva: ${backupErr?.message||String(backupErr)}`,
        tipo:"backup"
       },503);
      }
     }

     return json({
      ok:false,
      erro:`Turbo: ${turboMsg} | Fallback Whisper: ${e2?.message||String(e2)}`,
      tipo:"decode_audio"
     },422);
    }
   }

  }catch(e){
   console.error(e);
   return json({ok:false,erro:e?.message||String(e),tipo:"worker"},500);
  }
 }
};