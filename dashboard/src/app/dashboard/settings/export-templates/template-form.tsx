'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { InlineErrorState } from '@/components/ui/inline-error-state'
import { exportTemplatesApi, getApiErrorMessage } from '@/lib/api'
import type {
  ColumnGroup,
  ExportTemplate,
  TemplateColumn,
} from '@/lib/types'

// ── Auto-suggest mapping for CSV import ────────────────────────────────────

const FUZZY_MAP: Record<string, string> = {
  'order': 'order_id', 'order no': 'order_id', 'order number': 'order_id',
  'order id': 'order_id', 'order #': 'order_id', 'mã đơn': 'order_id',
  'date': 'order_date', 'order date': 'order_date', 'created': 'order_date', 'ngày': 'order_date',
  'customer': 'customer_name', 'name': 'customer_name', 'full name': 'customer_name',
  'recipient': 'customer_name', 'receiver': 'customer_name', 'consignee': 'customer_name',
  'người nhận': 'customer_name',
  'email': 'customer_email',
  'phone': 'customer_phone', 'mobile': 'customer_phone', 'tel': 'customer_phone',
  'số điện thoại': 'customer_phone', 'sdt': 'customer_phone',
  'tracking': 'tracking_number', 'awb': 'tracking_number', 'waybill': 'tracking_number',
  'mã vận đơn': 'tracking_number', 'vận đơn': 'tracking_number',
  'carrier': 'tracking_carrier', 'courier': 'tracking_carrier', 'shipper': 'tracking_carrier',
  'total': 'total_amount', 'amount': 'total_amount', 'price': 'total_amount',
  'tổng': 'total_amount', 'tổng tiền': 'total_amount',
  'item': 'item_name', 'product': 'item_name', 'goods': 'item_name', 'sản phẩm': 'item_name',
  'sku': 'item_sku', 'mã sp': 'item_sku',
  'qty': 'item_qty', 'quantity': 'item_qty', 'sl': 'item_qty', 'số lượng': 'item_qty',
  'address': 'shipping_address1', 'địa chỉ': 'shipping_address1',
  'city': 'shipping_city', 'district': 'shipping_city', 'thành phố': 'shipping_city',
  'postcode': 'shipping_postcode', 'zip': 'shipping_postcode', 'mã bưu chính': 'shipping_postcode',
  'country': 'shipping_country', 'quốc gia': 'shipping_country',
}

function suggestColumnKey(csvHeader: string): string | null {
  return FUZZY_MAP[csvHeader.toLowerCase().trim()] ?? null
}

function parseCsvHeaders(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0] || ''
  // Handle quoted headers
  const headers: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i]
    if (ch === '"') { inQuote = !inQuote }
    else if ((ch === ',' || ch === '\t') && !inQuote) { headers.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  if (cur.trim()) headers.push(cur.trim())
  return headers.filter(Boolean)
}

// ── Main Form Component ─────────────────────────────────────────────────────

interface FormPageProps {
  existingTemplate?: ExportTemplate
  columnGroups: ColumnGroup[]
}

function TemplateFormInner({ existingTemplate, columnGroups }: FormPageProps) {
  const router = useRouter()

  // Build a flat map of all available column keys → labels
  const allColumns = useMemo(() =>
    columnGroups.flatMap(g => g.columns),
    [columnGroups]
  )

  const [tab, setTab] = useState<'manual' | 'import'>('manual')
  const [name, setName] = useState(existingTemplate?.name ?? '')
  const [description, setDescription] = useState(existingTemplate?.description ?? '')
  const [selected, setSelected] = useState<TemplateColumn[]>(existingTemplate?.columns ?? [])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(columnGroups.map(g => g.group)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- CSV Import state ---
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({}) // header → order key or ''
  const [csvLabels, setCsvLabels] = useState<Record<string, string>>({})   // header → custom label
  const [csvStep, setCsvStep] = useState<1 | 2 | 3>(1)
  const [importTemplateName, setImportTemplateName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // --- Drag-and-drop state ---
  const dragIndex = useRef<number | null>(null)

  // Set of selected keys for quick lookup
  const selectedKeys = useMemo(() =>
    new Set(selected.filter(c => c.type === 'order_field').map(c => c.key!)),
    [selected]
  )

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(group) ? next.delete(group) : next.add(group)
      return next
    })
  }

  const toggleColumn = (key: string, label: string) => {
    if (selectedKeys.has(key)) {
      setSelected(prev => prev.filter(c => !(c.type === 'order_field' && c.key === key)))
    } else {
      setSelected(prev => [...prev, { type: 'order_field', key, label }])
    }
  }

  const addCustomColumn = () => {
    setSelected(prev => [...prev, { type: 'custom', label: '', default_value: '' }])
  }

  const removeSelected = (index: number) => {
    setSelected(prev => prev.filter((_, i) => i !== index))
  }

  const updateLabel = (index: number, label: string) => {
    setSelected(prev => prev.map((c, i) => i === index ? { ...c, label } : c))
  }

  const updateDefaultValue = (index: number, defaultValue: string) => {
    setSelected(prev => prev.map((c, i) => i === index ? { ...c, default_value: defaultValue } : c))
  }

  // Drag-and-drop
  const handleDragStart = (index: number) => { dragIndex.current = index }
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex.current === null || dragIndex.current === index) return
    const next = [...selected]
    const [item] = next.splice(dragIndex.current, 1)
    next.splice(index, 0, item)
    dragIndex.current = index
    setSelected(next)
  }

  // CSV Import handlers
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const processFile = (file: File) => {
    setImportTemplateName(file.name.replace(/\.[^.]+$/, ''))
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const headers = parseCsvHeaders(text)
      setCsvHeaders(headers)
      // Auto-suggest mapping
      const mapping: Record<string, string> = {}
      const labels: Record<string, string> = {}
      headers.forEach(h => {
        mapping[h] = suggestColumnKey(h) ?? ''
        labels[h] = h // keep original CSV header as label
      })
      setCsvMapping(mapping)
      setCsvLabels(labels)
      setCsvStep(2)
    }
    reader.readAsText(file)
  }

  const applyImport = () => {
    const cols: TemplateColumn[] = csvHeaders
      .filter(h => csvMapping[h]) // skip ignored
      .map(h => ({
        type: 'order_field' as const,
        key: csvMapping[h],
        label: csvLabels[h] || h,
      }))
    setSelected(cols)
    setName(importTemplateName)
    setCsvStep(3)
    setTab('manual') // Switch to manual to confirm and save
  }

  // Save
  const handleSave = async () => {
    setError(null)
    if (!name.trim()) { setError('Template name is required.'); return }
    if (selected.length === 0) { setError('Add at least one column.'); return }
    const hasOrderField = selected.some(c => c.type === 'order_field')
    if (!hasOrderField) { setError('At least one order field column is required.'); return }
    const emptyLabel = selected.findIndex(c => !c.label.trim())
    if (emptyLabel !== -1) { setError(`Column ${emptyLabel + 1}: label is required.`); return }

    setSaving(true)
    try {
      if (existingTemplate) {
        await exportTemplatesApi.update(existingTemplate.id, { name, description, columns: selected })
      } else {
        await exportTemplatesApi.create({ name, description, columns: selected })
      }
      router.push('/dashboard/settings/export-templates')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save template.'))
    } finally {
      setSaving(false)
    }
  }

  const previewHeader = selected.map(c => c.label || `(${c.type === 'order_field' ? c.key : 'custom'})`).join(' | ')

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      {!existingTemplate && (
        <div className="flex w-fit gap-1 rounded-xl border border-app-line bg-slate-100 p-1 shadow-sm">
          <button
            type="button"
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'manual' ? 'bg-white text-app-strong shadow-sm' : 'text-app-muted hover:text-app-strong'}`}
            onClick={() => setTab('manual')}
          >
            Manual Setup
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'import' ? 'bg-white text-app-strong shadow-sm' : 'text-app-muted hover:text-app-strong'}`}
            onClick={() => setTab('import')}
          >
            Import from CSV
          </button>
        </div>
      )}

      {error && <InlineErrorState body={error} compact />}

      {/* ── Tab: Import from CSV ── */}
      {tab === 'import' && (
        <div className="space-y-4">
          {csvStep === 1 && (
            <div
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-8 py-14 text-center shadow-sm"
              onDragOver={e => e.preventDefault()}
              onDrop={handleFileDrop}
            >
              <Upload className="mb-3 h-8 w-8 text-app-muted" />
              <p className="text-sm font-medium text-app-strong">Drop a CSV or TSV file here</p>
              <p className="mt-1 text-xs text-app-muted">Only the header row will be read — your data stays local.</p>
              <button
                type="button"
                className="btn-secondary mt-4 gap-2 text-sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Browse file
              </button>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {csvStep === 2 && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-app-line bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-2.5 text-left font-medium text-app-strong">CSV Header</th>
                      <th className="px-4 py-2.5 text-left font-medium text-app-strong">Maps to Order Column</th>
                      <th className="px-4 py-2.5 text-left font-medium text-app-strong">Label in export</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {csvHeaders.map(h => (
                      <tr key={h} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2 font-mono text-xs text-app-strong">{h}</td>
                        <td className="px-4 py-2">
                          <select
                            className="select text-xs w-full"
                            value={csvMapping[h]}
                            onChange={e => setCsvMapping(prev => ({ ...prev, [h]: e.target.value }))}
                          >
                            <option value="">— Ignore —</option>
                            {columnGroups.map(g => (
                              <optgroup key={g.group} label={g.group}>
                                {g.columns.map(c => (
                                  <option key={c.key} value={c.key}>{c.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            className="input text-xs w-full"
                            value={csvLabels[h]}
                            onChange={e => setCsvLabels(prev => ({ ...prev, [h]: e.target.value }))}
                            placeholder={h}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-app-muted mr-2">Template name:</span>
                  <input
                    type="text"
                    className="input text-sm"
                    value={importTemplateName}
                    onChange={e => setImportTemplateName(e.target.value)}
                    placeholder="Template name"
                  />
                </label>
                <button type="button" className="btn-secondary text-sm" onClick={() => setCsvStep(1)}>← Back</button>
                <button type="button" className="btn-primary text-sm gap-2" onClick={applyImport}>
                  Use This →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Manual Setup ── */}
      {tab === 'manual' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Column Pool */}
          <div className="overflow-hidden rounded-xl border border-app-line bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-app-muted">Available Columns</span>
              <button
                type="button"
                className="btn-secondary gap-1.5 text-xs"
                onClick={addCustomColumn}
                title="Add a custom column not tied to order data"
              >
                <Plus className="h-3.5 w-3.5" />
                Custom column
              </button>
            </div>
            <div className="max-h-[420px] divide-y divide-slate-200 overflow-y-auto">
              {columnGroups.map(g => (
                <div key={g.group}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-app-muted transition-colors hover:bg-slate-50"
                    onClick={() => toggleGroup(g.group)}
                  >
                    {expandedGroups.has(g.group)
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                    {g.group}
                    <span className="ml-auto text-[10px]">{g.columns.filter(c => selectedKeys.has(c.key)).length}/{g.columns.length}</span>
                  </button>
                  {expandedGroups.has(g.group) && (
                    <div className="bg-slate-50/70">
                      {g.columns.map(col => {
                        const checked = selectedKeys.has(col.key)
                        return (
                          <label
                            key={col.key}
                            className="flex cursor-pointer items-center gap-3 px-6 py-1.5 transition-colors hover:bg-white"
                          >
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={checked}
                              onChange={() => toggleColumn(col.key, col.label)}
                            />
                            <span className="text-sm text-app-strong">{col.label}</span>
                            <span className="ml-auto font-mono text-[10px] text-app-muted">{col.key}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Columns */}
          <div className="overflow-hidden rounded-xl border border-app-line bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-app-muted">
                Selected Columns ({selected.length})
              </span>
            </div>

            {selected.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-app-muted">
                Tick columns on the left to add them here.
              </div>
            ) : (
              <ul className="max-h-[420px] divide-y divide-slate-200 overflow-y-auto">
                {selected.map((col, index) => (
                  <li
                    key={index}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={e => handleDragOver(e, index)}
                    className="flex cursor-grab items-center gap-2 px-3 py-2 transition-colors hover:bg-slate-50/80 active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-app-muted" />

                    {/* Type badge */}
                    {col.type === 'custom' ? (
                      <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                        custom
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-[10px] text-app-muted w-24 truncate">{col.key}</span>
                    )}

                    {/* Label input */}
                    <input
                      type="text"
                      className="input flex-1 text-xs"
                      value={col.label}
                      onChange={e => updateLabel(index, e.target.value)}
                      placeholder={col.type === 'order_field' ? (allColumns.find(c => c.key === col.key)?.label ?? 'Label') : 'Column label'}
                    />

                    {/* Default value for custom */}
                    {col.type === 'custom' && (
                      <input
                        type="text"
                        className="input w-24 text-xs"
                        value={col.default_value ?? ''}
                        onChange={e => updateDefaultValue(index, e.target.value)}
                        placeholder="Default"
                        title="Static value for every row (leave empty for blank)"
                      />
                    )}

                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-app-muted hover:text-red-500 transition-colors"
                      onClick={() => removeSelected(index)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Preview */}
            {selected.length > 0 && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-app-muted mb-1">CSV header preview</p>
                <p className="text-xs text-app-strong font-mono truncate" title={previewHeader}>{previewHeader}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer form fields and actions */}
      {(tab === 'manual' || existingTemplate) && (
        <div className="space-y-4 rounded-xl border border-app-line bg-white px-4 py-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-app-strong">Template Name <span className="text-red-500">*</span></span>
              <input
                type="text"
                className="input w-full"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Logistics Export, Accounting Report"
                maxLength={100}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-app-strong">Description</span>
              <input
                type="text"
                className="input w-full"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </label>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <button
              type="button"
              className="btn-primary gap-2"
              disabled={saving}
              onClick={handleSave}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : existingTemplate ? 'Update Template' : 'Create Template'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => router.back()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page wrappers ───────────────────────────────────────────────────────────

function useFormData(templateId?: string) {
  const [columnGroups, setColumnGroups] = useState<ColumnGroup[]>([])
  const [template, setTemplate] = useState<ExportTemplate | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const promises: Promise<void>[] = [
      exportTemplatesApi.listColumns().then(r => setColumnGroups(r.data)).catch(() => {}),
    ]
    if (templateId) {
      promises.push(
        exportTemplatesApi.get(templateId).then(r => setTemplate(r.data)).catch(err => {
          setError(getApiErrorMessage(err, 'Template not found.'))
        })
      )
    }
    Promise.all(promises).finally(() => setLoading(false))
  }, [templateId])

  return { columnGroups, template, loading, error }
}

export function NewTemplatePage() {
  const { columnGroups, loading, error } = useFormData()

  if (loading) return <LoadingSpinner className="py-16" />
  if (error) return <InlineErrorState body={error} />

  return <TemplateFormInner columnGroups={columnGroups} />
}

export function EditTemplatePage({ templateId }: { templateId: string }) {
  const { columnGroups, template, loading, error } = useFormData(templateId)

  if (loading) return <LoadingSpinner className="py-16" />
  if (error) return <InlineErrorState body={error} />
  if (!template) return <InlineErrorState body="Template not found." />

  return <TemplateFormInner existingTemplate={template} columnGroups={columnGroups} />
}
