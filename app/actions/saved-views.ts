'use server'

import { revalidatePath } from 'next/cache'
import {
  assertSavedViewEditable,
  getCurrentSavedViewContext,
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

  if (error) throw new Error(error.message)

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

  if (error) throw new Error(error.message)

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

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard')
  revalidatePath('/clients')
  return { success: true }
}
