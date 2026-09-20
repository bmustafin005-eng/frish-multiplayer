const express=require('express'); const http=require('http'); const {Server}=require('socket.io'); const path=require('path');
const app=express(), server=http.createServer(app), io=new Server(server); app.use(express.static(path.join(__dirname,'public')));
const rooms=new Map(); const names=['ИГОРЬ','ДЖАМАЛ','ВАЛЕК','АЛЕКСЕЙ'];
function code(){let c;do{c='FRISH-'+Math.floor(1000+Math.random()*9000)}while(rooms.has(c));return c}
function roomView(r){return {code:r.code,players:r.players.map((p,i)=>p?{name:p.name,bot:p.bot,connected:p.connected,seat:i}:null),started:r.started,log:r.log.slice(-12)}}
function emit(r){io.to(r.code).emit('room',roomView(r))}
function fillBots(r){for(let i=0;i<4;i++)if(!r.players[i])r.players[i]={name:names[i],bot:true,connected:true}}
io.on('connection',s=>{
 s.on('create',({name})=>{const c=code(),r={code:c,players:[{id:s.id,name:name||'ИГОРЬ',bot:false,connected:true},null,null,null],started:false,log:['Комната создана']};rooms.set(c,r);s.join(c);s.data={code:c,seat:0};emit(r)});
 s.on('join',({code:c,name})=>{c=(c||'').toUpperCase();const r=rooms.get(c);if(!r)return s.emit('err','Комната не найдена');if(r.started)return s.emit('err','Игра уже началась');let seat=r.players.findIndex(x=>!x);if(seat<0)return s.emit('err','Комната заполнена');r.players[seat]={id:s.id,name:name||names[seat],bot:false,connected:true};s.join(c);s.data={code:c,seat};r.log.push(`${r.players[seat].name} подключился`);emit(r)});
 s.on('start',()=>{const r=rooms.get(s.data?.code);if(!r||s.data.seat!==0)return;fillBots(r);r.started=true;r.log.push('Тестовая партия запущена. Свободные места заняли боты.');emit(r);io.to(r.code).emit('game',{message:'Мультиплеерная комната работает. Следующий этап — подключение полного движка правил ФРИШ.'})});
 s.on('chat',msg=>{const r=rooms.get(s.data?.code);if(!r)return;const p=r.players[s.data.seat];r.log.push(`${p?.name||'Игрок'}: ${String(msg).slice(0,120)}`);emit(r)});
 s.on('disconnect',()=>{const r=rooms.get(s.data?.code);if(!r)return;const p=r.players[s.data.seat];if(p&&!p.bot){p.connected=false;r.log.push(`${p.name} отключился`);emit(r)}})
});
server.listen(process.env.PORT||3000,()=>console.log('FRISH multiplayer on '+(process.env.PORT||3000)));
