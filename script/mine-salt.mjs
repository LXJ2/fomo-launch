import { randomBytes } from 'node:crypto'
import { concatHex, getCreate2Address, isAddress, keccak256, toHex } from 'viem'

const portal = '0x000042108465206185A077Edc3F3fd2b49060000'
const implementation = process.argv[2] ?? '0x7777c57ff7dc441c1715b2e36fa581c48B782222'
if (!isAddress(implementation)) throw new Error('Expected a valid Pool Launch token implementation address.')

const bytecodeHash = keccak256(concatHex([
  '0x3d602d80600a3d3981f3363d3d373d3d3d363d73',
  implementation,
  '0x5af43d82803e903d91602b57fd5bf3',
]))
const entropy = toHex(randomBytes(24))
for (let index = 0n; ; index++) {
  const salt = concatHex([entropy, toHex(index, { size: 8 })])
  const token = getCreate2Address({ from: portal, salt, bytecodeHash })
  if (token.endsWith('7777')) {
    console.log(JSON.stringify({ salt, token }))
    break
  }
}
