import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://vwgvankgqybuqnbbkalk.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1cyVnqoRnnK90rx9NHsf6w_0IFlViCd'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---- Safe upload helpers -------------------------------------------------
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

// returns an error string, or null when the file is OK
export function validateUpload(file, { allowPdf = true, maxBytes = 10 * 1024 * 1024 } = {}) {
  if (!file) return 'err.fileMissing'
  const ext = MIME_TO_EXT[file.type]
  if (!ext || (!allowPdf && ext === 'pdf')) {
    return 'err.fileType'
  }
  if (file.size > maxBytes) {
    return 'err.fileTooLarge'
  }
  return null
}

// random file name; extension comes from the MIME type, never from the user's file name
export function safeFileName(file) {
  return `${crypto.randomUUID()}.${MIME_TO_EXT[file.type] || 'bin'}`
}

// ---- Private file access (signed URLs) -----------------------------------
// Accepts a storage path ("<uid>/abc.png") OR an old public URL saved earlier.
export async function getSignedUrl(bucket, pathOrUrl, expiresIn = 3600) {
  if (!pathOrUrl) return null
  let path = pathOrUrl
  const marker = `/object/public/${bucket}/`
  const i = pathOrUrl.indexOf(marker)
  if (i !== -1) path = decodeURIComponent(pathOrUrl.slice(i + marker.length))
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  return error ? null : data.signedUrl
}

// opens a private file in a new tab (popup-blocker safe)
export async function openPrivateFile(bucket, pathOrUrl, onError = () => alert('Could not open this file.')) {
  const win = window.open('', '_blank')
  const url = await getSignedUrl(bucket, pathOrUrl)
  if (!url) {
    if (win) win.close()
    onError()
    return false
  }
  if (win) {
    win.opener = null
    win.location.href = url
  } else {
    window.open(url, '_blank', 'noopener')
  }
  return true
}
