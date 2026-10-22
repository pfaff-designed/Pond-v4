'use client'

/**
 * Guests on an event. Clicking the field opens a finder over the pond's
 * contacts. No contacts yet asks to create them. A name that isn't already
 * a contact can be added as one. An email that isn't a contact is not saved.
 */

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createDatabase } from '@/lib/pages/create-database'
import { createPage, getCollectionRows, getPage, type PondPage } from '@/lib/pages/client'
import { isDatabasesRoot } from '@/lib/pages/databases-root'
import { pagesKey } from '@/lib/pages/keys'
import { usePagesRows } from '@/lib/pages/use-pages'
import { usePondId } from '@/lib/pond/context'
import { readSchema, readValues, ROW_TYPE, type PropertyValue } from '@/lib/properties/schema'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { rowsKey } from './rows-key'
import {
  guestActions,
  isEmailAddress,
  readGuests,
  writeGuests,
  type ContactChoice,
  type GuestEntry,
} from './guest-value'
import { MENU_ON_CARD } from './menu-surface'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'

const ROW =
  'flex w-full items-baseline justify-between gap-3 rounded-[8px] px-[8px] py-[7px] text-left text-[13.5px] text-mn-text hover:bg-mn-hover-fill'
const DETAIL = 'text-[11px] text-mn-text-secondary'

export function GuestMenu({
  value,
  editable,
  contacts,
  hasContacts,
  busy,
  onChange,
  onCreateContacts,
  onAddContact,
}: {
  value: PropertyValue
  editable: boolean
  contacts: readonly ContactChoice[]
  /** A contacts collection exists, even when it has no one in it yet. */
  hasContacts: boolean
  busy?: boolean
  onChange: (value: PropertyValue) => void
  onCreateContacts: () => void
  /** Creates a contact from the typed name and returns its id. */
  onAddContact: (name: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  useDismissOnOutside(open, () => setOpen(false), [rootRef])
  const guests = readGuests(value)
  const chosen = new Set(guests.flatMap((guest) => (guest.kind === 'contact' ? [guest.id] : [])))
  const actions = guestActions(
    query,
    contacts.filter((contact) => !chosen.has(contact.id))
  )
  const titles = new Map(contacts.map((contact) => [contact.id, contact.title]))

  const write = (next: GuestEntry[]) => onChange(writeGuests(next))

  const handlePick = (id: string) => {
    write([...guests, { kind: 'contact', id }])
    setQuery('')
    setOpen(false)
  }

  const handleAddContact = async () => {
    const name = query.trim()
    if (!name || busy) return
    const id = await onAddContact(name)
    if (!id) return
    write([...guests, { kind: 'contact', id }])
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} data-part="guest-finder" className="relative min-w-0">
      <div className="flex min-h-8 w-full flex-wrap items-center gap-1">
        {guests.map((guest, index) => {
          const label = guest.kind === 'contact' ? (titles.get(guest.id) ?? 'contact') : guest.email
          return (
            <span
              key={`${guest.kind}-${guest.kind === 'contact' ? guest.id : guest.email}`}
              className="inline-flex items-center gap-1 rounded-full bg-mn-hover-fill px-2 py-0.5 text-[13px] text-mn-text"
            >
              {label}
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => write(guests.filter((_, at) => at !== index))}
                  className="text-mn-text-secondary hover:text-mn-text"
                >
                  ×
                </button>
              )}
            </span>
          )
        })}
        <button
          type="button"
          aria-label="guests"
          disabled={!editable}
          onClick={() => setOpen((current) => !current)}
          className="text-left text-[13.5px] text-mn-text-secondary"
        >
          {guests.length === 0 ? 'add a guest' : 'add'}
        </button>
      </div>
      {open && editable && (
        <div
          role="dialog"
          aria-label="find a contact"
          className={`absolute top-full left-0 z-50 mt-1 w-[min(20rem,calc(100vw-4rem))] rounded-[12px] p-2 ${MENU_ON_CARD}`}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }}
        >
          <input
            aria-label="Find a contact"
            value={query}
            placeholder="find a contact"
            onChange={(event) => setQuery(event.target.value)}
            className="w-full border-0 bg-transparent px-2 py-1.5 text-[13.5px] text-mn-text outline-none placeholder:text-mn-text-secondary"
          />
          {!hasContacts && query.trim() === '' && (
            <div className="px-2 py-1">
              <p className={DETAIL}>no contacts</p>
              <button type="button" className={ROW} disabled={busy} onClick={onCreateContacts}>
                create contacts
              </button>
            </div>
          )}
          {hasContacts && actions.matches.length === 0 && query.trim() === '' && (
            <p className={`px-2 py-1 ${DETAIL}`}>no contacts yet</p>
          )}
          {actions.matches.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className={ROW}
              onClick={() => handlePick(contact.id)}
            >
              <span>{contact.title || 'untitled'}</span>
              {contact.email && <span className={DETAIL}>{contact.email}</span>}
            </button>
          ))}
          {actions.addContact && (
            <button
              type="button"
              className={ROW}
              disabled={busy}
              onClick={() => void handleAddContact()}
            >
              <span>add a new contact</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function GuestFinder({
  value,
  editable,
  onChange,
}: {
  value: PropertyValue
  editable: boolean
  onChange: (value: PropertyValue) => void
}) {
  const pondId = usePondId()
  const getSupabase = useLazySupabase()
  const queryClient = useQueryClient()
  const pages = usePagesRows(pondId)
  const [madeId, setMadeId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const root = pages.data.find((page) =>
    isDatabasesRoot({ parentId: page.parent_id, title: page.title })
  )
  const found = root
    ? pages.data.find(
        (page) => page.parent_id === root.id && page.title.trim().toLowerCase() === 'contacts'
      )
    : undefined
  const contactsId = found?.id ?? madeId

  const contactsPage = useQuery({
    queryKey: ['page', contactsId],
    enabled: !!contactsId,
    queryFn: () => getPage(getSupabase(), contactsId as string),
  })
  const contactRows = useQuery({
    queryKey: contactsId ? rowsKey(contactsId) : ['rows', 'none'],
    enabled: !!contactsId,
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !contactsId) return [] as PondPage[]
      return getCollectionRows(supabase, user.id, contactsId)
    },
  })

  const emailId =
    readSchema(contactsPage.data?.props)?.find(
      (field) => field.name.trim().toLowerCase() === 'email'
    )?.id ?? null
  const contacts: ContactChoice[] = (contactRows.data ?? []).map((row) => {
    const email = emailId ? readValues(row.props)[emailId] : null
    return {
      id: row.id,
      title: row.title,
      email: typeof email === 'string' && email !== '' ? email : null,
    }
  })

  const ensureContacts = async (): Promise<{
    databaseId: string
    emailId: string | null
  } | null> => {
    if (contactsId) return { databaseId: contactsId, emailId }
    const supabase = getSupabase()
    const emailField = crypto.randomUUID()
    const made = await createDatabase(
      supabase,
      {
        pondId,
        title: 'contacts',
        schema: [{ id: emailField, name: 'email', type: 'text' }],
      },
      () => crypto.randomUUID()
    )
    setMadeId(made.databaseId)
    void queryClient.invalidateQueries({ queryKey: pagesKey(pondId) })
    return { databaseId: made.databaseId, emailId: emailField }
  }

  const handleCreateContacts = () => {
    if (busy || contactsId) return
    setBusy(true)
    void ensureContacts().finally(() => setBusy(false))
  }

  const handleAddContact = async (name: string): Promise<string | null> => {
    if (busy) return null
    setBusy(true)
    try {
      const ensured = await ensureContacts()
      if (!ensured) return null
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null
      const email = isEmailAddress(name) ? name : null
      const created = await createPage(supabase, user.id, {
        parentId: ensured.databaseId,
        type: ROW_TYPE,
        title: name,
        props: email && ensured.emailId ? { [ensured.emailId]: email } : {},
        pondId,
      })
      queryClient.setQueryData<PondPage[]>(rowsKey(ensured.databaseId), (prev) =>
        prev ? [...prev, created] : [created]
      )
      return created.id
    } finally {
      setBusy(false)
    }
  }

  return (
    <GuestMenu
      value={value}
      editable={editable}
      contacts={contacts}
      hasContacts={!!contactsId}
      busy={busy}
      onChange={onChange}
      onCreateContacts={handleCreateContacts}
      onAddContact={handleAddContact}
    />
  )
}
