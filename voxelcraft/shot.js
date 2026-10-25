/* 纯Node 软件光栅器：把游戏真实 render() 的结果写成 PNG，不依赖浏览器。
   三个踩过的坑，务必保留：
   1) 必须先 genWorld() + spawnPoint()，否则 chunks 全空 → 0 个面
   2) 不做 z-buffer：游戏内部已用画家算法排好序，逐个覆盖才是忠实模拟
      （之前用 depth=0 写 z-buffer，导致 0>=0 把后续所有面全跳过，只剩最远一层）
   3) 线性渐变要真实实现，否则天空退化成灰色 */
const fs=require('fs'), zlib=require('zlib');
let code=fs.readFileSync(process.env.VC_SRC||'D:/WS/Games/voxelcraft/index.html','utf8')
  .split('<script>')[1].split('</script>')[0];
code=code.replace('const $ = id => document.getElementById(id);','const $ = (id) => (globalThis.__el[id] || null);');
code=code.split('/* ---------------- 13. 输入 ---------------- */')[0];

const W=960,H=540;
const img=new Uint8Array(W*H*3);
let drawn=0, nanCnt=0, maxPts=0;
const facePix=[];let curFace=-1;
/* 覆盖统计：同一个像素被多少个多边形盖过，用来发现排序失效 */
const cover=new Uint16Array(W*H);
let maxCover=0;

function toRGB(s){
  if(typeof s==='string'&&s[0]==='#'){
    const h=s.slice(1);
    if(h.length>=6) return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];
  }
  const m=/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s||'');
  return m?[+m[1],+m[2],+m[3]]:[128,128,128];
}

/* 垂直线性渐变，按 y 采样 */
function mkGrad(y0,y1,stops){
  return {__grad:true, sample(py){
    const t=Math.max(0,Math.min(1,(py-y0)/((y1-y0)||1)));
    let a=stops[0], b=stops[stops.length-1];
    for(let i=0;i<stops.length-1;i++){
      if(t>=stops[i][0]&&t<=stops[i+1][0]){ a=stops[i]; b=stops[i+1]; break; }
    }
    const span=(b[0]-a[0])||1, u=Math.max(0,Math.min(1,(t-a[0])/span));
    return [a[1][0]+(b[1][0]-a[1][0])*u,
            a[1][1]+(b[1][1]-a[1][1])*u,
            a[1][2]+(b[1][2]-a[1][2])*u];
  }};
}

/* 屏幕空间 Sutherland–Hodgman 裁剪。
   注意：本函数假定输入是凸多边形且顶点按序环绕。
   近平面裁剪后的四边形若退化成「一条线 + 一个重合点」，环绕顺序会被破坏，
   配对/凸包求交都会填出横贯全屏的条带 —— 所以这里额外做了环绕方向归一化。 */
function signedArea(pts){
  let s=0;
  for(let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    s += a[0]*b[1] - b[0]*a[1];
  }
  return s/2;
}
function clipRect(ptsIn){
  let pts=ptsIn.slice();
  if(pts.length<3) return pts;
  /* 统一为逆时针（屏幕 y 向下，所以 s>0 才是我们想要的绕向） */
  if(signedArea(pts)<0) pts.reverse();

  function lerpX(a,b,x){ const t=(x-a[0])/((b[0]-a[0])||1e-9); return [x, a[1]+(b[1]-a[1])*t]; }
  function lerpY(a,b,y){ const t=(y-a[1])/((b[1]-a[1])||1e-9); return [a[0]+(b[0]-a[0])*t, y]; }
  const edges=[
    p=>p[0]>=0, p=>p[0]<=W,
    p=>p[1]>=0, p=>p[1]<=H,
  ];
  const lerps=[(a,b)=>lerpX(a,b,0), (a,b)=>lerpX(a,b,W),
               (a,b)=>lerpY(a,b,0), (a,b)=>lerpY(a,b,H)];

  for(let e=0;e<4;e++){
    if(pts.length<3) return [];
    const inside=edges[e], lerp=lerps[e];
    const inp=pts; pts=[];
    for(let i=0;i<inp.length;i++){
      const a=inp[i], b=inp[(i+1)%inp.length];
      const ia=inside(a), ib=inside(b);
      if(ia) pts.push(a);
      if(ia!==ib) pts.push(lerp(a,b));
    }
  }
  /* 裁剪后若出现几乎重合的相邻顶点，清掉，避免退化边产生虚假跨度 */
  const out=[];
  for(const p of pts){
    const q=out[out.length-1];
    if(q && Math.abs(q[0]-p[0])<1e-6 && Math.abs(q[1]-p[1])<1e-6) continue;
    out.push(p);
  }
  if(out.length>2){
    const f=out[0], l=out[out.length-1];
    if(Math.abs(f[0]-l[0])<1e-6 && Math.abs(f[1]-l[1])<1e-6) out.pop();
  }
  return out;
}

/* ---------- 拖影诊断：找出屏幕空间里又宽又扁的多边形 ---------- */
const STREAK=[];   /* [w,h,y,color] */
function noteStreak(pts,style){
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(const p of pts){
    if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1];
  }
  const w=x1-x0, h=y1-y0;
  if(w>120 && h<=14) STREAK.push({w:w|0,h:h.toFixed(1),y:y0|0,
    c:toRGB(style).join(','),n:pts.length});
}

/* 扫描线填充：画家算法，直接覆盖 */
function fillPoly(pts0,style,alpha){
  if(!pts0||pts0.length<3) return;
  for(const p of pts0) if(!isFinite(p[0])||!isFinite(p[1])) return;
  const pts=clipRect(pts0);
  if(pts.length<3) return;
  if(pts.length>maxPts) maxPts=pts.length;
  noteStreak(pts,style);
  curFace=drawn; facePix[curFace]=0;

  let minY=1e9,maxY=-1e9;
  for(const p of pts){ if(p[1]<minY)minY=p[1]; if(p[1]>maxY)maxY=p[1]; }
  minY=Math.max(0,Math.floor(minY)); maxY=Math.min(H-1,Math.ceil(maxY));
  if(minY>maxY) return;

  for(let y=minY;y<=maxY;y++){
    /* 关键：裁剪后的四边形在屏幕空间一定是凸的，所以扫描线与它的交集
       就是所有交点的 [min, max]。用配对法在水平边上会重复计数、错配，
       正是那些横向拖影的来源。 */
    let lo=1e9, hi=-1e9, n=0;
    for(let i=0;i<pts.length;i++){
      const a=pts[i], b=pts[(i+1)%pts.length];
      if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){
        const x=a[0]+(y-a[1])/((b[1]-a[1])||1e-9)*(b[0]-a[0]);
        if(x<lo)lo=x; if(x>hi)hi=x; n++;
      }
    }
    if(n<2) continue;
    const col = (style&&style.__grad) ? style.sample(y+0.5) : toRGB(style);
    const x0=Math.max(0,Math.ceil(lo-0.5)), x1=Math.min(W-1,Math.floor(hi-0.5));
    for(let x=x0;x<=x1;x++){
      cover[y*W+x]++; if(cover[y*W+x]>maxCover) maxCover=cover[y*W+x];
      facePix[curFace]++;
      const o=(y*W+x)*3;
      img[o  ]=col[0]*alpha+img[o  ]*(1-alpha);
      img[o+1]=col[1]*alpha+img[o+1]*(1-alpha);
      img[o+2]=col[2]*alpha+img[o+2]*(1-alpha);
    }
  }
  drawn++;
}

/* 描边：Bresenham 画线（游戏只用它做0.7px 同色消裂缝，不参与形状判断） */
function strokePoly(pts,style,alpha){
  if(!pts||pts.length<2) return;
  const col=toRGB(style);
  for(let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    if(!isFinite(a[0])||!isFinite(a[1])||!isFinite(b[0])||!isFinite(b[1])) continue;
    /* 限制长度，防止坐标爆炸时扫全屏 */
    if(Math.abs(a[0]-b[0])>4000||Math.abs(a[1]-b[1])>4000) continue;
    let x0=Math.round(a[0]), y0=Math.round(a[1]);
    let x1=Math.round(b[0]), y1=Math.round(b[1]);
    const dx=Math.abs(x1-x0), dy=-Math.abs(y1-y0);
    const sx=x0<x1?1:-1, sy=y0<y1?1:-1;
    let err=dx+dy, guard=0;
    for(;;){
      if(x0>=0&&x0<W&&y0>=0&&y0<H){
        const o=(y0*W+x0)*3;
        img[o  ]=col[0]*alpha+img[o  ]*(1-alpha);
        img[o+1]=col[1]*alpha+img[o+1]*(1-alpha);
        img[o+2]=col[2]*alpha+img[o+2]*(1-alpha);
      }
      if((x0===x1&&y0===y1)||++guard>8000) break;
      const e2=2*err;
      if(e2>=dy){ err+=dy; x0+=sx; }
      if(e2<=dx){ err+=dx; y0+=sy; }
    }
  }
}

/* ---------- canvas 2D 替身 ---------- */
let curStyle='rgb(128,128,128)', curAlpha=1, pending=null;
const ctx={
  canvas:{width:W,height:H},
  createRadialGradient:()=>({addColorStop(){}}),
  arc(){}, fillRect(){}, strokeRect(){}, clearRect(){},
  rect(){}, roundRect(){}, ellipse(){}, quadraticCurveTo(){}, bezierCurveTo(){},
  setTransform(){}, translate(){}, scale(){},
  measureText:()=>({width:8}),
  get fillStyle(){return curStyle;}, set fillStyle(v){curStyle=v;},
  get globalAlpha(){return curAlpha;}, set globalAlpha(v){curAlpha=v;},
  get strokeStyle(){return curStyle;}, set strokeStyle(v){curStyle=v;},
  lineWidth:1,lineJoin:'',textBaseline:'',font:'',
  beginPath(){pending=[];},
  moveTo(x,y){pending=[[x,y]];},
  lineTo(x,y){ if(pending) pending.push([x,y]); },
  closePath(){},
  fill(){ fillPoly(pending,curStyle,curAlpha); },
  /* 游戏给每个不透明面加同色细描边来消抗锯齿裂缝。
     必须实现它 —— 但它是「描边」不是「填充」：只画线，不能当多边形填。
     这正是之前横向拖影的来源：stroke() 空实现时 pending 被下一次
     beginPath 之前的重复调用污染，导致路径跨越多个面。 */
  stroke(){ strokePoly(pending,curStyle,curAlpha); },
  fillText(){}, drawImage(){},
  save(){}, restore(){}, clip(){},
};
/* 渐变：收集色标后按 y 采样（只支持垂直渐变，本作足够） */
ctx.createLinearGradient=(x0,y0,x1,y1)=>{
  const st=[];
  return {__grad:true, addColorStop:(o,c)=>st.push([o,toRGB(c)]),
          sample:py=>mkGrad(y0,y1,st).sample(py)};
};
/* fillRect 走多边形路径，天空才能填满 */
ctx.fillRect=function(x,y,w,h){ fillPoly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],curStyle,curAlpha); };

/* ---------- DOM 环境 ---------- */
globalThis.__el={};
const el=globalThis.__el;
function mkEl(extra){
  return Object.assign({textContent:'',value:'20261007',style:{},
    classList:{add(){},toggle(){},remove(){}},
    appendChild(){},addEventListener(){},innerHTML:''},extra||{});
}
for(const id of ['hPos','hDir','hFps','hFace','hMode','hChunk','bar','barname',
                 'toast','veil','seedIn','btnPlay','btnNew']) el[id]=mkEl();
el['c']=mkEl({width:W,height:H,getContext:()=>ctx,focus(){}});

global.document={
  getElementById:id=> el[id] || mkEl({width:W,height:H,getContext:()=>ctx,focus(){}}),
  createElement:()=>({getContext:()=>ctx,width:0,height:0,style:{}}),
  addEventListener(){}, exitPointerLock(){},
};
global.window={devicePixelRatio:1,innerWidth:W,innerHeight:H,addEventListener(){}};
global.innerWidth=W; global.innerHeight=H;
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.performance={now:()=>0};
global.requestAnimationFrame=()=>{};
global.setInterval=()=>{}; global.setTimeout=()=>0; global.clearTimeout=()=>{};

const G=new Function(code+'return {render,resize,P,get faceDrawn(){return faceDrawn},'+
  'spawnPoint,genWorld,get dayT(){return dayT},setDay:v=>{dayT=v}};')();

/* ★ 先生成世界 + 放置玩家 */
G.genWorld(20261007);
G.spawnPoint();

/* 可选机位：node shot.js <yaw> <pitch> <dayT> */
const A=process.argv.slice(2).map(Number);
if(A.length>=2){ G.P.yaw=A[0]; G.P.pitch=A[1]; }
if(A.length>=3) G.setDay(A[2]);

G.resize();
console.log('玩家', G.P.x.toFixed(2), G.P.y.toFixed(2), G.P.z.toFixed(2),
            '| yaw', G.P.yaw.toFixed(3), '| pitch', G.P.pitch.toFixed(3),
            '| dayT', G.dayT);

const t0=Date.now();
G.render();
const ms=Date.now()-t0;

console.log('游戏报告面数 :', G.faceDrawn);
console.log('光栅多边形数 :', drawn);
console.log('NaN 顶点     :', nanCnt, '| 最大顶点数:', maxPts);
console.log('渲染耗时     :', ms, 'ms');
/* 覆盖深度分布 */
let c1=0,c2=0,c3p=0,c0=0;
for(let i=0;i<W*H;i++){ const v=cover[i]; if(v===0)c0++; else if(v===1)c1++; else if(v===2)c2++; else c3p++; }
console.log('像素覆盖分布 : 未被覆盖', c0, '| 1层', c1, '| 2层', c2, '| 3层+', c3p, '| 最大', maxCover);

/* 拖影诊断 */
console.log('\n=== 横向拖影多边形（宽>250 且高<=4）: 共', STREAK.length, '===');
const byCol={};
for(const s of STREAK) byCol[s.c]=(byCol[s.c]||0)+1;
console.log('按颜色分布:', JSON.stringify(byCol,null,0).slice(0,600));
console.log('前 12 条:', JSON.stringify(STREAK.slice(0,12)));
const heights=STREAK.map(s=>s.y).sort((a,b)=>a-b);
console.log('y 范围:', heights[0], '~', heights[heights.length-1]);
/* 找出贡献像素最多的面（拖影带的来源必然在此） */
const top=facePix.map((n,i)=>[n,i]).sort((a,b)=>b[0]-a[0]).slice(0,15);
console.log('写入像素最多的面:', JSON.stringify(top));
let scan='';
for(let x=0;x<W;x+=6){scan+=String(cover[300*W+x]).padStart(4);} 
console.log('y=300 覆盖剖面:', scan);
console.log('顶点数分布:', JSON.stringify(STREAK.reduce((m,s)=>(m[s.n]=(m[s.n]||0)+1,m),{})));

const px=(x,y)=>{const o=(y*W+x)*3;return `rgb(${img[o]},${img[o+1]},${img[o+2]})`;};
console.log('采样 天空顶  :', px(480,6), '| 天空中:', px(480,110),
            '| 正中:', px(480,300), '| 下方:', px(480,505));

/* ---------- 写 PNG ---------- */
const raw=Buffer.alloc((W*3+1)*H);
for(let y=0;y<H;y++){ raw[y*(W*3+1)]=0; Buffer.from(img.buffer,y*W*3,W*3).copy(raw,y*(W*3+1)+1); }
function chunk(type,data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td=Buffer.concat([Buffer.from(type),data]);
  const ct=[]; for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;ct[n]=c>>>0;}
  let c=0xFFFFFFFF; for(const b of td) c=ct[(c^b)&0xFF]^(c>>>8);
  const crc=Buffer.alloc(4); crc.writeUInt32BE((c^0xFFFFFFFF)>>>0);
  return Buffer.concat([len,td,crc]);
}
const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
ihdr[8]=8; ihdr[9]=2;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]);
const OUT=process.env.VC_OUT || 'D:/WS/Games/voxelcraft/vcnode.png';
fs.writeFileSync(OUT, png);
console.log('已写出', OUT, png.length, 'bytes');