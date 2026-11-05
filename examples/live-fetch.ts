import ReverseContact from '../src'

const client = new ReverseContact({ apiKey: process.env.RC_API_KEY })
const params = { url: 'https://social.com/in/janedoe' }
const cached = await client.fetch.person(params)
if (cached) {
  console.log(cached.data)
} else {
  const task = await client.fetch.personLive(params)
  console.log('Save this task id before waiting:', task.id)
  const result = await task.wait({ timeout: 30 * 60 * 1000 })
  console.log(result.data.result)
}
