const { createApp } = Vue;

createApp({
    data() {
        return {
            currentPage: 'dashboard',
            searchQuery: '',
            expandedGroups: ['Podstawowe', 'Dane klienta', 'Magazyn'],
            editingName: false,
            accordionOpen: 'filters',
            showPreviewModal: false,
            deleteConfirm: null,
            scheduleValue: '15-minutes',
            
            config: {
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
                schedule_minutes: 15
            },

            toast: {
                show: false,
                title: '',
                message: '',
                icon: ''
            },

            buyForm: {
                email: '',
                nip: '',
                phone: '',
                message: ''
            },

            sortable: null,
            sheetUrlValid: null,
            extractedSheetId: null,
            
            // Live stats
            currentTime: new Date(),
            lastSyncTime: new Date(Date.now() - 2 * 60 * 1000),
            uptime: 99.8,
            uptimeChart: null
        };
    },

    computed: {
        exportsList() {
            const stored = localStorage.getItem('exports_list');
            if (stored) {
                return JSON.parse(stored);
            }
            return MOCK_DATA.exportsList.map(exp => ({
                ...exp,
                uptime: (99.5 + Math.random() * 0.5).toFixed(1)
            }));
        },

        activeExportsCount() {
            return this.exportsList.filter(e => e.status === 'active').length;
        },

        availableFields() {
            return this.config.dataset === 'orders' 
                ? MOCK_DATA.fieldsOrders 
                : MOCK_DATA.fieldsProducts;
        },

        sampleData() {
            return this.config.dataset === 'orders'
                ? MOCK_DATA.sampleOrders
                : MOCK_DATA.sampleProducts;
        },

        filteredGroups() {
            const groups = {};
            
            this.availableFields
                .filter(field => {
                    if (!this.searchQuery) return true;
                    const query = this.searchQuery.toLowerCase();
                    return field.label.toLowerCase().includes(query) || 
                           field.field_key.toLowerCase().includes(query);
                })
                .forEach(field => {
                    if (!groups[field.group]) {
                        groups[field.group] = [];
                    }
                    groups[field.group].push(field);
                });

            return Object.entries(groups).map(([name, fields]) => ({ name, fields }));
        },

        previewTableData() {
            let data = [...this.sampleData];

            if (this.config.dataset === 'orders' && this.config.filters.status) {
                data = data.filter(r => r.order_status_id === this.config.filters.status);
            }

            if (this.config.filters.date_from) {
                data = data.filter(r => {
                    const recordDate = r.date_add || '';
                    return recordDate >= this.config.filters.date_from;
                });
            }

            if (this.config.filters.date_to) {
                data = data.filter(r => {
                    const recordDate = r.date_add || '';
                    return recordDate <= this.config.filters.date_to;
                });
            }

            return data.slice(0, 5);
        },

        csvPreview() {
            if (this.config.selected_fields.length === 0) return '';
            
            const data = this.previewTableData;
            const headers = this.config.selected_fields.map(fieldKey => {
                const field = this.availableFields.find(f => f.field_key === fieldKey);
                return field ? field.label : fieldKey;
            });

            const lines = [headers.join(';')];

            data.forEach(record => {
                const row = this.config.selected_fields.map(fieldKey => {
                    const value = record[fieldKey] || '';
                    const escaped = String(value).replace(/"/g, '""');
                    return escaped.includes(';') ? `"${escaped}"` : escaped;
                });
                lines.push(row.join(';'));
            });

            return lines.join('\n');
        },

        recordCount() {
            let data = [...this.sampleData];

            if (this.config.dataset === 'orders' && this.config.filters.status) {
                data = data.filter(r => r.order_status_id === this.config.filters.status);
            }

            if (this.config.filters.date_from) {
                data = data.filter(r => {
                    const recordDate = r.date_add || '';
                    return recordDate >= this.config.filters.date_from;
                });
            }

            if (this.config.filters.date_to) {
                data = data.filter(r => {
                    const recordDate = r.date_add || '';
                    return recordDate <= this.config.filters.date_to;
                });
            }

            return data.length;
        },

        lastSyncText() {
            const diff = Math.floor((this.currentTime - this.lastSyncTime) / 1000);
            const minutes = Math.floor(diff / 60);
            const seconds = diff % 60;
            
            if (minutes === 0) {
                return `${seconds} sek temu`;
            }
            return `${minutes} min ${seconds} sek temu`;
        },

        ordersToday() {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();
            
            if (hour < 7) {
                return Math.floor((hour * 60 + minute) / (7 * 60) * 30);
            }
            
            const minutesSince7 = (hour - 7) * 60 + minute;
            const totalMinutesAfter7 = 17 * 60;
            return 30 + Math.floor((minutesSince7 / totalMinutesAfter7) * 253);
        },

        runsToday() {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();
            const totalMinutes = hour * 60 + minute;
            return Math.floor(totalMinutes / 5);
        }
    },

    methods: {
        toggleGroup(groupName) {
            const index = this.expandedGroups.indexOf(groupName);
            if (index > -1) {
                this.expandedGroups.splice(index, 1);
            } else {
                this.expandedGroups.push(groupName);
            }
        },

        toggleAccordion(section) {
            this.accordionOpen = this.accordionOpen === section ? null : section;
        },

        isFieldSelected(fieldKey) {
            return this.config.selected_fields.includes(fieldKey);
        },

        handleFieldClick(field) {
            if (field.higher_plan) {
                this.currentPage = 'buy';
                this.scrollToForm();
            } else if (!this.isFieldSelected(field.field_key)) {
                this.addField(field.field_key);
            }
        },

        addField(fieldKey) {
            if (!this.isFieldSelected(fieldKey)) {
                this.config.selected_fields.push(fieldKey);
                this.$nextTick(() => {
                    this.initSortable();
                });
            }
        },

        removeField(fieldKey) {
            const index = this.config.selected_fields.indexOf(fieldKey);
            if (index > -1) {
                this.config.selected_fields.splice(index, 1);
            }
        },

        getFieldLabel(fieldKey) {
            const field = this.availableFields.find(f => f.field_key === fieldKey);
            return field ? field.label : fieldKey;
        },

        onDatasetChange() {
            this.config.selected_fields = [];
        },

        updateSchedule() {
            if (this.scheduleValue === 'live') {
                this.config.schedule_minutes = 0;
                // Don't redirect, just set the value
                return;
            }
            
            const [value, unit] = this.scheduleValue.split('-');
            if (unit === 'minutes') {
                this.config.schedule_minutes = parseInt(value);
            } else if (unit === 'hours') {
                this.config.schedule_minutes = parseInt(value) * 60;
            } else if (unit === 'days') {
                this.config.schedule_minutes = parseInt(value) * 1440;
            }
        },

        validateSheetUrl() {
            const url = this.config.sheets.sheet_url;
            if (!url) {
                this.sheetUrlValid = null;
                this.extractedSheetId = null;
                return;
            }

            const pattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
            const match = url.match(pattern);
            
            if (match) {
                this.sheetUrlValid = true;
                this.extractedSheetId = match[1];
            } else {
                this.sheetUrlValid = false;
                this.extractedSheetId = null;
            }
        },

        async saveConfig() {
            // Save to localStorage
            localStorage.setItem(`export_${this.config.id}`, JSON.stringify(this.config));
            
            const list = this.exportsList;
            const existingIndex = list.findIndex(e => e.id === this.config.id);
            
            if (existingIndex > -1) {
                list[existingIndex].name = this.config.name;
                list[existingIndex].type = this.config.dataset;
                list[existingIndex].sheet_url = this.config.sheets.sheet_url;
            } else if (this.config.id !== 'new') {
                list.push({
                    id: this.config.id,
                    name: this.config.name,
                    type: this.config.dataset,
                    interval: this.config.schedule_minutes,
                    sheets_tab: 'Sheet1',
                    status: 'active',
                    last_run: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    uptime: '99.8',
                    sheet_url: this.config.sheets.sheet_url
                });
            }
            
            localStorage.setItem('exports_list', JSON.stringify(list));
            
            // Try to write to Google Sheets
            if (this.sheetUrlValid && this.extractedSheetId) {
                await this.writeToGoogleSheets();
            }
            
            this.showToast(
                'Zapisano',
                'Konfiguracja została zapisana pomyślnie',
                '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
            );
        },

        async writeToGoogleSheets() {
            // This would connect to your backend API
            // For demo purposes, just log
            console.log('Writing to Google Sheets:', {
                sheetId: this.extractedSheetId,
                data: this.previewTableData,
                fields: this.config.selected_fields,
                writeMode: this.config.sheets.write_mode
            });
        },

        createNewExport() {
            const newId = 'export-' + Date.now();
            this.config = {
                id: newId,
                name: 'Nowy eksport',
                dataset: 'orders',
                selected_fields: [],
                filters: { status: '', date_from: '', date_to: '' },
                sheets: { sheet_url: '', write_mode: 'append' },
                schedule_minutes: 15
            };
            this.scheduleValue = '15-minutes';
            this.sheetUrlValid = null;
            this.extractedSheetId = null;
            this.currentPage = 'konfigurator';
            this.$nextTick(() => {
                this.initSortable();
            });
        },

        loadExport(exportId) {
            const stored = localStorage.getItem(`export_${exportId}`);
            if (stored) {
                this.config = JSON.parse(stored);
            } else {
                if (exportId === 'export-1') {
                    this.config = {
                        id: 'export-1',
                        name: 'Zamówienia dzienne do Sheets',
                        dataset: 'orders',
                        selected_fields: ['date_add', 'order_id', 'total_price', 'email', 'order_status_id'],
                        filters: { status: '234562', date_from: '', date_to: '' },
                        sheets: {
                            sheet_url: 'https://docs.google.com/spreadsheets/d/1eakktbW8gttUOukkws3G7I2GBQo3DYzDdFls705pC5g/edit',
                            write_mode: 'append'
                        },
                        schedule_minutes: 15
                    };
                } else {
                    this.config.id = exportId;
                }
            }
            
            const mins = this.config.schedule_minutes;
            if (mins === 0) {
                this.scheduleValue = 'live';
            } else if (mins < 60) {
                this.scheduleValue = `${mins}-minutes`;
            } else if (mins < 1440) {
                this.scheduleValue = `${mins / 60}-hours`;
            } else {
                this.scheduleValue = `${mins / 1440}-days`;
            }
            
            this.validateSheetUrl();
            this.currentPage = 'konfigurator';
            this.$nextTick(() => {
                this.initSortable();
            });
        },

        confirmDelete(exportId) {
            this.deleteConfirm = exportId;
        },

        deleteExport(exportId) {
            const list = this.exportsList.filter(e => e.id !== exportId);
            localStorage.setItem('exports_list', JSON.stringify(list));
            localStorage.removeItem(`export_${exportId}`);
            this.deleteConfirm = null;
            this.showToast(
                'Usunięto',
                'Eksport został pomyślnie usunięty',
                '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>'
            );
        },

        toggleExportStatus(exp) {
            const list = this.exportsList;
            const index = list.findIndex(e => e.id === exp.id);
            if (index > -1) {
                list[index].status = list[index].status === 'active' ? 'paused' : 'active';
                localStorage.setItem('exports_list', JSON.stringify(list));
                this.$forceUpdate();
            }
        },

        runExport() {
            this.lastSyncTime = new Date();
            
            // Symulacja zapisu - w prawdziwej aplikacji tutaj byłoby wywołanie backendu
            // który zapisze dane NA GÓRZE arkusza (insert na pozycji 2, po headerze)
            console.log('Running export with data insert at TOP (after header)');
            console.log('Sheet ID:', this.extractedSheetId);
            console.log('Write mode:', this.config.sheets.write_mode);
            console.log('Fields:', this.config.selected_fields);
            console.log('Data preview:', this.previewTableData);
            
            // Informacja dla użytkownika
            this.showToast(
                'Uruchomiono',
                'Eksport zapisany NA GÓRZE arkusza (najnowsze dane na początku)',
                '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
            );
        },

        downloadCsv() {
            const blob = new Blob([this.csvPreview], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${this.config.name || 'export'}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        formatLastRun(dateStr) {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            const now = new Date();
            const diff = Math.floor((now - date) / 1000);
            
            if (diff < 60) return `${diff} sek temu`;
            if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
            if (diff < 86400) return `${Math.floor(diff / 3600)} godz temu`;
            return `${Math.floor(diff / 86400)} dni temu`;
        },

        showToast(title, message, icon) {
            this.toast = { show: true, title, message, icon };
            setTimeout(() => {
                this.toast.show = false;
            }, 3000);
        },

        formatNip() {
            // Remove all non-digits
            let nip = this.buyForm.nip.replace(/\D/g, '');
            
            // Limit to 10 digits
            nip = nip.substring(0, 10);
            
            // Format: xxx-xxx-xx-xx
            if (nip.length > 6) {
                this.buyForm.nip = nip.substring(0, 3) + '-' + nip.substring(3, 6) + '-' + nip.substring(6, 8) + '-' + nip.substring(8);
            } else if (nip.length > 3) {
                this.buyForm.nip = nip.substring(0, 3) + '-' + nip.substring(3);
            } else {
                this.buyForm.nip = nip;
            }
        },

        scrollToForm() {
            this.$nextTick(() => {
                const form = document.getElementById('contact-form');
                if (form) {
                    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        },

        async submitBuyForm() {
            // Validate NIP (xxx-xxx-xx-xx format)
            const nipDigits = this.buyForm.nip.replace(/\D/g, '');
            if (nipDigits.length !== 10) {
                this.showToast(
                    'Błąd',
                    'NIP musi zawierać dokładnie 10 cyfr',
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
                return;
            }

            // Wysyłka przez EmailJS
            try {
                await emailjs.send(
                    'service_cde8vm8',     // ✅ Twój Service ID z EmailJS
                    'template_abtm78k',    // ✅ Twój Template ID z EmailJS
                    {
                        email: this.buyForm.email,
                        nip: this.buyForm.nip,
                        phone: this.buyForm.phone,
                        message: this.buyForm.message || 'Brak wiadomości',
                        timestamp: new Date().toLocaleString('pl-PL', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        })
                    }
                );
            } catch (error) {
                console.error('Email error:', error);
                this.showToast(
                    'Błąd',
                    'Nie udało się wysłać formularza. Spróbuj ponownie.',
                    '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
                );
                return;
            }
            
            this.showToast(
                'Wysłano',
                'Dziękujemy! Skontaktujemy się wkrótce.',
                '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>'
            );
            
            this.buyForm = { email: '', nip: '', phone: '', message: '' };
        },

        initSortable() {
            const el = document.getElementById('sortable-list');
            if (!el) return;

            if (this.sortable) {
                this.sortable.destroy();
            }

            this.sortable = Sortable.create(el, {
                handle: '.drag-handle',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: (evt) => {
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    
                    const item = this.config.selected_fields.splice(oldIndex, 1)[0];
                    this.config.selected_fields.splice(newIndex, 0, item);
                }
            });
        },

        initUptimeChart() {
            const canvas = document.getElementById('uptimeChart');
            if (!canvas) return;

            const data = [];
            for (let i = 0; i < 30; i++) {
                data.push(99.5 + Math.random() * 0.5);
            }

            const ctx = canvas.getContext('2d');
            
            if (this.uptimeChart) {
                this.uptimeChart.destroy();
            }
            
            this.uptimeChart = new Chart(ctx, {
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
            });
        },

        updateTime() {
            this.currentTime = new Date();
        }
    },

    watch: {
        currentPage(newPage) {
            if (newPage === 'konfigurator') {
                this.$nextTick(() => {
                    this.initSortable();
                });
            } else if (newPage === 'dashboard') {
                this.$nextTick(() => {
                    this.initUptimeChart();
                });
            }
        }
    },

    mounted() {
        // Update time every second
        setInterval(() => {
            this.updateTime();
        }, 1000);

        // Init chart if on dashboard
        if (this.currentPage === 'dashboard') {
            this.$nextTick(() => {
                this.initUptimeChart();
            });
        }

        // Auto-refresh every 5 minutes (except on konfigurator page)
        setInterval(() => {
            if (this.currentPage !== 'konfigurator') {
                // Soft refresh - just update data without page reload
                this.$forceUpdate();
            }
        }, 5 * 60 * 1000); // 5 minutes
    }
}).mount('#app');
