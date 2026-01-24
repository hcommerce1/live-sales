/**
 * Email Service
 *
 * Sends notification emails for errors and alerts.
 * Uses nodemailer with SMTP configuration.
 *
 * NOT for marketing emails - only technical notifications.
 */

const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.enabled = false;
  }

  /**
   * Initialize email transporter
   * Call once at app startup
   */
  init() {
    if (this.initialized) {
      return;
    }

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      logger.warn('Email service not configured (SMTP_HOST, SMTP_USER, SMTP_PASS required)');
      this.initialized = true;
      this.enabled = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production',
        },
      });

      this.enabled = true;
      logger.info('Email service initialized', { host, port });
    } catch (error) {
      logger.error('Email service initialization failed', { error: error.message });
      this.enabled = false;
    }

    this.initialized = true;
  }

  /**
   * Check if email service is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled && this.transporter !== null;
  }

  /**
   * Send email
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} html - HTML body
   * @param {string} text - Plain text body (fallback)
   * @returns {Promise<boolean>} Success status
   */
  async send(to, subject, html, text) {
    if (!this.isEnabled()) {
      logger.debug('Email not sent - service disabled', { to, subject });
      return false;
    }

    try {
      const fromName = process.env.SMTP_FROM_NAME || 'Live Sales';
      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
      });

      logger.info('Email sent', { to, subject });
      return true;
    } catch (error) {
      logger.error('Failed to send email', {
        error: error.message,
        to,
        subject,
      });
      return false;
    }
  }

  /**
   * Strip HTML tags for plain text fallback
   * @param {string} html
   * @returns {string}
   */
  stripHtml(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Get notification settings for a company
   * @param {string} companyId
   * @returns {Promise<Object|null>}
   */
  async getNotificationSettings(companyId) {
    try {
      return await prisma.notificationSettings.findUnique({
        where: { companyId }
      });
    } catch (error) {
      logger.error('Failed to get notification settings', {
        error: error.message,
        companyId,
      });
      return null;
    }
  }

  /**
   * Send export error notification
   * @param {string} companyId - Company ID
   * @param {string} exportName - Export name
   * @param {string} errorMessage - Error details
   * @param {Object} metadata - Additional context
   */
  async sendExportErrorNotification(companyId, exportName, errorMessage, metadata = {}) {
    if (!this.isEnabled()) {
      return;
    }

    const settings = await this.getNotificationSettings(companyId);

    if (!settings || !settings.notifyOnExportError || settings.errorEmails.length === 0) {
      logger.debug('Export error notification skipped - not configured', { companyId, exportName });
      return;
    }

    const subject = `[Live Sales] Błąd eksportu: ${exportName}`;
    const timestamp = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Błąd eksportu</h2>

        <p>Eksport <strong>${this.escapeHtml(exportName)}</strong> zakończył się błędem.</p>

        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #991b1b;"><strong>Błąd:</strong></p>
          <p style="margin: 8px 0 0 0; color: #7f1d1d; font-family: monospace; white-space: pre-wrap;">${this.escapeHtml(errorMessage)}</p>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          <strong>Czas:</strong> ${timestamp}<br>
          ${metadata.exportId ? `<strong>ID eksportu:</strong> ${metadata.exportId}<br>` : ''}
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

        <p style="color: #9ca3af; font-size: 12px;">
          To jest automatyczne powiadomienie z systemu Live Sales.<br>
          Możesz zarządzać powiadomieniami w ustawieniach firmy.
        </p>
      </div>
    `;

    // Send to all configured email addresses
    for (const email of settings.errorEmails) {
      await this.send(email, subject, html);
    }

    logger.info('Export error notifications sent', {
      companyId,
      exportName,
      recipientCount: settings.errorEmails.length,
    });
  }

  /**
   * Send payment issue notification
   * @param {string} companyId - Company ID
   * @param {string} issueType - Type of issue (e.g., 'payment_failed', 'subscription_canceled')
   * @param {Object} details - Additional details
   */
  async sendPaymentIssueNotification(companyId, issueType, details = {}) {
    if (!this.isEnabled()) {
      return;
    }

    const settings = await this.getNotificationSettings(companyId);

    if (!settings || !settings.notifyOnPaymentIssue || settings.errorEmails.length === 0) {
      logger.debug('Payment issue notification skipped - not configured', { companyId, issueType });
      return;
    }

    const issueMessages = {
      payment_failed: {
        title: 'Płatność nieudana',
        description: 'Próba pobrania płatności za subskrypcję nie powiodła się.',
        action: 'Sprawdź dane karty płatniczej w ustawieniach rozliczeń.',
      },
      subscription_past_due: {
        title: 'Subskrypcja przeterminowana',
        description: 'Twoja subskrypcja jest przeterminowana z powodu nieudanych płatności.',
        action: 'Zaktualizuj metodę płatności, aby uniknąć utraty dostępu.',
      },
      subscription_canceled: {
        title: 'Subskrypcja anulowana',
        description: 'Twoja subskrypcja została anulowana.',
        action: 'Możesz odnowić subskrypcję w dowolnym momencie.',
      },
      trial_ending: {
        title: 'Okres próbny kończy się',
        description: `Twój okres próbny kończy się ${details.endDate || 'wkrótce'}.`,
        action: 'Dodaj metodę płatności, aby kontynuować korzystanie z pełnych funkcji.',
      },
    };

    const issue = issueMessages[issueType] || {
      title: 'Problem z płatnością',
      description: 'Wystąpił problem z Twoją subskrypcją.',
      action: 'Skontaktuj się z obsługą klienta.',
    };

    const subject = `[Live Sales] ${issue.title}`;
    const timestamp = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">${this.escapeHtml(issue.title)}</h2>

        <p>${this.escapeHtml(issue.description)}</p>

        <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #854d0e;"><strong>Zalecane działanie:</strong></p>
          <p style="margin: 8px 0 0 0; color: #713f12;">${this.escapeHtml(issue.action)}</p>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          <strong>Czas:</strong> ${timestamp}
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

        <p style="color: #9ca3af; font-size: 12px;">
          To jest automatyczne powiadomienie z systemu Live Sales.<br>
          Możesz zarządzać powiadomieniami w ustawieniach firmy.
        </p>
      </div>
    `;

    // Send to all configured email addresses
    for (const email of settings.errorEmails) {
      await this.send(email, subject, html);
    }

    logger.info('Payment issue notifications sent', {
      companyId,
      issueType,
      recipientCount: settings.errorEmails.length,
    });
  }

  /**
   * Escape HTML special characters
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = emailService;
