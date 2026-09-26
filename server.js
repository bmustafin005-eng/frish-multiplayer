const express=require('express');
const path=require('path');
const http=require('http');
const {Server}=require('socket.io');
const app=express(), server=http.createServer(app), io=new Server(server);
const PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,'public')));
const rooms=new Map();
const NAMES=['ИГОРЬ','ДЖАМАЛ','ВАЛЕК','АЛЕКСЕЙ'];
const RANKS=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
const SUITS=['♥','♣','♦','♠'];
const isJ=c=>c&&c.rank==='JOKER';
function deck(){let a=[],id=1;for(let copy=1;copy<=2;copy++)for(const suit of SUITS)for(const rank of RANKS)a.push({id:id++,rank,suit,copy});a.push({id:id++,rank:'JOKER',suit:'R',copy:1},{id:id++,rank:'JOKER',suit:'B',copy:2});for(let i=a.length-1;i;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function code(){let s;do{s='FRISH-'+Math.floor(1000+Math.random()*9000)}while(rooms.has(s));return s}
function newRoom(hostName,sid){return {code:code(),players:[{name:hostName||'Игорь',sid,bot:false},null,null,null],started:false,dealNo:1,mult:2,dealer:0,cutter:3,phase:'lobby',stock:[],svetka:null,discard:[],hands:[[],[],[],[]],melds:[],turn:0,drawn:false,log:['Комната создана'],cutTimer:null,ran:[false,false,false,false],allDeclared:[false,false,false,false],cardSaid:[false,false,false,false],frishVote:null,scoreHistory:[],turnMeldPoints:[0,0,0,0],runReady:[false,false,false,false],turnSerial:0,runClaims:[null,null,null,null],ironClaims:[],allFinisher:null,reportTimer:null,allDeadline:null,screenNotice:null,noticeTimer:null,cumulative:[0,0,0,0],dealAccum:[0,0,0,0],highlightMeldId:null,dealDisplayMult:1,rebuildCards:null,rebuildResumeTurn:null,takenDiscardId:[null,null,null,null],reclaimedJokerId:[null,null,null,null],pairFinish:[null,null,null,null],allFromHand:[false,false,false,false],bet:10,playerSuits:['♥','♣','♦','♠'],undoSnapshot:[null,null,null,null],cardWarning:[null,null,null,null],finalSettlement:null,seatChoices:[null,null,null,null],seatCards:[],seatTurn:0}}
function cardText(c){return isJ(c)?'J':c.rank+c.suit}
function publicState(r,viewer){return {code:r.code,players:r.players.map((p,i)=>p?{name:p.name,bot:p.bot,count:r.hands[i]?.length||0}:null),started:r.started,dealNo:r.dealNo,mult:r.mult,dealer:r.dealer,cutter:r.cutter,phase:r.phase,svetka:r.svetka,discard:r.discard.at(-1)||null,stockCount:r.stock.length,melds:r.melds,turn:r.turn,drawn:r.drawn,myIndex:viewer,myHand:viewer>=0?r.hands[viewer]:[],log:r.log.slice(-8),ran:r.ran,runReady:r.runReady,allDeclared:r.allDeclared,allFinisher:r.allFinisher,allDeadline:r.allDeadline,screenNotice:r.screenNotice,scoreHistory:r.scoreHistory,cumulative:r.cumulative,dealAccum:r.dealAccum,highlightMeldId:r.highlightMeldId,dealDisplayMult:r.dealDisplayMult,reclaimedJokerPending:viewer>=0?!!r.reclaimedJokerId[viewer]:false,pairFinish:viewer>=0?r.pairFinish[viewer]:null,allFromHand:r.allFromHand,bet:r.bet,playerSuits:r.playerSuits,finalSettlement:r.finalSettlement,cardSaid:r.cardSaid,seatChoices:r.seatChoices,seatCards:r.seatCards,seatTurn:r.seatTurn}}
function emit(r){r.players.forEach((p,i)=>{if(p&&!p.bot&&p.sid)io.to(p.sid).emit('state',publicState(r,i))})}
function addLog(r,s){r.log.push(s);if(r.log.length>80)r.log.shift()} function notice(r,text,ms=5000){if(r.noticeTimer)clearTimeout(r.noticeTimer);r.screenNotice={text,until:Date.now()+ms};emit(r);r.noticeTimer=setTimeout(()=>{r.screenNotice=null;emit(r)},ms)}
function startGame(r){for(let i=0;i<4;i++)if(!r.players[i])r.players[i]={name:NAMES[i],sid:null,bot:true};r.started=true;r.phase='seat_draw';r.seatChoices=[null,null,null,null];r.seatCards=[{slot:0,suit:'♥',taken:false},{slot:1,suit:'♣',taken:false},{slot:2,suit:'♦',taken:false},{slot:3,suit:'♠',taken:false}];for(let x=r.seatCards.length-1;x>0;x--){const j=Math.floor(Math.random()*(x+1));[r.seatCards[x],r.seatCards[j]]=[r.seatCards[j],r.seatCards[x]]}r.seatTurn=0;addLog(r,'Перед матчем каждый игрок сам вытягивает карту для определения места.');emit(r);autoSeatBots(r)}
function autoSeatBots(r){if(r.phase!=='seat_draw')return;if(r.seatTurn>=4)return finalizeSeats(r);if(r.players[r.seatTurn].bot){const free=r.seatCards.findIndex(c=>!c.taken);setTimeout(()=>chooseSeatCard(r,r.seatTurn,free),500)}}
function chooseSeatCard(r,i,idx){if(r.phase!=='seat_draw'||i!==r.seatTurn)return;const c=r.seatCards[Number(idx)];if(!c||c.taken)return;c.taken=true;c.chosenBy=i;r.seatChoices[i]=c.suit;addLog(r,`${r.players[i].name} вытянул ${c.suit}`);notice(r,`${r.players[i].name} — ${c.suit}`,2200);r.seatTurn++;emit(r);if(r.seatTurn>=4)return setTimeout(()=>finalizeSeats(r),700);autoSeatBots(r)}
function finalizeSeats(r){if(r.phase!=='seat_draw')return;const order=['♥','♣','♦','♠'];const oldPlayers=[...r.players],oldChoices=[...r.seatChoices];r.players=order.map(su=>oldPlayers[oldChoices.indexOf(su)]);r.playerSuits=order;r.seatChoices=order.slice();addLog(r,'Рассадка: '+r.players.map((p,i)=>order[i]+' '+p.name).join(' · '));startDeal(r)}
function startDeal(r,replay=false){r.pairFinish=[null,null,null,null];r.allFromHand=[false,false,false,false];r.undoSnapshot=[null,null,null,null];r.cardWarning=[null,null,null,null];r.reclaimedJokerId=[null,null,null,null];r.takenDiscardId=[null,null,null,null];clearTimeout(r.cutTimer);if(!replay){r.dealAccum=[0,0,0,0]}r.highlightMeldId=null;r.dealDisplayMult=r.mult;r.dealer=(r.dealNo-1)%4;r.cutter=(r.dealer+3)%4;r.phase='cut';r.stock=deck();r.svetka=null;r.discard=[];r.hands=[[],[],[],[]];r.melds=[];r.runClaims=[null,null,null,null];r.ironClaims=[];r.allDeclared=[false,false,false,false];r.cardSaid=[false,false,false,false];r.allFinisher=null;r.allDeadline=null;if(r.reportTimer){clearTimeout(r.reportTimer);r.reportTimer=null}r.ran=[false,false,false,false];r.turnMeldPoints=[0,0,0,0];r.runReady=[false,false,false,false];r.turn=r.dealer;r.drawn=false;addLog(r,`${r.players[r.cutter].name} снимает колоду`);emit(r);r.cutTimer=setTimeout(()=>completeCut(r,Math.floor(r.stock.length/2),true),7000);if(r.players[r.cutter].bot)setTimeout(()=>completeCut(r,Math.floor(r.stock.length*(.35+Math.random()*.3)),true),900)}
function completeCut(r,pos,auto=false){
 if(r.phase!=='cut')return;clearTimeout(r.cutTimer);
 pos=Math.max(10,Math.min(r.stock.length-10,Number(pos)||Math.floor(r.stock.length/2)));
 const cut=r.stock.splice(0,pos),candidate=cut.pop();r.stock=[...r.stock,...cut];
 if(isJ(candidate)){
   const penalty=10*r.mult;r.dealAccum[r.cutter]-=penalty;r.hands[r.cutter].push(candidate);
   addLog(r,`${r.players[r.cutter].name} снял JOKER: JOKER переходит ему в руку, −${penalty}; множитель ×${r.mult} → ×${r.mult+1}. Снимает снова.`);
   notice(r,`${r.players[r.cutter].name} СНЯЛ JOKER · −${penalty} · ×${r.mult+1}`,4500);
   r.mult+=1;r.dealDisplayMult=r.mult;r.svetka=null;r.phase='cut';emit(r);
   r.cutTimer=setTimeout(()=>completeCut(r,Math.floor(r.stock.length/2),true),7000);
   if(r.players[r.cutter].bot)setTimeout(()=>completeCut(r,Math.floor(r.stock.length*(.35+Math.random()*.3)),true),900);
   return;
 }
 r.svetka=candidate;r.phase='deal';
 addLog(r,`${r.players[r.cutter].name} ${auto?'снял автоматически':'снял колоду'}. Светка: ${cardText(r.svetka)}`);
 if(r.svetka&&r.svetka.rank==='2'&&r.svetka.suit==='♠'){
   const bonus=10*r.mult;r.dealAccum[r.cutter]+=bonus;
   addLog(r,`Светка 2♠: ${r.players[r.cutter].name} +${bonus}; множитель ×${r.mult} → ×${r.mult+1}`);
   r.mult+=1;r.dealDisplayMult=r.mult;
 }
 for(let i=0;i<4;i++){
   const target=i===r.dealer?15:14;
   const need=Math.max(0,target-r.hands[i].length);
   for(let k=0;k<need;k++)r.hands[i].push(r.stock.pop());
 }
 r.phase='turn';r.turn=r.dealer;r.drawn=false;emit(r);beginTurn(r)
}
function startStockRebuild(r){
 if(r.phase!=='turn')return;
 if(r.discard.length<=1){addLog(r,'Колода закончилась, карт для пересборки пока нет.');emit(r);return}
 r.rebuildResumeTurn=r.turn;
 r.rebuildCards=r.discard.splice(0,r.discard.length-1);
 // dealer shuffles continuation cards; cutter is unchanged from this deal
 for(let i=r.rebuildCards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r.rebuildCards[i],r.rebuildCards[j]]=[r.rebuildCards[j],r.rebuildCards[i]]}
 r.phase='rebuild_cut';r.stock=[...r.rebuildCards];r.rebuildCards=null;
 addLog(r,`ПЕРЕВЕРНУЛАСЬ. ${r.players[r.dealer].name} перемешал сброс; ${r.players[r.cutter].name} снимает колоду.`);
 emit(r);clearTimeout(r.cutTimer);r.cutTimer=setTimeout(()=>completeRebuildCut(r,Math.floor(r.stock.length/2),true),7000);
 if(r.players[r.cutter].bot)setTimeout(()=>completeRebuildCut(r,Math.floor(r.stock.length/2),true),700);
}
function completeRebuildCut(r,pos,auto=false){
 if(r.phase!=='rebuild_cut')return;clearTimeout(r.cutTimer);
 if(r.stock.length<2){r.phase='turn';r.turn=r.rebuildResumeTurn;return beginTurn(r)}
 pos=Math.max(1,Math.min(r.stock.length-1,Number(pos)||Math.floor(r.stock.length/2)));
 const cut=r.stock.splice(0,pos);
 // cut-off portion goes on existing svetka conceptually; remainder is above it for continued draw order.
 r.stock=[...cut,...r.stock];
 r.phase='turn';r.turn=r.rebuildResumeTurn;r.drawn=false;
 addLog(r,`${r.players[r.cutter].name} ${auto?'снял автоматически':'снял'} колоду для продолжения. Светка остаётся ${cardText(r.svetka)}.`);
 beginTurn(r);
}
function buryDue(r){const due=r.melds.filter(m=>m.buryOnTurnOf===r.turn);if(due.length){for(const m of due)r.discard.push(...m.cards.filter(c=>!c.svetkaWildcard));r.melds=r.melds.filter(m=>!due.includes(m));addLog(r,'Завершённый терец ушёл в сброс после полного круга. Эти физические карты снова участвуют после ПЕРЕВЕРНУЛАСЬ.')}}
function beginTurn(r){buryDue(r);r.turnSerial++;for(let p=0;p<4;p++){const w=r.cardWarning[p];if(w&&!w.said&&!r.cardSaid[p]&&r.turnSerial>=w.dueSerial)return applyZastrel(r,p,'не объявлена КАРТА за полный круг')}r.turnMeldPoints[r.turn]=0;r.runReady[r.turn]=false;r.undoSnapshot[r.turn]=null;emit(r);if(r.players[r.turn].bot)setTimeout(()=>botTurn(r),650)}
function saveUndo(r,i){if(r.undoSnapshot[i])return;r.undoSnapshot[i]={hand:r.hands[i].map(c=>({...c})),melds:JSON.parse(JSON.stringify(r.melds)),turnMeldPoints:r.turnMeldPoints[i],runReady:r.runReady[i],reclaimedJokerId:r.reclaimedJokerId[i],takenDiscardId:r.takenDiscardId[i],finishKind:r.finishKind||null,pairFinish:r.pairFinish[i]?JSON.parse(JSON.stringify(r.pairFinish[i])):null};}
function handPenalty(cards){const v=cards.reduce((a,c)=>a+(isJ(c)?10:(['A','K','Q','J','10'].includes(c.rank)?10:Number(c.rank)||0)),0);if(v<=5)return 0;return Math.min(8,Math.ceil((v-5)/10))}
function finishOrdinaryDeal(r,finisher){
 const delta=[0,0,0,0];
 delta[finisher]=(r.allFromHand&&r.allFromHand[finisher]?-10:(r.ran[finisher]?-5:-10))*r.mult;
 for(let i=0;i<4;i++)if(i!==finisher)delta[i]=r.ran[i]?handPenalty(r.hands[i])*r.mult:10*r.mult;
 for(let i=0;i<4;i++){r.dealAccum[i]+=delta[i];r.cumulative[i]+=r.dealAccum[i]}
 r.scoreHistory=r.scoreHistory.filter(x=>x.dealNo!==r.dealNo);
 r.scoreHistory.push({dealNo:r.dealNo,mult:r.dealDisplayMult,deal:[...r.dealAccum],totals:[...r.cumulative]});
}
function validFinishPair(cards){if(!Array.isArray(cards)||cards.length!==2)return false;const js=cards.filter(isJ),real=cards.filter(c=>!isJ(c));if(js.length===1&&real.length===1)return true;return js.length===0&&real.length===2&&real[0].rank===real[1].rank&&real[0].suit===real[1].suit}
function findPairsFinish(hand){
 if(hand.length!==15)return null;
 for(let di=0;di<hand.length;di++){
  const rest=hand.filter((_,x)=>x!==di),jokers=rest.filter(isJ),real=rest.filter(c=>!isJ(c)),g=new Map();
  for(const c of real){const k=c.rank+'|'+c.suit;if(!g.has(k))g.set(k,[]);g.get(k).push(c)}
  if([...g.values()].some(a=>a.length>2))continue;
  const singles=[...g.values()].filter(a=>a.length===1),pairs=[...g.values()].filter(a=>a.length===2);
  if(singles.length!==jokers.length||pairs.length+singles.length!==7)continue;
  const groups=pairs.map(a=>[...a]);singles.forEach((a,n)=>groups.push([a[0],jokers[n]]));
  return {discard:hand[di],groups};
 }
 return null;
}
function finishPairsDeal(r,finisher){
 const delta=[0,0,0,0];delta[finisher]=-50*r.mult;
 for(let i=0;i<4;i++)if(i!==finisher)delta[i]=handPenalty(r.hands[i])*r.mult;
 for(let i=0;i<4;i++){r.dealAccum[i]+=delta[i];r.cumulative[i]+=r.dealAccum[i]}
 r.scoreHistory=r.scoreHistory.filter(x=>x.dealNo!==r.dealNo);r.scoreHistory.push({dealNo:r.dealNo,mult:r.dealDisplayMult,finishKind:'pairs',deal:[...r.dealAccum],totals:[...r.cumulative]});
}
function finishSuitDeal(r,finisher){
 const delta=[0,0,0,0];delta[finisher]=-75*r.mult;
 for(let i=0;i<4;i++)if(i!==finisher)delta[i]=75*r.mult;
 for(let i=0;i<4;i++){r.dealAccum[i]+=delta[i];r.cumulative[i]+=r.dealAccum[i]}
 r.scoreHistory=r.scoreHistory.filter(x=>x.dealNo!==r.dealNo);r.scoreHistory.push({dealNo:r.dealNo,mult:r.dealDisplayMult,finishKind:'suit',deal:[...r.dealAccum],totals:[...r.cumulative]});
}
function findSuitFinish(hand){
 if(hand.length!==15)return null;
 for(let di=0;di<hand.length;di++){const rest=hand.filter((_,x)=>x!==di);if(rest.length===14&&!rest.some(isJ)&&rest.every(c=>c.suit===rest[0].suit))return {discard:hand[di],cards:rest,suit:rest[0].suit}}
 return null;
}
function beginFinishReport(r,i,kind='ordinary'){
 r.phase='finish_report';r.allFinisher=i;r.allDeadline=Date.now()+10000;r.finishKind=kind;
 addLog(r,`${r.players[i].name} закончил${kind==='pairs'?' ПАРАМИ':kind==='suit'?' МАСТЬЮ':''}. 10 секунд на ПРОВЕРКУ.`);emit(r);
 if(r.reportTimer)clearTimeout(r.reportTimer);
 r.reportTimer=setTimeout(()=>{if(r.phase!=='finish_report'||r.allFinisher!==i)return;
  if(kind==='pairs')finishPairsDeal(r,i);else if(kind==='suit')finishSuitDeal(r,i);else finishOrdinaryDeal(r,i);
  addLog(r,`Раздача №${r.dealNo} завершена`);r.phase='deal_end';emit(r);
  setTimeout(()=>{if(r.dealNo>=16){r.phase='match_finished';const net=[0,0,0,0];for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const d=(r.cumulative[b]-r.cumulative[a])*r.bet;net[a]+=d;net[b]-=d}r.finalSettlement={points:[...r.cumulative],bet:r.bet,net};addLog(r,'Матч завершён после 16 раздач. Ставка '+r.bet+' монет/очко.');emit(r);return}r.dealNo++;r.mult=[1,6,11,16].includes(r.dealNo)?2:1;startDeal(r,false)},3500);
 },10000);
}
function applyZastrel(r,offender,reason,meldId=null){
 if(r.reportTimer){clearTimeout(r.reportTimer);r.reportTimer=null}
 const pts=20*r.mult;r.dealAccum[offender]+=pts;r.highlightMeldId=meldId;
 addLog(r,`ЗАСТРЕЛ: ${r.players[offender].name} +${pts} · ${reason}`);
 r.phase='zastrel';notice(r,`${r.players[offender].name} — ЗАСТРЕЛ · ${reason.toUpperCase()} · +${pts}`,5000);
 const sameDeal=r.dealNo;r.mult+=1;r.dealDisplayMult=r.mult;
 setTimeout(()=>{if(r.dealNo===sameDeal&&r.phase==='zastrel')startDeal(r,true)},5000);
}
function endTurn(r){const i=r.turn;if(r.reclaimedJokerId[i]!=null)return applyZastrel(r,i,'забранный JOKER не использован в этом ходе');if(r.allDeclared[i])return applyZastrel(r,i,'неправильное ВСЕ');r.takenDiscardId[i]=null;r.turn=(i+1)%4;r.drawn=false;beginTurn(r)}
function botCandidateMelds(r,i){
 const h=r.hands[i],out=[];
 const comb=(arr,k,start=0,p=[])=>{if(p.length===k){for(const perm of permutations(p)){const cs=perm.map(x=>h[x]);const v=validateMeldCanonical(r,cs,'NORMAL');if(v.valid)out.push({idx:[...p],cards:cs,v,pts:meldPoints(cs,v)})}return}for(let x=start;x<=arr.length-(k-p.length);x++)comb(arr,k,x+1,[...p,x])};
 function permutations(a){if(a.length<=1)return [a];let z=[];for(let x=0;x<a.length;x++)for(const q of permutations([...a.slice(0,x),...a.slice(x+1)]))z.push([a[x],...q]);return z}
 const ids=h.map((_,x)=>x);comb(ids,3);comb(ids,4);
 const seen=new Set();return out.filter(x=>{const k=x.cards.map(c=>c.id).sort((a,b)=>a-b).join('-');if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>b.pts-a.pts);
}
function botFindRun(r,i){
 const cand=botCandidateMelds(r,i);let best=null;
 function rec(pos,used,arr,pts){if(pts>=51){if(!best||pts<best.pts)best={arr:[...arr],pts};return}for(let x=pos;x<cand.length;x++){const c=cand[x];if(c.cards.some(z=>used.has(z.id)))continue;const nu=new Set(used);c.cards.forEach(z=>nu.add(z.id));rec(x+1,nu,[...arr,c],pts+c.pts)}}
 rec(0,new Set(),[],0);return best;
}
function botLay(r,i,c){
 const ids=new Set(c.cards.map(x=>x.id));const cards=[];r.hands[i]=r.hands[i].filter(x=>{if(ids.has(x.id)){cards.push(x);return false}return true});
 const v=validateMeldCanonical(r,c.cards,'NORMAL');const bm={id:Date.now()+Math.random(),owner:i,cards:c.cards,validation:v,reportUntilTurnSerial:r.turnSerial+4,buryOnTurnOf:null,buried:false};if(v.valid&&v.type==='SAME_RANK'&&c.cards.length===4)bm.buryOnTurnOf=i;r.melds.push(bm);
}
function botUsePodlozhki(r,i){
 if(!r.ran[i]&&!r.allDeclared[i])return;let changed=true;
 while(changed){changed=false;
  outer:for(let hi=0;hi<r.hands[i].length;hi++){const c=r.hands[i][hi];if(isJ(c))continue;
   for(const m of r.melds){
    if(!m.extTurn||m.extTurn.turnSerial!==r.turnSerial||m.extTurn.player!==i)m.extTurn={turnSerial:r.turnSerial,player:i,front:0,back:0};
    const front=[c,...m.cards],back=[...m.cards,c],special=jokerRankCompletion(m.cards,c),vf=special||validateMeldCanonical(r,front,'NORMAL'),vb=special||validateMeldCanonical(r,back,'NORMAL');
    let side=null;if(special&&m.extTurn.back<2)side='back';else if(vf.valid&&m.extTurn.front<2)side='front';else if(vb.valid&&m.extTurn.back<2)side='back';
    if(side){m.cards=special?[...m.cards,c]:(side==='front'?front:back);m.validation=special?special:(side==='front'?vf:vb);m.extTurn[side]++;r.hands[i].splice(hi,1);
      if(m.validation.valid&&m.validation.type==='SAME_RANK'&&m.cards.length===4&&m.buryOnTurnOf==null)m.buryOnTurnOf=i;
      addLog(r,`${r.players[i].name} подложил ${cardText(c)}`);changed=true;break outer}
   }
  }
 }
}
function botHasPodlozhka(r,i,c){if(isJ(c))return false;return r.melds.some(m=>{const st=(m.extTurn&&m.extTurn.turnSerial===r.turnSerial&&m.extTurn.player===i)?m.extTurn:{front:0,back:0};return !!jokerRankCompletion(m.cards,c)||(st.front<2&&validateMeldCanonical(r,[c,...m.cards],'NORMAL').valid)||(st.back<2&&validateMeldCanonical(r,[...m.cards,c],'NORMAL').valid)})}
function botCanFinish(r,i){
 // Conservative finish search: after podlozhki, partition all but one discard into valid 3/4-card melds.
 const h=r.hands[i];if(h.length<4)return null;const cand=botCandidateMelds(r,i);
 for(let discard=0;discard<h.length;discard++){const target=new Set(h.filter((_,x)=>x!==discard).map(c=>c.id));
  function rec(rem,arr){if(!rem.size)return arr;const first=[...rem][0];for(const c of cand){const ids=c.cards.map(z=>z.id);if(!ids.includes(first)||ids.some(id=>!rem.has(id)))continue;const nr=new Set(rem);ids.forEach(id=>nr.delete(id));const z=rec(nr,[...arr,c]);if(z)return z}return null}
  const z=rec(target,[]);if(z)return {melds:z,discard:h[discard]};
 }return null;
}
function botTurn(r){
 if(r.phase!=='turn'||!r.players[r.turn].bot)return;const i=r.turn;
 if(i===r.dealer&&r.hands[i].length===15&&!r.discard.length){let k=r.hands[i].findIndex(c=>!isJ(c));if(k<0)k=0;r.discard.push(r.hands[i].splice(k,1)[0]);addLog(r,`${r.players[i].name} сбросил карту`);return endTurn(r)}
 if(!r.stock.length){startStockRebuild(r);return}
 r.hands[i].push(r.stock.pop());addLog(r,`${r.players[i].name} взял карту из колоды`);
 if(!r.ran[i]&&r.hands[i].filter(isJ).length<2){const run=botFindRun(r,i);if(run){for(const c of run.arr)botLay(r,i,c);r.ran[i]=true;r.runClaims[i]={points:run.pts,turnSerial:r.turnSerial};addLog(r,`${r.players[i].name} побежал: ${run.pts} очков`)}}
 if(r.ran[i])botUsePodlozhki(r,i);
 const fin=botCanFinish(r,i);if(fin){
   r.allDeclared[i]=true;notice(r,`${r.players[i].name} — ВСЕ`,5000);
   for(const c of fin.melds)botLay(r,i,c);
   const di=r.hands[i].findIndex(c=>c.id===fin.discard.id);if(di>=0)r.discard.push(r.hands[i].splice(di,1)[0]);
   r.allFinisher=i;r.phase='finish_report';r.allDeadline=Date.now()+15000;emit(r);
   r.reportTimer=setTimeout(()=>{if(r.phase!=='finish_report'||r.allFinisher!==i)return;finishOrdinaryDeal(r,i);addLog(r,`Раздача №${r.dealNo} завершена`);r.phase='deal_end';emit(r);setTimeout(()=>{r.dealNo++;r.mult=[1,6,11,16].includes(r.dealNo)?2:1;startDeal(r,false)},3500)},15000);return;
 }
 // Never discard a usable podlozhka (already exhausted above), and never discard JOKER while ordinary card exists.
 if(r.hands[i].length){botUsePodlozhki(r,i);let k=r.hands[i].findIndex(c=>!isJ(c)&&!botHasPodlozhka(r,i,c));if(k<0)k=r.hands[i].findIndex(c=>!isJ(c));if(k<0)k=0;r.discard.push(r.hands[i].splice(k,1)[0]);addLog(r,`${r.players[i].name} сбросил карту`)}
 endTurn(r);
}
function legacyValidMeld_UNUSED(cs){if(cs.length<3)return false;const real=cs.filter(c=>!isJ(c));if(!real.length)return false;const sameRank=real.every(c=>c.rank===real[0].rank)&&new Set(real.map(c=>c.suit)).size===real.length&&cs.length<=4;if(sameRank)return true;if(cs.filter(isJ).length)return false;if(!real.every(c=>c.suit===real[0].suit))return false;const idx=real.map(c=>RANKS.indexOf(c.rank));return idx.every((v,k)=>k===0||v===idx[k-1]+1)}

// ===== CANONICAL FRISH MELD VALIDATOR =====
// D=♦, C=♣, H=♥, S=♠, X=JOKER.
// Same-rank melds use the exact whitelist supplied for ФРИШ.
const SAME_RANK_ALLOWED=new Set([
'DCH','DSH','HSD','HCD','SHC','SDC','CHS','CDS',
'CHSD','CDSH','SDCH','SHCD','HCDS','HSDC','DSHC','DCHS',
'XSD','XSH','XCD','XCH','XHS','XHC','XDS','XDC','SXC','CXS','DXH','HXD',
'DCX','DSX','HCX','HSX','CHX','CDX','SDX','SHX',
'HXDC','HXDS','DXHC','DXHS','SXCD','SXCH','CXSD','CXSH',
'XSHC','XSDC','XCHS','XCDS','XDSH','XDCH','XHSD','XHCD',
'HCXS','HSXC','DCXS','DSXC','SHXD','SDXH','CHXD','CDXH',
'SHCX','SDCX','CHSX','CDSX','DSHX','DCHX','HSDX','HCDX'
]);
const SEQ_ORDER=['A','K','Q','J','10','9','8','7','6','5','4','3','2','A'];
const suitCode=s=>({'♦':'D','♣':'C','♥':'H','♠':'S'})[s]||null;
function sameRankCheck(cards){
 if(cards.length<3||cards.length>4)return {valid:false,reason:'SAME_RANK_SIZE'};
 const real=cards.filter(c=>!isJ(c));
 if(!real.length||!real.every(c=>c.rank===real[0].rank))return {valid:false,reason:'NOT_SAME_RANK'};
 if(cards.filter(isJ).length>1)return {valid:false,reason:'TOO_MANY_JOKERS'};
 const suits=real.map(c=>suitCode(c.suit));
 if(new Set(suits).size!==suits.length)return {valid:false,reason:'DUPLICATE_SUIT'};
 const pattern=cards.map(c=>isJ(c)?'X':suitCode(c.suit)).join('');
 return SAME_RANK_ALLOWED.has(pattern)?{valid:true,type:'SAME_RANK',rank:real[0].rank,pattern}:{valid:false,reason:'SAME_RANK_ORDER_NOT_ALLOWED',pattern};
}
function jokerRankCompletion(existing,added){
 if(!Array.isArray(existing)||existing.length!==3||!added||isJ(added))return null;
 const jokers=existing.filter(isJ),real=existing.filter(c=>!isJ(c));
 if(jokers.length!==1||real.length!==2)return null;
 if(!real.every(c=>c.rank===real[0].rank)||added.rank!==real[0].rank)return null;
 const used=new Set(real.map(c=>suitCode(c.suit))),as=suitCode(added.suit);
 if(!as||used.has(as))return null;
 return {valid:true,type:'SAME_RANK',rank:real[0].rank,pattern:'JOKER_RANK_COMPLETION',jokerFlexibleMissingSuit:true};
}
function sequenceShape(cards){
 if(cards.length<3)return {valid:false,reason:'MIN_3'};
 if(cards.filter(isJ).length>1)return {valid:false,reason:'TOO_MANY_JOKERS'};
 const real=cards.filter(c=>!isJ(c)), suits=[...new Set(real.map(c=>suitCode(c.suit)))];
 if(suits.length!==1||!suits[0])return {valid:false,reason:'SEQUENCE_SAME_SUIT_REQUIRED'};
 const suit=suits[0], ji=cards.findIndex(isJ);
 for(let start=0;start<=SEQ_ORDER.length-cards.length;start++){
   const expected=SEQ_ORDER.slice(start,start+cards.length); let good=true;
   for(let i=0;i<cards.length;i++){
     if(i===ji)continue;
     if(cards[i].rank!==expected[i]||suitCode(cards[i].suit)!==suit){good=false;break}
   }
   if(good)return {valid:true,type:'SEQUENCE',suit,representedJoker:ji<0?null:{rank:expected[ji],suit}};
 }
 return {valid:false,reason:'SEQUENCE_ORDER'};
}
function jokerSnapshot(r,represented){
 const copies=[];
 for(const c of r.discard)if(!isJ(c)&&c.rank===represented.rank&&suitCode(c.suit)===represented.suit)copies.push({id:c.id,rank:c.rank,suit:c.suit,zone:'discard'});
 if(r.svetka&&!isJ(r.svetka)&&r.svetka.rank===represented.rank&&suitCode(r.svetka.suit)===represented.suit)copies.push({id:r.svetka.id,rank:r.svetka.rank,suit:r.svetka.suit,zone:'svetka'});
 for(let p=0;p<4;p++)for(const c of r.hands[p])if(!isJ(c)&&c.rank===represented.rank&&suitCode(c.suit)===represented.suit)copies.push({id:c.id,rank:c.rank,suit:c.suit,zone:'hand'});
 for(const m of r.melds)for(const c of m.cards)if(!isJ(c)&&c.rank===represented.rank&&suitCode(c.suit)===represented.suit)copies.push({id:c.id,rank:c.rank,suit:c.suit,zone:'table'});
 const byId=[...new Map(copies.map(c=>[c.id,c])).values()];
 return {physicalCopies:byId};
}
function publicOutOK(snapshot,rep){
 const a=(snapshot&&snapshot.physicalCopies||[]).filter(c=>c.rank===rep.rank&&suitCode(c.suit)===rep.suit);
 if(a.length!==2)return false;
 const z=a.map(c=>c.zone);
 return z.filter(x=>x==='discard').length===2||(z.filter(x=>x==='discard').length===1&&z.filter(x=>x==='svetka').length===1);
}
function validateMeldCanonical(r,cards,mode='NORMAL'){
 if(!Array.isArray(cards)||cards.length<3)return {valid:false,reason:'MIN_3'};
 const sr=sameRankCheck(cards); if(sr.valid)return sr;
 const sh=sequenceShape(cards); if(!sh.valid)return sh;
 if(!sh.representedJoker)return sh;
 const snap=jokerSnapshot(r,sh.representedJoker);
 if(mode==='ALL_FINISH')return {...sh,jokerRule:'ALL_FINISH_EXCEPTION',snapshot:snap};
 return publicOutOK(snap,sh.representedJoker)?{...sh,jokerRule:'PUBLIC_OUT_AT_ACTION_TIME',snapshot:snap}:{...sh,valid:false,reason:'JOKER_REPLACED_CARD_NOT_PUBLICLY_OUT',snapshot:snap};
}
function rankValue(rank,lowAce=false){if(rank==='A')return lowAce?1:10;if(['K','Q','J','10'].includes(rank))return 10;return Number(rank)||0}
function meldPoints(cards,v){
 if(!v||!v.valid)return 0;
 if(v.type==='SAME_RANK')return cards.length*rankValue(v.rank,false);
 if(v.type==='SEQUENCE'){
   let total=0;
   for(let i=0;i<cards.length;i++){
     let rank=isJ(cards[i])?v.representedJoker?.rank:cards[i].rank;
     const lowAce=rank==='A'&&i===cards.length-1&&i>0&&cards[i-1].rank==='2';
     total+=rankValue(rank,lowAce);
   }
   return total;
 }
 return 0;
}

function findRoomBySocket(s){for(const r of rooms.values()){let i=r.players.findIndex(p=>p&&p.sid===s.id);if(i>=0)return [r,i]}return [null,-1]}
io.on('connection',socket=>{
 socket.on('create',name=>{const r=newRoom(String(name||'Игорь').slice(0,20),socket.id);rooms.set(r.code,r);socket.join(r.code);socket.emit('joined',{code:r.code});emit(r)});
 socket.on('join',({name,code})=>{const r=rooms.get(String(code||'').toUpperCase());if(!r||r.started)return socket.emit('errorMsg','Комната не найдена или партия уже началась.');const i=r.players.findIndex(x=>!x);if(i<0)return socket.emit('errorMsg','Нет свободных мест.');r.players[i]={name:String(name||NAMES[i]).slice(0,20),sid:socket.id,bot:false};socket.join(r.code);addLog(r,`${r.players[i].name} подключился`);socket.emit('joined',{code:r.code});emit(r)});
 socket.on('start',()=>{const [r,i]=findRoomBySocket(socket);if(r&&i===0&&!r.started)startGame(r)});
 socket.on('chooseSeatCard',idx=>{const[r,i]=findRoomBySocket(socket);if(r)chooseSeatCard(r,i,idx)});
 socket.on('cut',p=>{const [r,i]=findRoomBySocket(socket);if(r&&i===r.cutter){if(r.phase==='cut')completeCut(r,p,false);else if(r.phase==='rebuild_cut')completeRebuildCut(r,p,false)}});
 socket.on('drawStock',()=>{const [r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||r.drawn)return;if(i===r.dealer&&r.hands[i].length===15&&!r.discard.length)return socket.emit('errorMsg','Раздающий первым действием должен сбросить карту.');if(!r.stock.length){startStockRebuild(r);return;}const drawn=r.stock.pop();r.hands[i].push(drawn);r.takenDiscardId[i]=null;r.drawn=true;addLog(r,`${r.players[i].name} взял карту из колоды`);if(r.ran[i]&&isJ(drawn)){addLog(r,`${r.players[i].name} потащил JOKER`);notice(r,`${r.players[i].name} ПОТАЩИЛ JOKER`,5000)}else emit(r)});
 socket.on('drawDiscard',()=>{const [r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||r.drawn||!r.discard.length)return;const dc=r.discard.pop();r.hands[i].push(dc);r.takenDiscardId[i]=dc.id;r.drawn=true;addLog(r,`${r.players[i].name} взял карту сброса`);emit(r)});
 socket.on('discard',id=>{const [r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn)return;if(r.reclaimedJokerId[i]!=null)return applyZastrel(r,i,'забранный JOKER не использован в этом ходе');if(r.takenDiscardId[i]!=null){const bad=r.takenDiscardId[i];r.takenDiscardId[i]=null;return applyZastrel(r,i,'карта из сброса не использована');}const dealerOpening=i===r.dealer&&r.hands[i].length===15&&!r.discard.length;if(!r.drawn&&!dealerOpening)return;const k=r.hands[i].findIndex(c=>c.id===id);if(k<0)return;
 if(r.allDeclared[i]&&r.pairFinish[i]&&r.pairFinish[i].count===7&&r.hands[i].length===1){const c=r.hands[i].splice(k,1)[0];r.discard.push(c);if(r.hands[i].length===0&&!r.allDeclared[i])return applyZastrel(r,i,'закончил без объявления ВСЕ');r.takenDiscardId[i]=null;r.reclaimedJokerId[i]=null;return beginFinishReport(r,i,'pairs');}
 if(r.allDeclared[i]&&r.hands[i].length!==1)return applyZastrel(r,i,'неправильное ВСЕ');
 const c=r.hands[i].splice(k,1)[0];r.discard.push(c);
 const ownThisTurn=r.melds.filter(m=>m.owner===i&&m.laidAtTurnSerial===r.turnSerial);
 if(!r.ran[i]&&ownThisTurn.length){
   const points=r.turnMeldPoints[i];
   r.runClaims[i]={player:i,points,turnSerial:r.turnSerial,valid:points>=51,expiresAfterTurnSerial:r.turnSerial+4};
   if(points>=51)r.ran[i]=true;
 }
 addLog(r,`${r.players[i].name} сбросил ${cardText(c)}`);if(r.hands[i].length===1&&!r.cardSaid[i]){if(!r.cardWarning[i])r.cardWarning[i]={dueSerial:r.turnSerial+4,said:false}}else r.cardWarning[i]=null;
 if(r.allDeclared[i]&&r.hands[i].length===0){beginFinishReport(r,i,r.finishKind==='suit'?'suit':'ordinary');return;
 }
 endTurn(r)});
 socket.on('meld',ids=>{const [r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||(!r.drawn&&!(i===r.dealer&&r.hands[i].length===15&&!r.discard.length)))return;
   saveUndo(r,i);ids=[...new Set((ids||[]).map(Number))];
   if(ids.length<3)return socket.emit('errorMsg','Выберите минимум 3 карты.');
   const cs=ids.map(id=>r.hands[i].find(c=>c.id===id)).filter(Boolean);
   if(cs.length!==ids.length)return socket.emit('errorMsg','Не все выбранные карты найдены в руке.');
   const mode=r.allDeclared[i]?'ALL_FINISH':'RUN';
   const validation=validateMeldCanonical(r,cs,mode);const handOrderSnapshot=ids.slice();
   r.hands[i]=r.hands[i].filter(c=>!ids.includes(c.id));
   if(r.takenDiscardId[i]!=null&&ids.includes(r.takenDiscardId[i]))r.takenDiscardId[i]=null;if(r.reclaimedJokerId[i]!=null&&ids.includes(r.reclaimedJokerId[i]))r.reclaimedJokerId[i]=null;
   const m={id:Date.now()+Math.random(),owner:i,cards:cs,buryOnTurnOf:null,validation,laidAtTurnSerial:r.turnSerial,reportUntilTurnSerial:r.turnSerial+4,inactive:false,handOrderSnapshot};
   r.melds.push(m);
   if(validation.valid){
     r.turnMeldPoints[i]+=meldPoints(cs,validation);
     if(!r.ran[i]&&r.turnMeldPoints[i]>=51)r.runReady[i]=true;
   }
   if(validation.valid&&validation.type==='SAME_RANK'&&cs.length===4)m.buryOnTurnOf=i;
   addLog(r,`${r.players[i].name} выложил терец`);
   emit(r)
 });
 socket.on('extendMeld',({meldId,ids})=>{const[r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn)return;
   if(!r.ran[i]&&!r.runReady[i]&&!r.allDeclared[i])return socket.emit('errorMsg','Подложки доступны после набора 51+ в текущем побеге, после побега или при завершении через ВСЕ.');
   const m=r.melds.find(x=>String(x.id)===String(meldId));if(!m)return;saveUndo(r,i);
   ids=(ids||[]).map(Number);if(ids.length<1||ids.length>2)return socket.emit('errorMsg','За один раз можно подложить не более 2 карт.');
   const picked=[];for(const id of ids){const c=r.hands[i].find(x=>x.id===id);if(c)picked.push(c)}if(picked.length!==ids.length)return;
   if(picked.length===2&&m.cards.length===3&&m.cards.some(isJ)){const jok=m.cards.find(isJ),real=m.cards.filter(c=>!isJ(c));if(real.length===2&&real.every(c=>c.rank===real[0].rank)&&picked.every(c=>!isJ(c)&&c.rank===real[0].rank)&&new Set([...real,...picked].map(c=>c.suit)).size===4){const set=new Set(ids);r.hands[i]=r.hands[i].filter(c=>!set.has(c.id));r.hands[i].push(jok);r.reclaimedJokerId[i]=jok.id;m.cards=[...real,...picked];m.validation={valid:true,type:'SAME_RANK',rank:real[0].rank,pattern:'FOUR_REAL_AFTER_JOKER_RECLAIM'};m.buryOnTurnOf=i;addLog(r,`${r.players[i].name} перепалил терец и забрал JOKER`);notice(r,`${r.players[i].name} ЗАБРАЛ JOKER`,4000);return emit(r)}}
   if(!m.extTurn||m.extTurn.turnSerial!==r.turnSerial||m.extTurn.player!==i)m.extTurn={turnSerial:r.turnSerial,player:i,front:0,back:0};
   if(picked.length===1&&m.cards.some(isJ)&&m.validation&&m.validation.type==='SEQUENCE'&&m.validation.representedJoker&&!isJ(picked[0])&&picked[0].rank===m.validation.representedJoker.rank&&suitCode(picked[0].suit)===m.validation.representedJoker.suit){const jok=m.cards.find(isJ),set=new Set([picked[0].id]);r.hands[i]=r.hands[i].filter(c=>!set.has(c.id));r.hands[i].push(jok);r.reclaimedJokerId[i]=jok.id;m.cards=m.cards.map(c=>isJ(c)?picked[0]:c);m.validation=validateMeldCanonical(r,m.cards,'NORMAL');addLog(r,`${r.players[i].name} заменил JOKER картой ${cardText(picked[0])} и забрал JOKER`);notice(r,`${r.players[i].name} ЗАБРАЛ JOKER`,4000);return emit(r)}
   const front=[...picked,...m.cards],back=[...m.cards,...picked];
   const special=picked.length===1?jokerRankCompletion(m.cards,picked[0]):null;
   const vf=special||validateMeldCanonical(r,front,r.allDeclared[i]?'ALL_FINISH':'NORMAL'),vb=special||validateMeldCanonical(r,back,r.allDeclared[i]?'ALL_FINISH':'NORMAL');
   let trial=null,v=null,side=null;
   if(special){trial=[...m.cards,picked[0]];v=special;side='back'}
   else if(vf.valid&&m.extTurn.front+picked.length<=2){trial=front;v=vf;side='front'}
   else if(vb.valid&&m.extTurn.back+picked.length<=2){trial=back;v=vb;side='back'}
   if(!trial)return socket.emit('errorMsg',r.allDeclared[i]?'Эта подложка не продолжает выбранный терец. При ВСЕ JOKER может заменять недостающую карту в длине.':'К этой стороне терца в текущем ходу можно подложить максимум 2 карты.');
   const set=new Set(picked.map(c=>c.id));r.hands[i]=r.hands[i].filter(c=>!set.has(c.id));
   if(r.takenDiscardId[i]!=null&&set.has(r.takenDiscardId[i]))r.takenDiscardId[i]=null;if(r.reclaimedJokerId[i]!=null&&set.has(r.reclaimedJokerId[i]))r.reclaimedJokerId[i]=null;
   m.cards=trial;m.validation=v;m.extTurn[side]+=picked.length;
   if(v.valid&&v.type==='SAME_RANK'&&trial.length===4&&m.buryOnTurnOf==null)m.buryOnTurnOf=i;
   addLog(r,`${r.players[i].name} подложил ${picked.map(cardText).join(' ')}`);emit(r);
 });
 socket.on('declareAll',()=>{const[r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||r.allDeclared[i])return;r.allFromHand[i]=!r.ran[i];r.allDeclared[i]=true;addLog(r,`${r.players[i].name} — ВСЕ`);notice(r,`${r.players[i].name} — ВСЕ`,5000);emit(r); });
 socket.on('reclaimJoker',({meldId,ids})=>{const[r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||(!r.ran[i]&&!r.allDeclared[i]))return;
 const m=r.melds.find(x=>String(x.id)===String(meldId));if(!m)return;saveUndo(r,i);const jok=m.cards.find(isJ),real=m.cards.filter(c=>!isJ(c));
 if(!jok||real.length!==2||!real.every(c=>c.rank===real[0].rank))return socket.emit('errorMsg','В этом терце нельзя забрать JOKER.');
 ids=[...new Set((ids||[]).map(Number))];const add=ids.map(id=>r.hands[i].find(c=>c.id===id)).filter(Boolean);
 if(add.length!==2||add.some(c=>isJ(c)||c.rank!==real[0].rank))return socket.emit('errorMsg','Выберите обе недостающие карты того же номинала.');
 if(new Set([...real,...add].map(c=>c.suit)).size!==4)return socket.emit('errorMsg','Нужны обе недостающие масти.');
 const set=new Set(ids);r.hands[i]=r.hands[i].filter(c=>!set.has(c.id));r.hands[i].push(jok);r.reclaimedJokerId[i]=jok.id;
 m.cards=[...real,...add];m.validation={valid:true,type:'SAME_RANK',rank:real[0].rank,pattern:'FOUR_REAL_AFTER_JOKER_RECLAIM'};m.buryOnTurnOf=i;
 addLog(r,`${r.players[i].name} перепалил терец и забрал JOKER`);notice(r,`${r.players[i].name} ЗАБРАЛ JOKER`,4000);emit(r);});
 socket.on('layPair',ids=>{const[r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||!r.allDeclared[i])return;
 ids=[...new Set((ids||[]).map(Number))];if(ids.length!==2)return socket.emit('errorMsg','Для пары выберите ровно 2 карты.');
 const cards=ids.map(id=>r.hands[i].find(c=>c.id===id)).filter(Boolean);if(cards.length!==2||!validFinishPair(cards))return socket.emit('errorMsg','Эти карты не образуют допустимую пару.');
 if(!r.pairFinish[i])r.pairFinish[i]={count:0,usedSvetka:false};if(r.pairFinish[i].count>=7)return;
 const set=new Set(ids);r.hands[i]=r.hands[i].filter(c=>!set.has(c.id));r.melds.push({id:Date.now()+Math.random(),owner:i,cards,validation:{valid:true,type:'PAIR_FINISH'},laidAtTurnSerial:r.turnSerial,inactive:false,buryOnTurnOf:null});r.pairFinish[i].count++;addLog(r,`${r.players[i].name} выложил пару ${r.pairFinish[i].count}/7`);emit(r);});
 socket.on('layPairWithSvetka',id=>{const[r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||!r.allDeclared[i])return;
 if(!r.pairFinish[i])r.pairFinish[i]={count:0,usedSvetka:false};if(r.pairFinish[i].usedSvetka||r.pairFinish[i].count>=7)return socket.emit('errorMsg','Светка уже использована в паре.');
 const c=r.hands[i].find(x=>x.id===Number(id));if(!c)return;r.hands[i]=r.hands[i].filter(x=>x.id!==c.id);r.pairFinish[i].usedSvetka=true;r.pairFinish[i].count++;
 const token={id:'svetka-pair-'+Date.now(),rank:r.svetka.rank,suit:r.svetka.suit,svetkaWildcard:true};r.melds.push({id:Date.now()+Math.random(),owner:i,cards:[c,token],validation:{valid:true,type:'PAIR_FINISH_SVETKA'},laidAtTurnSerial:r.turnSerial,inactive:false,buryOnTurnOf:null});
 addLog(r,`${r.players[i].name} использовал СВЕТКУ как любую карту пары`);notice(r,`${r.players[i].name} — СВЕТКА В ПАРЕ`,3500);});
 socket.on('swapSvetka',id=>{const[r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||!r.allDeclared[i])return;const k=r.hands[i].findIndex(c=>c.id===Number(id));if(k<0||!r.svetka)return socket.emit('errorMsg','Выберите одну карту из руки для замены со светкой.');saveUndo(r,i);const own=r.hands[i][k],old=r.svetka;r.hands[i][k]=old;r.svetka=own;addLog(r,`${r.players[i].name} поменял карту со СВЕТКОЙ`);notice(r,`${r.players[i].name} — ЗАМЕНА СВЕТКИ`,3500);emit(r)});
 socket.on('finishSuit',ids=>{const[r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn||!r.allDeclared[i])return;
 ids=[...new Set((ids||[]).map(Number))];if(ids.length!==14)return socket.emit('errorMsg','Для МАСТИ выберите ровно 14 карт.');
 const cards=ids.map(id=>r.hands[i].find(c=>c.id===id)).filter(Boolean);const real=cards.filter(c=>!isJ(c)),js=cards.filter(isJ);if(cards.length!==14||js.length>1||!real.length||!real.every(c=>c.suit===real[0].suit))return socket.emit('errorMsg','Для МАСТИ нужны 14 карт одной масти; один JOKER может заменить недостающую карту.');saveUndo(r,i);
 const set=new Set(ids);r.hands[i]=r.hands[i].filter(c=>!set.has(c.id));r.melds.push({id:Date.now()+Math.random(),owner:i,cards,validation:{valid:true,type:'SUIT_FINISH'},laidAtTurnSerial:r.turnSerial,inactive:false,buryOnTurnOf:null});r.finishKind='suit';addLog(r,`${r.players[i].name} выложил МАСТЬ`);emit(r);});
 socket.on('sayCard',()=>{const[r,i]=findRoomBySocket(socket);if(!r)return;if(r.hands[i].length!==1)return socket.emit('errorMsg','КАРТА объявляется, когда в руке осталась ровно одна карта.');r.cardSaid[i]=true;if(r.cardWarning[i])r.cardWarning[i].said=true;addLog(r,`${r.players[i].name} — КАРТА`);notice(r,`${r.players[i].name} — КАРТА`,5000);emit(r)});
 socket.on('undoTurn',()=>{const[r,i]=findRoomBySocket(socket);if(!r||r.phase!=='turn'||i!==r.turn)return;const u=r.undoSnapshot[i];if(!u)return socket.emit('errorMsg','В этом ходе пока нечего отменять.');r.hands[i]=u.hand;r.melds=u.melds;r.turnMeldPoints[i]=u.turnMeldPoints;r.runReady[i]=u.runReady;r.reclaimedJokerId[i]=u.reclaimedJokerId;r.takenDiscardId[i]=u.takenDiscardId;r.finishKind=u.finishKind;r.pairFinish[i]=u.pairFinish;r.undoSnapshot[i]=null;addLog(r,`${r.players[i].name} отменил выкладку текущего хода`);emit(r)});
 socket.on('setBet',v=>{const[r,i]=findRoomBySocket(socket);if(r&&i===0&&!r.started){const n=Math.max(1,Math.min(100000,Number(v)||10));r.bet=n;emit(r)}});
 socket.on('frishPropose',()=>{const[r,i]=findRoomBySocket(socket);if(!r||!r.started||r.phase==='cut')return;const jc=r.hands[i].filter(isJ).length;if(jc>=2)return socket.emit('errorMsg','С двумя JOKER нельзя предлагать ФРИШ.');addLog(r,`${r.players[i].name} предложил ФРИШ`);emit(r)});
 socket.on('checkBadMeld',meldId=>{const[r,caller]=findRoomBySocket(socket);if(!r)return;
   const m=r.melds.find(x=>String(x.id)===String(meldId));
   if(!m)return socket.emit('errorMsg','Выберите терец для проверки.');
   if(r.turnSerial>m.reportUntilTurnSerial)return socket.emit('errorMsg','Срок проверки этого терца уже истёк.');
   if(m.validation&&m.validation.valid)return applyZastrel(r,caller,'ложная проверка: терец был правильным',m.id);
   return applyZastrel(r,m.owner,'неправильный терец',m.id);
 });
 socket.on('checkRunPoints',playerIndex=>{const[r,caller]=findRoomBySocket(socket);if(!r)return;
   const p=Number(playerIndex),claim=r.runClaims[p];
   if(!claim)return socket.emit('errorMsg','У этого игрока нет сохранённого побега для проверки.');
   if(r.turnSerial>claim.expiresAfterTurnSerial)return socket.emit('errorMsg','Срок проверки этого побега уже истёк.');
   if(claim.points>=51)return applyZastrel(r,caller,`ложная проверка: у ${r.players[p].name} было ${claim.points} очков`);
   return applyZastrel(r,p,`не хватает очков для побега: ${claim.points} из 51`);
 });
 socket.on('claimIron',({meldId,cardId})=>{const[r,caller]=findRoomBySocket(socket);if(!r)return;
   const m=r.melds.find(x=>String(x.id)===String(meldId));
   const c=m&&m.cards.find(x=>String(x.id)===String(cardId));
   if(!m||!c)return socket.emit('errorMsg','Выберите конкретную карту в терце.');
   r.ironClaims.push({caller,meldId:m.id,cardId:c.id,owner:m.owner,claimedAtTurnSerial:r.turnSerial,resolved:false});
   addLog(r,`${r.players[caller].name} заявил ЖЕЛЕЗКУ — ${cardText(c)}`);notice(r,`${r.players[caller].name} ЗАЯВИЛ ЖЕЛЕЗКУ — ${cardText(c)}`,5000);
 });
 socket.on('disconnect',()=>{const [r,i]=findRoomBySocket(socket);if(!r)return;if(!r.started){r.players[i]=null;addLog(r,'Игрок отключился');emit(r)}else{r.players[i].bot=true;r.players[i].sid=null;addLog(r,`${r.players[i].name}: управление передано боту`);emit(r);if(r.turn===i)setTimeout(()=>botTurn(r),500)}});
});
const HTML=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ФРИШ Multiplayer v1.2.1 CUT SEAT DRAG FIX</title><style>
*{box-sizing:border-box}body{margin:0;background:#104a37;color:#fff;font-family:Arial,sans-serif}.wrap{max-width:1180px;margin:auto;padding:18px}.panel{background:#f5efdf;color:#171717;border-radius:16px;padding:16px;margin:10px 0}.hidden{display:none!important}button,input{font:inherit;padding:10px 13px;border:0;border-radius:10px;margin:3px}button{cursor:pointer}.top{display:flex;gap:8px;flex-wrap:wrap}.table{position:relative;min-height:660px;border:2px solid #ffffff55;border-radius:28px;background:#176147;margin-top:12px}.seat{position:absolute;background:#f5efdf;color:#111;padding:9px 13px;border-radius:12px;min-width:150px;text-align:center}.s0{bottom:12px;left:50%;transform:translateX(-50%)}.s1{left:8px;top:48%}.s2{top:8px;left:50%;transform:translateX(-50%)}.s3{right:8px;top:48%}.center{position:absolute;left:18%;right:18%;top:105px;bottom:90px;text-align:center;overflow:auto}.piles{display:flex;justify-content:center;gap:25px;align-items:center}.card{display:inline-flex;position:relative;width:58px;height:82px;background:white;color:#111;border-radius:7px;border:1px solid #aaa;margin:2px;align-items:center;justify-content:center;font-weight:800;font-size:20px;user-select:none}.red{color:#c71919}.selected{transform:translateY(-14px);outline:4px solid #f3c941;box-shadow:0 8px 16px #0006;z-index:8}.dragging{transform:translateY(-16px) scale(1.06);outline:4px solid #fff;box-shadow:0 12px 22px #0008;z-index:20}.dropBefore{margin-left:26px;box-shadow:-19px 0 0 -13px #f3c941}.dropAfter{margin-right:26px;box-shadow:19px 0 0 -13px #f3c941}.back{background:#1b2d72;color:white}.melds{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:14px}.meld{padding:5px;border:1px dashed #fff9;border-radius:9px}.hand{position:relative;margin:18px 6px 8px;display:flex;justify-content:center;flex-wrap:wrap;min-height:86px;touch-action:none}.cutdeck{width:110px;height:150px;background:#182c71;border:5px solid #fff;border-radius:12px;margin:20px auto;touch-action:none;cursor:ew-resize}.log{font-size:13px;white-space:pre-line}.sv{border:3px solid #e4bd35}.bury{opacity:.75;box-shadow:0 0 0 3px #e4bd35 inset}.turn{outline:4px solid #e4bd35}.status{font-weight:800}.gameLayout{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:12px;align-items:start}.boardCol{min-width:0}.controlRail{position:sticky;top:8px;background:#0c3d2e;border:1px solid #ffffff44;border-radius:16px;padding:10px}.actions,.global{display:flex;flex-direction:column;gap:7px;margin:0}.actions button,.global button{width:100%;margin:0}.global{margin-top:10px}.controlTitle{text-align:center;font-weight:800;margin-bottom:8px}.targetMeld{outline:4px solid #f3c941;background:#ffffff16}.hand .card{touch-action:none;cursor:grab}.hand .card:active{cursor:grabbing}.actionPrimary{font-weight:800}.disabled{opacity:.45;pointer-events:none}.modal{position:fixed;inset:0;background:#0009;display:flex;align-items:center;justify-content:center;z-index:50}.modalBox{background:#f5efdf;color:#111;border-radius:16px;padding:16px;max-width:92vw;max-height:82vh;overflow:auto}.scoreTable{border-collapse:collapse;width:100%}.scoreTable td,.scoreTable th{border:1px solid #999;padding:6px;text-align:center}@media(max-width:820px){.gameLayout{display:flex;flex-direction:column}.controlRail{position:relative;top:auto;width:100%;order:2}.boardCol{width:100%}.actions,.global{flex-direction:row;flex-wrap:wrap;justify-content:center}.actions button,.global button{width:auto;flex:1 1 145px}.wrap{padding:8px}.table{min-height:560px;padding-bottom:8px}.center{left:8%;right:8%;top:92px;bottom:86px}.card{width:45px;height:65px;font-size:16px}.seat{min-width:112px;font-size:13px}.s1{top:48%}.s3{top:48%}.hand{margin-top:20px}.actions button,.global button{padding:10px 9px;font-size:13px}}
#screenNotice{position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:10000;background:#111e;color:#fff;padding:16px 24px;border:2px solid #f3c941;border-radius:14px;font-size:22px;font-weight:900;text-align:center;max-width:min(88vw,720px);pointer-events:none}#modal.overlay{position:fixed;inset:0;z-index:9000;background:#000b;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto}#modal.overlay .modalBox{background:#173b31;color:#fff;border:1px solid #ffffff55;border-radius:16px;padding:18px;max-width:min(94vw,900px);max-height:90vh;overflow:auto}.meld .card{width:48px;height:68px;font-size:17px;margin-left:-5px}.meldChoice{display:inline-flex;gap:2px;align-items:center;padding:8px;margin:6px;border:2px solid #ffffff55;border-radius:12px;background:#24483e;cursor:pointer}.meldChoice .miniCard{width:38px;height:54px;border-radius:6px;background:#ddd;color:#111;display:flex;align-items:center;justify-content:center;font-weight:800;white-space:pre-line;text-align:center}.meldChoice .miniCard.red{color:#b31325}.scoreOverlayTable{border-collapse:collapse;width:100%;background:#fff;color:#111}.scoreOverlayTable th,.scoreOverlayTable td{border:1px solid #777;padding:7px;text-align:center}@media(max-width:700px){.meld .card{width:40px;height:58px;font-size:14px}.melds{gap:5px;margin:7px}.meld{padding:3px}#screenNotice{top:9%;font-size:18px;padding:12px 16px}}#melds .meld.zastrelHit{outline:5px solid #ff3030;background:#ff303033;box-shadow:0 0 22px #ff3030}
.gameLayout{display:grid!important;grid-template-columns:minmax(0,1fr) 300px!important;gap:14px!important;align-items:start!important}
.boardCol{min-width:0!important}
.controlRail{position:sticky!important;top:12px!important;align-self:start!important;width:300px!important;box-sizing:border-box!important;background:#0c4b3d!important;border:1px solid #ffffff44!important;border-radius:16px!important;padding:12px!important;z-index:20!important}
.controlTitle{text-align:center!important;font-size:18px!important;font-weight:900!important;margin:2px 0 10px!important}
.controlRail .actions,.controlRail .global{display:grid!important;grid-template-columns:1fr!important;gap:8px!important}
.controlRail .global{margin-top:10px!important}
.controlRail button{width:100%!important;min-height:48px!important;margin:0!important;white-space:normal!important}
@media(max-width:900px){
 .gameLayout{display:block!important}
 .controlRail{position:relative!important;top:auto!important;width:100%!important;margin-top:12px!important}
 .controlRail .actions,.controlRail .global{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}

.modalClose{position:absolute;right:10px;top:8px;width:38px!important;height:38px!important;min-height:38px!important;border-radius:50%;font-size:25px;line-height:30px;padding:0!important;z-index:5}
.multCrosses{font-weight:1000;letter-spacing:1px;color:#b31325;font-size:16px}
@media(min-width:901px){
 .gameLayout{display:block!important}
 .boardCol{margin-right:320px!important}
 .controlRail{position:fixed!important;right:18px!important;top:150px!important;width:285px!important;max-height:calc(100vh - 170px)!important;overflow:auto!important;margin:0!important}
}
.jokerCard{overflow:hidden!important;background:#f7f0df!important;border:1px solid #c79a39!important}.jokerCard::before{content:"";position:absolute;inset:10% 18%;background-image:var(--joker-art);background-size:cover;background-position:center;background-repeat:no-repeat;z-index:0}.jokerWord{position:absolute;z-index:2;display:flex;flex-direction:column;align-items:center;font-family:Georgia,serif;font-weight:900;font-size:.20em;line-height:.84;color:var(--joker-ink);text-shadow:0 1px 0 #fff8}.jokerWord.left{left:4%;top:6%}.jokerWord.right{right:4%;bottom:6%;transform:rotate(180deg)}.jokerCard.redJoker{--joker-art:url('/joker_red_heraldic.webp');--joker-ink:#b3151b}.jokerCard.blackJoker{--joker-art:url('/joker_black_heraldic.webp');--joker-ink:#111}.jokerCard .jokerWord span{display:block}
.card{position:relative}.card .corner{position:absolute;font-weight:900;line-height:1;white-space:nowrap}.card .corner.tl{left:5px;top:5px}.card .corner.br{right:5px;bottom:5px;transform:rotate(180deg)}@media(min-width:901px){#hand{display:flex!important;flex-wrap:nowrap!important;justify-content:center!important;gap:3px!important;overflow:visible!important}#hand .card{width:39px!important;height:58px!important;min-width:42px!important;font-size:13px!important;margin:0!important}#hand .card .corner.tl{left:3px;top:4px}#hand .card .corner.br{right:3px;bottom:4px}}
/* v0.9.1: own hand lives at the bottom of the table, directly above the local-player plaque */
.table{position:relative!important;padding-bottom:112px!important}
#hand{
 position:absolute!important;
 left:10px!important;
 right:10px!important;
 bottom:58px!important;
 top:auto!important;
 z-index:30!important;
 display:flex!important;
 flex-wrap:nowrap!important;
 justify-content:center!important;
 align-items:flex-end!important;
 gap:3px!important;
 margin:0!important;
 overflow:visible!important;
}
#hand .card{width:39px!important;height:58px!important;min-width:42px!important;margin:0!important}
.meSeat{position:absolute!important;left:50%!important;bottom:10px!important;transform:translateX(-50%)!important;z-index:31!important}
.melds{padding-bottom:92px!important}
@media(max-width:900px){
 .table{padding-bottom:106px!important}
 #hand{bottom:54px!important;left:4px!important;right:4px!important;gap:1px!important}
 #hand .card{width:34px!important;min-width:34px!important;height:52px!important;font-size:12px!important}
 .melds{padding-bottom:86px!important}
}

/* v1.2.1 compact table: keep all laid terets visible without vertical scrolling */
.center{overflow:hidden!important;left:15%!important;right:15%!important;top:92px!important;bottom:112px!important}
.melds{gap:4px!important;margin:6px!important;align-content:flex-start!important}
.meld{padding:2px!important;border-radius:6px!important}
.meld .card{width:37px!important;height:52px!important;min-width:37px!important;font-size:12px!important;margin-left:-7px!important}
.meld .card:first-child{margin-left:0!important}
.meld .card .corner.tl{left:2px!important;top:3px!important;font-size:10px!important}
.meld .card .corner.br{right:2px!important;bottom:3px!important;font-size:10px!important}
@media(max-width:900px){.center{left:6%!important;right:6%!important;top:86px!important;bottom:108px!important}.meld .card{width:31px!important;height:45px!important;min-width:31px!important;font-size:10px!important;margin-left:-7px!important}.melds{gap:3px!important;margin:4px!important}}

.controlRail{max-height:none!important;overflow:visible!important}
#moreActions button{width:100%;margin-top:6px}
@media(max-width:900px){.gameShell{display:block!important}.controlRail{position:sticky!important;bottom:0!important;right:auto!important;width:auto!important;margin:6px!important;padding:6px!important;z-index:40;background:#0b503d!important}.controlRail .actions,.controlRail .global{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:5px!important}.controlRail button{min-height:38px!important;padding:5px!important;font-size:12px!important}.controlTitle{display:none!important}}
#melds .card .corner.tl,#melds .card .corner.br{font-size:12px!important;font-weight:900!important;line-height:1!important}
@media(max-width:900px){#melds .card .corner.tl,#melds .card .corner.br{font-size:11px!important}}

#melds.dragTableTarget{outline:3px dashed #f3c941!important;background:#f3c94112!important}
#melds .meld.dragMeldTarget{outline:4px solid #f3c941!important;background:#f3c94122!important}
.hand .card.dragging{opacity:.72;transform:translateY(-8px) scale(1.05);z-index:80}
.dragHint{text-align:center;font-size:12px;opacity:.8;margin:0 8px 6px}
@media(max-width:900px){.dragHint{font-size:11px}}

/* v1.2.1 — selected BLACK PREMIUM visual */
:root{--bg:#090909;--felt:#151515;--felt2:#20201e;--gold:#d9a84e;--gold2:#f2cf83;--cream:#f7f0df;--ink:#121212;--red:#b92125;--green:#38bd76}
html,body{min-height:100%;background:radial-gradient(circle at 50% 20%,#352817 0,#15110d 32%,#070707 78%);color:var(--cream);font-family:Inter,Segoe UI,Arial,sans-serif}
body:before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 10% 15%,#d79b3d20,transparent 22%),radial-gradient(circle at 88% 12%,#d79b3d18,transparent 20%),linear-gradient(115deg,#ffffff03,#0000 30%,#ffffff02 55%,#0000);z-index:-1}
.wrap{max-width:1500px;padding:14px 18px 24px}h1{color:var(--gold2);letter-spacing:.04em;text-shadow:0 2px 16px #000;margin:8px 0 12px}.panel{background:linear-gradient(145deg,#151515,#24211c);color:var(--cream);border:1px solid #d9a84e88;box-shadow:0 12px 32px #0008;border-radius:18px}.top .panel{padding:10px 15px;margin:3px 0}.table{min-height:700px;background:radial-gradient(ellipse at center,#242421 0,#171715 65%,#0d0d0c 100%)!important;border:2px solid var(--gold)!important;box-shadow:inset 0 0 0 5px #050505,inset 0 0 0 7px #d9a84e55,0 22px 60px #000c!important;border-radius:38px!important}
.seat{background:linear-gradient(#171717,#090909)!important;color:var(--cream)!important;border:1px solid var(--gold)!important;box-shadow:0 8px 20px #000a!important;font-weight:800}.seat.turn{outline:3px solid var(--gold2)!important;box-shadow:0 0 24px #d9a84e77!important}
.controlRail{background:linear-gradient(160deg,#171717,#080808)!important;border:1px solid var(--gold)!important;box-shadow:0 14px 35px #000b!important}.controlTitle{color:var(--gold2)}
.controlRail button,.panel button{background:linear-gradient(#fbf6e9,#e9dcc2);color:#17130e;border:1px solid #c89948;box-shadow:0 5px 14px #0005;font-weight:750}.controlRail button:hover,.panel button:hover{filter:brightness(1.06)}.controlRail button:disabled{background:linear-gradient(#272727,#181818);color:#777;border-color:#4a4338;box-shadow:none}.controlRail .global>button:first-child{background:linear-gradient(145deg,#9f2c26,#5f1715);color:#f7dfbd;border-color:#d16b54}
.card{background:linear-gradient(145deg,#fffdf8,#eee8dc)!important;border:1px solid #c8bda9!important;box-shadow:0 5px 10px #0005;color:#111!important}.card.red{color:#b71922!important}.selected{outline-color:var(--gold2)!important;box-shadow:0 0 0 2px #17120a,0 9px 20px #0009!important}
/* Variant 1: BLACK PREMIUM card back — CSS, not a static image, so every hidden card uses it */
.card.back,.cutdeck{position:relative;overflow:hidden;background:repeating-linear-gradient(135deg,#111 0 8px,#1b1a18 8px 10px,#0a0a0a 10px 18px)!important;border:2px solid var(--gold)!important;box-shadow:inset 0 0 0 4px #0b0b0b,inset 0 0 0 5px #d9a84e88,0 7px 16px #0009!important}
.card.back:before,.cutdeck:before{content:'◆';position:absolute;inset:20% 18%;display:flex;align-items:center;justify-content:center;color:var(--gold2);font-size:22px;border:2px solid var(--gold);transform:rotate(45deg);background:#10100fdd;box-shadow:0 0 0 2px #080808,0 0 18px #d9a84e30}.card.back:after,.cutdeck:after{content:'♠ ♥ ♦ ♣';position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);color:var(--gold2);font-size:9px;letter-spacing:1px;text-align:center;z-index:2}.cutdeck:before{font-size:34px}.cutdeck:after{font-size:13px}
.piles small{color:var(--gold2);font-weight:800;letter-spacing:.04em}.sv{border-color:var(--gold2)!important}.meld{border:1px dashed #d9a84eaa!important;background:#0808082b}.bury{box-shadow:0 0 0 2px var(--gold) inset!important}.dragHint{color:#d7c7a4}.log{background:#0e0e0ddd!important;border-color:#d9a84e66!important;color:#d8cfbd!important}
#screenNotice{background:#0a0a0af2!important;border-color:var(--gold)!important;color:var(--cream)!important;box-shadow:0 12px 40px #000c!important}#allBanner{background:linear-gradient(90deg,#b87b2e,#f2d08a,#b87b2e)!important;color:#17100a!important;border:1px solid #f7dca0!important;box-shadow:0 8px 28px #0008!important}
#modal.overlay{background:#000d!important;backdrop-filter:blur(6px)}#modal.overlay .modalBox{background:linear-gradient(145deg,#151515,#090909)!important;border:1px solid var(--gold)!important;color:var(--cream)!important;box-shadow:0 24px 70px #000!important}
/* premium TABLE */
.scorePremium{width:min(1180px,94vw);padding:8px}.scorePremiumHead{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:14px}.scorePremiumTitle{font-size:32px;font-weight:900;color:var(--gold2);letter-spacing:.06em}.scoreBadge{border:1px solid var(--gold);border-radius:14px;padding:9px 13px;color:var(--gold2);font-weight:800;background:#0b0b0b}.scoreOverlayTable.premium{background:#090909!important;color:var(--cream)!important;border:1px solid var(--gold)!important;border-radius:14px;overflow:hidden}.scoreOverlayTable.premium th{color:#f3d69b;background:#121212;font-size:15px}.scoreOverlayTable.premium th,.scoreOverlayTable.premium td{border:1px solid #d9a84e45!important;padding:8px!important}.scoreOverlayTable.premium tr.currentDeal td{background:#d9a84e20}.scoreOverlayTable.premium td.done{color:#f5ead2}.scoreOverlayTable.premium td.empty{color:#766f64}.suitHeart{color:#e33a3e}.suitClub{color:#49c988}.suitDiamond{color:#ef4747}.suitSpade{color:#eee3cb}.finalOnly{margin-top:10px;border:1px solid var(--gold);border-radius:12px;padding:11px;text-align:center;color:var(--gold2);font-weight:900;background:#0b0b0b}.scoreLegend{font-size:12px;color:#bfb39c;margin-top:10px;text-align:center}.modalClose{background:#121212!important;color:var(--cream)!important;border:1px solid var(--gold)!important}
@media(max-width:900px){.wrap{padding:6px}.table{min-height:610px!important;border-radius:24px!important}.scorePremiumTitle{font-size:23px}.scorePremiumHead{align-items:flex-start;flex-direction:column}.scoreOverlayTable.premium th,.scoreOverlayTable.premium td{padding:5px 3px!important;font-size:11px}.controlRail{border-radius:14px!important}}

#modal.overlay.scoreOpen{padding:8px!important;overflow:hidden!important}
#modal.overlay.scoreOpen .modalBox{width:min(900px,96vw)!important;max-width:96vw!important;height:auto!important;max-height:96vh!important;overflow:hidden!important;padding:10px!important}
#modal.overlay.scoreOpen .scorePremium{width:100%!important;padding:2px!important}
#modal.overlay.scoreOpen .scorePremiumHead{margin:0 0 6px!important;min-height:34px!important}
#modal.overlay.scoreOpen .scorePremiumTitle{font-size:25px!important;line-height:1!important}
#modal.overlay.scoreOpen .scoreBadge{padding:5px 9px!important;font-size:12px!important}
#modal.overlay.scoreOpen .scoreOverlayTable.premium{table-layout:fixed!important}
#modal.overlay.scoreOpen .scoreOverlayTable.premium th,
#modal.overlay.scoreOpen .scoreOverlayTable.premium td{padding:3px 4px!important;height:25px!important;line-height:1.05!important;font-size:12px!important}
#modal.overlay.scoreOpen .finalOnly{margin-top:5px!important;padding:6px!important;font-size:12px!important}
#modal.overlay.scoreOpen .scoreLegend{margin-top:4px!important;font-size:10px!important}
#modal.overlay.scoreOpen .modalClose{width:34px!important;height:34px!important;padding:0!important;z-index:3}
@media(max-height:760px){
 #modal.overlay.scoreOpen .scorePremiumTitle{font-size:21px!important}
 #modal.overlay.scoreOpen .scoreOverlayTable.premium th,
 #modal.overlay.scoreOpen .scoreOverlayTable.premium td{height:21px!important;padding:2px 3px!important;font-size:10.5px!important}
 #modal.overlay.scoreOpen .finalOnly{padding:4px!important;font-size:10px!important}
 #modal.overlay.scoreOpen .scoreLegend{display:none!important}
}
@media(max-width:700px){
 #modal.overlay.scoreOpen{padding:3px!important}
 #modal.overlay.scoreOpen .modalBox{width:99vw!important;max-width:99vw!important;max-height:99vh!important;padding:6px!important}
 #modal.overlay.scoreOpen .scorePremiumTitle{font-size:18px!important}
 #modal.overlay.scoreOpen .scorePremiumHead{display:block!important;margin-bottom:4px!important}
 #modal.overlay.scoreOpen .scoreBadge{display:none!important}
 #modal.overlay.scoreOpen .scoreOverlayTable.premium th,
 #modal.overlay.scoreOpen .scoreOverlayTable.premium td{height:20px!important;padding:2px!important;font-size:9px!important}
 #modal.overlay.scoreOpen .finalOnly{font-size:9px!important;padding:3px!important}
 #modal.overlay.scoreOpen .scoreLegend{display:none!important}
}

.fullQuick{border:1px solid #b98a2e;background:#0c0c0c;color:#f2cd79;border-radius:10px;font-size:20px;padding:6px 10px;cursor:pointer}
.seatDrawTitle{text-align:center;font-size:22px;font-weight:900;color:#f2cd79;margin:18px}
.seatDrawCards{display:flex;justify-content:center;gap:18px;margin:30px auto}
.seatDrawCard{width:82px;height:118px;border:2px solid #c99632;border-radius:10px;background:linear-gradient(145deg,#050505,#191919);color:#e5b54e;box-shadow:0 8px 24px #0008;cursor:pointer}
.seatDrawCard.revealed{background:#f5f0e5;color:#111;opacity:1;cursor:default;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.seatFace{font-size:42px;font-weight:900}.seatFace.red{color:#c62828}.seatDrawCard small{font-size:11px;font-weight:800;max-width:74px;overflow:hidden;text-overflow:ellipsis}.premiumBackMini{font-size:30px}
.seatDrawInfo{text-align:center;color:#f2cd79;font-weight:800}
#hand .dropBefore{margin-left:20px!important;box-shadow:-8px 0 0 #e4b94f!important}
#hand .dropAfter{margin-right:20px!important;box-shadow:8px 0 0 #e4b94f!important}
#hand .card.dragging{opacity:.45!important}

:fullscreen body{overflow:hidden!important}:fullscreen .wrap{max-width:none!important;width:100vw!important;height:100vh!important;margin:0!important;padding:4px 8px!important}
</style></head><body><div class="wrap"><h1>ФРИШ · Multiplayer v1.2.2 HERALDIC JOKER</h1><div id="lobby" class="panel"><input id="name" placeholder="Ваше имя"><button id="createBtn">Создать комнату</button><input id="code" placeholder="FRISH-0000"><button id="joinBtn">Войти</button></div><div id="room" class="hidden"><div class="panel"><b>Комната <span id="roomCode"></span></b><div id="players"></div><label>Ставка: <input id="bet" type="number" min="1" value="10" style="width:110px"> монет/очко</label><button id="start" onclick="startMatch()">ВЫТЯНУТЬ МАСТИ И НАЧАТЬ</button></div><div id="screenNotice" class="hidden"></div><div id="seatDraw" class="hidden"></div><div id="game" class="hidden"><div id="allBanner" class="hidden" style="margin:8px auto;padding:12px 18px;max-width:520px;text-align:center;font-weight:900;font-size:22px;background:#f3c941;color:#111;border-radius:12px"></div><div class="top"><span class="panel status" id="meta"></span><span class="panel status" id="phase"></span><button class="tableQuick" onclick="toggleScore()">ТАБЛИЦА</button><button class="fullQuick" id="fullBtn" onclick="toggleFullscreen()" title="Полный экран">⛶</button></div><div class="gameLayout"><div class="boardCol"><div class="table"><div id="seats"></div><div class="center"><div id="cutUI" class="hidden"><b id="cutText"></b><div class="cutdeck" id="cutdeck"></div><small>Проведите пальцем/мышью по колоде. Через 7 секунд снятие выполнится автоматически.</small></div><div id="playUI" class="hidden"><div class="piles"><div><div class="card back premiumBack" aria-label="Колода" onclick="drawStock()"></div><span id="stockN"></span></div><div><small>СВЕТКА</small><div id="svetka"></div></div><div><small>СБРОС</small><div id="discard"></div></div></div><div class="melds" id="melds"></div></div></div><div class="hand" id="hand"></div><div class="dragHint">Выберите карты и перетащите их на стол; для подложки — на нужный терец.</div></div><aside class="controlRail"><div class="controlTitle">ДЕЙСТВИЯ</div><div class="actions"><button class="actionPrimary" id="stockBtn" onclick="drawStock()">ВЗЯТЬ ИЗ КОЛОДЫ</button><button id="discardTakeBtn" onclick="drawDiscard()">ВЗЯТЬ СБРОС</button><button id="pairsBtn" onclick="layPair()">ВЫЛОЖИТЬ ПАРУ</button><button id="suitBtn" onclick="finishSuit()">ВЫЛОЖИТЬ МАСТЬ</button><button id="swapSvetkaBtn" onclick="swapSvetka()">ЗАМЕНИТЬ СВЕТКУ</button><button onclick="discardSelected()">СБРОСИТЬ</button><button id="undoBtn" onclick="undoTurn()">ОТМЕНИТЬ</button></div><div class="global"><button onclick="declareAll()">ВСЕ</button><button onclick="toggleMore()">ЕЩЁ</button><div id="moreActions" class="hidden"><button onclick="layMeld()">ВЫЛОЖИТЬ ТЕРЕЦ</button><button id="extendBtn" onclick="startExtend()">ПОДЛОЖИТЬ</button><button id="reclaimBtn" onclick="startReclaim()">ЗАБРАТЬ JOKER</button><button onclick="openCheck()">ПРОВЕРКА</button><button onclick="toggleScore()">ТАБЛИЦА</button><button onclick="proposeFrish()">ФРИШ</button></div><button onclick="sayCard()">КАРТА</button></div></aside></div></div><div class="panel log" id="log"></div><div id="modal" class="hidden"></div></div></div><script src="/socket.io/socket.io.js"></script><script>
const socket=io();let finalShown=false,S=null,sel=new Set(),extendMode=false,extendTarget=null,reclaimMode=false,reclaimTarget=null,svetkaSelected=false;const q=s=>document.querySelector(s);function createRoom(){socket.emit('create',q('#name').value)}function startMatch(){socket.emit('setBet',Number(q('#bet').value)||10);setTimeout(()=>socket.emit('start'),80)}function joinRoom(){socket.emit('join',{name:q('#name').value,code:q('#code').value})}q('#createBtn').addEventListener('click',createRoom);q('#joinBtn').addEventListener('click',joinRoom);socket.on('joined',x=>{q('#roomCode').textContent=x.code;q('#lobby').classList.add('hidden');q('#room').classList.remove('hidden')});socket.on('errorMsg',alert);socket.on('state',s=>{S=s;render();if(S.phase==='match_finished'&&S.finalSettlement&&!finalShown){finalShown=true;setTimeout(showFinal,50)}});function ct(c){return !c?'':c.rank==='JOKER'?'J\\nO\\nK\\nE\\nR':c.rank+c.suit}function ce(c,click=true){let d=document.createElement('div');d.className='card '+((c&&['♥','♦'].includes(c.suit))?'red':'');if(c&&c.rank==='JOKER'){d.classList.add('jokerCard',c.suit==='R'?'redJoker':'blackJoker');const word=()=>{const w=document.createElement('span');w.className='jokerWord';for(const ch of 'JOKER'){const z=document.createElement('span');z.textContent=ch;w.appendChild(z)}return w};const l=word(),rr=word();l.classList.add('left');rr.classList.add('right');d.append(l,rr)}else if(c){const a=document.createElement('span'),b=document.createElement('span');a.className='corner tl';b.className='corner br';a.textContent=c.rank+c.suit;b.textContent=c.rank+c.suit;d.append(a,b)}if(c&&click){d.onclick=()=>{sel.has(c.id)?sel.delete(c.id):sel.add(c.id);render()};if(sel.has(c.id))d.classList.add('selected')}return d}function render(){if(!S)return;const sn=q('#screenNotice');if(S.screenNotice&&S.screenNotice.text){sn.textContent=S.screenNotice.text;sn.classList.remove('hidden')}else{sn.textContent='';sn.classList.add('hidden')};q('#roomCode').textContent=S.code;q('#players').innerHTML=S.players.map((p,i)=>(i+1)+'. '+(p?((S.started&&S.playerSuits?S.playerSuits[i]+' ':'')+p.name+(p.bot?' · БОТ':'')):'свободно')).join('<br>');q('#start').style.display=(!S.started&&S.myIndex===0)?'inline-block':'none';if(!S.started)return;
if(S.phase==='seat_draw'){q('#game').classList.add('hidden');const sd=q('#seatDraw');sd.classList.remove('hidden');const mine=S.myIndex===S.seatTurn;sd.innerHTML='<div class="seatDrawTitle">ВЫТЯНИТЕ КАРТУ · РАССАДКА</div><div class="seatDrawCards">'+S.seatCards.map((c,n)=>'<button class="seatDrawCard '+(c.taken?'revealed':'')+'" '+(!mine||c.taken?'disabled':'')+' onclick="chooseSeat('+n+')">'+(c.taken?'<span class="seatFace '+((c.suit==='♥'||c.suit==='♦')?'red':'')+'">'+c.suit+'</span><small>'+S.players[c.chosenBy].name+'</small>':'<span class="premiumBackMini">◆</span>')+'</button>').join('')+'</div><div class="seatDrawInfo">'+(mine?'Ваш выбор':'Выбирает '+S.players[S.seatTurn].name)+'</div>';return}else q('#seatDraw').classList.add('hidden');
q('#game').classList.remove('hidden');q('#meta').textContent='Раздача '+S.dealNo+' · ×'+S.mult+' · ставка '+S.bet+' · раздаёт '+S.players[S.dealer].name;q('#phase').textContent=(S.phase==='cut'||S.phase==='rebuild_cut')?'Снимает '+S.players[S.cutter].name:(S.phase==='finish_report'?'10 СЕКУНД НА ПРОВЕРКУ':S.phase==='match_finished'?'МАТЧ ЗАВЕРШЁН':'Ход: '+S.players[S.turn].name);
 const ab=q('#allBanner');const ai=(S.allDeclared||[]).findIndex(Boolean);
 if(S.phase==='finish_report'){ab.textContent=S.players[S.allFinisher].name+' ЗАКОНЧИЛ · 10 СЕКУНД НА ПРОВЕРКУ';ab.classList.remove('hidden')}
 else if(ai>=0){ab.textContent=S.players[ai].name+' — ВСЕ';ab.classList.remove('hidden')}
 else {ab.textContent='';ab.classList.add('hidden')};q('#cutUI').classList.toggle('hidden',!(S.phase==='cut'||S.phase==='rebuild_cut'));q('#playUI').classList.remove('hidden');q('#cutText').textContent=S.players[S.cutter].name+' снимает колоду';q('#seats').innerHTML='';const relClass=['s0','s1','s2','s3'];for(let rel=0;rel<4;rel++){const i=(S.myIndex+rel)%4,p=S.players[i];let d=document.createElement('div');d.className='seat '+relClass[rel]+(S.turn===i&&S.phase==='turn'?' turn':'');d.textContent=p.name+' · '+p.count+' карт'+((S.cardSaid&&S.cardSaid[i])?' · КАРТА':'');q('#seats').appendChild(d)}q('#svetka').innerHTML='';if(S.svetka){let x=ce(S.svetka,false);x.classList.add('sv');if(svetkaSelected)x.classList.add('selected');x.onclick=()=>{if(!(S.allDeclared&&S.allDeclared[S.myIndex]))return;svetkaSelected=!svetkaSelected;render()};q('#svetka').appendChild(x)}q('#discard').innerHTML='';if(S.discard)q('#discard').appendChild(ce(S.discard,false));q('#stockN').textContent=S.stockCount;q('#hand').innerHTML='';orderedHand().forEach(c=>{let el=ce(c,true);el.dataset.id=c.id;q('#hand').appendChild(el)});installDrag();const mine=S.phase==='turn'&&S.myIndex===S.turn;q('#stockBtn').disabled=!mine||S.drawn;const cardBtn=[...document.querySelectorAll('button')].find(b=>b.textContent==='КАРТА');if(cardBtn)cardBtn.disabled=!!(S.cardSaid&&S.cardSaid[S.myIndex]);q('#discardTakeBtn').disabled=!mine||S.drawn||!S.discard;q('#extendBtn').textContent=extendMode?'ВЫБЕРИТЕ ТЕРЕЦ':'ПОДЛОЖИТЬ';q('#extendBtn').disabled=!mine||!((S.ran&&S.ran[S.myIndex])||(S.runReady&&S.runReady[S.myIndex])||(S.allDeclared&&S.allDeclared[S.myIndex]));q('#pairsBtn').disabled=!(S.allDeclared&&S.allDeclared[S.myIndex]);q('#swapSvetkaBtn').disabled=!(mine&&S.allDeclared&&S.allDeclared[S.myIndex]&&sel.size===1&&S.svetka);q('#suitBtn').disabled=!(S.allDeclared&&S.allDeclared[S.myIndex]);q('#pairsBtn').style.display=(S.allDeclared&&S.allDeclared[S.myIndex])?'block':'none';q('#suitBtn').style.display=(S.allDeclared&&S.allDeclared[S.myIndex])?'block':'none';q('#reclaimBtn').disabled=!(S.phase==='turn'&&S.turn===S.myIndex&&((S.ran&&S.ran[S.myIndex])||(S.allDeclared&&S.allDeclared[S.myIndex])));q('#reclaimBtn').style.display=((S.ran&&S.ran[S.myIndex])||(S.allDeclared&&S.allDeclared[S.myIndex]))?'block':'none';q('#melds').innerHTML='';S.melds.forEach(m=>{let d=document.createElement('div');d.className='meld'+(m.buryOnTurnOf!==null?' bury':'');d.dataset.meldId=m.id;d.className=d.className+(String(extendTarget)===String(m.id)?' targetMeld':'')+(String(S.highlightMeldId)===String(m.id)?' zastrelHit':'');d.onclick=()=>{if(reclaimMode){reclaimTarget=m.id;confirmReclaim();return}if(!extendMode)return;extendTarget=m.id;confirmExtend()};m.cards.forEach(c=>{let x=ce(c,false);x.dataset.cardId=c.id;x.dataset.meldId=m.id;d.appendChild(x)});q('#melds').appendChild(d)});q('#log').textContent=S.log.join('\\n')}
q('#cutdeck').addEventListener('pointerup',e=>{if(!S||!(S.phase==='cut'||S.phase==='rebuild_cut')||S.myIndex!==S.cutter)return;let r=e.currentTarget.getBoundingClientRect(),p=Math.round(((e.clientY-r.top)/r.height)*80)+13;socket.emit('cut',p)});function drawStock(){socket.emit('drawStock')}function drawDiscard(){socket.emit('drawDiscard')}function toggleMore(){q('#moreActions').classList.toggle('hidden')}function layPair(){if(svetkaSelected){if(sel.size!==1)return alert('Для пары со светкой выберите одну карту из руки.');socket.emit('layPairWithSvetka',[...sel][0]);svetkaSelected=false;sel.clear();return}if(sel.size!==2)return alert('Выберите 2 карты пары.');socket.emit('layPair',orderedHand().filter(c=>sel.has(c.id)).map(c=>c.id));sel.clear()}
function chooseSeat(n){socket.emit('chooseSeatCard',n)}
function swapSvetka(){if(sel.size!==1)return alert('Выберите одну карту из руки.');socket.emit('swapSvetka',[...sel][0]);sel.clear();svetkaSelected=false}
function toggleFullscreen(){if(!document.fullscreenElement){document.documentElement.requestFullscreen().catch(()=>{})}else document.exitFullscreen()}
document.addEventListener('fullscreenchange',()=>{const b=q('#fullBtn');if(b)b.textContent=document.fullscreenElement?'⤢':'⛶'});
function finishSuit(){if(sel.size!==14)return alert('Выберите 14 карт одной масти; один JOKER может заменить недостающую карту.');socket.emit('finishSuit',orderedHand().filter(c=>sel.has(c.id)).map(c=>c.id));sel.clear()}
function startReclaim(){if(!(S.ran&&S.ran[S.myIndex])&&!(S.allDeclared&&S.allDeclared[S.myIndex]))return;if(sel.size!==2)return alert('Выберите две недостающие карты.');reclaimMode=true;reclaimTarget=null;render()}
function confirmReclaim(){if(!reclaimMode||reclaimTarget==null)return;socket.emit('reclaimJoker',{meldId:reclaimTarget,ids:orderedHand().filter(c=>sel.has(c.id)).map(c=>c.id)});sel.clear();reclaimMode=false;reclaimTarget=null}
function layMeld(){if(sel.size<3)return alert('Выберите минимум 3 карты.');socket.emit('meld',orderedHand().filter(c=>sel.has(c.id)).map(c=>c.id));sel.clear()}function discardSelected(){if(sel.size!==1)return alert('Выберите одну карту.');socket.emit('discard',[...sel][0]);sel.clear()}function startExtend(){if(!((S.ran&&S.ran[S.myIndex])||(S.runReady&&S.runReady[S.myIndex])||(S.allDeclared&&S.allDeclared[S.myIndex])))return;if(!sel.size)return;extendMode=true;extendTarget=null;render()}function confirmExtend(){if(!extendMode||extendTarget==null)return;socket.emit('extendMeld',{meldId:extendTarget,ids:orderedHand().filter(c=>sel.has(c.id)).map(c=>c.id)});sel.clear();extendMode=false;extendTarget=null} 
let handOrder=[];function orderedHand(){if(!S)return[];const m=new Map(S.myHand.map(c=>[c.id,c]));const out=[];handOrder.forEach(id=>{if(m.has(id)){out.push(m.get(id));m.delete(id)}});for(const c of S.myHand){if(m.has(c.id)){out.push(c);m.delete(c.id)}}handOrder=out.map(c=>c.id);return out}function installDrag(){
 const h=q('#hand'),table=q('#melds');let dragId=null,pid=null,sx=0,sy=0,moved=false,previewIndex=null;
 const selectedIds=()=>{const ids=orderedHand().filter(c=>sel.has(c.id)).map(c=>c.id);return sel.has(dragId)&&ids.length?ids:[dragId]};
 const clearPreview=()=>{h.querySelectorAll('.dropBefore,.dropAfter,.dragging').forEach(x=>x.classList.remove('dropBefore','dropAfter','dragging'));table.classList.remove('dragTableTarget');table.querySelectorAll('.dragMeldTarget').forEach(x=>x.classList.remove('dragMeldTarget'))};
 const hit=(x,y)=>{const el=document.elementFromPoint(x,y);return el?{meld:el.closest('.meld'),table:el.closest('#melds'),hand:el.closest('#hand')}:{}};
 const preview=(x,y)=>{
   clearPreview();const de=h.querySelector('[data-id="'+dragId+'"]');if(de)de.classList.add('dragging');
   const z=hit(x,y);
   if(z.meld){z.meld.classList.add('dragMeldTarget');previewIndex=null;return}
   if(z.table){table.classList.add('dragTableTarget');previewIndex=null;return}
   const cards=[...h.querySelectorAll('.card[data-id]')].filter(el=>String(el.dataset.id)!==String(dragId));
   if(!cards.length){previewIndex=0;return}
   let best=null,dist=Infinity;
   for(const el of cards){const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,d=Math.hypot(x-cx,(y-cy)*1.7);if(d<dist){dist=d;best={el,r,cx}}}
   if(!best)return;const before=x<best.cx;best.el.classList.add(before?'dropBefore':'dropAfter');
   const ids=handOrder.filter(id=>String(id)!==String(dragId)),target=Number(best.el.dataset.id),base=ids.findIndex(id=>String(id)===String(target));
   previewIndex=Math.max(0,base+(before?0:1));
 };
 h.querySelectorAll('.card[data-id]').forEach(el=>{
   el.onclick=null;
   el.onpointerdown=e=>{e.preventDefault();pid=e.pointerId;dragId=Number(el.dataset.id);sx=e.clientX;sy=e.clientY;moved=false;previewIndex=null;try{el.setPointerCapture(pid)}catch(_){}};
   el.onpointermove=e=>{if(pid!==e.pointerId)return;if(!moved&&Math.hypot(e.clientX-sx,e.clientY-sy)>7)moved=true;if(moved)preview(e.clientX,e.clientY)};
   el.onpointerup=e=>{if(pid!==e.pointerId)return;const z=hit(e.clientX,e.clientY),ids=selectedIds();
     if(moved&&z.meld&&ids.length>=1&&ids.length<=2&&((S.ran&&S.ran[S.myIndex])||(S.runReady&&S.runReady[S.myIndex])||(S.allDeclared&&S.allDeclared[S.myIndex]))){
       socket.emit('extendMeld',{meldId:z.meld.dataset.meldId,ids});sel.clear();
     }else if(moved&&z.table&&!z.meld&&ids.length>=3){
       socket.emit('meld',ids);sel.clear();
     }else if(moved&&previewIndex!==null){
       const a=handOrder.filter(id=>String(id)!==String(dragId));a.splice(Math.min(previewIndex,a.length),0,dragId);handOrder=a;
     }else if(!moved){sel.has(dragId)?sel.delete(dragId):sel.add(dragId)}
     clearPreview();pid=null;dragId=null;previewIndex=null;render()
   };
   el.onpointercancel=()=>{clearPreview();pid=null;dragId=null;previewIndex=null;render()}
 })
}function undoTurn(){socket.emit('undoTurn');sel.clear()}function declareAll(){socket.emit('declareAll')}function sayCard(){socket.emit('sayCard')}function proposeFrish(){socket.emit('frishPropose')}function openCheck(){
 showModal('<b>ПРОВЕРКА</b><br><button id="checkZ">ЗАСТРЕЛ</button><button id="checkI">ЖЕЛЕЗКА</button>');
 q('#checkZ').onclick=openZastrelReasons;
 q('#checkI').onclick=openIronMelds;
}
function openZastrelReasons(){
 showModal('<b>ПРОВЕРКА → ЗАСТРЕЛ</b><br><button id="badM">НЕПРАВИЛЬНЫЙ ТЕРЕЦ</button><button id="lowP">НЕ ХВАТАЕТ ОЧКОВ</button>');
 q('#badM').onclick=openBadMelds;q('#lowP').onclick=openRunPlayers;
}
function miniCard(c){const red=c&&['♥','♦'].includes(c.suit);return '<span class="miniCard '+(red?'red':'')+'">'+ct(c).replaceAll('\\n','<br>')+'</span>'}function meldVisual(m,cls){return '<button class="meldChoice '+cls+'" data-mid="'+m.id+'">'+m.cards.map(miniCard).join('')+'</button>'}function openBadMelds(){
 let rows=S.melds.map(m=>meldVisual(m,'badMeldBtn')).join('');
 showModal('<b>ЗАСТРЕЛ → НЕПРАВИЛЬНЫЙ ТЕРЕЦ</b><br>Выберите терец:<br>'+rows);
 document.querySelectorAll('.badMeldBtn').forEach(b=>b.onclick=()=>{socket.emit('checkBadMeld',b.dataset.mid);closeModal()});
}
function openRunPlayers(){
 let rows=S.players.map((p,i)=>'<button class="runPlayerBtn" data-p="'+i+'">'+p.name+'</button>').join('<br>');
 showModal('<b>ЗАСТРЕЛ → НЕ ХВАТАЕТ ОЧКОВ</b><br>Выберите игрока:<br>'+rows);
 document.querySelectorAll('.runPlayerBtn').forEach(b=>b.onclick=()=>{socket.emit('checkRunPoints',Number(b.dataset.p));closeModal()});
}
function openIronMelds(){
 let rows=S.melds.map(m=>meldVisual(m,'ironMeldBtn')).join('');
 showModal('<b>ПРОВЕРКА → ЖЕЛЕЗКА</b><br>Выберите терец:<br>'+rows);
 document.querySelectorAll('.ironMeldBtn').forEach(b=>b.onclick=()=>openIronCards(b.dataset.mid));
}
function openIronCards(mid){
 const m=S.melds.find(x=>String(x.id)===String(mid));if(!m)return;
 let rows=m.cards.map(c=>'<button class="ironCardBtn" data-cid="'+c.id+'">'+ct(c).replaceAll('\\n','')+'</button>').join(' ');
 showModal('<b>ЖЕЛЕЗКА</b><br>Выберите конкретную карту:<br>'+rows);
 document.querySelectorAll('.ironCardBtn').forEach(b=>b.onclick=()=>{socket.emit('claimIron',{meldId:mid,cardId:b.dataset.cid});closeModal()});
}
function showFinal(){const f=S.finalSettlement,n=S.players.map(p=>p.name),suits=['♥','♣','♦','♠'];let rows=n.map((x,i)=>'<tr><td>'+suits[i]+' '+x+'</td><td>'+f.points[i]+'</td><td>'+(f.net[i]>=0?'+':'')+f.net[i]+'</td></tr>').join('');showModal('<div class="scorePremium"><div class="scorePremiumTitle">МАТЧ ЗАВЕРШЁН</div><p>16 раздач · ставка <b>'+f.bet+' монет/очко</b></p><table class="scoreOverlayTable premium"><tr><th>Игрок</th><th>ИТОГ</th><th>Расчёт по ставке</th></tr>'+rows+'</table></div>')}
function toggleScore(){
 const suits=['♥','♣','♦','♠'],suitCls=['suitHeart','suitClub','suitDiamond','suitSpade'];
 const names=S.players.map((p,i)=>p.name);
 let rows='';
 for(let d=1;d<=16;d++){
  const h=(S.scoreHistory||[]).find(x=>x.dealNo===d),current=d===S.dealNo&&S.phase!=='match_finished';
  const mult=h?h.mult:(current?S.dealDisplayMult:([1,6,11,16].includes(d)?2:1));
  const crosses=mult>1?' <span class="multCrosses">'+Array(mult-1).fill('×').join('')+'</span>':'';
  rows+='<tr class="'+(current?'currentDeal':'')+'"><td><b>'+d+'</b>'+crosses+'</td>'+names.map((_,i)=>'<td class="'+(h&&h.totals?'done':'empty')+'">'+(h&&h.totals?h.totals[i]:'—')+'</td>').join('')+'</tr>';
 }
 const headers=names.map((n,i)=>'<th><span class="'+suitCls[i]+'">'+suits[i]+'</span> '+n+'</th>').join('');
 const finished=S.phase==='match_finished'&&S.finalSettlement;
 const finalRow=finished?'<tr class="finalRow"><th>ИТОГ</th>'+S.finalSettlement.points.map(x=>'<th>'+x+'</th>').join('')+'</tr>':'<tr class="finalRow"><th>ИТОГ</th><th>—</th><th>—</th><th>—</th><th>—</th></tr>';
 const finalNote=finished?'ИТОГ рассчитан после завершения всех 16 раздач.':'ИТОГ появится только после завершения 16-й раздачи.';
 q('#modal').classList.add('scoreOpen');
 showModal('<div class="scorePremium"><div class="scorePremiumHead"><div><div class="scorePremiumTitle">ФРИШ · ТАБЛИЦА</div><div style="color:#bfb39c">16 РАЗДАЧ</div></div><div class="scoreBadge">РАЗДАЧА '+Math.min(S.dealNo,16)+' / 16 · ×'+S.mult+'</div></div><table class="scoreOverlayTable premium"><tr><th>РАЗДАЧА</th>'+headers+'</tr>'+rows+finalRow+'</table><div class="finalOnly">'+finalNote+'</div><div class="scoreLegend">Порядок мест в таблице всегда: ♥ → ♣ → ♦ → ♠. Незавершённая раздача остаётся пустой.</div></div>')
}function showModal(html){const m=q('#modal');const score=m.classList.contains('scoreOpen');m.className='overlay'+(score?' scoreOpen':'');m.innerHTML='<div class="modalBox" style="position:relative"><button class="modalClose" onclick="closeModal()" aria-label="Закрыть">×</button>'+html+'</div>'}function closeModal(){const m=q('#modal');m.className='hidden';m.classList.remove('scoreOpen');m.innerHTML=''}
</script></body></html>`;

app.get('/',(req,res)=>res.type('html').send(HTML));
server.listen(PORT,()=>console.log('FRISH v1.2.1 CUT SEAT DRAG FIX on',PORT));
