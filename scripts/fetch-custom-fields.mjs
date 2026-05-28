// Fetch Custom Fields from Optimal Blue API
// Run: node --env-file=.env.local scripts/fetch-custom-fields.mjs
// (Node 20+ — uses native fetch + --env-file flag.)

async function main() {
  console.log('Starting Custom Fields Fetch...\n')

  const tokenUrl = process.env.OB_AAD_TOKEN_URL
  const clientId = process.env.OB_CLIENT_ID
  const clientSecret = process.env.OB_CLIENT_SECRET
  const resource = process.env.OB_AAD_RESOURCE

  if (!tokenUrl || !clientId || !clientSecret || !resource) {
    throw new Error('Missing required auth env vars: OB_AAD_TOKEN_URL, OB_CLIENT_ID, OB_CLIENT_SECRET, OB_AAD_RESOURCE')
  }

  console.log(`Step 1: Authenticating with ${tokenUrl}...`)

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    resource,
  })

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text()
    throw new Error(`Token request failed (${tokenRes.status}): ${errorText}`)
  }

  const { access_token: token } = await tokenRes.json()
  if (!token) throw new Error('No access token received')
  console.log('✓ Authentication successful.\n')

  const baseUrl = process.env.OB_API_BASE_URL?.replace(/\/$/, '')
  const channelId = process.env.OB_BUSINESS_CHANNEL_ID
  if (!baseUrl || !channelId) {
    throw new Error('Missing OB_API_BASE_URL or OB_BUSINESS_CHANNEL_ID')
  }

  const fieldsUrl = `${baseUrl}/support/api/businesschannels/${channelId}/customquestions`
  console.log(`Step 2: GET ${fieldsUrl}\n`)

  const fieldsRes = await fetch(fieldsUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'api-version': '4',
      'Accept': 'application/json',
    },
  })

  if (!fieldsRes.ok) {
    const errorText = await fieldsRes.text()
    throw new Error(`Custom fields request failed (${fieldsRes.status}): ${errorText}`)
  }

  const fieldsData = await fieldsRes.json()

  console.log('='.repeat(80))
  console.log('RAW CUSTOM FIELDS PAYLOAD')
  console.log('='.repeat(80))
  console.log(JSON.stringify(fieldsData, null, 2))
  console.log('='.repeat(80))

  if (Array.isArray(fieldsData) && fieldsData.length > 0) {
    console.log('\nSUMMARY\n' + '-'.repeat(80))
    fieldsData.forEach((field, idx) => {
      console.log(`\n${idx + 1}. ${field.displayName || 'Unknown'}`)
      console.log(`   Input Name : "${field.customFieldInputName}"`)
      console.log(`   Column Name: "${field.columnName}"`)
      console.log(`   Type       : ${field.typeOfField}`)
      if (Array.isArray(field.customListValues) && field.customListValues.length > 0) {
        console.log('   Valid Values:')
        field.customListValues.forEach(v => {
          console.log(`     • "${v.customFieldListDescription}" → customFieldValue = ${JSON.stringify(v.customFieldValue)}`)
        })
      }
    })
  }
}

main().catch(err => {
  console.error('\nError:', err.message)
  process.exit(1)
})
