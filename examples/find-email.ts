import ReverseContact, { TaskFailedError } from '../src'

const client = new ReverseContact({ apiKey: process.env.RC_API_KEY })
const task = await client.contact.findEmail({ fullName: 'Jane Doe', companyDomain: 'example.com' })
console.log('Save this task id before waiting:', task.id)
try {
  const result = await task.wait()
  for (const email of result.data.result ?? []) console.log(email.value, email.type)
} catch (error) {
  if (error instanceof TaskFailedError && error.notFound) console.log('No email found.')
  else throw error
}
