// monitorResultsHandler.js

/**
 * Handles monitor results safely with proper error handling for FOREIGN KEY constraints.
 */
const { db } = require('../db');

/**
 * Stores the monitor results into the database.
 * @param {Object} results - The results to store.
 */
async function storeMonitorResults(results) {
    try {
        await db('monitor_results').insert(results);
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            console.error('Foreign key constraint error:', error.message);
            throw new Error('Failed to store results due to foreign key constraint violation.');
        }
        throw error; // Rethrow any other error for global handling.
    }
}

module.exports = { storeMonitorResults };