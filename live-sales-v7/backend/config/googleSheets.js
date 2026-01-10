/**
 * Google Sheets API Configuration
 *
 * API Documentation: https://developers.google.com/sheets/api
 */

module.exports = {
  // Service Account Email
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,

  // Private Key (from service account JSON)
  privateKey: process.env.GOOGLE_PRIVATE_KEY ?
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') :
    null,

  // Scopes
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
  ],

  // Default write mode
  defaultWriteMode: 'append', // 'append' or 'replace'

  // Batch update size
  batchSize: 1000,
};
