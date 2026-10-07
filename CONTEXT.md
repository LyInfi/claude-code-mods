# Texas Hold'em Mod

一个 Claude Code mod：在终端侧边 Pane 里打单桌无限注德州扑克现金局（9-max、6-max 或单挑），对手是本地 Bot，可以趁 Claude 跑任务的空档玩几手。

## Language

### 宿主

**Session**：
一次 Claude Code 会话。本项目里，"session" 只指这个意思。
_Avoid_: 牌局, 游戏会话

**Table Pane**：
在 Claude Code 里显示牌桌的侧边 Pane，用 `/poker` 打开。
_Avoid_: 窗口, 面板, 游戏界面

**Lobby**：
Player 没坐在 Table 上时 Table Pane 显示的页面：POKER 标志，以及选择 Table Size 入座的入口。
_Avoid_: 主菜单, 首页, 大厅页

### 牌局

**Table**：
一张无限注德州扑克现金桌，座位数由 Table Size 决定，有固定盲注，只有一位 Player 是真人。
_Avoid_: 房间, 游戏

**Table Size**：
一张 Table 的座位数：9-max、6-max 或 Heads-up（单挑，2 个座位）。Player 在 Lobby 里选择。
_Avoid_: 桌型, 人数, 模式

**Format**：
牌局的赛制：Cash Game（现金局）或 Tournament（锦标赛，如 MTT）。目前只有 Cash Game；Table Size 只是 Cash Game 的一个维度。
_Avoid_: 模式, 玩法

**Seat**：
Table 上的一个位置，个数由 Table Size 决定，坐着 Player 或 Bot，也可以空着。

**Player**：
在终端前操作的真人。
_Avoid_: 用户, Hero（Hero 只在牌局复盘的语境里使用）

**Bot**：
坐在 Seat 上、由程序决策的对手。
_Avoid_: AI, NPC, 电脑

**Bot Style**：
Bot 的隐藏打法倾向，取值为 TAG、LAG、Calling Station、Nit 之一。Player 看不到，只能从 Bot 的行为里推断。同一种 Bot Style 在不同 Table Size 下有不同的 VPIP / PFR 目标（人越少打得越松）。
_Avoid_: 难度, 性格

**Bot Policy**：
决定 Bot 做什么 Action 的策略。它只能看到自己的底牌、公共牌和下注过程，看不到其他人的底牌。按风格打的规则策略是其中一种，以后的 GTO 策略或由 Claude 决策也会作为 Bot Policy 接入。
_Avoid_: AI, 大脑

**VPIP / PFR**：
衡量打法松紧和凶弱的两个比例：VPIP 是翻前主动把筹码投入底池的手数占比，PFR 是翻前加注的手数占比。每种 Bot Style 都以一组 VPIP / PFR 为目标。
_Avoid_: 入池率（可作中文说明，代码和讨论统一用 VPIP）

**Equity**：
一手牌在当前局面下能分到的底池份额期望，通过随机发完剩余的牌估算得出。
_Avoid_: 胜率（平分底池时两者不同）

**Action**：
轮到某个 Seat 时做出的一次决定：Fold、Check、Call、Bet、Raise 或 All-in。
_Avoid_: 操作, 动作

**Stake**：
Table 的盲注级别，目前只有 5/10 一档。
_Avoid_: 级别, 场次

**Sitting**：
Player 从坐上 Table 到离开 Table 的这段时间，期间会打很多 Hand。
_Avoid_: Session（已被宿主占用）, 牌局

**Hand**：
从发底牌到分完底池的一整局牌。
_Avoid_: 局, 回合, Round

**Street**：
一个 Hand 里的四个下注阶段之一：Preflop、Flop、Turn、River。
_Avoid_: Round, 阶段

**Pot**：
一个 Hand 里所有下注汇成的筹码。下注额不同的人全下时，会拆分为 Main Pot 和若干个 Side Pot。

**Showdown**：
River 下注结束后仍有两个以上 Seat 未弃牌时比牌的阶段。到达 Showdown 的所有底牌都会亮出。
_Avoid_: 开牌, 摊牌阶段

**Side Pot**：
只有投入额达到某个全下额的 Player 或 Bot 才有资格赢的那部分 Pot。

### 筹码

**Bankroll**：
Player 在所有 Session 中累计持有、但不在桌上的筹码。
_Avoid_: 余额, 钱包

**Stack**：
某个 Seat 当前摆在 Table 上的筹码。买入时从 Bankroll 转入，离开 Table 时转回 Bankroll。
_Avoid_: 筹码量, Chips

**Buy-in**：
坐上 Table 时，从 Bankroll 转入 Stack 的筹码，固定为 100BB。

**Rebuy**：
两手牌之间，在 Stack 低于 Buy-in 时，从 Bankroll 补到 Buy-in 金额。
_Avoid_: 补码, 加码

**Top-up**：
Bankroll 破产后，Player 手动领取的一笔补充筹码。
_Avoid_: 补码, 重置, Rebuy（Rebuy 指从 Bankroll 再次买入 Stack）

### 引擎

**Engine**：
不依赖任何 UI 的德州扑克规则核心：输入当前状态和一个 Action，返回新状态。它是规则的唯一权威来源。
_Avoid_: 游戏逻辑, Dealer（Dealer 指按钮位）

### 显示

**Card Style**：
牌面的渲染方式：Compact（`A♠` 加红黑配色）或 Boxed（ASCII 小方框）。
