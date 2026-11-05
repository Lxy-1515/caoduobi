(function(P){
'use strict';
const NS='http://www.w3.org/2000/svg';
class Title {
  constructor(element,disc,caption){this.element=element;this.disc=disc;this.caption=caption;}
  resize(width,height,worldScale){
    const portrait=height>width&&width<=1100;
    // The incumbent CSS owns the disc. Lettering adapts around it, never moves it.
    const disc=this.disc.getBoundingClientRect();
    // Hidden home nodes have no layout; keep the last valid title until shown.
    if(disc.width<=0||disc.height<=0||width<=0||height<=0||worldScale<=0)return false;
    const centerX=disc.x+disc.width/2,centerY=disc.y+disc.height/2;
    const stageWidth=portrait?Math.min(width*.94,disc.width*(width<=600?1.52:1.36)):Math.min(width*.65,disc.width*1.4);
    const stageHeight=stageWidth*(portrait?.8:.64);
    const left=centerX-stageWidth/2,top=centerY-stageHeight/2;
    Object.assign(this.element.style,{left:left+'px',top:top+'px',width:stageWidth+'px',height:stageHeight+'px'});
    const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 1000 ${portrait?800:640}`);svg.setAttribute('aria-hidden','true');svg.classList.add('title-lettering');
    const combined=new Path2D();
    const add=(d,matrix,accent=false)=>{
      const path=document.createElementNS(NS,'path');path.setAttribute('d',d);path.setAttribute('transform',`matrix(${matrix.join(' ')})`);path.setAttribute('vector-effect','non-scaling-stroke');if(accent)path.classList.add('title-impact');svg.append(path);
      combined.addPath(new Path2D(d),new DOMMatrix(matrix));
    };
    const glyph=(char,x,y,w,h)=>{
      const data=P.titleGlyphs[char];
      // Replace soft quadratic shoulders with cut corners, sharing the resulting
      // outline with the trail mask. The source outlines remain attributable.
      let d=data.d.replace(/Q[-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)/g,'L$1 $2');
      if(char==='草')d=d.replace('M270.19 1000.0','M245 1000.0').replace('365.42 1000.0','389 960.0').replace('H0.0L9.32 770.19','H-40L32 770.19')
        .replace('H564.18L621.64 283.13L635.61 342.65','H646L635.61 342.65')
        .replace('H741.2L731.88 156.31','H778L711 156.31');
      // Long straight diagonals replace bowed stroke runs; pointed terminals
      // retain each character's counters and recognizable structure.
      if(char==='躲')d=d.replace('L447.48 786.3L351.18 950.57','L351.18 950.57')
        .replace('L263.13 976.83L201.85 1000.0L142.64 972.19','L270 982L144 1000')
        .replace('L626.67 849.64L600.41 724.0','L600.41 724.0')
        .replace('L713.7 54.58L726.06 117.4','L735 32.96L726.06 117.4');
      if(char==='避')d=d.replace('L316.32 874.74L482.11 908.42L613.68 895.79L716.84 858.95','L355 902L744 858.95')
        .replace('L751.58 943.16L629.47 985.26L472.63 1000.0L306.32 972.63','L711 1000H345')
        .replace('L231.58 342.11L245.26 413.68','L255 316.84L245.26 413.68');
      add(d,[w/data.width,0,0,h/1000,x,y]);
    };
    // Spread the second call to the right on wide screens, fold it underneath
    // on portrait screens. SVG and Canvas share these exact outlines.
    if(portrait){glyph('草',145,65,400,335);glyph('躲',60,430,335,300);glyph('避',405,375,355,325);}
    else{glyph('草',70,60,410,290);glyph('躲',300,342,275,230);glyph('避',590,295,285,250);}
    const bang='M36 0 158 -12 78 202 22 210ZM25 230 78 220 65 282 8 292Z';
    add(bang,portrait?[.95,0,0,1.04,560,83]:[.78,0,0,.9,490,72]);
    add(bang,portrait?[.92,0,0,1.05,790,373]:[.7,0,0,.88,885,294]);
    add(portrait?'M80 88 120 142 35 119ZM159 2 174 65 112 32ZM882 738 943 764 912 797Z':'M28 94 73 133 0 125ZM107 9 122 68 64 38ZM893 577 954 592 932 625Z',[1,0,0,1,0,0],true);
    this.element.replaceChildren(svg);
    const scale=stageWidth/1000/worldScale;
    this.glyphPath=new Path2D();this.glyphPath.addPath(combined,new DOMMatrix([scale,0,0,scale,left/worldScale,top/worldScale]));
    this.trailClip=new Path2D();this.trailClip.rect(-20,-20,width/worldScale+40,height/worldScale+40);this.trailClip.addPath(this.glyphPath);
    this.bounds={left,top,width:stageWidth,height:stageHeight};
    // Keep both caption lines left of the circular edge without moving the disc.
    this.caption.style.transform='none';let shift=0;
    const walker=document.createTreeWalker(this.caption,NodeFilter.SHOW_TEXT),range=document.createRange();
    while(walker.nextNode()){
      if(!walker.currentNode.textContent.trim())continue;range.selectNodeContents(walker.currentNode);
      for(const r of range.getClientRects()){
        const y=Math.max(r.top,Math.min(r.bottom,centerY)),dy=y-centerY;
        if(Math.abs(dy)<disc.width/2){const edge=centerX-Math.sqrt((disc.width/2)**2-dy**2);shift=Math.max(shift,r.right+10-edge);}
      }
    }
    this.caption.style.transform=`translateX(${-Math.max(0,shift)}px)`;
    return true;
  }
}
P.Title=Title;
})(globalThis.PixelDodge);
