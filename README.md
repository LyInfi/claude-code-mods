# Claude Code Mods

Mods for [Claude Code](https://claude.com/claude-code): things that live inside the TUI, written as function-hook plugins.

[中文说明](#中文)

| Mod | What it is |
| --- | --- |
| [`poker`](mods/poker) | No-Limit Texas Hold'em against styled bots at a 9-max, 6-max or heads-up table, in a pane beside your session. |

## Install

Inside Claude Code:

```
/plugin marketplace add LyInfi/claude-code-mods
/plugin install poker@lyinfi-mods
```

Then type `/poker`.

> **Compatibility.** These mods use Claude Code's function-hooks plugin API, which is in early access and may change between releases. Use a recent Claude Code; if a mod stops loading after an update, please open an issue.

## poker

A No-Limit Hold'em cash game at 5/10, drawn in box characters: each seat in its own ring, bets and the dealer button on the felt, the board in the middle. Pick a 9-max, 6-max or heads-up table from the lobby.

- **Bots with styles.** Every other seat holds a bot with a hidden style: tight-aggressive, loose-aggressive, calling station or nit. Preflop they play ranges sized to the style's VPIP/PFR, looser the fewer the seats; after the flop they weigh Monte Carlo equity against the pot odds. Busted bots leave and fresh ones sit down.
- **Full rules.** Side pots, short all-ins that don't reopen the betting, split pots with the odd chip, heads-up blinds.
- **Plays around your work.** Claude asking for permission or a question pauses the dealing and shows an alert; finishing a turn shows a short note.
- **Bankroll that persists.** 10,000 to start, 1,000 buy-ins, stats across sessions, `/poker topup` when you're broke.
- **Chinese and English**, compact (`A♠`) or boxed card faces, a scrollable action log.

### Keys (while the pane has focus)

| Key | Action |
| --- | --- |
| `9` / `6` / `2` | sit down at a 9-max / 6-max / heads-up table (in the lobby) |
| `f` / `c` / `r` / `a` | fold / check or call / min raise / all in |
| `1`–`4` | raise 2.5x / ½ pot / pot / all in; or type an amount and press Enter |
| `n` | deal the next hand now (it deals itself after 3 seconds) |
| `b` / `q` | rebuy / leave the table |
| `k` / `j` | scroll the action log up / down (the mouse wheel works too) |
| `l` / `v` | switch language / card style |
| `Esc` | back to the prompt |

Commands: `/poker`, `/poker stats`, `/poker lang`, `/poker cards`, `/poker topup`.

## Develop

```
claude --plugin-dir mods/poker      # load the working copy
claude plugin validate mods/poker   # what the engine would refuse
claude plugin test mods/poker       # the test suite
```

The rules engine (`mods/poker/engine`) is plain TypeScript with no UI; bots plug in through one `BotPolicy` function (`mods/poker/bots`). Domain terms are in [CONTEXT.md](CONTEXT.md).

## License

[MIT](LICENSE)

---

## 中文

在 Claude Code 终端里运行的 mod 合集，基于 Claude Code 的函数钩子插件接口编写。

### 安装

在 Claude Code 里依次执行：

```
/plugin marketplace add LyInfi/claude-code-mods
/plugin install poker@lyinfi-mods
```

然后输入 `/poker` 打开牌桌。

> **兼容性**：这些 mod 使用的函数钩子接口目前处于早期阶段，不同版本之间可能有变动。请使用较新版本的 Claude Code；如果升级后无法加载，欢迎提 issue。

### poker：德州扑克

无限注现金局，盲注 5/10，牌桌用框线字符绘制。在大厅里可以选择 9 人桌、6 人桌或单挑。

- **分风格的电脑对手**：除你之外的每个座位都是 Bot，各自随机带一种隐藏风格（紧凶、松凶、跟注站、紧弱），需要你从它们的打法里自己读出来。翻牌前按各自风格的 VPIP / PFR 划定起手牌范围，桌上人越少打得越松，翻牌后用蒙特卡洛模拟估算胜率，再和底池赔率比较来决策。输光的 Bot 会离桌，换新对手入座。
- **完整规则**：边池、不足额全下不重开加注、平分底池的零头筹码、单挑时的盲注规则都已实现。
- **不打扰工作**：Claude 请求授权或向你提问时，会暂停发牌并在牌桌上提醒；Claude 完成一轮时也会轻提示。
- **筹码跨会话保存**：初始余额 10,000，每次买入 1,000，战绩跨会话累计；输光后可以用 `/poker topup` 领取筹码。
- **其他**：中英文界面可切换，牌面有紧凑（`A♠`）和方框两种样式，行动记录可以上下滚动。

快捷键见上方英文部分的表格。
