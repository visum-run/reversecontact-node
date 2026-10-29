import ReverseContact, { JobFailedError } from '../src'

const client = new ReverseContact({ apiKey: process.env.RC_API_KEY })
const job = await client.contact.findEmail({ fullName: 'Jane Doe', companyDomain: 'example.com' })
console.log('Save this job id before waiting:', job.id)
try {
  const result = await job.wait()
  for (const email of result.data.result ?? []) console.log(email.value, email.type)
} catch (error) {
  if (error instanceof JobFailedError && error.notFound) console.log('No email found.')
  else throw error
}
