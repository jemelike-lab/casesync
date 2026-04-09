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

  const { data, error } = await supabase
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

  const { error } = await supabase
    .from('saved_views')
    .update({
      name: normalized.name,
      description: normalized.description,
      filter_definition: filterDefinition,
      sort_definition: normalized.sortDefinition,
      updated_at: new Date().toISOString(),
    })
    .eq('id', view.id)

  if (error) mapSavedViewActionError(error)

  revalidatePath('/dashboard')
  revalidatePath('/clients')
  return { success: true }
}

export async function deleteSavedView(savedViewId: string) {
  const { supabase, view } = await assertSavedViewEditable(savedViewId)

  const { error } = await supabase
    .from('saved_views')
    .delete()
    .eq('id', view.id)

  if (error) mapSavedViewActionError(error)

  revalidatePath('/dashboard')
  revalidatePath('/clients')
  return { success: true }
}
