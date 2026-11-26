import { t, applyLanguage, setLanguage, getLanguage } from './i18n.js'
import './style.css'
import {
  createPublicClient, createWalletClient, custom, formatEther, getAddress, http,
  isAddress, parseAbi, parseEther, zeroAddress,
} from 'viem'
import { bscTestnet } from 'viem/chains'
import config from './config.json'
import { demoProjects } from './projects.js'

const chain = bscTestnet
const portal = '0x000042108465206185A077Edc3F3fd2b49060000'
const scan = 'https://testnet.bscscan.com'
const client = createPublicClient({ chain, transport: http('https://bsc-testnet.publicnode.com') })
const abis = {
  portal: parseAbi([
    'function getLauncher(address) view returns (address launcherFactory)',
    'function getLaunchVault(address) view returns (address vault, address vaultFactory)',
  ]),
  launcher: parseAbi([
    'function launched() view returns (bool)', 'function raised() view returns (uint256)',
    'function targetRaise() view returns (uint256)', 'function saleDeadline() view returns (uint256)',
    'function token() view returns (address)', 'function vault() view returns (address)',
    'function name() view returns (string)', 'function symbol() view returns (string)',
    'function contributions(address) view returns (uint256)', 'function claimed(address) view returns (uint256)',
    'function contribute() payable', 'function claim()', 'function refund()',
  ]),
  vault: parseAbi([
    'function launcher() view returns (address)', 'function round() view returns (uint256)',
    'function deadline() view returns (uint256)', 'function prize() view returns (uint256)',
    'function nextPrize() view returns (uint256)', 'function leaderboard() view returns (address[5])',
    'function claimable(address) view returns (uint256)', 'function router() view returns (address)',
    'function wrappedNative() view returns (address)', 'function settle()',
    'function claimReward(address)', 'function buyAndEnter(uint256,uint256) payable',
  ]),
  token: parseAbi(['function taxProcessor() view returns (address)']),
  processor: parseAbi(['function dispatch()']),
  router: parseAbi(['function getAmountsOut(uint256,address[]) view returns (uint256[])']),
}

const $ = id => document.getElementById(id)
const actionButtons = [...document.querySelectorAll('[data-action]')]
const button = action => actionButtons.find(element => element.dataset.action === action)
let account
let snapshot
let activeLauncher
let loading = false
let pending = false
let demo = false
const demoBuyer = '0x000000000000000000000000000000000000f010'
let selectedDemo = demoProjects[0].id
const demoStates = new Map()
const liveProjects = new Map()
const storageKey = 'fomo-launch-projects'
let savedLaunchers = []
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
  if (Array.isArray(saved)) savedLaunchers = saved.filter(address => typeof address === 'string' && isAddress(address))
} catch { /* The directory can run without local storage. */ }
const knownLaunchers = [...new Set([config.launcher, ...(config.launchers ?? []), ...savedLaunchers]
  .filter(address => address && isAddress(address)).map(getAddress))]
let catalogRequest = 0

function demoClock() {
  return BigInt(Math.floor(performance.now() / 1000))
}

function createDemoState(project, index) {
  const board = Array.from({ length: 5 }, (_, i) => project.seconds === null ? zeroAddress
    : '0x' + (0x10000 * (index + 1) + 0xa921 + i * 7013).toString(16).padStart(40, '0'))
  return { ...project, launched: true, round: BigInt(project.round), prize: parseEther(project.prize),
    deadline: project.seconds === null ? null : demoClock() + BigInt(project.seconds || -1),
    timeOffset: 0n, board, claimable: 0n }
}

function addProjectText(parent, className, content) {
  const element = document.createElement('span')
  element.className = className
  element.textContent = content
  parent.append(element)
  return element
}

function renderProjects() {
  const container = $('projects')
  const query = $('project-search').value.trim().toLowerCase()
  const projects = [...(demo ? demoStates.values() : liveProjects.values())].filter(project =>
    [project.name, project.symbol, project.address].some(value => value?.toLowerCase().includes(query)))
  const urgency = project => {
    if (!project.launched || project.deadline === null || (!demo && !project.deadline)) return Infinity
    return Number(project.deadline - projectTime(project))
  }
  projects.sort($('project-sort').value === 'prize'
    ? (a, b) => a.prize === b.prize ? 0 : (a.prize ?? 0n) > (b.prize ?? 0n) ? -1 : 1
    : (a, b) => urgency(a) - urgency(b))

  container.replaceChildren()
  for (const project of projects) {
    const card = document.createElement('button')
    const selected = demo ? selectedDemo === project.id : activeLauncher === project.address
    card.type = 'button'
    card.className = 'project-card'
    card.setAttribute('aria-pressed', String(selected))
    const identity = addProjectText(card, 'project-identity', '')
    addProjectText(identity, 'token-icon ' + (project.color || 'acid'), project.icon || '◈')
    const label = addProjectText(identity, 'token-label', '')
    addProjectText(label, 'token-name', project.name)
    addProjectText(label, 'muted', '$' + project.symbol)
    const liveRound = project.launched && (demo ? project.deadline !== null : Boolean(project.deadline))
    const remaining = liveRound ? project.deadline - projectTime(project) : 0n
    const status = !project.launched ? (projectTime(project) >= project.saleDeadline ? t('募资结束') : t('募资中'))
      : !liveRound ? t('等待买入') : remaining <= 0n ? t('待结算') : remaining <= 45n ? t('最后冲刺') : t('竞速中')
    addProjectText(card, 'project-status' + (liveRound && remaining > 0n && remaining <= 45n ? ' urgent' : ''), status)
    const details = addProjectText(card, 'project-details', '')
    const pot = addProjectText(details, 'project-metric', '')
    addProjectText(pot, 'muted', project.launched ? t('税收奖池') : t('已募资金'))
    addProjectText(pot, 'metric-value', bnb(project.launched ? project.prize : project.raised))
    const clock = addProjectText(details, 'project-metric', '')
    addProjectText(clock, 'muted', project.launched ? t('第 {round} 轮', { round: project.round }) : t('募资目标'))
    addProjectText(clock, 'metric-value project-time', project.launched ? (liveRound ? clockText(remaining) : '03:00') : bnb(project.target))
    card.addEventListener('click', () => {
      if (pending) return
      if (demo) {
        selectedDemo = project.id
        snapshot = project
        $('amount').value = '0.11'
        message('')
        render()
      } else setLauncher(project.address)
      document.getElementById('arena').scrollIntoView({ behavior: 'smooth' })
    })
    container.append(card)
  }
  if (!projects.length) addProjectText(container, 'empty-projects', query ? t('没有匹配的项目。') : t('输入 Launcher 地址，将测试网发射项目加入广场。'))
}

function clockText(seconds) {
  const safe = seconds > 0n ? seconds : 0n
  return String(safe / 60n).padStart(2, '0') + ':' + String(safe % 60n).padStart(2, '0')
}

function projectTime(project) {
  return demo ? demoClock() + project.timeOffset
    : project.timestamp + BigInt(Math.floor((performance.now() - project.observed) / 1000))
}

function read(kind, address, functionName, args = [], blockNumber) {
  return client.readContract({ address, abi: abis[kind], functionName, args, blockNumber })
}

function readFields(kind, address, fields, blockNumber) {
  return Promise.all(fields.map(name => read(kind, address, name, [], blockNumber)))
}

function short(addr) {
  return addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : t('开放席位')
}

function bnb(amount) {
  if (amount === undefined) return '—'
  const formatted = formatEther(amount)
  if (amount > 0n && amount < 10n ** 12n) return '< 0.000001 tBNB'
  const [whole, fraction = ''] = formatted.split('.')
  const visible = fraction.slice(0, 6).replace(/0+$/, '')
  return whole + (visible ? '.' + visible : '') + ' tBNB'
}

function message(value, error = false) {
  $('message').textContent = value
  $('message').dataset.error = String(error)
}

function time() {
  return snapshot ? projectTime(snapshot) : 0n
}

function render() {
  $('demo-note').textContent = demo ? t('模拟场次 · 无需钱包') : 'BNB SMART CHAIN TESTNET'
  $('demo-toggle').textContent = demo ? t('切换到测试网') : t('体验演示')
  $('connect').textContent = account ? short(account) : t('连接钱包')
  const s = snapshot
  const launched = Boolean(s?.launched)
  $('arena-title').textContent = s ? s.name : t('选择一个发射项目')
  $('arena-mode').textContent = s ? (demo ? t('模拟竞速场') : 'BSC TESTNET') : ''
  $('round-grid').hidden = !s
  const expired = launched && Boolean(s.deadline) && time() >= s.deadline
  const saleEnded = s && !launched && time() >= s.saleDeadline
  const board = s?.board ?? Array(5).fill(null)
  const count = board.filter(addr => addr && addr !== zeroAddress).length
  $('round').textContent = launched ? t('第 {round} 轮', { round: s.round }) : t('当前轮次')
  $('phase').textContent = launched ? (expired ? t('待结算') : s.deadline ? t('倒计时中') : t('等待首次买入'))
    : (s ? (saleEnded ? t('募资已结束') : t('募资中')) : t('等待 Launcher'))
  $('prize').textContent = bnb(s?.prize)
  $('claimable').textContent = (demo || account) ? bnb(s?.claimable) : '—'
  $('count').textContent = count + ' / 5'
  $('board').replaceChildren(...board.map((addr, i) => {
    const row = document.createElement('li')
    const rank = document.createElement('span')
    rank.textContent = String(i + 1).padStart(2, '0')
    row.append(rank)
    if (demo && addr && addr !== zeroAddress) {
      row.append(addr === demoBuyer ? t('你 · 模拟买家') : short(addr))
    } else if (addr && addr !== zeroAddress) {
      const link = document.createElement('a')
      link.href = scan + '/address/' + addr
      link.target = '_blank'
      link.rel = 'noopener'
      link.textContent = short(addr)
      row.append(link)
    } else row.append(short())
    return row
  }))
  $('round-actions').hidden = !launched
  button('settle').disabled = pending || !expired
  button('reward').disabled = pending || Boolean((demo || account) && !s?.claimable)
  $('skip-clock').hidden = !demo
  $('skip-clock').disabled = expired || !s?.deadline
  $('trade').hidden = !s || (!launched && saleEnded)
  $('trade-title').textContent = demo ? t('模拟买入') : launched ? t('买入并参赛') : t('参与发射')
  $('send').textContent = demo ? t('模拟买入') : launched ? t('买入并参赛') : t('参与募资')
  $('send').disabled = pending
  $('slippage-field').hidden = !launched || demo
  $('explorer').hidden = !s || demo
  if (s && !demo) $('explorer').href = scan + '/address/' + (s.vault || s.address)
  $('trade-info').textContent = demo ? t('试试买入 0.11 tBNB，再快进到期、结算并领取模拟奖励。') : launched
    ? t('{name} · 只有通过此入口、单笔超过 0.1 tBNB 的成功买入计入榜单。', { name: s.name }) +
      (s.nextPrize ? t(' 下一轮已入账 {amount}。', { amount: bnb(s.nextPrize) }) : '')
    : s ? t('{name} · 已募 {raised} / {target}。达标后发币，截止未达标可退款。', { name: s.name, raised: bnb(s.raised), target: bnb(s.target) })
    : t('输入已登记的 FOMO Launcher 地址查看募资与比赛状态。')
  button('tokens').hidden = demo || !launched || !account || !s.contribution || Boolean(s.claimed)
  button('refund').hidden = !s || launched || !saleEnded || !account || !s.contribution
  button('dispatch').hidden = !launched || demo
  actionButtons.filter(el => !['reward', 'settle'].includes(el.dataset.action)).forEach(el => { el.disabled = pending })
  $('trade-panel').hidden = !s
  renderProjects()
  tick()
}

function tick() {
  const s = snapshot
  const deadline = s?.deadline || (!s?.launched && s?.saleDeadline)
  const remaining = deadline && deadline > time() ? deadline - time() : 0n
  const minutes = String(remaining / 60n).padStart(2, '0')
  const seconds = String(remaining % 60n).padStart(2, '0')
  $('timer').textContent = deadline ? minutes + ':' + seconds : s?.launched ? '03:00' : '--:--'
  $('timer').classList.toggle('urgent-clock', Boolean(s?.launched && remaining > 0n && remaining <= 45n))
  $('progress').value = s?.launched && remaining <= 180n ? Number(remaining) : 0
  if (s?.launched && remaining > 0n && remaining <= 45n) $('phase').textContent = t('最后冲刺')
  if (s?.launched && s.deadline && remaining === 0n) {
    $('phase').textContent = t('待结算')
    button('settle').disabled = pending
    if (demo) $('skip-clock').disabled = true
  }
}

async function loadProject(address, detail = false, walletAddress) {
  const { number, timestamp } = await client.getBlock()
  const observed = performance.now()
  const factory = await read('portal', portal, 'getLauncher', [address], number)
  if (factory === zeroAddress || (config.expectedFactory && getAddress(config.expectedFactory) !== getAddress(factory))) {
    throw new Error(t('该地址不是已登记的 FOMO Launcher。'))
  }
  const [name, symbol, launched, raised, target, saleDeadline, token, vault] = await readFields(
    'launcher', address, ['name', 'symbol', 'launched', 'raised', 'targetRaise', 'saleDeadline', 'token', 'vault'], number,
  )
  const project = { address, name, symbol, launched, raised, target, saleDeadline, token, timestamp, observed }
  if (walletAddress) {
    ;[project.contribution, project.claimed] = await Promise.all([
      read('launcher', address, 'contributions', [walletAddress], number),
      read('launcher', address, 'claimed', [walletAddress], number),
    ])
  }
  if (launched) {
    const [[registeredVault], paired] = await Promise.all([
      read('portal', portal, 'getLaunchVault', [token], number), read('vault', vault, 'launcher', [], number),
    ])
    if (getAddress(registeredVault) !== getAddress(vault) || getAddress(paired) !== address) {
      throw new Error(t('Launcher 与税收 Vault 的登记信息不匹配。'))
    }
    project.vault = vault
    ;[project.round, project.deadline, project.prize] = await readFields('vault', vault, ['round', 'deadline', 'prize'], number)
    if (detail) {
      ;[project.nextPrize, project.board] = await readFields('vault', vault, ['nextPrize', 'leaderboard'], number)
      if (walletAddress) project.claimable = await read('vault', vault, 'claimable', [walletAddress], number)
    }
  }
  return project
}

async function refresh() {
  if (demo || !activeLauncher || loading) return
  loading = true
  const address = activeLauncher
  const walletAddress = account
  try {
    const next = await loadProject(address, true, walletAddress)
    if (!demo && activeLauncher === address && account === walletAddress) {
      const switched = snapshot?.address !== address || snapshot?.launched !== next.launched
      snapshot = next
      liveProjects.set(address, next)
      if (!knownLaunchers.includes(address)) {
        knownLaunchers.push(address)
        try { localStorage.setItem(storageKey, JSON.stringify(knownLaunchers)) } catch { /* Optional persistence. */ }
      }
      $('load-message').textContent = ''
      if (switched) $('amount').value = next.launched ? '0.11' : ''
      render()
    }
  } catch (error) {
    if (!demo && activeLauncher === address) {
      snapshot = undefined
      render()
      $('load-message').textContent = error.shortMessage || error.message
      message(error.shortMessage || error.message, true)
    }
  } finally {
    loading = false
    if (activeLauncher !== address || account !== walletAddress) void refresh()
  }
}

function setLauncher(address) {
  if (!isAddress(address)) {
    $('load-message').textContent = t('请输入有效的 Launcher 地址。')
    return
  }
  activeLauncher = getAddress(address)
  if (demo) setDemo(false)
  snapshot = undefined
  const url = new URL(location.href)
  url.searchParams.set('launcher', activeLauncher)
  history.replaceState(null, '', url)
  message('')
  render()
  void refresh()
}

async function connect() {
  if (!window.ethereum) throw new Error(t('请先安装支持 BSC 测试网的浏览器钱包。'))
  const wallet = createWalletClient({ chain, transport: custom(window.ethereum) })
  const [address] = await wallet.requestAddresses()
  if (!address) throw new Error(t('钱包尚未授权账户。'))
  if (await wallet.getChainId() !== chain.id) {
    try {
      await wallet.switchChain({ id: chain.id })
    } catch (error) {
      if (error.code !== 4902 && error.cause?.code !== 4902) throw error
      await wallet.addChain({ chain })
      await wallet.switchChain({ id: chain.id })
    }
  }
  account = getAddress(address)
  $('connect').textContent = short(account)
  void refresh()
  return wallet
}

async function refreshCatalog() {
  if (demo) return
  const request = ++catalogRequest
  const entries = await Promise.allSettled(knownLaunchers.filter(address => address !== activeLauncher)
    .map(address => loadProject(address)))
  if (demo || request !== catalogRequest) return
  for (const entry of entries) {
    if (entry.status === 'fulfilled' && entry.value && entry.value.address !== activeLauncher) {
      liveProjects.set(entry.value.address, entry.value)
    }
  }
  renderProjects()
}

function setDemo(enabled) {
  demo = enabled
  $('demo-note').textContent = demo ? t('模拟场次 · 无需钱包') : 'BNB SMART CHAIN TESTNET'
  $('demo-note').hidden = false
  $('demo-toggle').textContent = demo ? t('切换到测试网') : t('体验演示')
  $('connect').hidden = demo
  $('load').hidden = demo
  $('tx').hidden = true
  message('')
  if (demo) {
    if (!demoStates.size) demoProjects.forEach((project, index) => demoStates.set(project.id, createDemoState(project, index)))
    snapshot = demoStates.get(selectedDemo)
    $('amount').value = '0.11'
  } else {
    snapshot = undefined
    void refreshCatalog()
    void refresh()
  }
  render()
}

function settleDemo(at) {
  const s = snapshot
  const winners = s.board.filter(address => address !== zeroAddress)
  if (winners.length) {
    const share = s.prize / BigInt(winners.length)
    if (winners.includes(demoBuyer)) s.claimable += share
    s.prize -= share * BigInt(winners.length)
  }
  s.round += 1n
  s.deadline = winners.length ? at + 180n : null
  s.board = Array(5).fill(zeroAddress)
}

function playDemo(action) {
  const s = snapshot
  const at = time()
  const expired = s.deadline !== null && at >= s.deadline
  if (action === 'submit') {
    const amount = $('amount').value.trim()
    if (!/^\d+(\.\d{1,18})?$/.test(amount) || parseEther(amount) <= parseEther('0.1')) {
      message(t('参赛买入必须严格超过 0.1 tBNB。'), true)
      return
    }
    if (expired) settleDemo(at)
    s.board = [demoBuyer, ...s.board.filter(address => address !== demoBuyer)].slice(0, 5)
    // The demo credits half of a 3% buy tax immediately.
    s.prize += parseEther(amount) * 15n / 1000n
    s.deadline = at + 180n
    message(t('模拟买入成功，你已上榜，倒计时重置为 3:00。'))
  } else if (action === 'settle' && expired) {
    settleDemo(at)
    message(t('模拟结算完成，已进入下一轮。'))
  } else if (action === 'reward' && s.claimable) {
    message(t('已领取 {amount} 模拟奖励。', { amount: bnb(s.claimable) }))
    s.claimable = 0n
  }
  render()
}

async function transact(action) {
  if (pending || !snapshot) return
  if (demo) return playDemo(action)
  const s = snapshot
  pending = true
  render()
  $('tx').hidden = true
  try {
    const wallet = await connect()
    if (s.address !== activeLauncher) throw new Error(t('Launcher 已切换，请重新确认交易。'))
    let kind = 'vault'
    let address = s.vault
    let functionName = action
    let args = []
    let value
    if (action === 'submit') {
      value = parseEther($('amount').value.trim())
      if (value <= 0n) throw new Error(t('金额必须大于 0。'))
      if (s.launched) {
        if (value <= parseEther('0.1')) throw new Error(t('参赛买入必须严格超过 0.1 tBNB。'))
        const slippage = Number($('slippage').value)
        if (!Number.isFinite(slippage) || slippage < 0.1 || slippage > 20) throw new Error(t('滑点必须在 0.1%–20% 之间。'))
        const [router, wrapped] = await readFields('vault', s.vault, ['router', 'wrappedNative'])
        const [, quote] = await read('router', router, 'getAmountsOut', [value, [wrapped, s.token]])
        // The FOMO Launcher configures 3% buy tax. Quote is the router's pre-tax output.
        const minOut = quote * 9700n * BigInt(10000 - Math.round(slippage * 100)) / 100000000n
        if (!minOut) throw new Error(t('报价过低，请重新输入金额。'))
        const latest = await client.getBlock()
        args = [minOut, latest.timestamp + 120n]
        functionName = 'buyAndEnter'
      } else {
        if (value > s.target - s.raised) throw new Error(t('金额超过剩余募资额度。'))
        kind = 'launcher'
        address = s.address
        functionName = 'contribute'
      }
    } else if (action === 'tokens' || action === 'refund') {
      kind = 'launcher'
      address = s.address
      functionName = action === 'tokens' ? 'claim' : 'refund'
    } else if (action === 'reward') {
      functionName = 'claimReward'
      args = [account]
    } else if (action === 'dispatch') {
      kind = 'processor'
      address = await read('token', s.token, 'taxProcessor')
    }
    message(t('请在钱包确认交易。'))
    const { request } = await client.simulateContract({ account, address, abi: abis[kind], functionName, args, value })
    const hash = await wallet.writeContract(request)
    $('tx').href = scan + '/tx/' + hash
    $('tx').hidden = false
    message(t('交易已提交，等待测试网确认。'))
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(t('交易在链上回滚。'))
    message(t('交易已确认。'))
    await refresh()
  } catch (error) {
    message(error.shortMessage || error.message, true)
  } finally {
    pending = false
    render()
  }
}

applyLanguage()
$('language').value = getLanguage()
$('language').addEventListener('change', event => {
  const status = $('message').textContent
  const loadStatus = $('load-message').textContent
  setLanguage(event.target.value)
  applyLanguage()
  $('message').textContent = t(status)
  $('load-message').textContent = t(loadStatus)
  render()
})

$('demo-toggle').addEventListener('click', () => { if (!pending) setDemo(!demo) })
$('skip-clock').addEventListener('click', () => {
  if (!demo || !snapshot?.deadline) return
  snapshot.timeOffset += snapshot.deadline - time()
  render()
})
$('load').addEventListener('submit', event => { event.preventDefault(); setLauncher($('launcher').value.trim()) })
$('trade').addEventListener('submit', event => { event.preventDefault(); void transact('submit') })
$('connect').addEventListener('click', () => connect().catch(error => message(error.shortMessage || error.message, true)))
actionButtons.forEach(element => element.addEventListener('click', () => void transact(element.dataset.action)))
window.ethereum?.on?.('accountsChanged', ([address]) => {
  account = address ? getAddress(address) : undefined
  $('connect').textContent = account ? short(account) : t('连接钱包')
  void refresh()
})
$('project-search').addEventListener('input', renderProjects)
$('project-sort').addEventListener('change', renderProjects)
setInterval(tick, 250)
setInterval(() => {
  if (document.activeElement?.classList.contains('project-card')) return
  renderProjects()
}, 1000)
setInterval(() => void refreshCatalog(), 15000)
setInterval(() => void refresh(), 5000)
render()
const initialLauncher = new URLSearchParams(location.search).get('launcher') || config.launcher
if (initialLauncher) {
  $('launcher').value = initialLauncher
  setDemo(false)
  setLauncher(initialLauncher)
}
else setDemo(true)
