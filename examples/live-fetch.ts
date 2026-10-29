import ReverseContact from '../src'

const client = new ReverseContact({ apiKey: process.env.RC_API_KEY })
const params = { url: 'https://social.com/in/janedoe' }
const cached = await client.fetch.person(params)
if (cached) {
  console.log(cached.data)
} else {
  const job = await client.fetch.personLive(params)
  console.log('Save this job id before waiting:', job.id)
  const result = await job.wait({ timeout: 30 * 60 * 1000 })
  console.log(result.data.result)
}
