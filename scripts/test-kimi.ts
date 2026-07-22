import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { generateKimiChat } from '../src/lib/kimi'

async function testKimi() {
  console.log('Testing Kimi API with model:', process.env.KIMI_MODEL || 'kimi-k3')
  try {
    const reply = await generateKimiChat({
      messages: [
        { role: 'system', content: 'You are Kimi AI assistant.' },
        { role: 'user', content: 'Hello! Please introduce yourself in 1 concise sentence.' },
      ],
      model: 'moonshot-v1-8k',
    })

    console.log('\n--- KIMI RESPONSE ---')
    console.log(reply)
    console.log('---------------------\n')
    console.log('SUCCESS: Kimi API is working!')
  } catch (err) {
    console.error('ERROR testing Kimi API:', err)
  }
}

testKimi()
