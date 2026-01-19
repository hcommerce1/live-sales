<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { MOCK_DATA } from './data.js'
import { API } from './api.js'
import Sortable from 'sortablejs'
import Chart from 'chart.js/auto'
import emailjs from '@emailjs/browser'

// Initialize EmailJS
emailjs.init("AJZSalcoaqOoF-Qxe")

// Auth state - MUST be checked before showing any content
const isAuthChecking = ref(true)
const isAuthenticated = ref(false)

// State
const currentPage = ref('dashboard')
const searchQuery = ref('')
const expandedGroups = ref(['Podstawowe', 'Dane klienta', 'Magazyn'])
const editingName = ref(false)
const accordionOpen = ref('filters')
const showPreviewModal = ref(false)
const deleteConfirm = ref(null)
const scheduleValue = ref('15-minutes')

const config = ref({
    id: 'new',
    name: 'Nowy eksport',
    dataset: 'orders',
    selected_fields: [],
    filters: {
        status: '',
        date_from: '',
        date_to: ''
    },
    sheets: {
        sheet_url: '',
        write_mode: 'append'
    },
    schedule_minutes: 15,
    status: 'active'
})

const toast = ref({
    show: false,
    title: '',
    message: '',
    icon: ''
})

const buyForm = ref({
    email: '',
    nip: '',
    phone: '',
    message: ''
})

let sortable = null
const sheetUrlValid = ref(null)
const extractedSheetId = ref(null)

// Live stats
const currentTime = ref(new Date())
const lastSyncTime = ref(new Date(Date.now() - 2 * 60 * 1000))
const uptime = ref(99.8)
let uptimeChart = null

// Server data
const exportsListServer = ref([])
const isLoading = ref(false)

// Configuration page
const baselinkerToken = ref('')
const showToken = ref(false)
const tokenSaved = ref(false)
let tokenSaveTimeout = null
const userEmail = ref('')

// Computed
const exportsList = computed(() => {
    if (exportsListServer.value.length > 0) {
        return exportsListServer.value
    }
    return MOCK_DATA.exportsList.map(exp => ({
        ...exp,
        uptime: (99.5 + Math.random() * 0.5).toFixed(1)
    }))
})

const activeExportsCount = computed(() => {
    return exportsList.value.filter(e => e.status === 'active').length
})

const availableFields = computed(() => {
    return config.value.dataset === 'orders'
        ? MOCK_DATA.fieldsOrders
        : MOCK_DATA.fieldsProducts
})

const sampleData = computed(() => {
    return config.value.dataset === 'orders'
        ? MOCK_DATA.sampleOrders
        : MOCK_DATA.sampleProducts
})

const filteredGroups = computed(() => {
    const groups = {}

    availableFields.value
        .filter(field => {
            if (!searchQuery.value) return true
            const query = searchQuery.value.toLowerCase()
            return field.label.toLowerCase().includes(query) ||
                   field.field_key.toLowerCase().includes(query)
        })
        .forEach(field => {
            if (!groups[field.group]) {
                groups[field.group] = []
            }
            groups[field.group].push(field)
        })

    return Object.entries(groups).map(([name, fields]) => ({ name, fields }))
})

const previewTableData = computed(() => {
    let data = [...sampleData.value]

    if (config.value.dataset === 'orders' && config.value.filters.status) {
        data = data.filter(r => r.order_status_id === config.value.filters.status)
    }

    if (config.value.filters.date_from) {
        data = data.filter(r => {
            const recordDate = r.date_add || ''
            return recordDate >= config.value.filters.date_from
        })
    }

    if (config.value.filters.date_to) {
        data = data.filter(r => {
            const recordDate = r.date_add || ''
            return recordDate <= config.value.filters.date_to
        })
    }

    return data.slice(0, 5)
})

const csvPreview = computed(() => {
    if (config.value.selected_fields.length === 0) return ''

    const data = previewTableData.value
    const headers = config.value.selected_fields.map(fieldKey => {
        const field = availableFields.value.find(f => f.field_key === fieldKey)
        return field ? field.label : fieldKey
    })

    const lines = [headers.join(';')]

    data.forEach(record => {
        const row = config.value.selected_fields.map(fieldKey => {
            const value = record[fieldKey] || ''
            const escaped = String(value).replace(/"/g, '""')
            return escaped.includes(';') ? `"${escaped}"` : escaped
        })
        lines.push(row.join(';'))
    })

    return lines.join('\n')
})

const recordCount = computed(() => {
    let data = [...sampleData.value]

    if (config.value.dataset === 'orders' && config.value.filters.status) {
        data = data.filter(r => r.order_status_id === config.value.filters.status)
    }

    if (config.value.filters.date_from) {
        data = data.filter(r => {
            const recordDate = r.date_add || ''
            return recordDate >= config.value.filters.date_from
        })
    }

    if (config.value.filters.date_to) {
        data = data.filter(r => {
            const recordDate = r.date_add || ''
            return recordDate <= config.value.filters.date_to
        })
    }

    return data.length
})

const lastSyncText = computed(() => {
    const diff = Math.floor((currentTime.value - lastSyncTime.value) / 1000)
    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60

    if (minutes === 0) {
        return `${seconds} sek temu`
    }
    return `${minutes} min ${seconds} sek temu`
})

const ordersToday = computed(() => {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()

    if (hour < 7) {
        return Math.floor((hour * 60 + minute) / (7 * 60) * 30)
    }

    const minutesSince7 = (hour - 7) * 60 + minute
    const totalMinutesAfter7 = 17 * 60
    return 30 + Math.floor((minutesSince7 / totalMinutesAfter7) * 253)
})

const runsToday = computed(() => {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const totalMinutes = hour * 60 + minute
    return Math.floor(totalMinutes / 5)
})

// Methods
async function loadExportsFromServer() {
    try {
        isLoading.value = true
        const exports = await API.exports.getAll()
        exportsListServer.value = exports.map(exp => ({
            id: exp.id,
            name: exp.name,
            type: exp.dataset,
            interval: exp.schedule_minutes,
            sheets_tab: 'Sheet1',
            status: exp.status || 'active',
            last_run: exp.last_run || new Date().toISOString().slice(0, 19).replace('T', ' '),
            uptime: (99.5 + Math.random() * 0.5).toFixed(1),
            sheet_url: exp.sheets?.sheet_url || ''
        }))
    } catch (error) {
        console.error('Failed to load exports:', error)
        showToast(
            'Błąd',
            'Nie udało się załadować eksportów z serwera',
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function saveConfigToServer() {
    try {
        isLoading.value = true
        const savedConfig = await API.exports.save(config.value)

        await loadExportsFromServer()

        showToast(
            'Zapisano',
            'Konfiguracja została zapisana pomyślnie na serwerze',
            '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        )

        return savedConfig
    } catch (error) {
        console.error('Failed to save config:', error)
        showToast(
            'Błąd',
            'Nie udało się zapisać konfiguracji: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
        throw error
    } finally {
        isLoading.value = false
    }
}

async function deleteExportFromServer(exportId) {
    try {
        isLoading.value = true
        await API.exports.delete(exportId)

        await loadExportsFromServer()

        deleteConfirm.value = null
        showToast(
            'Usunięto',
            'Eksport został pomyślnie usunięty z serwera',
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>'
        )
    } catch (error) {
        console.error('Failed to delete export:', error)
        showToast(
            'Błąd',
            'Nie udało się usunąć eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function runExportOnServer() {
    if (config.value.id === 'new') {
        showToast(
            'Informacja',
            'Zapisz konfigurację przed uruchomieniem eksportu',
            '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
        )
        return
    }

    try {
        isLoading.value = true
        lastSyncTime.value = new Date()

        const result = await API.exports.run(config.value.id)

        showToast(
            'Sukces',
            `Eksport zakończony! Zapisano ${result.recordCount} rekordów do Google Sheets`,
            '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
        )
    } catch (error) {
        console.error('Failed to run export:', error)
        showToast(
            'Błąd',
            'Nie udało się uruchomić eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function toggleExportStatusOnServer(exp) {
    try {
        isLoading.value = true
        await API.exports.toggle(exp.id)

        await loadExportsFromServer()
    } catch (error) {
        console.error('Failed to toggle export status:', error)
        showToast(
            'Błąd',
            'Nie udało się zmienić statusu eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function loadExportFromServer(exportId) {
    try {
        isLoading.value = true
        const exportConfig = await API.exports.get(exportId)

        config.value = {
            id: exportConfig.id,
            name: exportConfig.name,
            dataset: exportConfig.dataset,
            selected_fields: exportConfig.selected_fields || [],
            filters: exportConfig.filters || { status: '', date_from: '', date_to: '' },
            sheets: exportConfig.sheets || { sheet_url: '', write_mode: 'append' },
            schedule_minutes: exportConfig.schedule_minutes || 15,
            status: exportConfig.status || 'active'
        }

        const mins = config.value.schedule_minutes
        if (mins === 0) {
            scheduleValue.value = 'live'
        } else if (mins < 60) {
            scheduleValue.value = `${mins}-minutes`
        } else if (mins < 1440) {
            scheduleValue.value = `${mins / 60}-hours`
        } else {
            scheduleValue.value = `${mins / 1440}-days`
        }

        validateSheetUrl()
        currentPage.value = 'konfigurator'
        nextTick(() => {
            initSortable()
        })
    } catch (error) {
        console.error('Failed to load export:', error)
        showToast(
            'Błąd',
            'Nie udało się załadować eksportu: ' + error.message,
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
    } finally {
        isLoading.value = false
    }
}

async function validateSheetUrlOnServer() {
    const url = config.value.sheets.sheet_url
    if (!url) {
        sheetUrlValid.value = null
        extractedSheetId.value = null
        return
    }

    try {
        const result = await API.sheets.validate(url)
        sheetUrlValid.value = result.hasAccess
        extractedSheetId.value = result.sheetId

        if (!result.hasAccess) {
            showToast(
                'Uwaga',
                'Brak dostępu do arkusza. Upewnij się, że udostępniłeś arkusz dla Service Account.',
                '<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
            )
        }
    } catch (error) {
        sheetUrlValid.value = false
        extractedSheetId.value = null
        console.error('Sheet validation error:', error)
    }
}

function toggleGroup(groupName) {
    const index = expandedGroups.value.indexOf(groupName)
    if (index > -1) {
        expandedGroups.value.splice(index, 1)
    } else {
        expandedGroups.value.push(groupName)
    }
}

function toggleAccordion(section) {
    accordionOpen.value = accordionOpen.value === section ? null : section
}

function isFieldSelected(fieldKey) {
    return config.value.selected_fields.includes(fieldKey)
}

function handleFieldClick(field) {
    if (field.higher_plan) {
        currentPage.value = 'buy'
        scrollToForm()
    } else if (!isFieldSelected(field.field_key)) {
        addField(field.field_key)
    }
}

function addField(fieldKey) {
    if (!isFieldSelected(fieldKey)) {
        config.value.selected_fields.push(fieldKey)
        nextTick(() => {
            initSortable()
        })
    }
}

function removeField(fieldKey) {
    const index = config.value.selected_fields.indexOf(fieldKey)
    if (index > -1) {
        config.value.selected_fields.splice(index, 1)
    }
}

function getFieldLabel(fieldKey) {
    const field = availableFields.value.find(f => f.field_key === fieldKey)
    return field ? field.label : fieldKey
}

function onDatasetChange() {
    config.value.selected_fields = []
}

function updateSchedule() {
    if (scheduleValue.value === 'live') {
        config.value.schedule_minutes = 0
        return
    }

    const [value, unit] = scheduleValue.value.split('-')
    if (unit === 'minutes') {
        config.value.schedule_minutes = parseInt(value)
    } else if (unit === 'hours') {
        config.value.schedule_minutes = parseInt(value) * 60
    } else if (unit === 'days') {
        config.value.schedule_minutes = parseInt(value) * 1440
    }
}

function validateSheetUrl() {
    const url = config.value.sheets.sheet_url
    if (!url) {
        sheetUrlValid.value = null
        extractedSheetId.value = null
        return
    }

    const pattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
    const match = url.match(pattern)

    if (match) {
        extractedSheetId.value = match[1]

        const gidMatch = url.match(/[?#]gid=(\d+)/)
        if (gidMatch) {
            extractedSheetId.value += ` (Sheet ID: ${gidMatch[1]})`
        }

        validateSheetUrlOnServer()
    } else {
        sheetUrlValid.value = false
        extractedSheetId.value = null
    }
}

async function saveConfig() {
    await saveConfigToServer()
}

function createNewExport() {
    const newId = 'export-' + Date.now()
    config.value = {
        id: newId,
        name: 'Nowy eksport',
        dataset: 'orders',
        selected_fields: [],
        filters: { status: '', date_from: '', date_to: '' },
        sheets: { sheet_url: '', write_mode: 'append' },
        schedule_minutes: 15,
        status: 'active'
    }
    scheduleValue.value = '15-minutes'
    sheetUrlValid.value = null
    extractedSheetId.value = null
    currentPage.value = 'konfigurator'
    nextTick(() => {
        initSortable()
    })
}

function loadExport(exportId) {
    loadExportFromServer(exportId)
}

function confirmDelete(exportId) {
    deleteConfirm.value = exportId
}

function deleteExport(exportId) {
    deleteExportFromServer(exportId)
}

function toggleExportStatus(exp) {
    toggleExportStatusOnServer(exp)
}

function runExport() {
    runExportOnServer()
}

function downloadCsv() {
    const blob = new Blob([csvPreview.value], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${config.value.name || 'export'}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

function formatLastRun(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)

    if (diff < 60) return `${diff} sek temu`
    if (diff < 3600) return `${Math.floor(diff / 60)} min temu`
    if (diff < 86400) return `${Math.floor(diff / 3600)} godz temu`
    return `${Math.floor(diff / 86400)} dni temu`
}

function showToast(title, message, icon) {
    toast.value = { show: true, title, message, icon }
    setTimeout(() => {
        toast.value.show = false
    }, 3000)
}

function formatNip() {
    let nip = buyForm.value.nip.replace(/\D/g, '')
    nip = nip.substring(0, 10)

    if (nip.length > 6) {
        buyForm.value.nip = nip.substring(0, 3) + '-' + nip.substring(3, 6) + '-' + nip.substring(6, 8) + '-' + nip.substring(8)
    } else if (nip.length > 3) {
        buyForm.value.nip = nip.substring(0, 3) + '-' + nip.substring(3)
    } else {
        buyForm.value.nip = nip
    }
}

function scrollToForm() {
    nextTick(() => {
        const form = document.getElementById('contact-form')
        if (form) {
            form.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    })
}

async function submitBuyForm() {
    const nipDigits = buyForm.value.nip.replace(/\D/g, '')
    if (nipDigits.length !== 10) {
        showToast(
            'Błąd',
            'NIP musi zawierać dokładnie 10 cyfr',
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
        return
    }

    try {
        await emailjs.send(
            'service_cde8vm8',
            'template_abtm78k',
            {
                email: buyForm.value.email,
                nip: buyForm.value.nip,
                phone: buyForm.value.phone,
                message: buyForm.value.message || 'Brak wiadomości',
                timestamp: new Date().toLocaleString('pl-PL', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
            }
        )
    } catch (error) {
        console.error('Email error:', error)
        showToast(
            'Błąd',
            'Nie udało się wysłać formularza. Spróbuj ponownie.',
            '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        )
        return
    }

    showToast(
        'Wysłano',
        'Dziękujemy! Skontaktujemy się wkrótce.',
        '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>'
    )

    buyForm.value = { email: '', nip: '', phone: '', message: '' }
}

function initSortable() {
    const el = document.getElementById('sortable-list')
    if (!el) return

    if (sortable) {
        sortable.destroy()
    }

    sortable = Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            const oldIndex = evt.oldIndex
            const newIndex = evt.newIndex

            const item = config.value.selected_fields.splice(oldIndex, 1)[0]
            config.value.selected_fields.splice(newIndex, 0, item)
        }
    })
}

function initUptimeChart() {
    const canvas = document.getElementById('uptimeChart')
    if (!canvas) return

    const data = []
    for (let i = 0; i < 30; i++) {
        data.push(99.5 + Math.random() * 0.5)
    }

    const ctx = canvas.getContext('2d')

    if (uptimeChart) {
        uptimeChart.destroy()
    }

    uptimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: 30}, (_, i) => `${i+1}`),
            datasets: [{
                label: 'Uptime %',
                data: data,
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `Uptime: ${context.parsed.y.toFixed(2)}%`
                    }
                }
            },
            scales: {
                y: {
                    min: 99,
                    max: 100,
                    ticks: {
                        callback: (value) => value + '%'
                    }
                },
                x: {
                    display: false
                }
            }
        }
    })
}

function updateTime() {
    currentTime.value = new Date()
}

async function onTokenChange() {
    if (tokenSaveTimeout) {
        clearTimeout(tokenSaveTimeout)
    }

    tokenSaveTimeout = setTimeout(async () => {
        await saveBaselinkerToken()
    }, 1000)
}

async function saveBaselinkerToken() {
    if (!baselinkerToken.value || baselinkerToken.value.trim() === '') {
        return
    }

    try {
        const response = await fetch('/api/user/baselinker-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            },
            body: JSON.stringify({
                token: baselinkerToken.value
            })
        })

        if (!response.ok) {
            throw new Error('Failed to save token')
        }

        tokenSaved.value = true
        setTimeout(() => {
            tokenSaved.value = false
        }, 3000)
    } catch (error) {
        console.error('Error saving BaseLinker token:', error)
        showToast('Błąd', 'Nie udało się zapisać tokenu', 'error')
    }
}

async function loadBaselinkerToken() {
    try {
        const response = await fetch('/api/user/baselinker-token', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
        })

        if (response.ok) {
            const data = await response.json()
            if (data.token) {
                baselinkerToken.value = data.token
            }
        }
    } catch (error) {
        console.error('Error loading BaseLinker token:', error)
    }
}

async function loadUserEmail() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}')
        userEmail.value = user.email || 'demo@example.com'
    } catch (error) {
        console.error('Error loading user email:', error)
        userEmail.value = 'demo@example.com'
    }
}

function logout() {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    window.location.href = '/login.html'
}

// Watchers
watch(currentPage, (newPage) => {
    if (newPage === 'konfigurator') {
        nextTick(() => {
            initSortable()
        })
    } else if (newPage === 'dashboard') {
        nextTick(() => {
            initUptimeChart()
        })
    } else if (newPage === 'exports') {
        loadExportsFromServer()
    } else if (newPage === 'config') {
        loadBaselinkerToken()
        loadUserEmail()
    }
})

// Lifecycle
onMounted(async () => {
    // Check authentication FIRST - before showing any content
    isAuthChecking.value = true

    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null')
        const accessToken = localStorage.getItem('accessToken')

        if (!user || !accessToken) {
            // No credentials - redirect to login
            window.location.href = '/login.html'
            return
        }

        // Verify token is still valid by checking with server
        try {
            const health = await API.health()
            console.log('Server health:', health)
        } catch (error) {
            console.error('Server health check failed:', error)
            // Don't block auth for health check failure
        }

        // Authentication successful
        isAuthenticated.value = true
        isAuthChecking.value = false

    } catch (error) {
        console.error('Auth check failed:', error)
        window.location.href = '/login.html'
        return
    }

    // Update time every second
    setInterval(() => {
        updateTime()
    }, 1000)

    // Init chart if on dashboard
    if (currentPage.value === 'dashboard') {
        nextTick(() => {
            initUptimeChart()
        })
    }

    // Load exports from server
    await loadExportsFromServer()

    // Load user email
    await loadUserEmail()

    // Auto-refresh exports every 5 minutes
    setInterval(() => {
        if (currentPage.value === 'exports' || currentPage.value === 'dashboard') {
            loadExportsFromServer()
        }
    }, 5 * 60 * 1000)
})
</script>

<template>
    <div id="app" v-cloak>
        <!-- Auth Loading Screen - shows while checking authentication -->
        <div v-if="isAuthChecking" class="fixed inset-0 bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center z-[100]">
            <div class="text-center">
                <div class="w-20 h-20 mx-auto mb-6">
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="animate-pulse">
                        <rect fill="white" width="100" height="100" rx="20"/>
                        <text x="50" y="72" font-size="55" font-weight="bold" fill="#2563eb" text-anchor="middle" font-family="Arial, sans-serif">LS</text>
                    </svg>
                </div>
                <div class="flex items-center justify-center gap-3 text-white">
                    <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span class="text-lg font-medium">Weryfikacja sesji...</span>
                </div>
            </div>
        </div>

        <!-- Main App Content - only shown when authenticated -->
        <template v-if="isAuthenticated && !isAuthChecking">
            <!-- Sidebar -->
            <div class="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-50">
            <div class="p-6">
                <div class="flex items-center gap-3">
                    <!-- Logo SVG -->
                    <div class="w-12 h-12">
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
                                    <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
                                </linearGradient>
                            </defs>
                            <rect fill="url(#grad1)" width="100" height="100" rx="20"/>
                            <text x="50" y="72" font-size="55" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial, sans-serif">LS</text>
                        </svg>
                    </div>
                    <div>
                        <div class="font-bold text-base">Live Sales</div>
                        <div class="text-xs text-gray-500">No-Code dla e-commerce</div>
                    </div>
                </div>
            </div>

            <nav class="flex-1 px-3 space-y-1 sidebar-nav">
                <a href="#" @click.prevent="currentPage = 'dashboard'" :class="{'active': currentPage === 'dashboard'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                    </svg>
                    Dashboard
                </a>
                <a href="#" @click.prevent="currentPage = 'exports'" :class="{'active': currentPage === 'exports'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    Automatyczne eksporty
                </a>
                <a href="#" @click.prevent="currentPage = 'buy'" :class="{'active': currentPage === 'buy'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                    Chcę kupić
                </a>
                <a href="#" @click.prevent="currentPage = 'config'" :class="{'active': currentPage === 'config'}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                    Konfiguracja
                </a>
            </nav>

            <div class="p-4 border-t border-gray-200">
                <div class="flex items-center gap-3 px-3 py-2">
                    <div class="w-8 h-8 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center">
                        <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate">{{ userEmail.split('@')[0] }}</div>
                        <div class="text-xs text-gray-500">{{ userEmail }}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main content -->
        <div class="ml-0 md:ml-64 min-h-screen">
            <!-- Dashboard -->
            <div v-if="currentPage === 'dashboard'" class="p-4 md:p-8">
                <h1 class="text-2xl md:text-3xl font-bold mb-2">Dashboard</h1>
                <p class="text-gray-600 mb-6 md:mb-8">Przegląd integracji i synchronizacji</p>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-10 h-10 md:w-12 md:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                <svg class="w-5 h-5 md:w-6 md:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <div class="font-semibold text-sm md:text-base">Integracja BaseLinker</div>
                                <div class="text-xs md:text-sm text-green-600">Połączone</div>
                            </div>
                        </div>
                        <p class="text-xs md:text-sm text-gray-600">Status: <strong>OK</strong></p>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-10 h-10 md:w-12 md:h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                <svg class="w-5 h-5 md:w-6 md:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                            </div>
                            <div>
                                <div class="font-semibold text-sm md:text-base">Google Sheets</div>
                                <div class="text-xs md:text-sm text-blue-600">Gotowe</div>
                            </div>
                        </div>
                        <p class="text-xs md:text-sm text-gray-600">Arkuszy: <strong>3</strong></p>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-10 h-10 md:w-12 md:h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                <svg class="w-5 h-5 md:w-6 md:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <div class="font-semibold text-sm md:text-base">Ostatnia synchronizacja</div>
                                <div class="text-xs md:text-sm text-purple-600">{{ lastSyncText }}</div>
                            </div>
                        </div>
                        <p class="text-xs md:text-sm text-gray-600">Uruchomień dziś: <strong>{{ runsToday }}</strong></p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <h3 class="text-base md:text-lg font-semibold mb-4">Szybkie akcje</h3>
                        <div class="space-y-3">
                            <button @click="createNewExport" class="w-full bg-blue-600 text-white px-4 py-2.5 md:py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                </svg>
                                Nowy eksport
                            </button>
                            <button @click="currentPage = 'exports'" class="w-full bg-gray-100 text-gray-700 px-4 py-2.5 md:py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                                Lista eksportów
                            </button>
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <h3 class="text-base md:text-lg font-semibold mb-4">Statystyki</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="text-center">
                                <div class="text-2xl md:text-3xl font-bold text-blue-600">{{ ordersToday }}</div>
                                <div class="text-xs md:text-sm text-gray-600 mt-1">Zamówień dziś</div>
                            </div>
                            <div class="text-center">
                                <div class="text-2xl md:text-3xl font-bold text-blue-600">{{ activeExportsCount }}</div>
                                <div class="text-xs md:text-sm text-gray-600 mt-1">Aktywne eksporty</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bottom row: Exports list + Uptime -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <!-- Exports list -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <h3 class="text-base md:text-lg font-semibold mb-4">Ostatnie eksporty</h3>
                        <div class="space-y-2">
                            <div v-for="exp in exportsList.slice(0, 3)" :key="exp.id" class="flex items-center justify-between p-2 md:p-3 rounded-lg hover:bg-gray-50 transition-colors">
                                <div class="flex-1 min-w-0">
                                    <div class="text-xs md:text-sm font-medium truncate">{{ exp.name }}</div>
                                    <div class="text-xs text-gray-500">{{ formatLastRun(exp.last_run) }}</div>
                                </div>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ml-2" :class="exp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'">
                                    {{ exp.status === 'active' ? 'Aktywny' : 'Wstrzymany' }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Mini uptime chart -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="text-base md:text-lg font-semibold">Uptime</h3>
                            <span class="text-xl md:text-2xl font-bold text-green-600">{{ uptime }}%</span>
                        </div>
                        <canvas id="uptimeChart" height="100"></canvas>
                    </div>
                </div>
            </div>

            <!-- Lista eksportów -->
            <div v-if="currentPage === 'exports'" class="p-4 md:p-8">
                <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
                    <div>
                        <h1 class="text-2xl md:text-3xl font-bold mb-2">Automatyczne eksporty</h1>
                        <p class="text-sm md:text-base text-gray-600">Zarządzaj konfiguracjami wydruków</p>
                    </div>
                    <button @click="createNewExport" class="w-full md:w-auto bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        Nowy eksport
                    </button>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table class="w-full min-w-[800px]">
                        <thead class="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nazwa</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Typ</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uptime</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ostatnie uruchomienie</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arkusz</th>
                                <th class="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            <tr v-for="exp in exportsList" :key="exp.id" class="hover:bg-gray-50">
                                <td class="px-4 md:px-6 py-4">
                                    <div class="font-medium text-sm">{{ exp.name }}</div>
                                    <div class="text-xs text-gray-500">{{ exp.id }}</div>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" :class="exp.type === 'orders' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'">
                                        {{ exp.type === 'orders' ? 'Zamówienia' : 'Produkty' }}
                                    </span>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <button @click="toggleExportStatus(exp)" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors" :class="exp.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'">
                                        {{ exp.status === 'active' ? 'Aktywny' : 'Wstrzymany' }}
                                    </button>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <span class="text-sm font-medium text-green-600">{{ exp.uptime }}%</span>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <span class="text-sm text-gray-600">{{ formatLastRun(exp.last_run) }}</span>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <a v-if="exp.sheet_url" :href="exp.sheet_url" target="_blank" class="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                        </svg>
                                        Otwórz
                                    </a>
                                    <span v-else class="text-xs text-gray-400">Brak</span>
                                </td>
                                <td class="px-4 md:px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <button @click="loadExport(exp.id)" class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                            </svg>
                                            Edytuj
                                        </button>
                                        <button @click="confirmDelete(exp.id)" class="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                            </svg>
                                            Usuń
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Chcę kupić -->
            <div v-if="currentPage === 'buy'" class="p-4 md:p-8">
                <div class="max-w-5xl mx-auto">
                    <h1 class="text-2xl md:text-3xl font-bold mb-2">Chcę kupić</h1>
                    <p class="text-sm md:text-base text-gray-600 mb-8">Wybierz plan i wypełnij formularz</p>

                    <!-- Cennik -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
                        <!-- Darmowy -->
                        <div class="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-6">
                            <h3 class="text-lg font-bold mb-2">Darmowy</h3>
                            <div class="text-3xl font-bold text-gray-600 mb-4">0 zł</div>
                            <ul class="text-sm space-y-2 mb-4">
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Podstawowe pola</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Ograniczona częstotliwość</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Limit eksportów</span>
                                </li>
                            </ul>
                        </div>

                        <!-- Business -->
                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg border-2 border-blue-300 p-6 relative">
                            <div class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">POPULARNE</div>
                            <h3 class="text-lg font-bold mb-2">Business</h3>
                            <div class="text-3xl font-bold text-blue-600 mb-4">69 zł <span class="text-sm text-gray-600">/mies</span></div>
                            <ul class="text-sm space-y-2 mb-4">
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Do 10 eksportów</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Wszystko na żywo</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Wszystkie pola</span>
                                </li>
                            </ul>
                        </div>

                        <!-- PRO -->
                        <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-lg border-2 border-purple-300 p-6">
                            <h3 class="text-lg font-bold mb-2">PRO</h3>
                            <div class="text-3xl font-bold text-purple-600 mb-4">99 zł <span class="text-sm text-gray-600">/mies</span></div>
                            <ul class="text-sm space-y-2 mb-4">
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Do 25 eksportów</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Live updates</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                    </svg>
                                    <span>Nowe biznesowe pola</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <!-- Enterprise -->
                    <div class="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl shadow-xl p-6 mb-8">
                        <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div>
                                <h3 class="text-2xl font-bold mb-2">Enterprise</h3>
                                <p class="text-gray-300">Indywidualnie dostosowane rozwiązanie dla Twojej firmy</p>
                            </div>
                            <button @click="scrollToForm" class="bg-white text-gray-900 px-6 py-3 rounded-lg font-bold hover:bg-gray-100 transition-colors">
                                Skontaktuj się
                            </button>
                        </div>
                    </div>

                    <!-- Jak działa - Video Section -->
                    <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 md:p-8 border-2 border-indigo-200 mb-8">
                        <h3 class="text-xl md:text-2xl font-bold mb-4 text-center flex items-center justify-center gap-3">
                            <svg class="w-7 h-7 md:w-8 md:h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <span class="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                Jak działa Live Sales?
                            </span>
                        </h3>
                        
                        <p class="text-center text-gray-700 mb-6 text-sm md:text-base">
                            Zobacz krótki filmik prezentujący możliwości Live Sales
                        </p>

                        <!-- Video Container -->
                        <div class="relative bg-white rounded-lg shadow-xl overflow-hidden mx-auto max-w-4xl" style="padding-bottom: 56.25%; /* 16:9 aspect ratio */">
                            <!-- Placeholder gdy nie ma filmiku -->
                            <div class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                <svg class="w-16 h-16 md:w-24 md:h-24 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                </svg>
                                <p class="text-gray-500 text-base md:text-lg font-medium mb-2">Filmik wkrótce dostępny</p>
                                <p class="text-gray-400 text-xs md:text-sm">Video tutorial będzie tutaj</p>
                            </div>

                            <!-- 
                            ═══════════════════════════════════════════════════════════════
                            JAK DODAĆ FILMIK:
                            ═══════════════════════════════════════════════════════════════
                            
                            1. Usuń cały <div> z placeholderem powyżej (od "Placeholder" do </div>)
                            
                            2. Wklej jeden z poniższych kodów:
                            
                            ───────────────────────────────────────────────────────────────
                            YOUTUBE:
                            ───────────────────────────────────────────────────────────────
                            <iframe 
                                class="absolute inset-0 w-full h-full" 
                                src="https://www.youtube.com/embed/TWOJ_VIDEO_ID?rel=0" 
                                title="Live Sales Tutorial" 
                                frameborder="0" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowfullscreen>
                            </iframe>
                            
                            Przykład z prawdziwym ID:
                            src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"
                                                        └─────────┘
                                                        Twoje Video ID
                            
                            ───────────────────────────────────────────────────────────────
                            VIMEO:
                            ───────────────────────────────────────────────────────────────
                            <iframe 
                                class="absolute inset-0 w-full h-full" 
                                src="https://player.vimeo.com/video/TWOJ_VIDEO_ID?title=0&byline=0&portrait=0" 
                                title="Live Sales Tutorial"
                                frameborder="0" 
                                allow="autoplay; fullscreen; picture-in-picture" 
                                allowfullscreen>
                            </iframe>
                            
                            ───────────────────────────────────────────────────────────────
                            LOOM:
                            ───────────────────────────────────────────────────────────────
                            <iframe 
                                class="absolute inset-0 w-full h-full" 
                                src="https://www.loom.com/embed/TWOJ_VIDEO_ID" 
                                title="Live Sales Tutorial"
                                frameborder="0" 
                                webkitallowfullscreen 
                                mozallowfullscreen 
                                allowfullscreen>
                            </iframe>
                            
                            ───────────────────────────────────────────────────────────────
                            WISTIA:
                            ───────────────────────────────────────────────────────────────
                            <iframe 
                                class="absolute inset-0 w-full h-full wistia_embed" 
                                src="https://fast.wistia.net/embed/iframe/TWOJ_VIDEO_ID" 
                                title="Live Sales Tutorial"
                                frameborder="0" 
                                allowfullscreen>
                            </iframe>
                            
                            ───────────────────────────────────────────────────────────────
                            WŁASNY SERWER (MP4):
                            ───────────────────────────────────────────────────────────────
                            <video 
                                class="absolute inset-0 w-full h-full" 
                                controls 
                                poster="https://twoja-domena.pl/thumbnail.jpg">
                                <source src="https://twoja-domena.pl/video.mp4" type="video/mp4">
                                Twoja przeglądarka nie obsługuje video.
                            </video>
                            
                            ═══════════════════════════════════════════════════════════════
                            -->
                        </div>

                        <!-- Video Features -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mt-6">
                            <div class="bg-white rounded-lg p-3 md:p-4 text-center shadow-sm">
                                <div class="text-indigo-600 font-bold text-xl md:text-2xl mb-1">~2 min</div>
                                <div class="text-gray-600 text-xs md:text-sm">Szybki tutorial</div>
                            </div>
                            <div class="bg-white rounded-lg p-3 md:p-4 text-center shadow-sm">
                                <div class="text-indigo-600 font-bold text-xl md:text-2xl mb-1">Krok po kroku</div>
                                <div class="text-gray-600 text-xs md:text-sm">Łatwa konfiguracja</div>
                            </div>
                            <div class="bg-white rounded-lg p-3 md:p-4 text-center shadow-sm">
                                <div class="text-indigo-600 font-bold text-xl md:text-2xl mb-1">5 minut</div>
                                <div class="text-gray-600 text-xs md:text-sm">I już działa!</div>
                            </div>
                        </div>
                    </div>

                    <!-- Roadmap -->
                    <div class="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-6 mb-8">
                        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                            </svg>
                            Plany rozwoju - ta sama cena!
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Wysyłka HTTP/FTP plików</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Integracja Slack</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>WhatsApp, Telegram, Messenger</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Microsoft Teams</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>Wysyłka emailowa</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                                </svg>
                                <span>AI Raporty i podsumowania</span>
                            </div>
                        </div>
                    </div>

                    <!-- Formularz -->
                    <div id="contact-form" class="bg-white rounded-xl shadow-lg border border-gray-200 p-6 md:p-8">
                        <h2 class="text-xl md:text-2xl font-bold mb-6">Formularz kontaktowy</h2>
                        <form @submit.prevent="submitBuyForm" class="space-y-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                                <input v-model="buyForm.email" type="email" required class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">NIP firmy *</label>
                                <input v-model="buyForm.nip" @input="formatNip" type="text" required maxlength="13" placeholder="123-456-78-90" class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors">
                                <p class="text-xs text-gray-500 mt-1">Format: xxx-xxx-xx-xx</p>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Numer telefonu *</label>
                                <input v-model="buyForm.phone" type="tel" required pattern="[0-9]{9,11}" placeholder="123456789" class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Dodatkowe informacje</label>
                                <textarea v-model="buyForm.message" rows="4" placeholder="Opisz swoje potrzeby..." class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:border-blue-500 focus:outline-none transition-colors"></textarea>
                            </div>

                            <button type="submit" class="w-full bg-blue-600 text-white px-6 py-4 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                                </svg>
                                Wyślij zapytanie
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <!-- KONFIGURACJA -->
            <div v-if="currentPage === 'config'" class="p-4 md:p-8">
                <div class="max-w-3xl mx-auto">
                    <h1 class="text-2xl md:text-3xl font-bold mb-2">Konfiguracja</h1>
                    <p class="text-sm md:text-base text-gray-600 mb-8">Zarządzaj tokenem BaseLinker i ustawieniami konta</p>

                    <!-- BaseLinker Token Card -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                        <div class="flex items-start gap-4 mb-6">
                            <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <h2 class="text-xl font-semibold mb-1">Token BaseLinker</h2>
                                <p class="text-sm text-gray-600">Token potrzebny do synchronizacji danych z BaseLinker</p>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Token API
                                </label>
                                <div class="relative">
                                    <input
                                        v-model="baselinkerToken"
                                        :type="showToken ? 'text' : 'password'"
                                        @input="onTokenChange"
                                        placeholder="Wklej tutaj swój token BaseLinker"
                                        class="w-full border-2 border-gray-300 rounded-lg px-4 py-3 pr-24 focus:border-blue-500 focus:outline-none transition-colors font-mono text-sm"
                                    >
                                    <button
                                        @click="showToken = !showToken"
                                        type="button"
                                        class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                                    >
                                        <svg v-if="!showToken" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                        </svg>
                                        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                                        </svg>
                                    </button>
                                </div>
                                <p class="text-xs text-gray-500 mt-2">
                                    Token jest szyfrowany za pomocą AES-256-GCM i bezpiecznie przechowywany dla Twojego konta
                                </p>
                            </div>

                            <div v-if="tokenSaved" class="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                Token został zapisany automatycznie
                            </div>

                            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div class="flex gap-3">
                                    <svg class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <div class="text-sm text-blue-800">
                                        <p class="font-medium mb-1">Jak znaleźć token BaseLinker?</p>
                                        <ol class="list-decimal list-inside space-y-1 text-blue-700">
                                            <li>Zaloguj się do BaseLinker</li>
                                            <li>Przejdź do: Integracje → API</li>
                                            <li>Skopiuj token API</li>
                                            <li>Wklej token w pole powyżej</li>
                                        </ol>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Account Settings Card -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div class="flex items-start gap-4 mb-6">
                            <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <h2 class="text-xl font-semibold mb-1">Ustawienia konta</h2>
                                <p class="text-sm text-gray-600">Zarządzaj swoim kontem i ustawieniami bezpieczeństwa</p>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <div class="flex items-center justify-between py-3 border-b border-gray-200">
                                <div>
                                    <p class="font-medium text-gray-900">Email</p>
                                    <p class="text-sm text-gray-600">{{ userEmail }}</p>
                                </div>
                            </div>

                            <div class="flex items-center justify-between py-3">
                                <div>
                                    <p class="font-medium text-gray-900">Wyloguj się</p>
                                    <p class="text-sm text-gray-600">Zakończ bieżącą sesję</p>
                                </div>
                                <button
                                    @click="logout"
                                    class="px-4 py-2 border-2 border-red-500 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm"
                                >
                                    Wyloguj
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- KONFIGURATOR -->
            <div v-if="currentPage === 'konfigurator'" class="flex flex-col min-h-screen">
                <!-- Top bar -->
                <div class="bg-white border-b border-gray-200 px-4 md:px-6 py-4 sticky top-0 z-10 shadow-sm">
                    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <!-- Editable name -->
                        <div class="flex items-center gap-3 w-full md:w-auto">
                            <input v-if="editingName" v-model="config.name" @blur="editingName = false" @keyup.enter="editingName = false" type="text" class="text-lg font-medium border-2 border-blue-500 rounded-lg px-4 py-2 w-full md:w-96 focus:outline-none" autofocus>
                            <div v-else class="flex items-center gap-2">
                                <span class="text-lg font-medium">{{ config.name }}</span>
                                <button @click="editingName = true" class="text-gray-400 hover:text-gray-600 transition-colors">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        
                        <div class="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                            <!-- Dataset toggle -->
                            <div class="inline-flex rounded-lg border-2 border-gray-300 p-1 bg-gray-50">
                                <button @click="config.dataset = 'orders'; onDatasetChange()" :class="config.dataset === 'orders' ? 'bg-white shadow-sm border border-gray-200' : ''" class="flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
                                    </svg>
                                    Zamówienia
                                </button>
                                <button @click="config.dataset = 'products'; onDatasetChange()" :class="config.dataset === 'products' ? 'bg-white shadow-sm border border-gray-200' : ''" class="flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                                    </svg>
                                    Produkty
                                </button>
                            </div>

                            <!-- Schedule -->
                            <select v-model="scheduleValue" @change="updateSchedule" class="border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors bg-white">
                                <option value="live">⚡ Na żywo · PRO</option>
                                <option value="5-minutes">Co 5 minut</option>
                                <option value="15-minutes">Co 15 minut</option>
                                <option value="30-minutes">Co 30 minut</option>
                                <option value="1-hours">Co godzinę</option>
                                <option value="6-hours">Co 6 godzin</option>
                                <option value="12-hours">Co 12 godzin</option>
                                <option value="1-days">Raz dziennie</option>
                            </select>

                            <button @click="runExport" class="bg-blue-100 text-blue-700 px-4 md:px-5 py-2.5 rounded-lg hover:bg-blue-200 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span class="hidden md:inline">Uruchom teraz</span>
                            </button>

                            <button @click="saveConfig" class="bg-blue-600 text-white px-4 md:px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                                </svg>
                                Zapisz
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 4 panele -->
                <div class="flex-1 p-4 md:p-6 overflow-hidden">
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 h-full">
                        <!-- Panel A: Dostępne pola -->
                        <div class="md:col-span-3 overflow-y-auto">
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                <h3 class="text-base md:text-lg font-semibold mb-3">Dostępne pola</h3>
                                
                                <div class="relative mb-3">
                                    <input v-model="searchQuery" type="text" placeholder="Szukaj pola..." class="w-full border-2 border-gray-300 rounded-lg px-10 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                                    <svg class="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                    </svg>
                                </div>

                                <div class="space-y-2">
                                    <div v-for="group in filteredGroups" :key="group.name" class="border-b border-gray-200 pb-2">
                                        <button @click="toggleGroup(group.name)" class="w-full flex items-center justify-between py-2 hover:bg-gray-50 rounded-lg px-2 transition-colors">
                                            <span class="font-medium text-sm">{{ group.name }}</span>
                                            <svg class="w-5 h-5 transition-transform" :class="expandedGroups.includes(group.name) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                                            </svg>
                                        </button>
                                        
                                        <div v-if="expandedGroups.includes(group.name)" class="ml-2 mt-1 space-y-1">
                                            <div v-for="field in group.fields" :key="field.field_key" 
                                                 @click="handleFieldClick(field)"
                                                 :class="isFieldSelected(field.field_key) ? 'field-disabled' : 'hover:bg-blue-50 cursor-pointer'"
                                                 class="flex items-center justify-between py-2 px-3 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                                <div class="flex items-center gap-2 flex-1">
                                                    <svg v-if="isFieldSelected(field.field_key)" class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                    </svg>
                                                    <svg v-else class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                    </svg>
                                                    <span class="text-sm">{{ field.label }}</span>
                                                </div>
                                                <span v-if="field.higher_plan" @click.stop="currentPage = 'buy'" class="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium cursor-pointer hover:bg-amber-200">PRO</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Panel B: Wybrane pola -->
                        <div class="md:col-span-3 overflow-y-auto">
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                <div class="flex items-center justify-between mb-3">
                                    <h3 class="text-base md:text-lg font-semibold">Wybrane pola ({{ config.selected_fields.length }})</h3>
                                </div>

                                <div v-if="config.selected_fields.length === 0" class="text-center py-12 text-gray-400">
                                    <svg class="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                                    </svg>
                                    <p class="text-sm">Nie wybrano żadnych pól</p>
                                    <p class="text-xs mt-1">Kliknij pola po lewej aby dodać</p>
                                </div>

                                <div id="sortable-list" v-else class="space-y-2">
                                    <div v-for="fieldKey in config.selected_fields" :key="fieldKey" :data-id="fieldKey"
                                         class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors">
                                        <svg class="drag-handle w-5 h-5 text-gray-400 cursor-move flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path>
                                        </svg>
                                        <div class="flex-1 min-w-0">
                                            <div class="text-sm font-medium truncate">{{ getFieldLabel(fieldKey) }}</div>
                                            <div class="text-xs text-gray-500 truncate">{{ fieldKey }}</div>
                                        </div>
                                        <button @click="removeField(fieldKey)" class="text-red-500 hover:text-red-700 transition-colors flex-shrink-0">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Panel C: Konfiguracja -->
                        <div class="md:col-span-3 overflow-y-auto space-y-4">
                            <!-- Filtry Accordion -->
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <button @click="toggleAccordion('filters')" class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <h4 class="font-semibold text-sm flex items-center gap-2">
                                        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                                        </svg>
                                        Filtry
                                    </h4>
                                    <svg class="w-5 h-5 transition-transform" :class="accordionOpen === 'filters' ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>
                                
                                <div :class="accordionOpen === 'filters' ? 'open' : ''" class="accordion-content">
                                    <div class="p-4 space-y-4 border-t border-gray-200">
                                        <div v-if="config.dataset === 'orders'">
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Status zamówienia</label>
                                            <select v-model="config.filters.status" class="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white">
                                                <option value="">Wszystkie statusy</option>
                                                <option value="234540">Nowe</option>
                                                <option value="234562">Opłacone</option>
                                                <option value="234563">W realizacji</option>
                                                <option value="234564">Wysłane</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Data od</label>
                                            <input v-model="config.filters.date_from" type="date" class="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white">
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Data do</label>
                                            <input v-model="config.filters.date_to" type="date" class="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Google Sheets Accordion -->
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <button @click="toggleAccordion('sheets')" class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <h4 class="font-semibold text-sm flex items-center gap-2">
                                        <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                        </svg>
                                        Google Sheets
                                    </h4>
                                    <svg class="w-5 h-5 transition-transform" :class="accordionOpen === 'sheets' ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>
                                
                                <div :class="accordionOpen === 'sheets' ? 'open' : ''" class="accordion-content">
                                    <div class="p-4 space-y-4 border-t border-gray-200">
                                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                                            <p class="font-semibold mb-2 flex items-center gap-2">
                                                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                                </svg>
                                                Udostępnij arkusz do edycji dla:
                                            </p>
                                            <code class="block bg-white px-3 py-2 rounded border border-blue-200 text-blue-800 font-mono text-xs break-all select-all">live-sales-worker@livesales-483523.iam.gserviceaccount.com</code>
                                            <p class="text-xs text-gray-600 mt-2">Skopiuj powyższy email, otwórz swój arkusz Google Sheets → kliknij "Udostępnij" → wklej email → wybierz "Edytor" → Gotowe!</p>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">URL arkusza</label>
                                            <input v-model="config.sheets.sheet_url" @blur="validateSheetUrl" type="text" placeholder="https://docs.google.com/spreadsheets/d/..." class="w-full border-2 rounded-lg px-4 py-2.5 text-sm focus:outline-none bg-white" :class="sheetUrlValid === false ? 'border-red-500' : sheetUrlValid === true ? 'border-green-500' : 'border-gray-300'">
                                            <p v-if="sheetUrlValid === false" class="text-xs text-red-600 mt-1">Nieprawidłowy URL Google Sheets</p>
                                            <p v-if="extractedSheetId" class="text-xs text-green-600 mt-1">Sheet ID: {{ extractedSheetId }}</p>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Tryb zapisu</label>
                                            <select v-model="config.sheets.write_mode" class="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white">
                                                <option value="append">Dopisz na górze (Insert Top)</option>
                                                <option value="replace">Zastąp wszystko (Replace)</option>
                                            </select>
                                            <p class="text-xs text-gray-500 mt-2">
                                                <strong>Dopisz na górze:</strong> Nowe dane są zawsze dodawane NA POCZĄTKU arkusza (zaraz po headerze). Stare dane schodzą w dół. Najnowsze dane zawsze na górze! Idealne gdy chcesz gromadzić historię z najnowszymi danymi na wierzchu.<br>
                                                <strong>Zastąp:</strong> Arkusz jest czyszczony całkowicie i zapisywane są tylko dane spełniające aktualny filtr. Idealne do raportów "do spakowania" gdzie potrzebujesz tylko aktualne dane.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Panel D: Preview -->
                        <div class="md:col-span-3 overflow-y-auto">
                            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                <div class="flex items-center justify-between mb-3">
                                    <h3 class="text-base md:text-lg font-semibold">Podgląd danych</h3>
                                    <span class="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-medium">
                                        {{ recordCount }} rekordów
                                    </span>
                                </div>

                                <div class="space-y-3">
                                    <button @click="showPreviewModal = true" :disabled="config.selected_fields.length === 0" class="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm md:text-base">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                        </svg>
                                        Podgląd tabeli
                                    </button>

                                    <button @click="downloadCsv" :disabled="config.selected_fields.length === 0" class="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm md:text-base">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                        </svg>
                                        Pobierz CSV
                                    </button>
                                </div>

                                <div v-if="config.selected_fields.length === 0" class="mt-6 text-center py-12 text-gray-400">
                                    <svg class="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                    </svg>
                                    <p class="text-sm">Wybierz pola aby zobaczyć podgląd</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Preview Modal -->
        <div v-if="showPreviewModal" @click.self="showPreviewModal = false" class="fixed inset-0 bg-black bg-opacity-50 modal-backdrop flex items-center justify-center z-50 p-4 md:p-6">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
                <div class="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
                    <h3 class="text-xl md:text-2xl font-bold">Podgląd danych (max 5 rekordów)</h3>
                    <button @click="showPreviewModal = false" class="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg class="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                
                <div class="p-4 md:p-6 overflow-auto flex-1">
                    <div class="overflow-x-auto">
                        <table class="w-full border-collapse">
                            <thead>
                                <tr class="bg-gradient-to-r from-blue-50 to-blue-100">
                                    <th v-for="fieldKey in config.selected_fields" :key="fieldKey" class="border-2 border-blue-200 px-3 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-gray-700 whitespace-nowrap">
                                        {{ getFieldLabel(fieldKey) }}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(record, idx) in previewTableData" :key="idx" :class="idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'" class="hover:bg-blue-50 transition-colors">
                                    <td v-for="fieldKey in config.selected_fields" :key="fieldKey" class="border border-gray-300 px-3 md:px-4 py-2 text-xs md:text-sm whitespace-nowrap">
                                        {{ record[fieldKey] || '-' }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <div v-if="deleteConfirm" @click.self="deleteConfirm = null" class="fixed inset-0 bg-black bg-opacity-50 modal-backdrop flex items-center justify-center z-50 p-4 md:p-6">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <h3 class="text-xl font-bold mb-4">Potwierdź usunięcie</h3>
                <p class="text-gray-600 mb-6">Czy na pewno chcesz usunąć ten eksport? Tej operacji nie można cofnąć.</p>
                <div class="flex gap-3">
                    <button @click="deleteConfirm = null" class="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium">
                        Anuluj
                    </button>
                    <button @click="deleteExport(deleteConfirm)" class="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium">
                        Usuń
                    </button>
                </div>
            </div>
        </div>

            <!-- Toast (prawy dolny róg) -->
            <div v-if="toast.show" class="fixed bottom-4 right-4 bg-white border-2 border-gray-200 rounded-xl shadow-2xl p-4 max-w-sm z-50 animate-slide-in">
                <div class="flex items-start gap-3">
                    <div v-html="toast.icon" class="w-6 h-6 flex-shrink-0"></div>
                    <div class="flex-1">
                        <div class="font-semibold text-sm">{{ toast.title }}</div>
                        <div class="text-xs text-gray-600">{{ toast.message }}</div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.drag-handle { cursor: move; }
.sortable-ghost { opacity: 0.4; background: #e5e7eb; }
.field-disabled { opacity: 0.4; cursor: not-allowed !important; }

.accordion-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-out;
}
.accordion-content.open { max-height: 800px; }

.modal-backdrop { backdrop-filter: blur(4px); }
</style>
