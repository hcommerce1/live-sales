<template>
  <div class="sheet-config">
    <!-- Service account info -->
    <div class="service-account-info">
      <div class="info-icon">📋</div>
      <div class="info-content">
        <p><strong>Ważne:</strong> Udostępnij swój arkusz Google dla naszego konta serwisowego:</p>
        <div class="email-copy">
          <code>{{ serviceAccountEmail }}</code>
          <button @click="copyEmail" class="copy-btn" :title="emailCopied ? 'Skopiowano!' : 'Kopiuj'">
            {{ emailCopied ? '✓' : '📋' }}
          </button>
        </div>
        <p class="info-note">Uprawnienia: Edytor (Editor)</p>
      </div>
    </div>

    <!-- Sheets list -->
    <div class="sheets-list">
      <div
        v-for="(sheet, index) in sheets"
        :key="index"
        class="sheet-item"
      >
        <div class="sheet-header">
          <span class="sheet-number">Arkusz {{ index + 1 }}</span>
          <button
            v-if="sheets.length > 1"
            class="remove-sheet-btn"
            @click="removeSheet(index)"
            title="Usuń arkusz"
          >
            ×
          </button>
        </div>

        <div class="sheet-fields">
          <!-- Sheet URL -->
          <div class="field-group">
            <label>URL arkusza Google Sheets</label>
            <div class="url-input-wrapper">
              <input
                v-model="sheet.sheet_url"
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                class="url-input"
                :class="{
                  valid: sheet.urlStatus === 'valid',
                  invalid: sheet.urlStatus === 'invalid'
                }"
                @input="validateUrl(sheet)"
              />
              <span v-if="sheet.urlStatus === 'valid'" class="url-status valid">✓</span>
              <span v-if="sheet.urlStatus === 'invalid'" class="url-status invalid">✗</span>
            </div>
            <p v-if="sheet.extractedId" class="sheet-id">
              ID: {{ sheet.extractedId }}
              <span v-if="sheet.extractedGid"> | Zakładka: gid={{ sheet.extractedGid }}</span>
            </p>
            <p v-if="sheet.urlStatus === 'invalid'" class="error-text">
              Nieprawidłowy URL arkusza Google Sheets
            </p>
          </div>

          <!-- Write mode -->
          <div class="field-group">
            <label>Tryb zapisu</label>
            <div class="write-mode-options">
              <label class="radio-option">
                <input
                  type="radio"
                  v-model="sheet.write_mode"
                  value="append"
                />
                <span class="radio-label">
                  <strong>Dopisuj</strong>
                  <small>Nowe dane dodawane na końcu arkusza</small>
                </span>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  v-model="sheet.write_mode"
                  value="replace"
                />
                <span class="radio-label">
                  <strong>Zastąp</strong>
                  <small>Każdy eksport nadpisuje poprzednie dane</small>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add sheet button -->
    <button
      v-if="sheets.length < maxSheets"
      class="add-sheet-btn"
      @click="addSheet"
    >
      + Dodaj kolejny arkusz docelowy
    </button>

    <p v-if="sheets.length >= maxSheets" class="limit-notice">
      Osiągnięto limit {{ maxSheets }} arkuszy docelowych dla Twojego planu.
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [{
      sheet_url: '',
      write_mode: 'append',
      urlStatus: null,
      extractedId: null,
      extractedGid: null
    }]
  },
  serviceAccountEmail: {
    type: String,
    default: 'live-sales@live-sales-app.iam.gserviceaccount.com'
  },
  maxSheets: {
    type: Number,
    default: 3
  }
})

const emit = defineEmits(['update:modelValue'])

const emailCopied = ref(false)

const sheets = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Copy service account email
function copyEmail() {
  navigator.clipboard.writeText(props.serviceAccountEmail)
  emailCopied.value = true
  setTimeout(() => {
    emailCopied.value = false
  }, 2000)
}

// Validate Google Sheets URL and extract ID + GID
function validateUrl(sheet) {
  const url = sheet.sheet_url
  if (!url) {
    sheet.urlStatus = null
    sheet.extractedId = null
    sheet.extractedGid = null
    return
  }

  // Pattern: https://docs.google.com/spreadsheets/d/{spreadsheetId}/...
  const idRegex = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  const idMatch = url.match(idRegex)

  // Pattern for GID: ?gid=123 or #gid=123
  const gidRegex = /[?#]gid=(\d+)/
  const gidMatch = url.match(gidRegex)

  if (idMatch) {
    sheet.urlStatus = 'valid'
    sheet.extractedId = idMatch[1]
    sheet.extractedGid = gidMatch ? gidMatch[1] : null
  } else {
    sheet.urlStatus = 'invalid'
    sheet.extractedId = null
    sheet.extractedGid = null
  }
}

// Add new sheet
function addSheet() {
  sheets.value = [
    ...sheets.value,
    {
      sheet_url: '',
      write_mode: 'append',
      urlStatus: null,
      extractedId: null,
      extractedGid: null
    }
  ]
}

// Remove sheet
function removeSheet(index) {
  const newSheets = [...sheets.value]
  newSheets.splice(index, 1)
  sheets.value = newSheets
}

// Initialize with default if empty
watch(() => props.modelValue, (newVal) => {
  if (!newVal || newVal.length === 0) {
    emit('update:modelValue', [{
      sheet_url: '',
      write_mode: 'append',
      urlStatus: null,
      extractedId: null,
      extractedGid: null
    }])
  }
}, { immediate: true })
</script>

<style scoped>
.sheet-config {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.service-account-info {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
}

.info-icon {
  font-size: 1.5rem;
}

.info-content {
  flex: 1;
}

.info-content p {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: #1e40af;
}

.email-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: white;
  border-radius: 6px;
  margin: 0.5rem 0;
}

.email-copy code {
  font-size: 0.85rem;
  color: #374151;
}

.copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.copy-btn:hover {
  opacity: 1;
}

.info-note {
  font-size: 0.8rem;
  color: #3b82f6;
}

.sheets-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.sheet-item {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.sheet-number {
  font-weight: 600;
  font-size: 0.95rem;
  color: #374151;
}

.remove-sheet-btn {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-sheet-btn:hover {
  opacity: 1;
}

.sheet-fields {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-group label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #374151;
}

.optional {
  font-weight: 400;
  color: #9ca3af;
}

.url-input-wrapper {
  position: relative;
}

.url-input {
  width: 100%;
  padding: 0.75rem 1rem;
  padding-right: 2.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.url-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.url-input.valid {
  border-color: #10b981;
}

.url-input.invalid {
  border-color: #ef4444;
}

.url-status {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.1rem;
}

.url-status.valid {
  color: #10b981;
}

.url-status.invalid {
  color: #ef4444;
}

.sheet-id {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
}

.error-text {
  font-size: 0.8rem;
  color: #ef4444;
  margin: 0;
}

.field-hint {
  font-size: 0.8rem;
  color: #9ca3af;
  margin: 0;
}

.write-mode-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.radio-option:hover {
  border-color: #6366f1;
}

.radio-option input[type="radio"] {
  margin-top: 0.25rem;
}

.radio-option input[type="radio"]:checked + .radio-label {
  color: #4f46e5;
}

.radio-label {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.radio-label strong {
  font-size: 0.9rem;
}

.radio-label small {
  font-size: 0.8rem;
  color: #6b7280;
}

.add-sheet-btn {
  align-self: flex-start;
  padding: 0.75rem 1.5rem;
  background: #f3f4f6;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.add-sheet-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: #eef2ff;
}

.limit-notice {
  font-size: 0.85rem;
  color: #6b7280;
  padding: 0.75rem;
  background: #f3f4f6;
  border-radius: 6px;
}
</style>
