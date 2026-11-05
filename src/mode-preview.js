(function(P){
'use strict';
const TAU=Math.PI*2,SIZE=520;
function create(mode,random=Math.random){
  const roll=()=>Math.max(0,Math.min(.999999,Number(random())||0)),between=(a,b)=>a+(b-a)*roll(),pick=values=>values[Math.floor(roll()*values.length)];
  const scene={mode,size:SIZE,monochrome:mode==='monochrome',hazards:[],ghosts:[],pickups:[],orbs:[],whites:[],orbit:null};
  function history(head,heading,length=between(92,132)){
    return Array.from({length:36},(_,i)=>{const t=i/35,d=(1-t)*length;return{x:head.x-Math.cos(heading)*d,y:head.y-Math.sin(heading)*d};});
  }
  function ball(x,y,heading=between(0,TAU)){const head={x,y,r:P.config.radius};head.trail=history(head,heading);return head;}
  scene.player=ball(between(140,190),between(320,370));
  if(mode==='race'){
    scene.player=ball(between(65,95),between(330,365),between(1.2,1.8));
    scene.whites=[ball(between(430,455),between(340,370),between(.8,1.3))];
    for(const [i,[x,y]]of [[120,125],[395,145],[285,395]].entries())scene.orbs.push({type:'large',x:x+between(-10,10),y:y+between(-10,10),r:between(90,108),angle:0,colorIndex:(i+Math.floor(roll()*3))%6,spawn:0});
    return scene;
  }
  if(mode==='twin'){
    const angle=between(0,TAU),direction=roll()<.5?-1:1;scene.orbit={x:260,y:260,radius:210};
    function orbitalBall(a){return ball(260+Math.cos(a)*210,260+Math.sin(a)*210,a+direction*Math.PI/2);}
    scene.player=orbitalBall(angle);scene.whites=[orbitalBall(angle+Math.PI)];
  }else if(mode==='trial'){
    scene.player=ball(between(215,315),between(255,330));
    const places=[[85,80],[260,65],[430,115],[455,300],[390,435],[185,440],[65,350],[80,210]],offset=Math.floor(roll()*places.length),count=4+Math.floor(roll()*5);
    for(let i=0;i<count;i++){const [x,y]=places[(i+offset)%places.length],p={x:x+between(-8,8),y:y+between(-8,8)};scene.whites.push(ball(p.x,p.y,Math.atan2(p.y-260,p.x-260)+between(-.3,.3)));}
  }else scene.whites=[ball(between(350,390),between(95,125),between(-1.1,-.6))];
  if(mode!=='trial'){
    const anchors=mode==='twin'?[[160,180],[330,160],[310,340],[65,65],[455,65],[455,455]]:[[85,85],[240,90],[425,180],[445,325],[330,445],[85,430],[275,250]];
    for(const [i,[x,y]]of anchors.entries()){
      const type=['split','normal','fast','split','fast','normal','split'][i],h={type,x:x+between(-14,14),y:y+between(-14,14),r:type==='split'?20:type==='fast'?between(10,13):between(15,19),angle:(between(0,TAU)+i*.79)%TAU,colorIndex:(i+Math.floor(roll()*6))%6,spawn:0,frozen:mode==='hard'};
      if([scene.player,...scene.whites].some(p=>Math.hypot(p.x-h.x,p.y-h.y)<h.r+p.r+22))continue;
      scene.hazards.push(h);
      if(mode!=='twin')for(let j=1;j<=(mode==='hard'?2:1);j++){
        const heading=i*1.13+.5,x=h.x-Math.cos(heading)*P.config.ghostSpacing*j,y=h.y-Math.sin(heading)*P.config.ghostSpacing*j;
        if(x>25&&x<495&&y>25&&y<495&&[scene.player,...scene.whites].every(p=>Math.hypot(p.x-x,p.y-y)>h.r+p.r+14))scene.ghosts.push({...h,x,y,age:1,angle:h.angle-j*.16});
      }
    }
  }
  if(mode!=='twin'){
    for(const [x,y]of [[235,170],[375,310],[190,425]])scene.pickups.push({type:'coin',x:x+between(-15,15),y:y+between(-15,15),sides:3+Math.floor(roll()*4),angle:between(0,TAU),color:scene.monochrome?'#111111':pick(P.coinStyle.colors),life:9});
    if(mode!=='trial')scene.pickups.push({type:mode==='hard'?'freeze':pick(['invincible','magnet','freeze']),x:between(200,225),y:between(270,285),life:9});
  }
  return scene;
}
class ModePreview{
  constructor(root){this.canvases=new Map([...root.querySelectorAll('[data-mode-preview]')].map(c=>[c.dataset.modePreview,c]));this.revision=0;
    if(globalThis.ResizeObserver){this.observer=new ResizeObserver(()=>this.draw());for(const c of this.canvases.values())this.observer.observe(c.parentElement);}
    else globalThis.addEventListener?.('resize',()=>this.draw());
  }
  show(mode){const canvas=this.canvases.get(mode);if(!canvas)return;this.canvas=canvas;this.scene=create(mode);canvas.dataset.sceneId=String(++this.revision);this.draw();}
  draw(){if(this.canvas&&this.scene)P.Renderer.modePreview(this.canvas,this.scene);}
  static create(mode,random){return create(mode,random);}
}
P.ModePreview=ModePreview;
})(globalThis.PixelDodge);
