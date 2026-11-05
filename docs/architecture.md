# 架构

普通script脚本共享PixelDodge命名空间，无前端框架和打包器运行依赖。

| 模块 | 职责 |
| --- | --- |
| content.js | 模式参数、商品、道具 |
| engine.js、geometry.js、twin-orbit.js | 固定步长模拟、形状碰撞、双生轨道 |
| render.js、home-mask.js、mode-preview.js | Canvas绘制、拖尾、首页遮罩、模式预览 |
| store.js | 存档、购买装备、结果去重结算 |
| achievements*.js | 成就判定、次数、卡片 |
| touch-controls.js、orientation.js | 单轮盘多指接力、手指输入、可跳过横屏建议 |
| audio.js、result-presentation.js | 音频生命周期、结算计数 |
| rewarded-ads.js、leaderboards.js、ranking-view.js | 可选平台接口、状态隔离 |
| app.js | 页面、输入、暂停、结算和调度 |

上述模块均在src/。模拟采用1/120秒固定步长，requestAnimationFrame驱动绘制；碰撞与渲染共享形状几何，真实碰撞体有明确容差。

复活保留同局ID，成功最多一次；最终结束才入账。广告只接受当前请求isEnded===true的回调，防重复或跨局旧回调再次授奖。localStorage保存钱包、装备、记录与成就；项目不含服务端反作弊或多人实时同步。

build.cjs生成音频模块，将脚本及CSS内联为play.html；serve.cjs默认只监听本机；可选tools/package-h5.py把入口和许可组织为单根目录ZIP。
