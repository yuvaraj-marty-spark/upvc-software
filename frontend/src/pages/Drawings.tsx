import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, authFetch } from '../utils/api'
import { fetchProjectFormulas } from '../utils/formulaStorage'
import {
  Download,
  Eye,
  FileSpreadsheet,
  Glasses,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react'
import type { Language } from '../components/Sidebar'
import { A4FabricationModal } from '../components/A4FabricationModal'
import { WindowVisualizer2D } from '../components/WindowVisualizer2D'
import type { CalculationResult } from '../types/cad'
import type { Customer } from './Customers'
import type { MeasurementRow } from './Measurements'
import { convertMeasurementsToCalculationResults } from '../utils/cadBridge'
import { convertToMm, WINDOW_MODELS } from '../utils/slidingCalculations'
import { resolveWindowLabels } from '../utils/windowIdentity'
import {
  generateWorkshopOrderPDF,
  generateGlassFactoryOrderPDF,
} from '../utils/pdfGenerator'
import './Drawings.css'

interface DrawingsProps {
  language: Language
  initialProjectId?: string | null
  onOpenMeasurements?: (
    projectId?: string,
    customer?: Customer,
  ) => void
}

interface BackendProject {
  id: string
  customer_id: string
  name: string
  serial_number?: string | null
  input_unit?: 'in' | 'cm' | 'mm' | null
  output_unit?: 'in' | 'cm' | 'mm' | null
  default_tolerance_mm?: number | string | null
  default_apply_tolerance?: boolean | null
}

interface BackendMeasurement {
  id: string
  row_order: number
  height?: number | string | null
  width?: number | string | null
  model_id?: string | null
  variant_letter?: string | null
  glass_type?: string | null
  tolerance_mm?: number | string | null
  apply_tolerance?: boolean | null
  height_additional_mm?: number | string | null
  width_additional_mm?: number | string | null
  identification_color?: string | null
  status?: string | null
}

interface DrawingRecord {
  project: BackendProject
  measurement: BackendMeasurement
  result: CalculationResult
  windowLabel: string
}

type ExportType = 'workshop' | 'glass'

const PAGE_SIZE = 8

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected request failure.'
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      detail || `Request failed with status ${response.status}.`,
    )
  }

  return response.json() as Promise<T>
}

function getMeshPanel(result: CalculationResult) {
  return result.additionalPanels?.find(
    (panel) =>
      /mesh/i.test(panel.shutterType || '') &&
      panel.heightMM > 0 &&
      panel.widthMM > 0,
  )
}

function getModelType(modelId: string): string {
  const model = WINDOW_MODELS.find((item) => item.id === modelId)
  if (!model) return modelId || '—'

  if (model.category === 'open') {
    if (modelId === 'open-single') return 'Casement'
    if (modelId === 'open-double') return 'Open-Double'
    if (modelId === 'open-triple') return 'Open-Triple'
  }

  return model.category.charAt(0).toUpperCase() + model.category.slice(1)
}

function getStatusLabel(status?: string | null, isTamil = false): string {
  if (!status || status === 'pending') return isTamil ? 'நிலுவை' : 'Pending'
  if (status === 'finished' || status === 'completed') {
    return isTamil ? 'முடிந்தது' : 'Completed'
  }
  if (status === 'in_progress') return isTamil ? 'செயலில்' : 'In Progress'

  return status.replaceAll('_', ' ')
}

function getStatusClass(status?: string | null): string {
  if (status === 'finished' || status === 'completed') return 'completed'
  if (status === 'in_progress') return 'in-progress'
  return 'pending'
}

function mapMeasurementToRow(
  measurement: BackendMeasurement,
  project: BackendProject,
  index: number,
): MeasurementRow {
  return {
    id: index + 1,
    backendId: measurement.id,
    height: measurement.height == null ? '' : String(measurement.height),
    width: measurement.width == null ? '' : String(measurement.width),
    modelId: measurement.model_id || '',
    variantLetter: measurement.variant_letter || '',
    glassType: measurement.glass_type || '',
    toleranceMm:
      measurement.tolerance_mm == null
        ? Number(project.default_tolerance_mm ?? 5)
        : Number(measurement.tolerance_mm),
    applyTolerance:
      measurement.apply_tolerance ??
      project.default_apply_tolerance ??
      true,
    heightAdditionalMm: Number(measurement.height_additional_mm ?? 0),
    widthAdditionalMm: Number(measurement.width_additional_mm ?? 0),
    identificationColor: measurement.identification_color || '#E5E7EB',
  }
}

export default function Drawings({
  language,
  initialProjectId,
  onOpenMeasurements,
}: DrawingsProps) {
  const isTamil = language === 'ta'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const selectedCustomerIdRef = useRef('')
  const initialProjectResolvedRef = useRef(false)
  const [records, setRecords] = useState<DrawingRecord[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const syncFormulas = () => {
      setRefreshKey((k) => k + 1)
    }
    window.addEventListener('storage', syncFormulas)
    window.addEventListener('ls-formulas-updated', syncFormulas)
    return () => {
      window.removeEventListener('storage', syncFormulas)
      window.removeEventListener('ls-formulas-updated', syncFormulas)
    }
  }, [])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [customerError, setCustomerError] = useState('')
  const [recordsError, setRecordsError] = useState('')
  const [page, setPage] = useState(1)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportSheetType, setExportSheetType] = useState<ExportType>('workshop')
  const [pdfError, setPdfError] = useState('')

  const selectedCustomer =
    customers.find((customer) => customer.id === selectedCustomerId) || null

  const matchingCustomers = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase()
    return customers.filter((customer) =>
      customer.name.toLocaleLowerCase().includes(query),
    )
  }, [customers, searchTerm])

  const calculationResults = useMemo(
    () => records.map((record) => record.result),
    [records],
  )

  const projects = useMemo(() => {
    const uniqueProjects = new Map<string, BackendProject>()
    records.forEach((record) => uniqueProjects.set(record.project.id, record.project))
    return Array.from(uniqueProjects.values())
  }, [records])

  const singleProject = projects.length === 1 ? projects[0] : undefined
  const showMeshColumn = records.some((record) =>
    Boolean(getMeshPanel(record.result)),
  )
  const showMullionColumn = records.some((record) => {
    const mullionLength =
      record.result.mullionMM ?? record.result.frame.mullionCutMM
    return mullionLength !== undefined && mullionLength > 0
  })

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const visibleRecords = records.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  )
  const firstVisibleRecord = records.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastVisibleRecord = Math.min(page * PAGE_SIZE, records.length)

  useEffect(() => {
    let cancelled = false

    const loadCustomers = async () => {
      setLoadingCustomers(true)
      setCustomerError('')

      try {
        const response = await authFetch(apiUrl('/customers/?include_inactive=true'))
        const loadedCustomers = await readJson<Customer[]>(response)

        if (!Array.isArray(loadedCustomers)) {
          throw new Error('The customer API returned an invalid response.')
        }

        let nextCustomer = loadedCustomers.find(
          (customer) => customer.id === selectedCustomerIdRef.current,
        )

        if (initialProjectId && !initialProjectResolvedRef.current) {
          const projectResponse = await authFetch(
            apiUrl(`/projects/${encodeURIComponent(initialProjectId)}`),
          )
          const project = await readJson<BackendProject>(projectResponse)
          nextCustomer = loadedCustomers.find(
            (customer) => customer.id === project.customer_id,
          )

          if (!nextCustomer) {
            throw new Error(
              'The selected project is not linked to an available customer.',
            )
          }

          initialProjectResolvedRef.current = true
        }

        if (cancelled) return

        setCustomers(loadedCustomers)
        const nextId = nextCustomer?.id || ''
        selectedCustomerIdRef.current = nextId
        setSelectedCustomerId(nextId)
      } catch (error) {
        if (!cancelled) setCustomerError(getErrorMessage(error))
      } finally {
        if (!cancelled) setLoadingCustomers(false)
      }
    }

    void loadCustomers()
    return () => {
      cancelled = true
    }
  }, [initialProjectId, refreshKey])

  useEffect(() => {
    if (!selectedCustomer) return

    let cancelled = false

    const loadCustomerRecords = async () => {
      setLoadingRecords(true)
      setRecords([])
      setRecordsError('')
      setPdfError('')
      setPage(1)
      setViewIndex(null)

      try {
        const projectsResponse = await authFetch(
          apiUrl(`/projects/?customer_id=${encodeURIComponent(selectedCustomer.id)}`),
        )
        const customerProjects = await readJson<BackendProject[]>(
          projectsResponse,
        )

        if (!Array.isArray(customerProjects)) {
          throw new Error('The project API returned an invalid response.')
        }

        const projectMeasurements = await Promise.all(
          customerProjects.map(async (project) => {
            const [response, projectFormulas] = await Promise.all([
              authFetch(
                apiUrl(`/projects/${encodeURIComponent(project.id)}/measurements/`),
              ),
              fetchProjectFormulas(project.id, selectedCustomer.id),
            ])
            const measurements = await readJson<BackendMeasurement[]>(response)

            if (!Array.isArray(measurements)) {
              throw new Error(
                `Measurements for project ${project.name} are invalid.`,
              )
            }

            return { project, measurements, projectFormulas }
          }),
        )

        const loadedRecords: DrawingRecord[] = []

        for (const { project, measurements, projectFormulas } of projectMeasurements) {
          const unit = project.input_unit || 'in'
          const rows = measurements.map((measurement, index) =>
            mapMeasurementToRow(measurement, project, index),
          )
          const labels = resolveWindowLabels(rows, unit, projectFormulas)
          const results = convertMeasurementsToCalculationResults(
            rows,
            labels.map((item) => item.label),
            projectFormulas,
            unit,
          )

          for (const result of results) {
            const rowIndex = Number(result.id) - 1
            const measurement = measurements[rowIndex]
            const row = rows[rowIndex]
            if (!measurement || !row || !row.modelId) continue

            const height = Number(row.height)
            const width = Number(row.width)
            if (!Number.isFinite(height) || height <= 0) continue
            if (!Number.isFinite(width) || width <= 0) continue

            loadedRecords.push({
              project,
              measurement,
              result,
              windowLabel:
                result.input.windowLabel ||
                labels[rowIndex]?.label ||
                `W${measurement.row_order}`,
            })
          }
        }

        if (!cancelled) setRecords(loadedRecords)
      } catch (error) {
        if (!cancelled) {
          setRecords([])
          setRecordsError(getErrorMessage(error))
        }
      } finally {
        if (!cancelled) setLoadingRecords(false)
      }
    }

    void loadCustomerRecords()
    return () => {
      cancelled = true
    }
  }, [selectedCustomer, refreshKey])

  const selectCustomer = (customer: Customer) => {
    selectedCustomerIdRef.current = customer.id
    setSelectedCustomerId(customer.id)
    setPage(1)
  }

  const getPdfOptions = (project?: BackendProject) => ({
    customerName: selectedCustomer?.name || '',
    customerPhone: selectedCustomer?.phone || '',
    customerSerial: selectedCustomer?.serial_number || '',
    projectName: project?.name || '',
    projectSerial: project?.serial_number || '',
    date: new Date().toLocaleDateString('en-GB'),
    isTamil,
  })

  const downloadPdf = (
    type: ExportType,
    results: CalculationResult[],
    project?: BackendProject,
  ) => {
    if (!selectedCustomer || results.length === 0) return

    setPdfError('')

    try {
      const doc =
        type === 'workshop'
          ? generateWorkshopOrderPDF(results, getPdfOptions(project))
          : generateGlassFactoryOrderPDF(results, getPdfOptions(project))
      const customerSlug = selectedCustomer.name
        .trim()
        .replace(/[^a-z0-9]+/gi, '_')
      const date = new Date().toISOString().slice(0, 10)
      const fileName =
        type === 'workshop'
          ? `LS_Interiors_Workshop_${customerSlug}_${date}.pdf`
          : `LS_Interiors_Glass_Factory_${customerSlug}_${date}.pdf`

      doc.save(fileName)
    } catch (error) {
      setPdfError(`Unable to generate the PDF: ${getErrorMessage(error)}`)
    }
  }

  const openExportModal = (type: ExportType) => {
    setExportSheetType(type)
    setIsExportModalOpen(true)
  }

  const startView = (index: number) => {
    setViewIndex(index)
    setPage(Math.floor(index / PAGE_SIZE) + 1)
  }

  return (
    <div className="drawings-workspace">
      <header className="drawings-page-heading">
        <FileSpreadsheet aria-hidden="true" size={34} />
        <div>
          <h2>{isTamil ? 'வரைபடங்கள் & PDF' : 'Drawings & PDFs'}</h2>
          <p>
            {isTamil
              ? 'உங்கள் சாளர வரைபடங்கள் மற்றும் தயாரிப்பு ஆவணங்களைப் பார்க்கவும் பதிவிறக்கவும்.'
              : 'View and download your window drawings and fabrication documents.'}
          </p>
        </div>
      </header>

      <section
        className="drawings-customer-search"
        aria-label="Customer search and selection"
      >
        <div className="drawings-search-input">
          <Search aria-hidden="true" size={19} />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={
              isTamil
                ? 'வாடிக்கையாளர் பெயரில் தேடவும்...'
                : 'Search by Customer Name...'
            }
            aria-label={
              isTamil ? 'வாடிக்கையாளர் பெயரில் தேடவும்' : 'Search by Customer Name'
            }
            aria-controls="drawings-customer-results"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className="drawings-refresh-button"
          onClick={() => setRefreshKey((current) => current + 1)}
          disabled={loadingCustomers || loadingRecords}
        >
          <RefreshCw aria-hidden="true" size={17} />
          {isTamil ? 'புதுப்பி' : 'Refresh'}
        </button>

        <div
          className="drawings-customer-results"
          id="drawings-customer-results"
          role="group"
          aria-label={isTamil ? 'வாடிக்கையாளர் பட்டியல்' : 'Customer list'}
        >
          {loadingCustomers ? (
            <p>
              {isTamil
                ? 'வாடிக்கையாளர்கள் ஏற்றப்படுகின்றனர்...'
                : 'Loading customers...'}
            </p>
          ) : matchingCustomers.length > 0 ? (
            matchingCustomers.map((customer) => (
              <button
                type="button"
                aria-pressed={customer.id === selectedCustomerId}
                key={customer.id}
                onClick={() => selectCustomer(customer)}
              >
                <span>{customer.name}</span>
                <small>
                  {[customer.phone, customer.serial_number]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </button>
            ))
          ) : (
            <p>
              {customerError
                ? isTamil
                  ? 'வாடிக்கையாளர்களைக் காட்ட முடியவில்லை.'
                  : 'Unable to display customers.'
                : isTamil
                  ? 'இந்தப் பெயருடன் வாடிக்கையாளர்கள் இல்லை.'
                  : 'No customers match this name.'}
            </p>
          )}
        </div>
      </section>

      {customerError && (
        <p className="drawings-error" role="alert">
          {isTamil ? 'வாடிக்கையாளர்களை ஏற்ற முடியவில்லை: ' : 'Unable to load customers: '}
          {customerError}
        </p>
      )}

      {selectedCustomer && (
        <section
          className="drawings-customer-summary"
          aria-label={isTamil ? 'தேர்ந்தெடுக்கப்பட்ட வாடிக்கையாளர்' : 'Selected customer'}
        >
          <UserRound aria-hidden="true" size={27} />
          <span>
            {isTamil ? 'வாடிக்கையாளர்:' : 'Customer:'} <strong>{selectedCustomer.name}</strong>
          </span>
          <span className="drawings-summary-divider" aria-hidden="true" />
          <span>
            <strong>{isTamil ? 'தொலைபேசி:' : 'Phone:'}</strong> {selectedCustomer.phone || ''}
          </span>
          <span className="drawings-summary-divider" aria-hidden="true" />
          <span>
            <strong>{isTamil ? 'வரிசை எண்:' : 'Serial No:'}</strong>{' '}
            {selectedCustomer.serial_number || ''}
          </span>
        </section>
      )}

      {recordsError && (
        <p className="drawings-error" role="alert">
          {isTamil ? 'சேமித்த அளவீடுகளை ஏற்ற முடியவில்லை: ' : 'Unable to load saved measurements: '}
          {recordsError}
        </p>
      )}

      {selectedCustomer && (
        <>
          <section className="drawings-records-card">
            <div className="drawings-table-scroll">
              <table className="drawings-records-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">{isTamil ? 'ஜன்னல் எண்' : 'Window Number'}</th>
                    <th scope="col">{isTamil ? 'மாடல் பெயர்' : 'Model Name'}</th>
                    <th scope="col">{isTamil ? 'மாடல் வகை' : 'Model Type'}</th>
                    <th scope="col">{isTamil ? 'அகலம் (mm)' : 'Width (mm)'}</th>
                    <th scope="col">{isTamil ? 'உயரம் (mm)' : 'Height (mm)'}</th>
                    {showMeshColumn && <th scope="col">{isTamil ? 'கொசு வலை' : 'Mesh'}</th>}
                    {showMullionColumn && <th scope="col">{isTamil ? 'முல்லியன்' : 'Mullion'}</th>}
                    <th scope="col">{isTamil ? 'கண்ணாடி வகை' : 'Glass Type'}</th>
                    <th scope="col">{isTamil ? 'நிலை' : 'Status'}</th>
                    <th scope="col">{isTamil ? 'செயல்கள்' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRecords ? (
                    <tr>
                      <td
                        colSpan={
                          9 +
                          Number(showMeshColumn) +
                          Number(showMullionColumn)
                        }
                        className="drawings-table-message"
                      >
                        {isTamil
                          ? 'வாடிக்கையாளர் அளவீடுகள் ஏற்றப்படுகின்றன...'
                          : 'Loading customer measurements...'}
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          9 +
                          Number(showMeshColumn) +
                          Number(showMullionColumn)
                        }
                        className="drawings-table-message"
                      >
                        {isTamil
                          ? 'இந்த வாடிக்கையாளருக்கு சேமித்த ஜன்னல் அளவீடுகள் இல்லை.'
                          : 'No saved window measurements found for this customer.'}
                      </td>
                    </tr>
                  ) : (
                    visibleRecords.map((record, visibleIndex) => {
                      const recordIndex = (page - 1) * PAGE_SIZE + visibleIndex
                      const model = WINDOW_MODELS.find(
                        (item) => item.id === record.result.input.modelId,
                      )
                      const unit = record.project.input_unit || 'in'
                      const unitForConversion =
                        unit === 'in' ? 'inches' : unit
                      const height = Number(record.measurement.height)
                      const width = Number(record.measurement.width)
                      const heightMm = convertToMm(
                        height,
                        unitForConversion,
                      )
                      const widthMm = convertToMm(
                        width,
                        unitForConversion,
                      )
                      const mesh = getMeshPanel(record.result)
                      const mullion =
                        record.result.mullionMM ??
                        record.result.frame.mullionCutMM

                      return (
                        <tr key={record.measurement.id}>
                          <td>{recordIndex + 1}</td>
                          <td>{record.windowLabel}</td>
                          <td>{model?.name || record.result.ruleProfileName}</td>
                          <td>
                            <span>
                              {getModelType(record.result.input.modelId || '')}
                            </span>
                            {model?.shortCode && (
                              <small className="drawings-model-code">
                                {model.shortCode}
                              </small>
                            )}
                          </td>
                          <td>{widthMm || ''}</td>
                          <td>{heightMm || ''}</td>
                          {showMeshColumn && (
                            <td>
                              {mesh
                                ? `${mesh.heightMM} × ${mesh.widthMM}`
                                : ''}
                            </td>
                          )}
                          {showMullionColumn && (
                            <td>
                              {mullion !== undefined && mullion > 0
                                ? mullion
                                : ''}
                            </td>
                          )}
                          <td>{record.measurement.glass_type || ''}</td>
                          <td>
                            <span
                              className={`drawings-status ${getStatusClass(
                                record.measurement.status,
                              )}`}
                            >
                              {getStatusLabel(record.measurement.status, isTamil)}
                            </span>
                          </td>
                          <td>
                            <div className="drawings-row-actions">
                              <button
                                type="button"
                                className="drawings-row-button"
                                onClick={() => startView(recordIndex)}
                                aria-label={
                                  isTamil
                                    ? `${record.windowLabel} பார்க்கவும்`
                                    : `View ${record.windowLabel}`
                                }
                              >
                                <Eye aria-hidden="true" size={15} />
                                {isTamil ? 'பார்க்க' : 'View'}
                              </button>
                              <button
                                type="button"
                                className="drawings-row-button"
                                onClick={() =>
                                  downloadPdf('workshop', [record.result], record.project)
                                }
                                aria-label={
                                  isTamil
                                    ? `${record.windowLabel} பட்டறை PDF பதிவிறக்கு`
                                    : `Download workshop PDF for ${record.windowLabel}`
                                }
                              >
                                <Download aria-hidden="true" size={15} />
                                PDF
                              </button>
                              {onOpenMeasurements && (
                                <button
                                  type="button"
                                  className="drawings-row-button edit"
                                  onClick={() =>
                                    onOpenMeasurements(
                                      record.project.id,
                                      selectedCustomer,
                                    )
                                  }
                                  aria-label={
                                    isTamil
                                      ? `${record.windowLabel} அளவீடுகளைத் திருத்து`
                                      : `Edit ${record.windowLabel} measurements`
                                  }
                                >
                                  {isTamil ? 'திருத்து' : 'Edit'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <footer className="drawings-table-footer">
              <span>
                {isTamil
                  ? `${records.length} பதிவுகளில் ${firstVisibleRecord} முதல் ${lastVisibleRecord} வரை`
                  : `Showing ${firstVisibleRecord} to ${lastVisibleRecord} of ${records.length} entries`}
              </span>
              <div
                className="drawings-pagination"
                aria-label={isTamil ? 'பக்க வழிசெலுத்தல்' : 'Table pagination'}
              >
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  aria-label={isTamil ? 'முந்தைய பக்கம்' : 'Previous page'}
                >
                  ‹
                </button>
                <span aria-current="page">{page}</span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={page >= totalPages}
                  aria-label={isTamil ? 'அடுத்த பக்கம்' : 'Next page'}
                >
                  ›
                </button>
              </div>
            </footer>
          </section>

          {pdfError && (
            <p className="drawings-error" role="alert">
              {pdfError}
            </p>
          )}

          <section className="drawings-download-sections">
            <article className="drawings-download-card">
              <FileSpreadsheet aria-hidden="true" size={48} />
              <div className="drawings-download-content">
                <h3>{isTamil ? 'பட்டறை PDF' : 'Workshop PDF'}</h3>
                <p>
                  {isTamil
                    ? 'முழு விவரங்களுடன் பட்டறை ஆர்டர் பதிவிறக்கு'
                    : 'Download workshop order with full details'}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadPdf('workshop', calculationResults, singleProject)
                  }
                  disabled={records.length === 0 || loadingRecords}
                >
                  <Download aria-hidden="true" size={17} />
                  {isTamil ? 'பட்டறை PDF பதிவிறக்கு' : 'Download Workshop PDF'}
                </button>
              </div>
            </article>
            <article className="drawings-download-card">
              <Glasses aria-hidden="true" size={48} />
              <div className="drawings-download-content">
                <h3>{isTamil ? 'கிளாஸ் தொழிற்சாலை PDF' : 'Glass Factory PDF'}</h3>
                <p>
                  {isTamil
                    ? 'கண்ணாடி விவரக்குறிப்பு பதிவிறக்கு'
                    : 'Download glass specification'}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadPdf('glass', calculationResults, singleProject)
                  }
                  disabled={records.length === 0 || loadingRecords}
                >
                  <Download aria-hidden="true" size={17} />
                  {isTamil ? 'கிளாஸ் PDF பதிவிறக்கு' : 'Download Glass Factory PDF'}
                </button>
              </div>
            </article>
          </section>
        </>
      )}

      {viewIndex !== null && calculationResults[viewIndex] && (
        <section className="drawings-cad-view">
          <div className="drawings-cad-heading">
            <h3>
              {isTamil ? 'ஜன்னல் வரைபடம்:' : 'Window drawing:'}{' '}
              {records[viewIndex]?.windowLabel || ''}
            </h3>
            <button type="button" onClick={() => setViewIndex(null)}>
              {isTamil ? 'ஜன்னல்களுக்குத் திரும்பு' : 'Back to windows'}
            </button>
          </div>
          <WindowVisualizer2D
            results={calculationResults}
            selectedIndex={viewIndex}
            onSelectIndex={setViewIndex}
            language={language}
            projectName={singleProject?.name || ''}
            customerSerial={selectedCustomer?.serial_number || ''}
            customerName={selectedCustomer?.name || ''}
            onExportPDF={() => openExportModal('workshop')}
            onExportGlassPDF={() => openExportModal('glass')}
          />
        </section>
      )}

      {isExportModalOpen && selectedCustomer && (
        <A4FabricationModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          results={calculationResults}
          initialSheetType={exportSheetType}
          language={language}
          initialCustomerName={selectedCustomer.name}
          initialCustomerPhone={selectedCustomer.phone || ''}
          customerSerial={selectedCustomer.serial_number || ''}
          projectName={singleProject?.name || ''}
          projectSerial={singleProject?.serial_number || ''}
        />
      )}
    </div>
  )
}
