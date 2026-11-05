# 音频

原音频不公开，也未嵌入已提交的JS/HTML。build.cjs为缺失文件生成100ms静音WAV；src/audio-assets.js与play.html都是忽略的生成物。

将自行获授权音频放在本地assets/audio/后重新构建。该目录默认被Git忽略：

| 用途 | 文件 |
| --- | --- |
| 默认背景、拾取、消除、结束、菜单 | disco-bass-loop.wav、score-pickup.wav、bubble-pop.wav、game-end.wav、menu-click.mp3 |
| 商城音效 | shop-sound-1.wav、shop-sound-2.wav、shop-sound-4.wav、shop-sound-5.wav、shop-sound-6.wav、shop-sound-7.wav |
| 商城音乐 | shop-music-1.wav、shop-music-2.wav |

可修改build.cjs中的映射。文件名仅为接口兼容，不授予原素材权利。背景音乐循环播放；添加音源后自行检查循环边界、响度和移动端解码。
