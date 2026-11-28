import { apiUrl, authFetch } from './api'
import type { CustomDeductionOverrides } from './slidingCalculations'

export const DRAFT_FORMULAS_KEY = 'ls-interiors-draft-formulas'
export const PROJECT_FORMULAS_KEY = 'ls-interiors-project-formulas'
export const CUSTOMER_FORMULAS_KEY = 'ls-interiors-customer-formulas'
const LEGACY_FORMULAS_KEY = 'ls-interiors-custom-formulas'

export type FormulasMap = Record<string, CustomDeductionOverrides>

export function notifyFormulasUpdated(): void {
  window.dispatchEvent(new CustomEvent('ls-formulas-updated'))
}

export function clearDraftFormulas(): void {
  try {
    localStorage.removeItem(DRAFT_FORMULAS_KEY)
    localStorage.removeItem(LEGACY_FORMULAS_KEY)
    notifyFormulasUpdated()
  } catch {
    // Ignore storage errors
  }
}

export function loadDraftFormulas(): FormulasMap {
  try {
    const raw = localStorage.getItem(DRAFT_FORMULAS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as FormulasMap) : {}
  } catch {
    return {}
  }
}

export function saveDraftFormulas(formulas: FormulasMap): void {
  try {
    if (Object.keys(formulas).length === 0) {
      localStorage.removeItem(DRAFT_FORMULAS_KEY)
    } else {
      localStorage.setItem(DRAFT_FORMULAS_KEY, JSON.stringify(formulas))
    }
    notifyFormulasUpdated()
  } catch (e) {
    console.error(e)
  }
}

function loadScopedMap(storageKey: string): Record<string, FormulasMap> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, FormulasMap>)
      : {}
  } catch {
    return {}
  }
}

function loadScopedFormulas(storageKey: string, id: string): FormulasMap {
  const all = loadScopedMap(storageKey)
  const entry = all[id]
  return entry && typeof entry === 'object' ? entry : {}
}

function saveScopedFormulas(
  storageKey: string,
  id: string,
  formulas: FormulasMap,
  notify = true
): void {
  try {
    const all = loadScopedMap(storageKey)
    if (Object.keys(formulas).length === 0) {
      delete all[id]
    } else {
      all[id] = formulas
    }
    localStorage.setItem(storageKey, JSON.stringify(all))
    if (notify) {
      notifyFormulasUpdated()
    }
  } catch (e) {
    console.error(e)
  }
}

export function loadLocalProjectFormulas(projectId: string): FormulasMap {
  return loadScopedFormulas(PROJECT_FORMULAS_KEY, projectId)
}

export function saveLocalProjectFormulas(
  projectId: string,
  formulas: FormulasMap,
  notify = true
): void {
  saveScopedFormulas(PROJECT_FORMULAS_KEY, projectId, formulas, notify)
}

export function loadLocalCustomerFormulas(customerId: string): FormulasMap {
  return loadScopedFormulas(CUSTOMER_FORMULAS_KEY, customerId)
}

export function saveLocalCustomerFormulas(
  customerId: string,
  formulas: FormulasMap,
  notify = true
): void {
  saveScopedFormulas(CUSTOMER_FORMULAS_KEY, customerId, formulas, notify)
}

export function loadLocalCustomerOrProjectFormulas(
  customerId?: string | null,
  projectId?: string | null
): FormulasMap {
  if (projectId) {
    const projectFormulas = loadLocalProjectFormulas(projectId)
    if (Object.keys(projectFormulas).length > 0) {
      return projectFormulas
    }
  }
  if (customerId) {
    return loadLocalCustomerFormulas(customerId)
  }
  return projectId ? {} : loadDraftFormulas()
}

export function saveLocalCustomerOrProjectFormulas(
  customerId: string | null | undefined,
  projectId: string | null | undefined,
  formulas: FormulasMap,
  notify = true
): void {
  if (projectId) {
    saveLocalProjectFormulas(projectId, formulas, false)
  }
  if (customerId) {
    saveLocalCustomerFormulas(customerId, formulas, false)
  }
  if (!customerId && !projectId) {
    saveDraftFormulas(formulas)
    return
  }
  if (notify) {
    notifyFormulasUpdated()
  }
}

export async function fetchCustomerOrProjectFormulas(
  customerId?: string | null,
  projectId?: string | null
): Promise<FormulasMap> {
  if (!customerId && !projectId) {
    return loadDraftFormulas()
  }

  const params = new URLSearchParams()
  if (customerId) params.set('customer_id', customerId)
  if (projectId) params.set('project_id', projectId)

  try {
    const response = await authFetch(
      apiUrl(`/settings/formulas?${params.toString()}`)
    )
    if (!response.ok) {
      return loadLocalCustomerOrProjectFormulas(customerId, projectId)
    }
    const data: { formulas?: FormulasMap } = await response.json()
    const formulas =
      data?.formulas && typeof data.formulas === 'object' ? data.formulas : {}
    saveLocalCustomerOrProjectFormulas(customerId, projectId, formulas, false)
    return formulas
  } catch {
    return loadLocalCustomerOrProjectFormulas(customerId, projectId)
  }
}

export async function saveCustomerOrProjectFormulasToServer(
  customerId: string | null | undefined,
  projectId: string | null | undefined,
  formulas: FormulasMap
): Promise<boolean> {
  saveLocalCustomerOrProjectFormulas(customerId, projectId, formulas, true)

  if (!customerId && !projectId) {
    return true
  }

  try {
    const response = await authFetch(apiUrl('/settings/formulas'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId || null,
        project_id: projectId || null,
        formulas,
      }),
    })
    return response.ok
  } catch (e) {
    console.error('Failed to sync customer/project formulas to server:', e)
    return false
  }
}

export async function fetchProjectFormulas(
  projectId: string,
  customerId?: string | null
): Promise<FormulasMap> {
  return fetchCustomerOrProjectFormulas(customerId, projectId)
}

export async function saveProjectFormulasToServer(
  projectId: string,
  formulas: FormulasMap,
  customerId?: string | null
): Promise<boolean> {
  return saveCustomerOrProjectFormulasToServer(customerId, projectId, formulas)
}
