(function (P) {
  'use strict';
  P.config = Object.freeze({ size: 720, radius: 9, step: 1 / 120, playerSpeed: 504, playerAcceleration: 1260,
    playerInset: 2, hazardInset: 3,
    race: { seconds:30, batchStep:3, roundReward:3, speedFactor:3, accelerationFactor:2 },
    twin: { radiusFactor:2, rewardSeconds:2 }, trial: { initialBalls:3, ballInterval:5, rewardSeconds:3 },
    shieldRadius: 40, shieldExpandSeconds: .16, shieldShrinkSeconds: .18, freezeWaveSpeed: 1600,
    rangeExpandSeconds: .25, rangeShrinkSeconds: .3,
    hazardLimit: 70, coinLimit: 12, powerLimit: 5, splitRange: 150, splitDistance: 360, ghostSpacing: 96,
    coinAssistRange: 28,
    magnetRange: 180, magnetSpeed: 380, pulseRange: 720 * Math.sqrt(.5 / Math.PI), durations: { invincible: 4, magnet: 7, freeze: 3 },
    hazards: {
      normal: { radius: [12, 18], speed: [108, 168], after: 0, weight: 1 / 3 },
      large: { radius: [90, 120], speed: [72, 102], after: 0, weight: 0 },
      fast: { radius: [8, 11], speed: [252, 312], after: 0, weight: 1 / 3 },
      split: { radius: [20, 20], speed: [120, 156], after: 0, weight: 1 / 3 }
    },
    generation: { firstHazard: 1.2, coinInterval: 1.2, firstPower: 3, powerInterval: [3, 5],
      intervalStart: .9, intervalEnd: .24, rampSeconds: 180, maxSpeedFactor: 1.7, entryWarning: .55,
      childRadius: 12, childSpeedFactor: 1.2, childAngles: [-3, -1, 1, 3].map(n => n * Math.PI / 5) },
    pickups: { coinLife: 9, powerLife: 10, coinRadius: 8, powerRadius: 13,
      weights: { invincible: .25, magnet: .25, freeze: .20, pulse: .22, nova: .08 },
      hardFreezeExtraFactor: 3, extraFreezeLimit: 3 }
  });
  P.whiteBallStyle = Object.freeze({ color: '#eeeeee', shade: '#5f5f5f' });
  P.coinStyle = Object.freeze({ radius: 7.08, colors: Object.freeze(['#edbd13','#2789ef','#a060ef','#f065b0','#f18b36','#24bca8']) });
  P.modeNames = {classic:'经典模式',hard:'困难模式',monochrome:'黑白世界',race:'竞速模式',twin:'双生循环',trial:'无尽试炼'};
  P.formatSeconds=(time,countdown=false)=>{
    const value=Number.isFinite(time)?Math.max(0,time):0;
    return Math.max(0,countdown?Math.ceil(value-1e-9):Math.floor(value+1e-9))+'\u202fs';
  };
  // Keep IDs stable when the user supplies final display names.
  P.shopSounds=[{"id":"default-collect","name":"默认拾取音","price":0,"sample":"collect","default":true},{"id":"default-ghost","name":"默认消除音","price":0,"sample":"ghost","default":true},{"id":"shop-sound-1","name":"怀疑","price":100,"sample":"shop1"},{"id":"shop-sound-2","name":"NO","price":100,"sample":"shop2"},{"id":"shop-sound-4","name":"噗","price":100,"sample":"shop4"},{"id":"shop-sound-5","name":"钢管","price":100,"sample":"shop5"},{"id":"shop-sound-6","name":"哇哦","price":100,"sample":"shop6"},{"id":"shop-sound-7","name":"Whooo","price":null,"acquisition":"rewardedAd","sample":"shop7"}];
  P.shopMusic=[{"id":"default-music","name":"默认音乐","price":0,"sample":"music","default":true},{"id":"music-lemon-duck","name":"柠檬橡皮鸭","price":500,"sample":"musicLemon"},{"id":"music-fart-disco","name":"放屁迪斯科","price":null,"acquisition":"rewardedAd","sample":"musicFart"}];
  P.soundAvailable=item=>!!(item&&(item.acquisition==='rewardedAd'||Number.isSafeInteger(item.price)&&item.price>=0)&&typeof item.sample==='string'&&P.audioAssets?.[item.sample]);
  P.skins = {
    player: [
      { id: 'mint', name: '墨色轨迹', note: '纯黑小球 · 黑灰渐变尾迹', price: 0, color: '#111111', shade: '#a0a0a0' },
      { id: 'sun', name: '日光核心', note: '琥珀小球 · 金色渐变尾迹', price: 40, color: '#dc9d00', shade: '#f2d588' },
      { id: 'iris', name: '紫电方舟', note: '紫色小球 · 淡紫渐变尾迹', price: 90, color: '#9454ed', shade: '#cbb0f3' },
      { id: 'rose', name: '绯红彗星', note: '玫红小球 · 浅粉渐变尾迹', price: 160, color: '#ed4d98', shade: '#f8b6d3' }
    ],
    hazard: [
      { id: 'ember', name: '明亮光谱', note: '黄 / 蓝 / 紫 / 粉 · 随机亮色', price: 0, palette: ['#edbd13','#2789ef','#a060ef','#f065b0','#f18b36','#24bca8'], pattern: 0 },
      { id: 'gold', name: '日落光谱', note: '金黄 / 珊瑚 / 玫红 · 随机暖色', price: 40, palette: ['#edb70a','#f18237','#f35c86','#df69c5','#ef9464'], pattern: 1 },
      { id: 'violet', name: '极光光谱', note: '紫 / 蓝 / 青 · 随机冷色', price: 90, palette: ['#9b5ded','#348af0','#21b4b2','#d661c9','#7381ed'], pattern: 2 },
      { id: 'white', name: '糖果光谱', note: '粉 / 柠黄 / 蓝紫 · 随机糖果色', price: 160, palette: ['#ed79b4','#d4b31a','#6d9eee','#a97ce5','#49bdad'], pattern: 3 }
    ]
  };
  P.items = {
    coin: { name: '积分碎片', short: '+1', color: '#218b74', desc: '随机彩色实心三至六边形；本局 +1 分，结束后存入钱包' },
    invincible: { name: '护盾', short: '4s', color: '#b27c00', desc: '免伤 4 秒，范围展开至半径 40 并挡碎障碍，结束收回；困难模式拾取后储存，濒死时消耗一个自动开启。白球不会被消除' },
    magnet: { name: '磁铁', short: '7s', color: '#9252d8', desc: '吸引范围从自身展开，7 秒结束前收回；按当前可见范围吸引碎片。经典模式同时清除拖尾，困难模式不清除' },
    freeze: { name: '冻结', short: '3s', color: '#187fae', desc: '冻结随机障碍与拖尾自转 3 秒，白球继续弹跳。经典模式扩散波清除拖尾，困难模式不清除，拖尾仍会造成伤害' },
    pulse: { name: '近身清障', short: '½', color: '#d96a39', desc: '以冰冻波速度向外扩散，触及才清除局部范围内的障碍和拖尾；白球不受影响，靠边时裁切' },
    nova: { name: '全屏清障', short: '全', color: '#ba7b13', desc: '以冰冻波速度扩散至全场，触及的障碍和拖尾才消失；白球及其尾迹保留' }
  };
  P.skin = (group, id) => P.skins[group].find(s => s.id === id) || P.skins[group][0];
})(globalThis.PixelDodge = globalThis.PixelDodge || {});
