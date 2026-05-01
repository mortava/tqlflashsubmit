interface TokenCache {
  token: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

export async function getEncompassToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 300_000) {
    return tokenCache.token
  }

  const baseUrl = process.env.ENCOMPASS_API_BASE_URL || process.env.API_BASE_URL || 'https://api.elliemae.com'
  const clientId = process.env.ENCOMPASS_CLIENT_ID || process.env.CLIENT_ID
  const clientSecret = process.env.ENCOMPASS_CLIENT_SECRET || process.env.CLIENT_SECRET
  const instanceId = process.env.ENCOMPASS_INSTANCE_ID || process.env.INSTANCE_ID
  const username = process.env.ENCOMPASS_USERNAME || process.env.USERNAME
  const password = process.env.ENCOMPASS_PASSWORD || process.env.PASSWORD

  if (!clientId || !clientSecret || !instanceId || !username || !password) {
    throw new Error('Missing Encompass API credentials in environment variables')
  }

  const smartClientUser = `${username}@encompass:${instanceId}`

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username: smartClientUser,
    password: password,
  })

  const res = await fetch(`${baseUrl}/oauth2/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Encompass auth failed (${res.status}): ${errText}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return tokenCache.token
}
