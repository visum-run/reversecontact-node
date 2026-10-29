import ReverseContact from '../src'

const client = new ReverseContact()
const result = await client.enrich.person({ email: 'jane@example.com' })
if (result === null) {
  console.log('No confident match. This lookup did not consume credits.')
} else {
  console.log(result.data.person, result.data.isFullProfile)
  console.log('Request:', result.metadata?.requestId, 'Credits:', result.quotas?.creditsConsumed)
}
