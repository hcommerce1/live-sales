const { google } = require('googleapis');
const config = require('../config/googleSheets');
const logger = require('../utils/logger');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initAuth();
  }

  /**
   * Initialize Google Sheets API authentication
   */
  initAuth() {
    try {
      // Try using full credentials JSON first (recommended)
      if (config.credentialsJson) {
        logger.info('Initializing Google Sheets auth with credentials JSON', {
          email: config.credentialsJson.client_email,
          projectId: config.credentialsJson.project_id
        });

        this.auth = new google.auth.GoogleAuth({
          credentials: config.credentialsJson,
          scopes: config.scopes,
        });

        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        logger.info('Google Sheets API initialized successfully (using JSON credentials)');
        return;
      }

      // Fallback to separate email/key (legacy)
      if (!config.serviceAccountEmail || !config.privateKey) {
        logger.warn('Google Sheets credentials not configured');
        return;
      }

      logger.info('Initializing Google Sheets auth with email/key', {
        email: config.serviceAccountEmail,
        keyLength: config.privateKey?.length,
        keyStart: config.privateKey?.substring(0, 30)
      });

      this.auth = new google.auth.JWT({
        email: config.serviceAccountEmail,
        key: config.privateKey,
        scopes: config.scopes,
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      logger.info('Google Sheets API initialized successfully (using email/key)');
    } catch (error) {
      logger.error('Failed to initialize Google Sheets API', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Extract Sheet ID from URL
   * @param {string} url - Google Sheets URL
   * @returns {string} - Sheet ID
   */
  extractSheetId(url) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Sheets URL');
    }
    return match[1];
  }

  /**
   * Extract GID (sub-sheet ID) from URL
   * Supports both ?gid= and #gid= formats
   * @param {string} url - Google Sheets URL
   * @returns {string|null} - GID if present, null otherwise
   */
  extractGid(url) {
    // Support both ?gid= and #gid= formats (Google uses both)
    const match = url.match(/[?#]gid=(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Get sheet name by GID
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} gid - Sheet GID
   * @returns {Promise<string>} - Sheet name
   */
  async getSheetNameByGid(spreadsheetId, gid) {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets.find(
      s => s.properties.sheetId === parseInt(gid, 10)
    );

    if (!sheet) {
      throw new Error(`Sheet with GID "${gid}" not found`);
    }

    return sheet.properties.title;
  }

  /**
   * Write data to Google Sheets
   * @param {string} sheetUrl - Google Sheets URL
   * @param {Array<string>} headers - Column headers
   * @param {Array<Array>} data - Data rows
   * @param {string} writeMode - 'append' (insert at top) or 'replace' (clear and write)
   * @param {string} sheetName - Sheet name (default: first sheet)
   * @returns {Promise<object>} - Update result
   */
  async writeData(sheetUrl, headers, data, writeMode = 'append', sheetName = null) {
    try {
      logger.info(`[SHEETS WRITE] Starting`, {
        sheetUrl,
        writeMode,
        rowCount: data.length,
        columnCount: headers.length,
        hasSheets: !!this.sheets,
        hasAuth: !!this.auth
      });

      if (!this.sheets) {
        throw new Error('Google Sheets API not initialized');
      }

      const sheetId = this.extractSheetId(sheetUrl);
      const gid = this.extractGid(sheetUrl);

      logger.info(`[SHEETS WRITE] Extracted IDs`, {
        sheetId,
        gid
      });

      // Get sheet name if not provided
      if (!sheetName) {
        if (gid) {
          logger.info(`[SHEETS WRITE] Getting sheet name by GID...`, { gid });
          // Use GID to find the specific sheet
          sheetName = await this.getSheetNameByGid(sheetId, gid);
          logger.info(`[SHEETS WRITE] Resolved sheet name from GID`, { gid, sheetName });
        } else {
          logger.info(`[SHEETS WRITE] Getting first sheet name...`);
          // Default to first sheet
          const spreadsheet = await this.sheets.spreadsheets.get({
            spreadsheetId: sheetId,
          });
          sheetName = spreadsheet.data.sheets[0].properties.title;
          logger.info(`[SHEETS WRITE] Got first sheet name`, { sheetName });
        }
      }

      const range = `${sheetName}!A:Z`;

      if (writeMode === 'replace') {
        // Clear existing data
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId: sheetId,
          range: range,
        });

        // Write headers and data
        const values = [headers, ...data];
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `${sheetName}!A1`,
          valueInputOption: 'RAW',
          resource: {
            values: values,
          },
        });

        logger.info(`Data replaced in Google Sheets`, {
          sheetId,
          totalRows: values.length
        });

        return {
          success: true,
          mode: 'replace',
          rowsWritten: values.length
        };
      } else {
        // 'append' mode - insert at top (after header)
        // First, check if sheet has headers
        const existingData = await this.sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${sheetName}!A1:Z1`,
        });

        let hasHeaders = false;
        if (existingData.data.values && existingData.data.values.length > 0) {
          hasHeaders = true;
        }

        if (!hasHeaders) {
          // Write headers first
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            resource: {
              values: [headers],
            },
          });
        }

        // Insert data at row 2 (pushing old data down)
        // This ensures newest data is always at the top
        if (data.length > 0) {
          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            resource: {
              requests: [
                {
                  insertDimension: {
                    range: {
                      sheetId: await this.getSheetIdByName(sheetId, sheetName),
                      dimension: 'ROWS',
                      startIndex: 1,
                      endIndex: 1 + data.length,
                    },
                  },
                },
              ],
            },
          });

          // Write data to newly inserted rows
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'RAW',
            resource: {
              values: data,
            },
          });
        }

        logger.info(`Data appended to Google Sheets (insert at top)`, {
          sheetId,
          rowsInserted: data.length
        });

        return {
          success: true,
          mode: 'append',
          rowsWritten: data.length
        };
      }
    } catch (error) {
      logger.error('[SHEETS WRITE] FAILED', {
        error: error.message,
        errorStack: error.stack,
        errorCode: error.code,
        errorName: error.name,
        errorResponse: JSON.stringify(error.response?.data),
        errorStatus: error.response?.status,
        errorStatusText: error.response?.statusText,
        sheetUrl,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      throw error;
    }
  }

  /**
   * Get sheet ID by name
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} sheetName - Sheet name
   * @returns {Promise<number>} - Sheet ID
   */
  async getSheetIdByName(spreadsheetId, sheetName) {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets.find(
      s => s.properties.title === sheetName
    );

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    return sheet.properties.sheetId;
  }

  /**
   * Read data from Google Sheets
   * @param {string} sheetUrl - Google Sheets URL
   * @param {string} range - Range to read (e.g., 'Sheet1!A1:Z100')
   * @returns {Promise<Array<Array>>} - Data rows
   */
  async readData(sheetUrl, range = 'A:Z') {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets API not initialized');
      }

      const sheetId = this.extractSheetId(sheetUrl);

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: range,
      });

      return response.data.values || [];
    } catch (error) {
      logger.error('Failed to read data from Google Sheets', {
        error: error.message,
        sheetUrl
      });
      throw error;
    }
  }

  /**
   * Validate sheet access
   * @param {string} sheetUrl - Google Sheets URL
   * @returns {Promise<boolean>} - True if accessible
   */
  async validateAccess(sheetUrl) {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets API not initialized');
      }

      const sheetId = this.extractSheetId(sheetUrl);

      await this.sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to validate Google Sheets access', {
        error: error.message,
        sheetUrl
      });
      return false;
    }
  }
}

module.exports = new GoogleSheetsService();
