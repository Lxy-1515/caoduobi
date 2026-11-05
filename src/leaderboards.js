(function(P){
'use strict';
const modes=Object.freeze(['classic','hard','monochrome','race','twin','trial']);
const survival=mode=>mode==='twin'||mode==='trial';
const integer=value=>Number.isFinite(value)&&value>=0?Math.min(Number.MAX_SAFE_INTEGER,Math.floor(value)):null;
const label=mode=>mode==='race'?'消除个数':survival(mode)?'存活时间':'草！值';
const display=(mode,score)=>survival(mode)?P.formatSeconds(score):String(score);
const error=(code,message)=>Object.assign(new Error(message||String(code)),{code});
function scoreOf(result){
  if(!result||!modes.includes(result.gameMode))return null;
  return integer(result.gameMode==='race'?result.clearedOrbs:survival(result.gameMode)?result.time:result.grass);
}
function recordOf(data,mode){
  return integer(mode==='race'?data.raceClearBest:survival(mode)?data.survivalBest?.[mode]:data.grassBest?.[mode])??0;
}
function callManager(manager,method,args,host){
  return new Promise((resolve,reject)=>{
    const timer=host.setTimeout(()=>reject(error('timeout')),15000);
    const done=fn=>value=>{host.clearTimeout(timer);fn(value);};
    try{manager[method]({...args,callback:{onSuccess:done(resolve),onFailure:(code,message)=>done(reject)(error(code,message))}});}
    catch(e){host.clearTimeout(timer);reject(e);}
  });
}
function androidProvider(bridge,host){
  let serial=0;const pending=new Map();
  bridge.onmessage=event=>{
    let reply;try{reply=JSON.parse(event.data);}catch{return;}
    const task=pending.get(reply.id);if(!task)return;
    pending.delete(reply.id);host.clearTimeout(task.timer);
    if(reply.ok)task.resolve(reply.data);else task.reject(error(reply.code,reply.message));
  };
  const request=(action,args={})=>new Promise((resolve,reject)=>{
    const id=String(++serial),timer=host.setTimeout(()=>{pending.delete(id);reject(error('timeout'));},action==='login'?60000:15000);
    pending.set(id,{resolve,reject,timer});
    try{bridge.postMessage(JSON.stringify({id,action,...args}));}catch(e){host.clearTimeout(timer);pending.delete(id);reject(e);}
  });
  return{kind:'android',load:(board,cursor,periodToken='')=>request('load',{leaderboardId:board,cursor,periodToken}),submit:(board,score)=>request('submit',{leaderboardId:board,score}),login:()=>request('login')};
}
function providerFor(host){
  if(host.PixelDodgeTapBridge?.postMessage)return androidProvider(host.PixelDodgeTapBridge,host);
  try{
    const manager=host.tap?.getLeaderboardManager?.();
    if(manager)return{kind:'tap',load:(board,cursor,periodToken='')=>callManager(manager,'loadLeaderboardScores',{leaderboardId:board,continuationToken:cursor,maxSize:200,collection:'public',periodToken},host),submit:(board,score)=>callManager(manager,'submitScores',{scores:[{leaderboardId:board,score}]},host)};
  }catch{/* Host may not be ready yet; retry at the next user action. */}
  return null;
}
class Leaderboards{
  constructor({host=globalThis,config=P.platformConfig}={}){this.host=host;this.config=config;this.provider=null;this.pending=new Map();this.sent=new Map();this.inflight=new Map();this.weeklySent=new Set();this.weeklyInflight=new Map();}
  getProvider(){return this.provider||(this.provider=providerFor(this.host));}
  isWeekly(){return this.getProvider()?.kind!=='android'&&this.config.resetPeriod==='weekly';}
  board(mode){const ids=this.getProvider()?.kind==='android'?this.config.androidBoards:this.config.boards;return modes.includes(mode)&&typeof ids?.[mode]==='string'?ids[mode].trim():'';}
  availability(mode){if(!this.getProvider())return'unsupported';return this.board(mode)?'ready':'unconfigured';}
  async top(mode,{signal}={}){
    const state=this.availability(mode);if(state!=='ready')throw error(state);
    const provider=this.getProvider(),board=this.board(mode),limit=500,rows=[],users=new Set(),tokens=new Set();let cursor='',periodToken='';
    for(let page=0;page<100&&rows.length<limit;page++){
      if(signal?.aborted)throw error('cancelled');
      const result=await provider.load(board,cursor,periodToken);
      if(signal?.aborted)throw error('cancelled');
      if(!result||!Array.isArray(result.scores))throw error('invalid');
      const responsePeriod=result.leaderboard?.period?.periodToken;
      if(periodToken&&responsePeriod&&responsePeriod!==periodToken)throw error('periodChanged');
      if(typeof responsePeriod==='string')periodToken=responsePeriod;
      for(const item of result.scores){
        const value=integer(item.score),rank=integer(item.rank),id=String(item.user?.openid||item.user?.openId||'');
        if(value===null||rank===null||rank<1||rank>limit||(id&&users.has(id)))continue;
        if(id)users.add(id);
        rows.push({rank,name:typeof item.user?.name==='string'?item.user.name:'TapTap 玩家',score:value});
        if(rows.length===limit)break;
      }
      const next=result.nextContinuationToken;
      if(!next)break;
      if(typeof next!=='string'||tokens.has(next))throw error('invalid');
      tokens.add(next);cursor=next;
      if(page===99&&rows.length<limit)throw error('invalid');
    }
    return rows;
  }
  submit(result){
    if(!result?.id||result.reason==='quit'||scoreOf(result)===null)return Promise.resolve(false);
    if(this.availability(result.gameMode)!=='ready')return Promise.resolve(false);
    return this.isWeekly()?this.submitWeekly(result):this.submitAllTime(result);
  }
  submitWeekly(result){
    const board=this.board(result.gameMode),key=board+':'+result.id;
    if(this.weeklySent.has(key))return Promise.resolve(true);
    if(this.weeklyInflight.has(key))return this.weeklyInflight.get(key);
    // Every run reaches the server's current week, even if lower than last week's best.
    // Failed weekly results are not carried into a later week via the retry queue.
    const task=Promise.resolve().then(()=>this.getProvider().submit(board,scoreOf(result))).then(()=>{
      this.weeklySent.add(key);if(this.weeklySent.size>128)this.weeklySent.delete(this.weeklySent.values().next().value);return true;
    },e=>{this.lastSubmitError=e;return false;}).finally(()=>this.weeklyInflight.delete(key));
    this.weeklyInflight.set(key,task);return task;
  }
  submitAllTime(result){
    if(!result?.id||result.reason==='quit')return Promise.resolve(false);
    const score=scoreOf(result),mode=result.gameMode;
    if(score===null||this.availability(mode)!=='ready')return Promise.resolve(false);
    const old=this.pending.get(mode);if(!old||score>old.score)this.pending.set(mode,{score,id:result.id});
    return this.flush(mode);
  }
  flush(mode){
    if(this.inflight.has(mode))return this.inflight.get(mode);
    const task=(async()=>{
      while(this.pending.has(mode)){
        const next=this.pending.get(mode);
        if((this.sent.get(mode)??-1)>=next.score){this.pending.delete(mode);continue;}
        try{await this.getProvider().submit(this.board(mode),next.score);}
        catch(e){this.lastSubmitError=e;return false;}
        this.sent.set(mode,next.score);if(this.pending.get(mode)===next)this.pending.delete(mode);
      }
      return true;
    })().finally(()=>this.inflight.delete(mode));
    this.inflight.set(mode,task);return task;
  }
  retryPending(){return Promise.all([...this.pending.keys()].map(mode=>this.flush(mode)));}
  canLogin(){return typeof this.getProvider()?.login==='function';}
  async login(){if(!this.canLogin())throw error('unsupported');await this.getProvider().login();await this.retryPending();}
}
P.Leaderboards=Leaderboards;
P.rankingMetric=Object.freeze({modes,label,display,scoreOf,recordOf,recordLabel:mode=>mode==='race'?'最大个数':survival(mode)?'最高存活时间':'最高草！值'});
})(globalThis.PixelDodge);
