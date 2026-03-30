// Server-side only — do not import from client components
export interface SharePointFile {
  id: string
  name: string
  size: number
  mimeType: string
  webUrl: string
  createdAt: string
  createdBy: string
}

async function getAccessToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  if (!tenantId) throw new Error('MICROSOFT_TENANT_ID is not set')
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(url, { method: 'POST', body })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Failed to get access token: ${txt}`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('No access_token in response')
  return data.access_token
}

// Cache site ID to avoid redundant calls within a request
let _siteId: string | null = null

async function getSiteId(token: string): Promise<string> {
  if (_siteId) return _siteId
  const siteUrl = process.env.SHAREPOINT_SITE_URL!
  // Extract host and path from the full URL
  // e.g. https://beatricelovingheartinc.sharepoint.com/sites/BeatriceLovingHeart9
  const url = new URL(siteUrl)
  const host = url.hostname
  const sitePath = url.pathname // /sites/BeatriceLovingHeart9

  const apiUrl = `https://graph.microsoft.com/v1.0/sites/${host}:${sitePath}`
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Failed to get site ID: ${txt}`)
  }
  const data = await res.json()
  _siteId = data.id
  return data.id
}

async function getDriveId(token: string, siteId: string): Promise<string> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Failed to get drives: ${await res.text()}`)
  const data = await res.json()
  // Find the "Documents" drive (default document library)
  const drive = data.value?.find(
    (d: any) => d.name === 'Documents' || d.driveType === 'documentLibrary'
  ) ?? data.value?.[0]
  if (!drive) throw new Error('No drive found')
  return drive.id
}

export async function uploadToSharePoint(
  clientId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ webUrl: string; itemId: string }> {
  const token = await getAccessToken()
  const siteId = await getSiteId(token)
  const driveId = await getDriveId(token, siteId)

  // Ensure the folder path exists by uploading directly (Graph creates folders automatically)
  const encodedName = encodeURIComponent(fileName)
  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/Clients/${clientId}/${encodedName}:/content`

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: fileBuffer,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`SharePoint upload failed: ${txt}`)
  }

  const data = await res.json()
  return {
    webUrl: data.webUrl,
    itemId: data.id,
  }
}

export async function listClientFiles(clientId: string): Promise<SharePointFile[]> {
  const token = await getAccessToken()
  const siteId = await getSiteId(token)
  const driveId = await getDriveId(token, siteId)

  const folderPath = `Clients/${clientId}`
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${folderPath}:/children`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 404) return [] // folder doesn't exist yet
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Failed to list files: ${txt}`)
  }

  const data = await res.json()
  return (data.value ?? []).map((item: any): SharePointFile => ({
    id: item.id,
    name: item.name,
    size: item.size ?? 0,
    mimeType: item.file?.mimeType ?? 'application/octet-stream',
    webUrl: item.webUrl,
    createdAt: item.createdDateTime,
    createdBy: item.createdBy?.user?.displayName ?? item.createdBy?.user?.email ?? 'Unknown',
  }))
}

export async function deleteSharePointFile(itemId: string): Promise<void> {
  const token = await getAccessToken()
  const siteId = await getSiteId(token)
  const driveId = await getDriveId(token, siteId)

  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${itemId}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) {
    const txt = await res.text()
    throw new Error(`Failed to delete file: ${txt}`)
  }
}

export async function getDownloadUrl(itemId: string): Promise<string> {
  const token = await getAccessToken()
  const siteId = await getSiteId(token)
  const driveId = await getDriveId(token, siteId)

  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${itemId}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Failed to get download URL: ${txt}`)
  }
  const data = await res.json()
  // @microsoft.graph.downloadUrl is a pre-authenticated short-lived URL
  const downloadUrl = data['@microsoft.graph.downloadUrl']
  if (!downloadUrl) throw new Error('No download URL available')
  return downloadUrl
}
