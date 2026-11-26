import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createPublicClient, getAddress, http, isAddress, parseAbi } from 'viem'
import { bscTestnet } from 'viem/chains'

const [factoryInput, templateDirectory] = process.argv.slice(2)
if (!factoryInput || !isAddress(factoryInput) || !templateDirectory) {
  throw new Error('Usage: node script/flap-package.mjs <deployed FOMO Launcher Factory> <Flap UI template checkout>')
}
const factory = getAddress(factoryInput)
const portal = '0x000042108465206185A077Edc3F3fd2b49060000'
const rpcUrl = process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet.publicnode.com'
const client = createPublicClient({ chain: bscTestnet, transport: http(rpcUrl) })
if (await client.getChainId() !== bscTestnet.id) throw new Error('Expected a BSC Testnet RPC endpoint (chain 97).')
const [code, configuredPortal, version] = await Promise.all([
  client.getCode({ address: factory }),
  client.readContract({ address: factory, abi: parseAbi(['function hub() view returns (address)']), functionName: 'hub' }),
  client.readContract({ address: factory, abi: parseAbi(['function factorySpecVersion() view returns (string)']), functionName: 'factorySpecVersion' }),
])
if (!code || getAddress(configuredPortal) !== portal || version !== 'lf-v1') {
  throw new Error('Factory is missing or does not match the testnet Pool Launch Portal.')
}
const [enabled, multiplier] = await client.readContract({
  address: portal,
  abi: parseAbi(['function launcherFactoryMultiplier(address) view returns (bool enabled, uint16 multiplierBps)']),
  functionName: 'launcherFactoryMultiplier',
  args: [factory],
})
console.log('Launcher Factory:', factory, '| Flap enabled:', enabled, '| multiplier:', multiplier)

const source = resolve('flap-ui')
const staging = await mkdtemp(join(tmpdir(), 'fomo-launcher-'))
try {
  const manifest = JSON.parse(await readFile(join(source, 'manifest.template.json'), 'utf8'))
  manifest.factoryAddress = factory
  await Promise.all([
    copyFile(join(source, 'Component.tsx'), join(staging, 'Component.tsx')),
    copyFile(join(source, 'i18n.json'), join(staging, 'i18n.json')),
    writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'),
  ])
  execFileSync(process.execPath, [resolve(templateDirectory, 'scripts/launcher-check-source.mjs'), staging], { stdio: 'inherit' })
  const output = resolve('submission', 'fomo-launcher-ui.zip')
  await mkdir(resolve('submission'), { recursive: true })
  const archive = join(staging, 'fomo-launcher-ui.zip')
  execFileSync('zip', ['-q', archive, 'Component.tsx', 'manifest.json', 'i18n.json'], { cwd: staging, stdio: 'inherit' })
  await copyFile(archive, output)
  console.log('Launcher UI ZIP:', output)
} finally {
  await rm(staging, { recursive: true, force: true })
}
