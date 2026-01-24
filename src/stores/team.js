// src/stores/team.js
// Pinia Team Store - Team members and invitations management

import { defineStore } from 'pinia'

export const useTeamStore = defineStore('team', {
  state: () => ({
    // Team members
    members: [],

    // Pending invitations
    pendingInvitations: [],

    // Loading states
    loading: false,
    error: null
  }),

  getters: {
    // Total members count
    membersCount: (state) => state.members.length,

    // Pending invitations count
    pendingCount: (state) => state.pendingInvitations.length,

    // Get member by ID
    getMemberById: (state) => (id) => state.members.find(m => m.id === id),

    // Get owner
    owner: (state) => state.members.find(m => m.role === 'owner'),

    // Get admins
    admins: (state) => state.members.filter(m => m.role === 'admin'),

    // Get regular members
    regularMembers: (state) => state.members.filter(m => m.role === 'member')
  },

  actions: {
    /**
     * Load team members
     */
    async loadMembers() {
      this.loading = true
      this.error = null

      try {
        const { API } = await import('../api.js')
        const response = await API.team.getMembers()

        this.members = response.members || []
        return this.members
      } catch (error) {
        console.error('[TeamStore] loadMembers failed:', error)
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * Load pending invitations
     */
    async loadPendingInvitations() {
      try {
        const { API } = await import('../api.js')
        const response = await API.team.getPending()

        this.pendingInvitations = response.invitations || []
        return this.pendingInvitations
      } catch (error) {
        console.error('[TeamStore] loadPendingInvitations failed:', error)
        throw error
      }
    },

    /**
     * Invite new member
     */
    async inviteMember(email, role = 'member') {
      try {
        const { API } = await import('../api.js')
        const response = await API.team.invite(email, role)

        // Reload pending invitations
        await this.loadPendingInvitations()

        return response
      } catch (error) {
        console.error('[TeamStore] inviteMember failed:', error)
        throw error
      }
    },

    /**
     * Cancel invitation
     */
    async cancelInvitation(token) {
      try {
        const { API } = await import('../api.js')
        await API.team.cancelInvitation(token)

        // Remove from local list
        this.pendingInvitations = this.pendingInvitations.filter(i => i.token !== token)
      } catch (error) {
        console.error('[TeamStore] cancelInvitation failed:', error)
        throw error
      }
    },

    /**
     * Resend invitation
     */
    async resendInvitation(token) {
      try {
        const { API } = await import('../api.js')
        return await API.team.resendInvitation(token)
      } catch (error) {
        console.error('[TeamStore] resendInvitation failed:', error)
        throw error
      }
    },

    /**
     * Remove member
     */
    async removeMember(memberId) {
      try {
        const { API } = await import('../api.js')
        await API.team.remove(memberId)

        // Remove from local list
        this.members = this.members.filter(m => m.id !== memberId)
      } catch (error) {
        console.error('[TeamStore] removeMember failed:', error)
        throw error
      }
    },

    /**
     * Change member role
     */
    async changeMemberRole(memberId, newRole) {
      try {
        const { API } = await import('../api.js')
        const response = await API.team.changeRole(memberId, newRole)

        // Update local list
        const index = this.members.findIndex(m => m.id === memberId)
        if (index >= 0) {
          this.members[index].role = newRole
        }

        return response
      } catch (error) {
        console.error('[TeamStore] changeMemberRole failed:', error)
        throw error
      }
    },

    /**
     * Transfer ownership
     */
    async transferOwnership(newOwnerId) {
      try {
        const { API } = await import('../api.js')
        const response = await API.team.transferOwnership(newOwnerId)

        // Reload members to reflect new roles
        await this.loadMembers()

        return response
      } catch (error) {
        console.error('[TeamStore] transferOwnership failed:', error)
        throw error
      }
    },

    /**
     * Leave company
     */
    async leaveCompany() {
      try {
        const { API } = await import('../api.js')
        return await API.team.leave()
      } catch (error) {
        console.error('[TeamStore] leaveCompany failed:', error)
        throw error
      }
    },

    /**
     * Load all team data
     */
    async loadAll() {
      await Promise.all([
        this.loadMembers(),
        this.loadPendingInvitations()
      ])
    },

    /**
     * Reset store state (on logout)
     */
    $reset() {
      this.members = []
      this.pendingInvitations = []
      this.loading = false
      this.error = null
    }
  }
})
