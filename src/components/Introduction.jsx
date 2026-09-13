import React from 'react'
import './Introduction.css'

function Introduction({ onStart }) {
  return (
    <div className="introduction">
      <div className="card">
        <h1 className="title">角色扮演游戏 V 2.0</h1>
        <div className="content">
          <section className="section">
            <h2>游戏介绍：</h2>
            <p>在课堂梦游时，你是否幻想过成为小说世界的主角，随后不再局限于故事剧情而是为所欲为？</p>
            <p>本游戏就是基于这个启发而创建的游戏，可以基于你的幻想创造一个完整的世界，让你成为其中的主角随意行动，上演你想要的剧情！</p>
            <p className="note">***本游戏界面和本机代理运行在你的电脑中；生成内容时会把请求直接发送到 DeepSeek 官方接口。API Key 仅保存在当前浏览器本地，不写入项目文件。</p>
          </section>

          <section className="section">
            <h2>玩法：</h2>
            <ol>
              <li>在 DeepSeek 官方平台创建 API Key。游戏固定使用 DeepSeek V4.1 Flash。</li>
              <li>模型 ID 固定为 deepseek-flash，API Key 仅保存在当前浏览器。</li>
              <li>打开"角色扮演游戏"文件，双击"启动开发服务器.bat" （在一些电脑上是Windows批处理文件）</li>
              <li>点右上角“配置 DeepSeek API”，填写 Key 并测试连接。</li>
              <li>粘贴世界书，或让 AI 补全世界逻辑。世界书默认不规划后续主线、支线或结局，剧情由玩家主导。</li>
              <li>描述你要扮演的角色</li>
              <li>自定义开局，或者直接开始游戏随即开局。</li>
            </ol>
          </section>

          <section className="section important-section">
            <h2><strong>重要事项</strong></h2>
            <ul>
              <li><strong>0. 禁止商用！分享这代码只是我学习网页开发途中的正常学术交流！</strong></li>
              <li><strong>1. 模型调用费用由 DeepSeek 按其规则收取，与本项目作者无关。请在 DeepSeek 后台查看价格和余额。</strong></li>
              <li><strong>2. 本代码完全开源！在github上可搜！https://github.com/FeiyangPang/AiChat ! 不存在什么病毒木马暴露隐私拿你电脑挖矿（我要是有那水平就好了喵qwq)，你可以随便看我简陋的代码或者把代码丢给ai问这含不含病毒，或者会不会泄露你隐私。</strong></li>
              <li><strong>3. 若有任何bug或者想要优化新增的内容请联系qq 1276025418，备注来意,请勿骚扰</strong></li>
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

          <section className="section">
            <h2>版本更新内容</h2>
            <ul>
              <li><strong>V 1.O</strong> 发布完整的角色扮演游戏，含介绍，辅助编写世界书功能，自定义角色和开局功能，生成长短文选择功能</li>
              <li><strong>V 1.1</strong> 添加ai辅助编写用户扮演的角色功能 / 添加一个毫无意义的开屏动画</li>
              <li><strong>V 1.2</strong> 添加使用stable diffusion api的图片生成功能 （一键生成提示词）</li>
              <li><strong>V 1.3</strong> 增加继续说功能</li>
              <li><strong>V 1.4</strong> 增加对话模式</li>
              <li><strong>V 1.5</strong> 增加撤回功能</li>
              <li><strong>V 1.6</strong> 开发智能体记忆模块 & Token 优化方案</li>
              <li><strong>V 1.7</strong> 增加根据故事生成世界书和开头功能</li>
              <li><strong>V 2.0</strong> 固定 DeepSeek V4.1 Flash；完整后置状态栏；8条近期 / 5组长期 / 核心记忆；角色档案、自动存档与同步撤回</li>
            </ul>
          </section>

          <section className="section">
            <h2>未来版本目标</h2>
            <ul>
              <li>优化长短文控制功能</li>
              <li>优化 DeepSeek 的生成体验</li>
              <li>优化人物一致性与剧情记忆</li>
              <li>改善存档管理</li>
              <li>完善道具与持续效果记录</li>
            </ul>
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
