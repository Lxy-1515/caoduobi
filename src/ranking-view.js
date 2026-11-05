(function(P){
'use strict';
class RankingView{
  constructor(dialog,service){
    this.dialog=dialog;this.service=service;this.rows=dialog.querySelector('#ranking-rows');this.status=dialog.querySelector('#ranking-status');this.refresh=dialog.querySelector('#ranking-refresh');this.login=dialog.querySelector('#ranking-login');this.epoch=0;
    dialog.querySelector('#ranking-close').addEventListener('click',()=>this.close());
    dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    dialog.addEventListener('close',()=>{if(!dialog.open)this.cancel();});
    this.refresh.addEventListener('click',()=>{service.retryPending();this.load();});
    this.login.addEventListener('click',async()=>{const epoch=this.epoch;this.login.disabled=true;try{await service.login();if(epoch===this.epoch&&dialog.open)this.load();}catch(e){if(epoch===this.epoch&&dialog.open)this.message(e);}finally{this.login.disabled=false;}});
  }
  open(mode,opener){this.mode=mode;this.opener=opener;this.dialog.querySelector('#ranking-title').textContent=P.modeNames[mode]+'排行榜';this.dialog.querySelector('#ranking-metric').textContent=P.rankingMetric.label(mode);this.dialog.showModal();this.dialog.querySelector('.ranking-scroll').scrollTop=0;this.load();}
  cancel(){this.epoch++;this.controller?.abort();}
  close(){this.cancel();this.dialog.close();if(this.opener?.isConnected)this.opener.focus({preventScroll:true});}
  message(e){
    const code=String(e.code),auth=['500101','500102','103','104'].includes(code);
    const messages={periodChanged:'榜单周期已更新，请刷新重试','500000':'榜单周期已更新，请刷新重试',cancelled:'已取消登录',unsupported:'请在 TapTap 游戏中查看排行榜',unconfigured:'排行榜暂未开放',timeout:'连接超时，请刷新重试',invalid:'榜单加载失败，请刷新重试'};
    this.status.textContent=messages[code]||(auth?'请先在 TapTap 登录并完成授权':'暂时无法连接排行榜，请刷新重试');this.status.hidden=false;
    this.login.hidden=!(auth&&this.service.canLogin());this.refresh.hidden=['unsupported','unconfigured'].includes(code);
  }
  async load(){
    this.cancel();const epoch=this.epoch;this.controller=new AbortController();this.rows.replaceChildren();this.status.hidden=false;this.status.textContent='正在加载…';this.login.hidden=true;this.refresh.hidden=false;this.refresh.disabled=true;this.dialog.setAttribute('aria-busy','true');
    try{
      const rows=await this.service.top(this.mode,{signal:this.controller.signal});
      if(epoch!==this.epoch||!this.dialog.open)return;
      const fragment=document.createDocumentFragment();
      for(const row of rows){const tr=document.createElement('tr');for(const text of [String(row.rank),row.name,P.rankingMetric.display(this.mode,row.score)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}fragment.append(tr);}
      this.rows.replaceChildren(fragment);this.status.textContent=rows.length?'':'还没有玩家上榜';this.status.hidden=rows.length>0;
    }catch(e){if(epoch===this.epoch&&this.dialog.open)this.message(e);}
    finally{if(epoch===this.epoch){this.refresh.disabled=false;this.dialog.removeAttribute('aria-busy');}}
  }
}
P.RankingView=RankingView;
})(globalThis.PixelDodge);
