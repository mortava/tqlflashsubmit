import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEncompassToken } from './_lib/encompass-token.js'

const API_BASE = process.env.ENCOMPASS_API_BASE_URL || process.env.API_BASE_URL || 'https://api.elliemae.com'

interface UploadUrlResponse {
  uploadUrl: string
  authorizationHeader: string
  mediaUrl: string
}

async function getUploadUrl(
  token: string,
  loanId: string,
  fileName: string,
  fileSize: number
): Promise<UploadUrlResponse> {
  const res = await fetch(
    `${API_BASE}/encompass/v3/loans/${loanId}/attachmentUploadUrl`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: { name: fileName, size: fileSize, contentType: 'application/pdf' },
        title: fileName,
      }),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to get upload URL (${res.status}): ${errText}`)
  }

  return await res.json() as UploadUrlResponse
}

async function uploadFileToPresignedUrl(
  uploadUrl: string,
  authHeader: string,
  fileBuffer: Uint8Array,
  contentType: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader,
      'Content-Type': contentType,
    },
    body: fileBuffer as unknown as BodyInit,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`File upload failed (${res.status}): ${errText}`)
  }
}

async function createEfolderDocument(
  token: string,
  loanId: string,
  title: string,
  docType: string
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/encompass/v1/loans/${loanId}/documents`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        title,
        description: `Uploaded via TQL Flash Submit`,
        applicationName: 'TQLFlashSubmit',
        eFolderDocument: docType || 'Other',
      }]),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`eFolder document creation failed (${res.status}): ${errText}`)
  }

  const docs = await res.json() as Array<{ id: string }>
  return docs[0]?.id || ''
}

async function assignAttachmentToDocument(
  token: string,
  loanId: string,
  documentId: string,
  mediaUrl: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/encompass/v3/loans/${loanId}/documents/${documentId}/attachments`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        entityId: mediaUrl,
        entityType: 'attachment',
      }]),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Attachment assignment failed (${res.status}): ${errText}`)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { loanId, fileName, fileBase64, contentType, docType } = req.body as {
      loanId?: string
      fileName?: string
      fileBase64?: string
      contentType?: string
      docType?: string
    }

    if (!loanId || !fileName || !fileBase64) {
      return res.status(400).json({
        success: false,
        error: 'loanId, fileName, and fileBase64 are required',
      })
    }

    // Validate file size (Vercel has 4.5MB body limit; base64 adds ~33% overhead)
    const approxSizeBytes = Math.ceil(fileBase64.length * 0.75)
    if (approxSizeBytes > 3 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: `File too large (${(approxSizeBytes / 1024 / 1024).toFixed(1)}MB). Maximum 3MB per upload. Please upload larger files directly in Encompass.`,
      })
    }

    const fileBuffer = new Uint8Array(Buffer.from(fileBase64, 'base64'))
    const mimeType = contentType || 'application/pdf'

    const token = await getEncompassToken()

    // Step 1: Get pre-signed upload URL
    const { uploadUrl, authorizationHeader, mediaUrl } = await getUploadUrl(
      token, loanId, fileName, fileBuffer.length
    )

    // Step 2: Upload file to pre-signed URL
    await uploadFileToPresignedUrl(uploadUrl, authorizationHeader, fileBuffer, mimeType)

    // Step 3: Create eFolder document container
    const documentId = await createEfolderDocument(token, loanId, fileName, docType || 'Other')

    // Step 4: Assign the uploaded attachment to the document
    if (documentId) {
      await assignAttachmentToDocument(token, loanId, documentId, mediaUrl)
    }

    return res.status(200).json({
      success: true,
      documentId,
      message: `"${fileName}" uploaded and attached to loan ${loanId}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Document upload failed'
    return res.status(500).json({ success: false, error: message })
  }
}
