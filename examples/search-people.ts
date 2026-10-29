import ReverseContact from '../src'

const client = new ReverseContact({ apiKey: process.env.RC_API_KEY })
const filters = { firstName: 'Jane' }
const count = await client.search.countPeople(filters)
console.log('Matches:', count.data.count)
for await (const person of client.search.iterPeople(filters, { maxResults: 10 })) {
  console.log(person.id, person.firstName)
}
