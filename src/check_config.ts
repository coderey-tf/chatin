import { getBotConfig } from './lib/db'

async function run() {
  const cfg = await getBotConfig('cus_BR11YSEDFGY34Z7T2J91MPJBAM')
  console.log('Bot Config for Flowku:', JSON.stringify(cfg, null, 2))
}

run()
