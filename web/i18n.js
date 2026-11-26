const english = {
  "主导航": "Main navigation",
  "发射广场": "Launchpad",
  "竞速场": "Arena",
  "体验演示": "Try demo",
  "连接钱包": "Connect wallet",
  "模拟场次 · 无需钱包": "Demo mode · No wallet needed",
  "FOMO 发射广场": "FOMO Launchpad",
  "选一个项目，抢最后五席。每笔超过 0.1 tBNB 的合格买入，都会重启该项目的三分钟倒计时。": "Pick a project and compete for the last five spots. Every qualifying buy over 0.1 tBNB resets its three-minute countdown.",
  "每笔买入重置": "Resets on each buy",
  "最后买家席位": "Last buyer spots",
  "交易税进奖池": "Trading tax to prizes",
  "发射项目": "Launch projects",
  "搜索项目": "Search projects",
  "搜索项目或代号": "Search projects or symbols",
  "排序方式": "Sort by",
  "倒计时最短": "Ending soonest",
  "奖池最高": "Largest prize",
  "添加 BSC Testnet Launcher": "Add a BSC Testnet Launcher",
  "添加 / 打开": "Add / Open",
  "选择一个发射项目": "Select a launch project",
  "返回项目列表": "Back to projects",
  "当前轮次": "Current round",
  "等待 Launcher": "Waiting for a Launcher",
  "倒计时剩余时间": "Time remaining",
  "本轮奖池": "Round prize pool",
  "可领奖励": "Claimable rewards",
  "快进到期": "Skip to expiry",
  "结算到期轮次": "Settle round",
  "领取奖励": "Claim rewards",
  "最近买入": "Latest buyers",
  "参与发射": "Join launch",
  "查看合约": "View contract",
  "输入已登记的 FOMO Launcher 地址查看募资与比赛状态。": "Enter a registered FOMO Launcher address to view fundraising and arena status.",
  "金额（tBNB）": "Amount (tBNB)",
  "参与募资": "Contribute",
  "滑点容差（%）": "Slippage tolerance (%)",
  "领取募资代币": "Claim launch tokens",
  "退回募资": "Refund contribution",
  "分发待处理税收": "Dispatch pending tax",
  "查看交易": "View transaction",
  "交易税的 50% 进入奖池，其余 50% 用于流动性。奖池按 Vault 实际到账时间入账。": "50% of trading tax funds prizes and 50% goes to liquidity. Prizes are credited when BNB reaches the Vault.",
  "募资结束": "Fundraising ended",
  "募资中": "Fundraising open",
  "等待买入": "Waiting for a buy",
  "待结算": "Ready to settle",
  "最后冲刺": "Final countdown",
  "竞速中": "Round live",
  "税收奖池": "Tax-funded prize",
  "已募资金": "Funds raised",
  "募资目标": "Funding target",
  "没有匹配的项目。": "No matching projects.",
  "输入 Launcher 地址，将测试网发射项目加入广场。": "Enter a Launcher address to add a testnet launch to the directory.",
  "开放席位": "Open spot",
  "模拟竞速场": "Demo arena",
  "倒计时中": "Countdown live",
  "等待首次买入": "Waiting for the first buy",
  "募资已结束": "Fundraising ended",
  "你 · 模拟买家": "You · Demo buyer",
  "模拟买入": "Demo buy",
  "买入并参赛": "Buy & enter",
  "试试买入 0.11 tBNB，再快进到期、结算并领取模拟奖励。": "Try buying 0.11 tBNB, then skip to expiry, settle the round and claim your demo rewards.",
  "该地址不是已登记的 FOMO Launcher。": "This address is not a registered FOMO Launcher.",
  "Launcher 与税收 Vault 的登记信息不匹配。": "The Launcher and tax Vault registrations do not match.",
  "请输入有效的 Launcher 地址。": "Enter a valid Launcher address.",
  "请先安装支持 BSC 测试网的浏览器钱包。": "Install a browser wallet that supports BSC Testnet first.",
  "钱包尚未授权账户。": "No wallet account has been authorized.",
  "切换到测试网": "Switch to testnet",
  "参赛买入必须严格超过 0.1 tBNB。": "A qualifying buy must be strictly greater than 0.1 tBNB.",
  "模拟买入成功，你已上榜，倒计时重置为 3:00。": "Demo buy complete. You are on the leaderboard and the countdown has reset to 3:00.",
  "模拟结算完成，已进入下一轮。": "Demo settlement complete. The next round has started.",
  "Launcher 已切换，请重新确认交易。": "The Launcher has changed. Review your transaction again.",
  "金额必须大于 0。": "The amount must be greater than zero.",
  "滑点必须在 0.1%–20% 之间。": "Slippage must be between 0.1% and 20%.",
  "报价过低，请重新输入金额。": "The quoted output is too low. Enter another amount.",
  "金额超过剩余募资额度。": "The amount exceeds the remaining funding target.",
  "请在钱包确认交易。": "Confirm the transaction in your wallet.",
  "交易已提交，等待测试网确认。": "Transaction submitted. Waiting for testnet confirmation.",
  "交易在链上回滚。": "The transaction reverted on-chain.",
  "交易已确认。": "Transaction confirmed.",
  "BSC Testnet 上的三分钟交易税奖池": "Three-minute tax-funded prize rounds on BSC Testnet",
  "第 {round} 轮": "Round {round}",
  "{name} · 只有通过此入口、单笔超过 0.1 tBNB 的成功买入计入榜单。": "{name} · Only successful buys over 0.1 tBNB through this entry count toward the leaderboard.",
  " 下一轮已入账 {amount}。": " Next round funded: {amount}.",
  "{name} · 已募 {raised} / {target}。达标后发币，截止未达标可退款。": "{name} · Raised {raised} / {target}. The token launches at the target. Refunds open if the deadline passes below target.",
  "已领取 {amount} 模拟奖励。": "Claimed {amount} in demo rewards.",
  "语言": "Language"
}

let language = navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
try {
  const saved = localStorage.getItem('fomo-launch-language')
  if (saved === 'zh' || saved === 'en') language = saved
} catch { /* Language switching also works without storage. */ }
const renderedMessages = new Map()

export function getLanguage() { return language }

export function setLanguage(value) {
  if (value !== 'zh' && value !== 'en') return
  language = value
  try { localStorage.setItem('fomo-launch-language', language) } catch { /* Optional persistence. */ }
}

export function t(key, values = {}) {
  const previous = renderedMessages.get(key)
  if (previous) return previous[language]
  if (!Object.hasOwn(english, key)) return key
  const fill = text => text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`))
  const versions = { zh: fill(key), en: fill(english[key]) }
  // Do not cache unfilled templates: their values differ between projects and rounds.
  if (Object.keys(values).length || !key.includes('{')) {
    renderedMessages.set(versions.zh, versions)
    renderedMessages.set(versions.en, versions)
  }
  return versions[language]
}

export function applyLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n)
  })
  for (const attribute of ['placeholder', 'aria-label', 'content']) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)))
    })
  }
}
