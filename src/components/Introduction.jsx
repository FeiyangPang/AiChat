import React from 'react'
import './Introduction.css'

function Introduction({ onStart }) {
  return (
    <div className="introduction">
      <div className="card">
        <h1 className="title">角色扮演游戏</h1>
        <div className="content">
          <section className="section">
            <h2>游戏介绍：</h2>
            <p>在课堂梦游时，你是否幻想过成为小说世界的主角，随后不再局限于故事剧情而是为所欲为？</p>
            <p>本游戏就是基于这个启发而创建的游戏，可以基于你的幻想创造一个完整的世界，让你成为其中的主角随意行动，上演你想要的剧情！</p>
            <p className="note">***本游戏本地部署在您电脑中，不连通互联网，使用的是您私人的api接口，因此不可能有第二个活人知道你们聊天的内容，ai也不会有限制了。我只是分享代码，才不是鼓励你们去搞涩涩喵qwq</p>
          </section>

          <section className="section">
            <h2>玩法：</h2>
            <ol>
              <li>进入deepseek官网platform.deepseek.com （目前只支持deepseek api后续会开放gemini,chatgpt等api接口）。</li>
              <li>注册账号，创建api密钥，复制保存好密钥，充值任意金额。有疑问的上任意短视频平台搜"deepseek api"，会有手把手教程教如何创建使用api的。</li>
              <li>打开"角色扮演游戏"文件，双击"启动开发服务器.bat" （在一些电脑上是Windows批处理文件）</li>
              <li>点右上角输入deepseek api密钥</li>
              <li>粘贴完整的世界书，或者描述你想象中的世界和世界中的重要人物，然后使用ai生成更加完整全面的世界书</li>
              <li>描述你要扮演的角色</li>
              <li>自定义开局，或者直接开始游戏随即开局。</li>
            </ol>
          </section>

          <section className="section important-section">
            <h2><strong>重要事项</strong></h2>
            <ul>
              <li><strong>0. 禁止商用！分享这代码只是我学习网页开发途中的正常学术交流！</strong></li>
              <li><strong>1. Deepseek Api 充 1米都可以玩，这钱是直接给deepseek官方的，并不是给我的！！！你后续要用这个api做别的任务是完全不影响的！！！</strong></li>
              <li><strong>2. 本代码完全开源！在github上可搜！https://github.com/FeiyangPang/AiChat！ 不存在什么病毒木马暴露隐私那你电脑挖矿（我要是有那水平就好了喵qwq)，你可以随便看我简陋的代码或者把代码丢给ai问这含不含病毒，或者会不会泄露你隐私。</strong></li>
              <li><strong>3. 版本为1.0，若有任何bug或者想要优化新增的内容请联系qq 1276025418，请勿骚扰，备注来意</strong></li>
              <li><strong>4. 后续会做功能的更新以及好玩的世界书的更新</strong></li>
            </ul>
          </section>

          <section className="section">
            <h2>为什么不用酒馆ai（sillytavern) 而是用我的软件？</h2>
            <p>因为我软件简陋+省事</p>
            <ol>
              <li>酒馆ai确实做的要比我好很多功能也齐全，但是就是因为他功能太多了上手很麻烦，当时我从想要玩ai对话到实际上玩上花了整整两个小时，配置各种东西和搜罗角色卡。我这个软件简单省事双击就可以玩。</li>
              <li>单论创造你想要的世界和故事这一块的自由度没有我这个高。在酒馆想要创造一个临时想出的世界和角色可能要花上一整天或者多天的时间学习写卡，而在这个软件花几分钟描述你就可以玩到你想象中的世界和人物。</li>
            </ol>
            <p className="note">后续会有更多好玩的功能！请期待！</p>
          </section>
        </div>
        <button onClick={onStart} className="btn-start">
          开始游戏
        </button>
      </div>
    </div>
  )
}

export default Introduction
