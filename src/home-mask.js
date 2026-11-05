(function(P){
'use strict';
class HomeMask {
  constructor(canvas,title){
    this.canvas=canvas;this.title=title;this.surface=document.createElement('canvas');this.ctx=this.surface.getContext('2d',{willReadFrequently:true});this.interactions=new Map();
    for(const el of document.querySelectorAll('.menu-link,.settings-open')){
      const update=()=>{
        this.interactions.set(el,el.matches(':hover,:focus-visible')?Infinity:performance.now()+400);
      };
      for(const type of ['pointerenter','pointerleave','focus','blur'])el.addEventListener(type,update);
    }
  }
  refresh(scale){
    this.scale=scale;const rect=this.canvas.getBoundingClientRect();this.width=Math.ceil(rect.width);this.height=Math.ceil(rect.height);
    this.surface.width=this.width;this.surface.height=this.height;const ctx=this.ctx;ctx.fillStyle=ctx.strokeStyle='#000';
    const disc=document.querySelector('.title-disc').getBoundingClientRect();
    this.disc={x:disc.x+disc.width/2-rect.x,y:disc.y+disc.height/2-rect.y,r:disc.width/2};
    if(this.title.glyphPath){ctx.save();ctx.scale(scale,scale);ctx.fill(this.title.glyphPath);ctx.lineWidth=parseFloat(getComputedStyle(document.querySelector('.title-lettering path')).strokeWidth)/scale;ctx.stroke(this.title.glyphPath);ctx.restore();}
    for(const el of document.querySelectorAll('.menu-link>span:nth-child(2),.title-caption,.signature'))this.text(el,rect);
    for(const el of document.querySelectorAll('.menu-dot')){const r=el.getBoundingClientRect();ctx.beginPath();ctx.ellipse(r.x+r.width/2-rect.x,r.y+r.height/2-rect.y,r.width/2,r.height/2,0,0,Math.PI*2);ctx.fill();}
    for(const el of document.querySelectorAll('.settings-open svg,.menu-link>svg')){
      if(+getComputedStyle(el).opacity>0)this.icon(el,rect);
    }
    this.buttons=new Map();
    for(const el of document.querySelectorAll('.menu-link,.settings-open')){const r=el.getBoundingClientRect();this.buttons.set(el,{x:r.x-rect.x,y:r.y-rect.y,w:r.width,h:r.height});if(el.matches(':hover,:focus-visible'))this.interactions.set(el,Infinity);}
    if(!this.detailSurface)this.detailSurface=document.createElement('canvas');
    this.detailSurface.width=this.width;this.detailSurface.height=this.height;this.detailSurface.getContext('2d').drawImage(this.surface,0,0);
    ctx.beginPath();ctx.arc(this.disc.x,this.disc.y,this.disc.r,0,Math.PI*2);ctx.fill();
    const data=ctx.getImageData(0,0,this.width,this.height),alpha=new Uint8Array(this.width*this.height),original=data.data;
    // One CSS pixel protects anti-aliased edges; do not create text-box gaps.
    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++)if(original[(y*this.width+x)*4+3]>8){
      for(let yy=Math.max(0,y-1);yy<=Math.min(this.height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(this.width-1,x+1);xx++)alpha[yy*this.width+xx]=1;
    }
    this.integral=new Uint32Array((this.width+1)*(this.height+1));
    for(let y=0;y<this.height;y++){let row=0;for(let x=0;x<this.width;x++){const i=y*this.width+x;row+=alpha[i];this.integral[(y+1)*(this.width+1)+x+1]=this.integral[y*(this.width+1)+x+1]+row;original[i*4+3]=alpha[i]*255;}}
    ctx.putImageData(data,0,0);
  }
  text(element,rect){
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),ctx=this.ctx;
    while(walker.nextNode()){
      const node=walker.currentNode;if(!node.textContent.trim())continue;
      const style=getComputedStyle(node.parentElement);ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.textBaseline='alphabetic';
      const range=document.createRange();let offset=0;
      for(const char of node.textContent){range.setStart(node,offset);offset+=char.length;range.setEnd(node,offset);const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;
        const m=ctx.measureText(char),a=m.fontBoundingBoxAscent??m.actualBoundingBoxAscent,d=m.fontBoundingBoxDescent??m.actualBoundingBoxDescent;
        ctx.fillText(char,r.x-rect.x,r.y-rect.y+(r.height-a-d)/2+a);
      }
    }
  }
  icon(element,rect){
    const target=document.querySelector(element.querySelector('use')?.getAttribute('href'));if(!target)return;
    const r=element.getBoundingClientRect(),v=target.viewBox.baseVal,ctx=this.ctx;ctx.save();ctx.translate(r.x-rect.x,r.y-rect.y);ctx.scale(r.width/v.width,r.height/v.height);ctx.translate(-v.x,-v.y);
    ctx.lineWidth=parseFloat(getComputedStyle(element).strokeWidth)||1.8;ctx.lineCap=ctx.lineJoin='round';
    for(const node of target.children){if(node.tagName==='path')ctx.stroke(new Path2D(node.getAttribute('d')));else if(node.tagName==='circle'){ctx.beginPath();ctx.arc(+node.getAttribute('cx'),+node.getAttribute('cy'),+node.getAttribute('r'),0,Math.PI*2);ctx.stroke();}}
    ctx.restore();
  }
  hoverShapes(){const now=performance.now(),shapes=[];for(const [el,until]of this.interactions){if(until<now){this.interactions.delete(el);continue;}const shape=this.buttons?.get(el);if(shape)shapes.push(shape);}return shapes;}
  erase(ctx,includeDisc=true){
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-out';ctx.drawImage(includeDisc?this.surface:this.detailSurface,0,0,ctx.canvas.width,ctx.canvas.height);
    const ratio=ctx.canvas.width/this.width;ctx.scale(ratio,ratio);ctx.fillStyle='#000';if(includeDisc)for(const r of this.hoverShapes()){const radius=r.h/2;ctx.beginPath();ctx.arc(r.x+radius,r.y+radius,radius,Math.PI/2,Math.PI*1.5);ctx.arc(r.x+r.w-radius,r.y+radius,radius,-Math.PI/2,Math.PI/2);ctx.closePath();ctx.fill();}ctx.restore();
  }
  ink(x0,y0,x1,y1){
    const w=this.width,s=w+1,a=this.integral;x0=Math.max(0,Math.floor(x0));y0=Math.max(0,Math.floor(y0));x1=Math.min(w,Math.ceil(x1));y1=Math.min(this.height,Math.ceil(y1));
    return x1>x0&&y1>y0&&a[y1*s+x1]-a[y0*s+x1]-a[y1*s+x0]+a[y0*s+x0]>0;
  }
  blocks(body){
    const scale=this.scale,x=body.x*scale,y=body.y*scale,reach=body.r*(body.type==='fast'?Math.SQRT2:1)*scale;
    const hover=this.hoverShapes();
    const inHover=(px,py,pad)=>hover.some(r=>{const radius=r.h/2,cx=Math.max(r.x+radius,Math.min(r.x+r.w-radius,px));return Math.hypot(px-cx,py-r.y-radius)<=radius+pad;});
    if(this.disc&&Math.hypot(x-this.disc.x,y-this.disc.y)+reach<this.disc.r)return true;
    if(!this.ink(x-reach-2,y-reach-2,x+reach+2,y+reach+2)&&!hover.some(r=>x+reach>=r.x&&x-reach<=r.x+r.w&&y+reach>=r.y&&y-reach<=r.y+r.h))return false;
    const half=(body.type==='child'?2.4:3)/2,vertices=P.geometry.polygon(body.type,body.r,half),pad=half*scale+.5;
    const sample=(px,py)=>this.ink(px-pad,py-pad,px+pad,py+pad)||inHover(px,py,pad);
    if(!vertices){const radius=(body.r-half)*scale,n=Math.max(12,Math.ceil(2*Math.PI*radius/.5));for(let i=0;i<n;i++){const a=i/n*Math.PI*2;if(sample(x+Math.cos(a)*radius,y+Math.sin(a)*radius))return true;}}
    else{const c=Math.cos(body.angle||0),s=Math.sin(body.angle||0),points=vertices.map(p=>({x:x+(p.x*c-p.y*s)*scale,y:y+(p.x*s+p.y*c)*scale}));
      for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.5));for(let k=0;k<=n;k++)if(sample(a.x+(b.x-a.x)*k/n,a.y+(b.y-a.y)*k/n))return true;}
    }
    return false;
  }
}
P.HomeMask=HomeMask;
})(globalThis.PixelDodge);
