
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Language } from '../components/Sidebar'
import { apiUrl, authFetch } from '../utils/api'
import './Customers.css'

export type Customer = {
  id: string
  name: string
  phone: string | null
  serial_number?: string | null
  email: string | null
  address: string | null
  is_active: boolean
  created_at?: string
}

export type Project = {
  id: string
  customer_id: string
  serial_number?: string
  name: string
  description: string | null
  status: string
  input_unit: string
  output_unit: string
  default_tolerance_mm: number
  default_apply_tolerance: boolean
  created_at?: string
}

type StatusFilter = 'all' | 'active' | 'inactive'

type Props = {
  language: Language
  selectedCustomer: Customer | null
  onSelectCustomer: (customer: Customer | null) => void
  onNewOrder: (customer: Customer) => void
}

type CustomerForm = {
  name: string
  phone: string
  serialNumber: string
  email: string
  address: string
}

const EMPTY_FORM: CustomerForm = {
  name: '',
  phone: '',
  serialNumber: '',
  email: '',
  address: '',
}

function Customers({
  language,
  selectedCustomer,
  onSelectCustomer,
  onNewOrder,
}: Props) {
  const isTamil = language === 'ta'

  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingCustomer, setEditingCustomer] =
    useState<Customer | null>(null)
  const [isAddingCustomer, setIsAddingCustomer] = useState(false)
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)

  const t = (english: string, tamil: string) =>
    isTamil ? tamil : english

  async function loadData() {
    try {
      const customerResponse = await authFetch(
        apiUrl('/customers/?include_inactive=true'),
      )

      if (!customerResponse.ok) {
        throw new Error('Unable to load customers.')
      }

      const customerData: Customer[] =
        await customerResponse.json()

      setError('')
      setCustomers(customerData)

      try {
        localStorage.setItem(
          'ls-interiors-customers',
          JSON.stringify(customerData),
        )
      } catch {
        // Local storage is optional.
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load customer data.'

      setError(message)

      // Read-only fallback when the backend is unavailable.
      try {
        const localCustomers = localStorage.getItem(
          'ls-interiors-customers',
        )

        if (localCustomers) {
          setCustomers(JSON.parse(localCustomers))
        }
      } catch {
        setCustomers([])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData()
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [])

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return customers.filter((customer) => {
      if (
        statusFilter === 'active' &&
        !customer.is_active
      ) {
        return false
      }

      if (
        statusFilter === 'inactive' &&
        customer.is_active
      ) {
        return false
      }

      if (!query) return true

      return (
        customer.name.toLowerCase().includes(query) ||
        customer.id.toLowerCase().includes(query) ||
        (customer.phone ?? '').toLowerCase().includes(query) ||
        (customer.email ?? '').toLowerCase().includes(query)
      )
    })
  }, [customers, search, statusFilter])

  const allVisibleSelected =
    filteredCustomers.length > 0 &&
    filteredCustomers.every(
      (customer) => selectedIds.includes(customer.id),
    )

  const selectedActiveCustomers = customers.filter(
    (customer) =>
      selectedIds.includes(customer.id) &&
      customer.is_active,
  )

  const selectedDeletedCustomers = customers.filter(
    (customer) =>
      selectedIds.includes(customer.id) &&
      !customer.is_active,
  )

  function toggleCustomerSelection(
    customerId: string,
    checked: boolean,
  ) {
    setSelectedIds((previous) =>
      checked
        ? [...new Set([...previous, customerId])]
        : previous.filter((id) => id !== customerId),
    )
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds((previous) => [
        ...new Set([
          ...previous,
          ...filteredCustomers.map((customer) => customer.id),
        ]),
      ])
    } else {
      const visibleIds = new Set(
        filteredCustomers.map((customer) => customer.id),
      )

      setSelectedIds((previous) =>
        previous.filter((id) => !visibleIds.has(id)),
      )
    }
  }

  function openEditForm(customer: Customer) {
    setEditingCustomer(customer)

    setForm({
      name: customer.name,
      phone: customer.phone ?? '',
      serialNumber: customer.serial_number ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
    })

    setError('')
  }

  function closeEditForm() {
    setEditingCustomer(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  function openAddForm() {
    setIsAddingCustomer(true)
    setForm(EMPTY_FORM)
    setError('')
  }

  function closeAddForm() {
    setIsAddingCustomer(false)
    setForm(EMPTY_FORM)
    setError('')
  }

  function updatePhone(value: string) {
    setForm((previous) => ({
      ...previous,
      phone: value.replace(/\D/g, '').slice(0, 10),
    }))
  }

  function validateCustomerPhone(phone: string): boolean {
    if (!phone) return true
    if (!/^\d{10}$/.test(phone)) {
      setError(
        t(
          'Phone number must contain exactly 10 digits.',
          'தொலைபேசி எண் சரியாக 10 இலக்கங்கள் இருக்க வேண்டும்.',
        ),
      )
      return false
    }
    return true
  }

  async function handleCreateCustomer(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (!validateCustomerPhone(form.phone.trim())) return
    if (!form.serialNumber.trim()) {
      setError(
        t(
          'Customer serial number is required.',
          'வாடிக்கையாளர் வரிசை எண் அவசியம்.',
        ),
      )
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      serial_number: form.serialNumber.trim(),
      email: form.email.trim() || null,
      address: form.address.trim() || null,
    }

    try {
      const response = await authFetch(apiUrl('/customers/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(
          result?.detail ||
            t('Unable to add customer.', 'வாடிக்கையாளரைச் சேர்க்க முடியவில்லை.'),
        )
      }

      const createdCustomer: Customer = await response.json()
      await loadData()
      closeAddForm()
      onNewOrder(createdCustomer)
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t('Unable to add customer.', 'வாடிக்கையாளரைச் சேர்க்க முடியவில்லை.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateCustomer(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!editingCustomer) return
    if (!validateCustomerPhone(form.phone.trim())) return
    if (!form.serialNumber.trim()) {
      setError(
        t(
          'Customer serial number is required.',
          'வாடிக்கையாளர் வரிசை எண் அவசியம்.',
        ),
      )
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      serial_number: form.serialNumber.trim(),
      email: form.email.trim() || null,
      address: form.address.trim() || null,
    }

    try {
      const response = await authFetch(
        apiUrl(`/customers/${editingCustomer.id}`),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      )

      if (!response.ok) {
        const result = await response.json()

        throw new Error(
          result.detail ||
            t('Unable to update customer.', 'வாடிக்கையாளரைப் புதுப்பிக்க முடியவில்லை.'),
        )
      }

      const updatedCustomer: Customer =
        await response.json()

      await loadData()
      closeEditForm()
      onNewOrder(updatedCustomer)
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : t('Unable to update customer.', 'வாடிக்கையாளரைப் புதுப்பிக்க முடியவில்லை.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteCustomer(customer: Customer) {
    const confirmed = window.confirm(
      isTamil
        ? `"${customer.name}" வாடிக்கையாளரை நீக்கப்பட்ட பட்டியலுக்கு மாற்றவா? தொடர்புடைய பதிவுகள் பாதுகாக்கப்பட்டு மீட்டெடுக்க முடியும்.`
        : `Move "${customer.name}" to Deleted Customers? Their associated records will be retained and can be restored.`,
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    try {
      const response = await authFetch(
        apiUrl(`/customers/${customer.id}`),
        { method: 'DELETE' },
      )

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(
          result?.detail ||
            t('Unable to delete customer.', 'வாடிக்கையாளரை நீக்க முடியவில்லை.'),
        )
      }

      if (selectedCustomer?.id === customer.id) {
        onSelectCustomer(null)
      }

      setSelectedIds((previous) =>
        previous.filter((id) => id !== customer.id),
      )

      await loadData()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('Unable to delete customer.', 'வாடிக்கையாளரை நீக்க முடியவில்லை.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteSelectedCustomers() {
    const targets = selectedActiveCustomers

    if (targets.length === 0) return

    const confirmed = window.confirm(
      isTamil
        ? `தேர்ந்தெடுத்த ${targets.length} வாடிக்கையாளர்களை நீக்கப்பட்ட பட்டியலுக்கு மாற்றவா?`
        : `Move ${targets.length} selected customer(s) to Deleted Customers? Their associated records will be retained.`,
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    try {
      for (const customer of targets) {
        const response = await authFetch(
          apiUrl(`/customers/${customer.id}`),
          { method: 'DELETE' },
        )

        if (!response.ok) {
          const result = await response.json().catch(() => null)
          throw new Error(
            result?.detail ||
              t(
                `Unable to delete ${customer.name}.`,
                `${customer.name} நீக்க முடியவில்லை.`,
              ),
          )
        }
      }

      if (
        selectedCustomer &&
        targets.some(
          (customer) => customer.id === selectedCustomer.id,
        )
      ) {
        onSelectCustomer(null)
      }

      setSelectedIds([])
      await loadData()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t(
              'Unable to delete selected customers.',
              'தேர்ந்தெடுத்த வாடிக்கையாளர்களை நீக்க முடியவில்லை.',
            ),
      )
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function restoreCustomer(customer: Customer) {
    const confirmed = window.confirm(
      isTamil
        ? `"${customer.name}" வாடிக்கையாளரை மீண்டும் செயலில் உள்ள பட்டியலில் சேர்க்கவா?`
        : `Restore "${customer.name}" to the active customer list?`,
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    try {
      const response = await authFetch(
        apiUrl(`/customers/${customer.id}/restore`),
        { method: 'PATCH' },
      )

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(
          result?.detail ||
            t('Unable to restore customer.', 'வாடிக்கையாளரை மீட்டெடுக்க முடியவில்லை.'),
        )
      }

      setSelectedIds((previous) =>
        previous.filter((id) => id !== customer.id),
      )

      await loadData()
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : t('Unable to restore customer.', 'வாடிக்கையாளரை மீட்டெடுக்க முடியவில்லை.'),
      )
    } finally {
      setSaving(false)
    }
  }

  async function restoreSelectedCustomers() {
    const targets = selectedDeletedCustomers

    if (targets.length === 0) return

    const confirmed = window.confirm(
      isTamil
        ? `தேர்ந்தெடுத்த ${targets.length} வாடிக்கையாளர்களை மீட்டெடுக்கவா?`
        : `Restore ${targets.length} selected customer(s)?`,
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    try {
      for (const customer of targets) {
        const response = await authFetch(
          apiUrl(`/customers/${customer.id}/restore`),
          { method: 'PATCH' },
        )

        if (!response.ok) {
          const result = await response.json().catch(() => null)
          throw new Error(
            result?.detail ||
              t(
                `Unable to restore ${customer.name}.`,
                `${customer.name} மீட்டெடுக்க முடியவில்லை.`,
              ),
          )
        }
      }

      setSelectedIds([])
      await loadData()
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : t(
              'Unable to restore selected customers.',
              'தேர்ந்தெடுத்த வாடிக்கையாளர்களை மீட்டெடுக்க முடியவில்லை.',
            ),
      )
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function permanentlyDeleteCustomer(
    customer: Customer,
  ) {
    const confirmed = window.confirm(
      isTamil
        ? `"${customer.name}" வாடிக்கையாளரை நிரந்தரமாக நீக்கவா?\n\nஇவரின் அனைத்து அளவீடு மற்றும் ஆர்டர் பதிவுகளும் நிரந்தரமாக அழிக்கப்படும். இதைத் திரும்பப் பெற முடியாது.`
        : `PERMANENTLY DELETE "${customer.name}"?\n\nThis will permanently remove this customer, all associated measurement records. This action cannot be undone.`,
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    try {
      const response = await authFetch(
        apiUrl(`/customers/${customer.id}/permanent`),
        { method: 'DELETE' },
      )

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(
          result?.detail ||
            t(
              'Unable to permanently delete customer.',
              'வாடிக்கையாளரை நிரந்தரமாக நீக்க முடியவில்லை.',
            ),
        )
      }

      if (selectedCustomer?.id === customer.id) {
        onSelectCustomer(null)
      }

      setSelectedIds((previous) =>
        previous.filter((id) => id !== customer.id),
      )

      await loadData()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t(
              'Unable to permanently delete customer.',
              'வாடிக்கையாளரை நிரந்தரமாக நீக்க முடியவில்லை.',
            ),
      )
    } finally {
      setSaving(false)
    }
  }

  async function permanentlyDeleteSelectedCustomers() {
    const targets = selectedDeletedCustomers

    if (targets.length === 0) return

    const confirmed = window.confirm(
      isTamil
        ? `தேர்ந்தெடுத்த ${targets.length} வாடிக்கையாளர்களை நிரந்தரமாக நீக்கவா?\n\nஅவர்களின் அனைத்து அளவீடு பதிவுகளும் நிரந்தரமாக அழிக்கப்படும்.`
        : `PERMANENTLY DELETE ${targets.length} selected customer(s)?\n\nAll associated measurement records will also be permanently deleted. This action cannot be undone.`,
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    try {
      for (const customer of targets) {
        const response = await authFetch(
          apiUrl(`/customers/${customer.id}/permanent`),
          { method: 'DELETE' },
        )

        if (!response.ok) {
          const result = await response.json().catch(() => null)
          throw new Error(
            result?.detail ||
              t(
                `Unable to permanently delete ${customer.name}.`,
                `${customer.name} நிரந்தரமாக நீக்க முடியவில்லை.`,
              ),
          )
        }
      }

      if (
        selectedCustomer &&
        targets.some(
          (customer) => customer.id === selectedCustomer.id,
        )
      ) {
        onSelectCustomer(null)
      }

      setSelectedIds([])
      await loadData()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t(
              'Unable to permanently delete selected customers.',
              'தேர்ந்தெடுத்த வாடிக்கையாளர்களை நிரந்தரமாக நீக்க முடியவில்லை.',
            ),
      )
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="customers-workspace">
      <div className="customers-toolbar">
        <div>
          <h2>
            {t('Customer Management', 'வாடிக்கையாளர் மேலாண்மை')}
          </h2>
          <p>
            {t(
              'View and manage customer records.',
              'வாடிக்கையாளர்கள், திட்டங்கள் மற்றும் பதிவுகளை நிர்வகிக்கவும்.',
            )}
          </p>
        </div>

        <div className="customer-toolbar-actions">
          <button
            type="button"
            className="customer-secondary-button"
            onClick={openAddForm}
            disabled={saving}
          >
            {t('Add Customer', 'வாடிக்கையாளர் சேர்க்க')}
          </button>
        </div>
      </div>

      {error && (
        <div className="customer-error" role="alert">
          {error}
        </div>
      )}

      <section className="customer-table-card">
        <div className="customer-table-heading">
          <div>
            <h3>
              {statusFilter === 'inactive'
                ? t('Deleted Customers', 'நீக்கப்பட்ட வாடிக்கையாளர்கள்')
                : statusFilter === 'active'
                  ? t('Active Customers', 'செயலில் உள்ள வாடிக்கையாளர்கள்')
                  : t('All Customers', 'அனைத்து வாடிக்கையாளர்கள்')}
            </h3>
            <span>
              {filteredCustomers.length}{' '}
              {t('customers shown', 'வாடிக்கையாளர்கள்')}
            </span>
          </div>

          <button
            type="button"
            className="customer-secondary-button"
            onClick={() => {
              setLoading(true)
              void loadData()
            }}
            disabled={loading || saving}
          >
            {t('Refresh', 'புதுப்பி')}
          </button>
        </div>

        <div className="customer-filter-bar">
          <input
            className="customer-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Search name, customer ID, phone or email...', 'வாடிக்கையாளர் பெயர், ID, தொலைபேசி அல்லது மின்னஞ்சல் மூலம் தேடு...')}
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            aria-label={t('Customer status filter', 'நிலை வடிகட்டி')}
          >
            <option value="all">
              {t('All Customers', 'அனைத்தும்')}
            </option>
            <option value="active">
              {t('Active Customers', 'செயலில் உள்ளவை')}
            </option>
            <option value="inactive">
              {t('Deleted Customers', 'நீக்கப்பட்டவை')}
            </option>
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div className="customer-bulk-toolbar">
            <strong>
              {selectedIds.length}{' '}
              {t('selected', 'தேர்ந்தெடுக்கப்பட்டன')}
            </strong>

            <div>
              {selectedActiveCustomers.length > 0 && (
                <button
                  type="button"
                  className="customer-danger-button"
                  onClick={() => void deleteSelectedCustomers()}
                  disabled={saving}
                >
                  {t('Delete Selected', 'தேர்ந்தெடுத்தவற்றை நீக்கு')}
                  {' '}({selectedActiveCustomers.length})
                </button>
              )}

              {selectedDeletedCustomers.length > 0 && (
                <>
                  <button
                    type="button"
                    className="customer-secondary-button"
                    onClick={() => void restoreSelectedCustomers()}
                    disabled={saving}
                  >
                    {t('Restore Selected', 'தேர்ந்தெடுத்தவற்றை மீட்டெடு')}
                    {' '}({selectedDeletedCustomers.length})
                  </button>

                  <button
                    type="button"
                    className="customer-danger-button"
                    onClick={() =>
                      void permanentlyDeleteSelectedCustomers()
                    }
                    disabled={saving}
                  >
                    {t('Permanently Delete Selected', 'நிரந்தரமாக நீக்கு')}
                    {' '}({selectedDeletedCustomers.length})
                  </button>
                </>
              )}

              <button
                type="button"
                className="customer-text-button"
                onClick={() => setSelectedIds([])}
                disabled={saving}
              >
                {t('Clear selection', 'தேர்வை நீக்கு')}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="customer-empty">
            {t('Loading customers...', 'வாடிக்கையாளர்கள் ஏற்றப்படுகிறது...')}
          </p>
        ) : filteredCustomers.length === 0 ? (
          <p className="customer-empty">
            {t('No customers found.', 'வாடிக்கையாளர்கள் இல்லை.')}
          </p>
        ) : (
          <div className="customer-table-scroll">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>{t('Customer Serial', 'வாடிக்கையாளர் வரிசை எண்')}</th>
                  <th className="customer-name-header">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) =>
                        toggleSelectAll(event.target.checked)
                      }
                      aria-label={t('Select all customers', 'அனைத்து வாடிக்கையாளர்களையும் தேர்வு செய்')}
                    />
                    {t('Customer Name', 'வாடிக்கையாளர் பெயர்')}
                  </th>
                  <th>{t('Customer Phone Number', 'வாடிக்கையாளர் தொலைபேசி எண்')}</th>
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.map((customer) => {
                  const isSelected = selectedCustomer?.id === customer.id

                  return (
                    <tr
                      key={customer.id}
                      className={isSelected ? 'selected-row' : ''}
                    >
                      <td>
                        <span className="customer-id">
                          {customer.serial_number || customer.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="customer-name-cell">
                          <div className="customer-name-identity">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(customer.id)}
                              onChange={(event) =>
                                toggleCustomerSelection(
                                  customer.id,
                                  event.target.checked,
                                )
                              }
                              aria-label={t(`Select ${customer.name}`, `${customer.name} தேர்வு செய்`)}
                            />
                            <button
                              type="button"
                              className="customer-details-button"
                              onClick={() => onSelectCustomer(customer)}
                            >
                              {customer.name}
                            </button>
                          </div>
                          <div className="customer-row-actions">
                            {customer.is_active ? (
                              <>
                                <button
                                  type="button"
                                  className="customer-action-button"
                                  onClick={() => openEditForm(customer)}
                                  disabled={saving}
                                >
                                  {t('Edit', 'திருத்து')}
                                </button>
                                <button
                                  type="button"
                                  className="customer-secondary-button"
                                  onClick={() => onNewOrder(customer)}
                                  disabled={saving}
                                >
                                  {t('Update Order / Measurement', 'ஆர்டர் / அளவீடு புதுப்பி')}
                                </button>
                                <button
                                  type="button"
                                  className="customer-danger-button"
                                  onClick={() => void deleteCustomer(customer)}
                                  disabled={saving}
                                >
                                  {t('Delete', 'நீக்கு')}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="customer-secondary-button"
                                  onClick={() => void restoreCustomer(customer)}
                                  disabled={saving}
                                >
                                  {t('Restore', 'மீட்டெடு')}
                                </button>
                                <button
                                  type="button"
                                  className="customer-danger-button"
                                  onClick={() => void permanentlyDeleteCustomer(customer)}
                                  disabled={saving}
                                >
                                  {t('Permanently Delete', 'நிரந்தரமாக நீக்கு')}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{customer.phone || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCustomer && (
        <section className="customer-details-panel">
          <div className="customer-details-heading">
            <div>
              <h3>{selectedCustomer.name}</h3>
              <p>
                {t('Customer contact information', 'வாடிக்கையாளர் தொடர்புத் தகவல்')}
              </p>
            </div>

            <button
              type="button"
              className="customer-secondary-button"
              onClick={() => onSelectCustomer(null)}
            >
              {t('Close Details', 'மூடு')}
            </button>
          </div>

          <div className="customer-contact-grid">
            <div>
              <span>{t('Phone', 'தொலைபேசி')}</span>
              <strong>{selectedCustomer.phone || '—'}</strong>
            </div>

            <div>
              <span>{t('Email', 'மின்னஞ்சல்')}</span>
              <strong>{selectedCustomer.email || '—'}</strong>
            </div>

            <div>
              <span>{t('Address', 'முகவரி')}</span>
              <strong>{selectedCustomer.address || '—'}</strong>
            </div>

            <div>
              <span>{t('Customer Serial', 'வாடிக்கையாளர் வரிசை எண்')}</span>
              <strong>{selectedCustomer.serial_number || selectedCustomer.id}</strong>
            </div>
          </div>

          {selectedCustomer.is_active && (
            <button
              type="button"
              className="customer-primary-button"
              onClick={() => onNewOrder(selectedCustomer)}
            >
              {t('New Order', 'புதிய ஆர்டர்')}
            </button>
          )}
        </section>
      )}

      {isAddingCustomer && (
        <div className="customer-modal-backdrop">
          <section
            className="customer-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-add-title"
          >
            <div className="customer-details-heading">
              <h3 id="customer-add-title">
                {t('Add Customer', 'புதிய வாடிக்கையாளர் சேர்க்க')}
              </h3>
              <button
                type="button"
                className="customer-close-button"
                onClick={closeAddForm}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateCustomer}>
              <label>
                {t('Customer Name', 'வாடிக்கையாளர் பெயர்')}
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>

              <label>
                {t('Phone Number', 'தொலைபேசி எண்')}
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={20}
                  value={form.phone}
                  onChange={(event) => updatePhone(event.target.value)}
                />
              </label>

              <label>
                {t('Customer Serial Number', 'வாடிக்கையாளர் வரிசை எண்')}
                <input
                  required
                  maxLength={50}
                  value={form.serialNumber}
                  placeholder={t('e.g. CUST-101', 'உ.ம். CUST-101')}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      serialNumber: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                {t('Email Address', 'மின்னஞ்சல் முகவரி')}
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
              </label>

              <label>
                {t('Address', 'முகவரி')}
                <textarea
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                />
              </label>

              <div className="customer-form-actions">
                <button
                  type="button"
                  className="customer-secondary-button"
                  onClick={closeAddForm}
                  disabled={saving}
                >
                  {t('Cancel', 'ரத்து செய்')}
                </button>
                <button
                  type="submit"
                  className="customer-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? t('Saving...', 'சேமிக்கிறது...')
                    : t('Add Customer', 'வாடிக்கையாளரைச் சேர்க்க')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {editingCustomer && (
        <div className="customer-modal-backdrop">
          <section
            className="customer-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-edit-title"
          >
            <div className="customer-details-heading">
              <h3 id="customer-edit-title">
                {t('Edit Customer', 'வாடிக்கையாளர் விவரங்களைத் திருத்து')}
              </h3>

              <button
                type="button"
                className="customer-close-button"
                onClick={closeEditForm}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer}>
              <label>
                {t('Customer Name', 'வாடிக்கையாளர் பெயர்')}
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                {t('Phone Number', 'தொலைபேசி எண்')}
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={20}
                  value={form.phone}
                  onChange={(event) => updatePhone(event.target.value)}
                />
              </label>

              <label>
                {t('Customer Serial Number', 'வாடிக்கையாளர் வரிசை எண்')}
                <input
                  required
                  maxLength={50}
                  value={form.serialNumber}
                  placeholder={t('e.g. CUST-101', 'உ.ம். CUST-101')}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      serialNumber: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                {t('Email Address', 'மின்னஞ்சல் முகவரி')}
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                {t('Address', 'முகவரி')}
                <textarea
                  value={form.address}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      address: event.target.value,
                    })
                  }
                />
              </label>

              <div className="customer-form-actions">
                <button
                  type="button"
                  className="customer-secondary-button"
                  onClick={closeEditForm}
                  disabled={saving}
                >
                  {t('Cancel', 'ரத்து செய்')}
                </button>

                <button
                  type="submit"
                  className="customer-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? t('Saving...', 'சேமிக்கிறது...')
                    : t('Save Changes', 'மாற்றங்களைச் சேமி')}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default Customers
