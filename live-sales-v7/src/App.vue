<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { MOCK_DATA } from './data.js'
import { API } from './api.js'
import Sortable from 'sortablejs'
import Chart from 'chart.js/auto'
import emailjs from '@emailjs/browser'

// Initialize EmailJS
emailjs.init("AJZSalcoaqOoF-Qxe")

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
    // Check authentication
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    const accessToken = localStorage.getItem('accessToken')
    if (!user || !accessToken) {
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

    // Check server health
    try {
        const health = await API.health()
        console.log('Server health:', health)
    } catch (error) {
        console.error('Server health check failed:', error)
        showToast(
            'Ostrzeżenie',
            'Nie można połączyć się z serwerem. Sprawdź czy backend jest uruchomiony.',
            '<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
        )
    }

    // Auto-refresh exports every 5 minutes
    setInterval(() => {
        if (currentPage.value === 'exports' || currentPage.value === 'dashboard') {
            loadExportsFromServer()
        }
    }, 5 * 60 * 1000)
})
</script>

<template>
    <!-- Note: Template will be continued in next file due to length -->
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
