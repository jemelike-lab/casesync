/**
 * One-time script: Upload DR plan to internal-docs bucket.
 * Run with: npx tsx scripts/upload-dr-plan.ts
 * 
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npx tsx scripts/upload-dr-plan.ts <path-to-file>')
    process.exit(1)
  }

  const fileBuffer = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)

  const { data, error } = await supabase.storage
    .from('internal-docs')
    .upload(fileName, fileBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    })

  if (error) {
    console.error('Upload failed:', error.message)
    process.exit(1)
  }

  console.log('Uploaded successfully:', data.path)
  console.log('Download via: GET /api/internal-docs?file=' + fileName)
}

main()
