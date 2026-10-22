import type { PropertyValue } from '@/lib/properties/schema'

/** A guest saved on the event. A contact is a person in contacts. An email is only on this event. */
export type GuestEntry = { kind: 'contact'; id: string } | { kind: 'email'; email: string }

export interface ContactChoice {
  id: string
  title: string
  email: string | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailAddress(value: string): boolean {
  return EMAIL.test(value.trim())
}

export function readGuests(value: PropertyValue): GuestEntry[] {
  if (typeof value !== 'string' || value === '') return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isGuestEntry)
  } catch {
    return []
  }
}

export function writeGuests(guests: GuestEntry[]): PropertyValue {
  return guests.length === 0 ? null : JSON.stringify(guests)
}

function isGuestEntry(value: unknown): value is GuestEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as { kind?: unknown; id?: unknown; email?: unknown }
  if (entry.kind === 'contact') return typeof entry.id === 'string' && entry.id !== ''
  if (entry.kind === 'email') return typeof entry.email === 'string' && entry.email !== ''
  return false
}

/** What the finder offers for a query against the contacts already loaded. */
export function guestActions(
  query: string,
  contacts: readonly ContactChoice[]
): { matches: ContactChoice[]; addContact: boolean; looseEmail: string | null } {
  const q = query.trim().toLowerCase()
  const matches = q
    ? contacts.filter(
        (contact) =>
          contact.title.toLowerCase().includes(q) || (contact.email ?? '').toLowerCase().includes(q)
      )
    : [...contacts]
  const taken = contacts.some(
    (contact) => contact.title.toLowerCase() === q || (contact.email ?? '').toLowerCase() === q
  )
  const typed = query.trim()
  return {
    matches,
    addContact: typed.length > 0 && !taken,
    looseEmail: isEmailAddress(typed) && !taken ? typed : null,
  }
}
