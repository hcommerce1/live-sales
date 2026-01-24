<template>
  <RequireAuth>
    <div class="settings-view">
      <!-- Header -->
      <header class="page-header">
        <div class="header-content">
          <h1>Ustawienia</h1>
          <p>Zarządzaj kontem i preferencjami</p>
        </div>
      </header>

      <!-- Content -->
      <main class="page-content">
        <!-- Navigation tabs -->
        <div class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab content -->
        <div class="tab-content">
          <!-- Account tab -->
          <div v-if="activeTab === 'account'" class="card">
            <div class="card-header">
              <h2>Dane konta</h2>
            </div>
            <div class="card-content">
              <div class="form-group">
                <label>Email</label>
                <input type="email" :value="authStore.user?.email" disabled class="input disabled" />
              </div>
              <div class="form-group">
                <label>Utworzono</label>
                <input type="text" :value="formatDate(authStore.user?.createdAt)" disabled class="input disabled" />
              </div>
            </div>
          </div>

          <!-- Security tab -->
          <div v-if="activeTab === 'security'" class="card">
            <div class="card-header">
              <h2>Bezpieczeństwo</h2>
            </div>
            <div class="card-content">
              <!-- Change password -->
              <div class="section">
                <h3>Zmiana hasła</h3>
                <form @submit.prevent="changePassword" class="password-form">
                  <div class="form-group">
                    <label>Obecne hasło</label>
                    <input
                      type="password"
                      v-model="passwordForm.currentPassword"
                      class="input"
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label>Nowe hasło</label>
                    <input
                      type="password"
                      v-model="passwordForm.newPassword"
                      class="input"
                      required
                      minlength="12"
                    />
                    <span class="hint">Minimum 12 znaków</span>
                  </div>
                  <div class="form-group">
                    <label>Potwierdź nowe hasło</label>
                    <input
                      type="password"
                      v-model="passwordForm.confirmPassword"
                      class="input"
                      required
                    />
                  </div>
                  <button type="submit" class="btn btn-primary" :disabled="isChangingPassword">
                    {{ isChangingPassword ? 'Zmieniam...' : 'Zmień hasło' }}
                  </button>
                </form>
              </div>

              <!-- 2FA section -->
              <div class="section">
                <h3>Weryfikacja dwuetapowa (2FA)</h3>
                <div v-if="authStore.user?.twoFactorEnabled" class="status-badge enabled">
                  Włączona
                </div>
                <div v-else class="status-badge disabled">
                  Wyłączona
                </div>
                <p class="section-desc">
                  Zabezpiecz swoje konto dodatkowym kodem weryfikacyjnym wysyłanym na email.
                </p>
                <button
                  v-if="!authStore.user?.twoFactorEnabled"
                  class="btn btn-sm"
                  @click="enable2FA"
                  :disabled="is2FALoading"
                >
                  {{ is2FALoading ? 'Włączanie...' : 'Włącz 2FA' }}
                </button>
                <button
                  v-else
                  class="btn btn-sm btn-danger"
                  @click="disable2FA"
                  :disabled="is2FALoading"
                >
                  {{ is2FALoading ? 'Wyłączanie...' : 'Wyłącz 2FA' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Company tab -->
          <div v-if="activeTab === 'company'" class="card">
            <div class="card-header">
              <h2>Firma</h2>
            </div>
            <div class="card-content">
              <div v-if="companyStore.activeCompany" class="company-info">
                <div class="form-group">
                  <label>Nazwa firmy</label>
                  <input type="text" :value="companyStore.activeCompany.name" disabled class="input disabled" />
                </div>
                <div class="form-group">
                  <label>NIP</label>
                  <input type="text" :value="companyStore.activeCompany.nip" disabled class="input disabled" />
                </div>
              </div>
              <EmptyState
                v-else
                type="company"
                title="Brak firmy"
                description="Nie jesteś przypisany do żadnej firmy."
              />
            </div>
          </div>

          <!-- Team tab -->
          <div v-if="activeTab === 'team'" class="card">
            <div class="card-header">
              <h2>Zespół</h2>
              <button class="btn btn-sm" @click="showInviteModal = true">
                Zaproś członka
              </button>
            </div>
            <div class="card-content">
              <div v-if="teamStore.members.length > 0" class="team-list">
                <div v-for="member in teamStore.members" :key="member.id" class="team-member">
                  <div class="member-info">
                    <span class="member-email">{{ member.email }}</span>
                    <span class="member-role" :class="member.role">{{ getRoleLabel(member.role) }}</span>
                  </div>
                  <div class="member-actions" v-if="member.role !== 'owner'">
                    <button class="btn btn-sm btn-danger" @click="removeMember(member)">
                      Usuń
                    </button>
                  </div>
                </div>
              </div>
              <EmptyState
                v-else
                type="team"
                title="Brak członków zespołu"
                description="Zaproś pierwszego członka do zespołu."
              />
            </div>
          </div>

          <!-- Billing tab -->
          <div v-if="activeTab === 'billing'" class="card">
            <div class="card-header">
              <h2>Subskrypcja</h2>
            </div>
            <div class="card-content">
              <div v-if="subscriptionStore.subscription" class="subscription-info">
                <div class="plan-name">{{ subscriptionStore.subscription.planName }}</div>
                <div class="plan-status" :class="subscriptionStore.subscription.status">
                  {{ getStatusLabel(subscriptionStore.subscription.status) }}
                </div>
                <div v-if="subscriptionStore.subscription.trialEndsAt" class="trial-info">
                  Trial kończy się: {{ formatDate(subscriptionStore.subscription.trialEndsAt) }}
                </div>
              </div>
              <div v-else class="no-subscription">
                <p>Brak aktywnej subskrypcji</p>
                <button class="btn btn-primary" @click="$router.push('/billing')">
                  Zobacz plany
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Invite modal -->
      <Teleport to="body">
        <div v-if="showInviteModal" class="modal-overlay" @click.self="showInviteModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h2>Zaproś członka zespołu</h2>
              <button class="close-btn" @click="showInviteModal = false">&times;</button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="inviteMember">
                <div class="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    v-model="inviteForm.email"
                    class="input"
                    required
                    placeholder="jan@firma.pl"
                  />
                </div>
                <div class="form-group">
                  <label>Rola</label>
                  <select v-model="inviteForm.role" class="input">
                    <option value="member">Członek</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div class="modal-actions">
                  <button type="button" class="btn btn-sm" @click="showInviteModal = false">
                    Anuluj
                  </button>
                  <button type="submit" class="btn btn-primary" :disabled="isInviting">
                    {{ isInviting ? 'Wysyłanie...' : 'Wyślij zaproszenie' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </RequireAuth>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useCompanyStore } from '../stores/company.js'
import { useTeamStore } from '../stores/team.js'
import { useSubscriptionStore } from '../stores/subscription.js'
import RequireAuth from '../components/RequireAuth.vue'
import EmptyState from '../components/EmptyState.vue'

const authStore = useAuthStore()
const companyStore = useCompanyStore()
const teamStore = useTeamStore()
const subscriptionStore = useSubscriptionStore()

// Tabs
const tabs = [
  { id: 'account', label: 'Konto' },
  { id: 'security', label: 'Bezpieczeństwo' },
  { id: 'company', label: 'Firma' },
  { id: 'team', label: 'Zespół' },
  { id: 'billing', label: 'Subskrypcja' }
]
const activeTab = ref('account')

// Password change
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const isChangingPassword = ref(false)

// 2FA
const is2FALoading = ref(false)

// Team invite
const showInviteModal = ref(false)
const inviteForm = ref({
  email: '',
  role: 'member'
})
const isInviting = ref(false)

// Role labels
const roleLabels = {
  owner: 'Właściciel',
  admin: 'Administrator',
  member: 'Członek'
}

function getRoleLabel(role) {
  return roleLabels[role] || role
}

// Status labels
const statusLabels = {
  active: 'Aktywna',
  trialing: 'Okres próbny',
  past_due: 'Zaległa płatność',
  canceled: 'Anulowana',
  incomplete: 'Niekompletna'
}

function getStatusLabel(status) {
  return statusLabels[status] || status
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

async function changePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    alert('Hasła nie są identyczne')
    return
  }

  isChangingPassword.value = true
  try {
    // TODO: Implement password change API call
    console.log('Change password:', passwordForm.value)
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    alert('Hasło zostało zmienione')
  } catch (error) {
    console.error('Failed to change password:', error)
    alert('Nie udało się zmienić hasła')
  } finally {
    isChangingPassword.value = false
  }
}

async function enable2FA() {
  is2FALoading.value = true
  try {
    // TODO: Implement 2FA enable API call
    console.log('Enable 2FA')
  } catch (error) {
    console.error('Failed to enable 2FA:', error)
  } finally {
    is2FALoading.value = false
  }
}

async function disable2FA() {
  is2FALoading.value = true
  try {
    // TODO: Implement 2FA disable API call
    console.log('Disable 2FA')
  } catch (error) {
    console.error('Failed to disable 2FA:', error)
  } finally {
    is2FALoading.value = false
  }
}

async function inviteMember() {
  isInviting.value = true
  try {
    await teamStore.inviteMember(inviteForm.value.email, inviteForm.value.role)
    showInviteModal.value = false
    inviteForm.value = { email: '', role: 'member' }
  } catch (error) {
    console.error('Failed to invite member:', error)
    alert('Nie udało się wysłać zaproszenia')
  } finally {
    isInviting.value = false
  }
}

async function removeMember(member) {
  if (!confirm(`Czy na pewno chcesz usunąć ${member.email} z zespołu?`)) return

  try {
    await teamStore.removeMember(member.id)
  } catch (error) {
    console.error('Failed to remove member:', error)
    alert('Nie udało się usunąć członka')
  }
}

// Load data on mount
onMounted(async () => {
  try {
    await Promise.all([
      companyStore.loadCompanies(),
      teamStore.loadMembers(),
      subscriptionStore.loadSubscription()
    ])
  } catch (error) {
    console.error('Failed to load settings data:', error)
  }
})
</script>

<style scoped>
.settings-view {
  min-height: 100vh;
  background: #f9fafb;
}

.page-header {
  padding: 1.5rem 2rem;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.header-content h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.25rem 0;
}

.header-content p {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

.page-content {
  padding: 1.5rem 2rem;
  max-width: 800px;
  margin: 0 auto;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  overflow-x: auto;
}

.tab {
  padding: 0.625rem 1rem;
  border: none;
  background: none;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  border-radius: 8px;
  white-space: nowrap;
  transition: all 0.2s;
}

.tab:hover {
  background: #f3f4f6;
  color: #374151;
}

.tab.active {
  background: #2563eb;
  color: #ffffff;
}

.card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.card-header h2 {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.card-content {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.375rem;
}

.input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: #2563eb;
}

.input.disabled {
  background: #f9fafb;
  color: #6b7280;
  cursor: not-allowed;
}

.hint {
  display: block;
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: #ffffff;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  background: #f3f4f6;
  color: #374151;
}

.btn-sm:hover {
  background: #e5e7eb;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}

.btn-danger:hover {
  background: #fecaca;
}

.section {
  padding: 1.5rem 0;
  border-bottom: 1px solid #f3f4f6;
}

.section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.section h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.75rem 0;
}

.section-desc {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0.5rem 0 1rem;
}

.password-form {
  max-width: 320px;
}

.status-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
}

.status-badge.enabled {
  background: #dcfce7;
  color: #16a34a;
}

.status-badge.disabled {
  background: #f3f4f6;
  color: #6b7280;
}

.team-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.team-member {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-radius: 8px;
}

.member-email {
  font-weight: 500;
  color: #111827;
}

.member-role {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  margin-left: 0.5rem;
}

.member-role.owner {
  background: #fef3c7;
  color: #d97706;
}

.member-role.admin {
  background: #dbeafe;
  color: #2563eb;
}

.member-role.member {
  background: #f3f4f6;
  color: #6b7280;
}

.subscription-info {
  text-align: center;
  padding: 1rem 0;
}

.plan-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
}

.plan-status {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
}

.plan-status.active,
.plan-status.trialing {
  background: #dcfce7;
  color: #16a34a;
}

.plan-status.past_due,
.plan-status.incomplete {
  background: #fee2e2;
  color: #dc2626;
}

.plan-status.canceled {
  background: #f3f4f6;
  color: #6b7280;
}

.trial-info {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.75rem;
}

.no-subscription {
  text-align: center;
  padding: 2rem 0;
}

.no-subscription p {
  color: #6b7280;
  margin-bottom: 1rem;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  width: 90%;
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #9ca3af;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #6b7280;
}

.modal-body {
  padding: 1.5rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
</style>
