import { NextRequest, NextResponse } from 'next/server'
import { getDownloadUrl } from '@/lib/sharepoint'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params
    const url = await getDownloadUrl(itemId)
    return NextResponse.redirect(url)
  } catch (err: any) {
    console.error('SharePoint download error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Failed to get download URL' },
      { status: 500 }
    )
  }
}
