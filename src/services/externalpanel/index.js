/**
 * Elahe Panel - External Panel Integration (DEPRECATED)
 * This service has been removed as part of comprehensive panel improvements
 * Feature removed: External panel integration (Marzban/3x-ui)
 * Developer: EHSANKiNG
 */

const { createLogger } = require('../../utils/logger');

const log = createLogger('ExternalPanelService');

class ExternalPanelService {
  /**
   * @deprecated External panel integration has been removed
   * Returns empty data for backward compatibility
   */
  static listPanels() {
    log.debug('External panels feature deprecated - returning empty list');
    return [];
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static addPanel() {
    log.warn('External panel integration has been removed');
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static getPanel() {
    return null;
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static async loginMarzban() {
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static async loginXUI() {
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static async getMarzbanUsers() {
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static async getXUIInbounds() {
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static async syncFromMarzban() {
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static async syncFromXUI() {
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static async checkPanelHealth() {
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static deletePanel() {
    return { success: false, error: 'External panel integration has been removed' };
  }

  /**
   * @deprecated External panel integration has been removed
   */
  static getPanelProxyUrl() {
    return null;
  }
}

module.exports = ExternalPanelService;
