'use server'

import { revalidatePath } from 'next/cache'
import {
  assertSavedViewEditable,
  getCurrentSavedViewContext,
  isSavedViewsUnavailableError,
  sanitizeSavedViewDescription,
  sanitizeSavedViewName,
  validateSavedViewFilterForRole,
} from '@/lib/saved-views'
import type { SavedViewFilter, SavedViewSortDefinition, SavedViewVisibilityType } from '@/lib/types'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

interface SavedViewActionInput {
  name: string
  description?: string | null
  filterDefinition: SavedViewFilter
  sortDefinition?: SavedViewSortDefinition | null
  visibilityType?: SavedViewVisibilityType
}

function normalizeActionInput(input: SavedViewActionInput) {
  const name = sanitizeSavedViewName(input.name)
  if (!name) throw new Error('Saved view name is required')

  return {
    name,
    description: sanitizeSavedViewDescription(input.description),
    filterDefinition: input.filterDefinition ?? {},
    sortDefinition: input.sortDefinition ?? null,
    visibilityType: input.visibilityType ?? 'personal',
  }
}

function mapSavedViewActionError(error: { code?: string | null; message?: string | null }) {
  if (isSavedViewsUnavailableError(error)) {
    throw new Error('Saved views are not deployed in this environment yet')
  }
  throw new Error(error.message ?? 'Saved view action failed')
}

export async function createSavedView(input: SavedViewActionInput) {
  const { supabase, user, profile } = await getCurrentSavedViewContext()
  const normalized = normalizeActionInput(input)

  if (normalized.visibilityType !== 'personal') {
    throw new Error('Only personal saved views can be created from the app right now')
  }

  const filterDefinition = validateSavedViewFilterForRole(profile.role, normalized.filterDefinition)

  let data: { id: string } | null = null
  let error: { code?: string | null; message?: string | null } | null = null
  if (isAzureConfigured()) {
    try {
      data = await withRlsContext(user.id, async (sql) => {
        const rows = await sql`INSERT INTO saved_views (name, description, owner_user_id, visibility_type, entity_type, filter_definition, sort_definition) VALUES (${normalized.name}, ${normalized.description}, ${user.id}, 'personal', 'clients', ${sql.json(filterDefinition as unknown as Parameters<typeof sql.json>[0])}, ${normalized.sortDefinition ? sql.json(normalized.sortDefinition as unknown as Parameters<typeof sql.json>[0]) : null}) RETURNING id`
        return (rows[0] ?? null) as unknown as { id: string } | null
      })
    } catch (e) {
      error = { code: (e as { code?: string }).code ?? null, message: (e as Error).message ?? null }
    }
  } else {
    const res = await supabase
      .from('saved_views')
      .insert({
        name: normalized.name,
        description: normalized.description,
        owner_user_id: user.id,
        visibility_type: 'personal',
        entity_type: 'clients',
        filter_definition: filterDefinition,
        sort_definition: normalized.sortDefinition,
      })
      .select('id')
      .single()
    data = res.data
    error = res.error
  }

  if (error) mapSavedViewActionError(error)
  if (!data?.id) throw new Error('Saved view creation returned no id')

  revalidatePath('/dashboard')
  revalidatePath('/clients')
  return { success: true, id: data.id }
}

export async function updateSavedView(savedViewId: string, input: SavedViewActionInput) {
  const { supabase, view } = await assertSavedViewEditable(savedViewId)
  const normalized = normalizeActionInput(input)
  const context = await getCurrentSavedViewContext()
  const filterDefinition = validateSavedViewFilterForRole(context.profile.role, normalized.filterDefinition)

  let error: { code?: string | null; message?: string | null } | null = null
  if (isAzureConfigured()) {
    try {
      await withRlsContext(context.user.id, (sql) => sql`UPDATE saved_views SET name = ${normalized.name}, description = ${normalized.description}, filter_definition = ${sql.json(filterDefinition as unknown as Parameters<typeof sql.json>[0])}, sort_definition = ${normalized.sortDefinition ? sql.json(normalized.sortDefinition as unknown as Parameters<typeof sql.json>[0]) : null}, updated_at = ${new Date().toISOString()} WHERE id = ${view.id}`)
    } catch (e) {
      error = { code: (e as { code?: string }).code ?? null, message: (e as Error).message ?? null }
    }
  } else {
    const res = await supabase
      .from('saved_views')
      .update({
        name: normalized.name,
        description: normalized.description,
        filter_definition: filterDefinition,
        sort_definition: normalized.sortDefinition,
        updated_at: new Date().toISOString(),
      })
      .eq('id', view.id)
    error = res.error
  }

  if (error) mapSavedViewActionError(error)

  revalidatePath('/dashboard')
  revalidatePath('/clients')
  return { success: true }
}

export async function deleteSavedView(savedViewId: string) {
  const { supabase, user, view } = await assertSavedViewEditable(savedViewId)

  let error: { code?: string | null; message?: string | null } | null = null
  if (isAzureConfigured()) {
    try {
      await withRlsContext(user.id, (sql) => sql`DELETE FROM saved_views WHERE id = ${view.id}`)
    } catch (e) {
      error = { code: (e as { code?: string }).code ?? null, message: (e as Error).message ?? null }
    }
  } else {
    const res = await supabase
      .from('saved_views')
      .delete()
      .eq('id', view.id)
    error = res.error
  }

  if (error) mapSavedViewActionError(error)

  revalidatePath('/dashboard')
  revalidatePath('/clients')
  return { success: true }
}
