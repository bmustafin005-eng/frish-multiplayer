const express=require('express');
const http=require('http');
const {Server}=require('socket.io');

const app=express();
const server=http.createServer(app);
const io=new Server(server);

const INDEX_HTML = "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>ФРИШ Multiplayer Test v0.3</title><style>\nbody{font-family:Arial,sans-serif;background:#143d2b;color:#fff;margin:0;padding:24px}main{max-width:760px;margin:auto}.card{background:#f5efe2;color:#151515;border-radius:18px;padding:20px;margin:14px 0}button,input{font-size:16px;padding:12px;border-radius:10px;border:0;margin:5px}button{cursor:pointer}.seats{display:grid;grid-template-columns:1fr 1fr;gap:10px}.seat{background:#fff;color:#111;padding:14px;border-radius:12px}.muted{opacity:.55}.code{font-size:28px;font-weight:700;letter-spacing:2px}#log{white-space:pre-line;min-height:80px}</style></head><body><main><h1>ФРИШ · Multiplayer Test</h1>\n<div class=\"card\" id=\"gate\"><input id=\"name\" placeholder=\"Ваше имя\"><br><button id=\"create\">Создать комнату</button><input id=\"codeIn\" placeholder=\"FRISH-0000\"><button id=\"join\">Войти</button><p id=\"err\"></p></div>\n<div class=\"card\" id=\"room\" hidden><div>Код комнаты</div><div class=\"code\" id=\"code\"></div><p>Передайте этот код другим игрокам. Можно подключить от 1 до 3 человек.</p><div class=\"seats\" id=\"seats\"></div><button id=\"start\">НАЧАТЬ ТЕСТ</button></div>\n<div class=\"card\" id=\"status\" hidden><b>События</b><div id=\"log\"></div><input id=\"msg\" placeholder=\"Сообщение\"><button id=\"send\">Отправить</button></div>\n<script src=\"/socket.io/socket.io.js\"></script><script>\nconst s=io(),$=q=>document.querySelector(q);let meHost=false;\n$('#create').onclick=()=>{meHost=true;s.emit('create',{name:$('#name').value})};$('#join').onclick=()=>s.emit('join',{code:$('#codeIn').value,name:$('#name').value});$('#start').onclick=()=>s.emit('start');$('#send').onclick=()=>{if($('#msg').value){s.emit('chat',$('#msg').value);$('#msg').value=''}};\ns.on('err',x=>$('#err').textContent=x);s.on('room',r=>{$('#gate').hidden=true;$('#room').hidden=false;$('#status').hidden=false;$('#code').textContent=r.code;$('#start').style.display=meHost&&!r.started?'inline-block':'none';$('#seats').innerHTML=r.players.map((p,i)=>`<div class=\"seat ${p&&!p.connected?'muted':''}\">${i+1}. ${p?(p.name+(p.bot?' · БОТ':'')+(p.connected?'':' · ОТКЛЮЧЕН')):'свободно'}</div>`).join('');$('#log').textContent=r.log.join('\\n')});s.on('game',g=>alert(g.message));\n</script></main></body></html>\n";

app.get('/',(req,res)=>res.type('html').send(INDEX_HTML));
app.get('/health',(req,res)=>res.json({ok:true,service:'FRISH Multiplayer Test'}));

const rooms=new Map();
const names=['ИГОРЬ','ДЖАМАЛ','ВАЛЕК','АЛЕКСЕЙ'];

function code(){
  let c;
  do{ c='FRISH-'+Math.floor(1000+Math.random()*9000); }while(rooms.has(c));
  return c;
}
function roomView(r){
  return {
    code:r.code,
    players:r.players.map((p,i)=>p?{name:p.name,bot:p.bot,connected:p.connected,seat:i}:null),
    started:r.started,
    log:r.log.slice(-12)
  };
}
function emit(r){ io.to(r.code).emit('room',roomView(r)); }
function fillBots(r){
  for(let i=0;i<4;i++){
    if(!r.players[i]) r.players[i]={name:names[i],bot:true,connected:true};
  }
}

io.on('connection',s=>{
  s.on('create',({name})=>{
    const c=code();
    const r={
      code:c,
      players:[{id:s.id,name:name||'ИГОРЬ',bot:false,connected:true},null,null,null],
      started:false,
      log:['Комната создана']
    };
    rooms.set(c,r);
    s.join(c);
    s.data={code:c,seat:0};
    emit(r);
  });

  s.on('join',({code:c,name})=>{
    c=(c||'').toUpperCase().trim();
    const r=rooms.get(c);
    if(!r) return s.emit('err','Комната не найдена');
    if(r.started) return s.emit('err','Игра уже началась');
    const seat=r.players.findIndex(x=>!x);
    if(seat<0) return s.emit('err','Комната заполнена');
    r.players[seat]={id:s.id,name:name||names[seat],bot:false,connected:true};
    s.join(c);
    s.data={code:c,seat};
    r.log.push(`${r.players[seat].name} подключился`);
    emit(r);
  });

  s.on('start',()=>{
    const r=rooms.get(s.data?.code);
    if(!r||s.data.seat!==0) return;
    fillBots(r);
    r.started=true;
    r.log.push('Тестовая партия запущена. Свободные места заняли боты.');
    emit(r);
    io.to(r.code).emit('game',{
      message:'Мультиплеерная комната работает. Следующий этап — подключение полного движка правил ФРИШ.'
    });
  });

  s.on('chat',msg=>{
    const r=rooms.get(s.data?.code);
    if(!r) return;
    const p=r.players[s.data.seat];
    r.log.push(`${p?.name||'Игрок'}: ${String(msg).slice(0,120)}`);
    emit(r);
  });

  s.on('disconnect',()=>{
    const r=rooms.get(s.data?.code);
    if(!r) return;
    const p=r.players[s.data.seat];
    if(p&&!p.bot){
      p.connected=false;
      r.log.push(`${p.name} отключился`);
      emit(r);
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('FRISH multiplayer on '+PORT));
