/**
 * Elahe Panel - Tunnel Engines Index
 * Exports all tunnel engines and the manager
 * Developer: EHSANKiNG
 */

const sshEngine = require('./ssh');
const frpEngine = require('./frp');
const gostEngine = require('./gost');
const chiselEngine = require('./chisel');
const trustTunnelEngine = require('./trusttunnel');
const tunnelManager = require('./manager');

module.exports = {
  sshEngine,
  frpEngine,
  gostEngine,
  chiselEngine,
  trustTunnelEngine,
  tunnelManager,
  
  // Quick access to engines by name
  engines: {
    ssh: sshEngine,
    frp: frpEngine,
    gost: gostEngine,
    chisel: chiselEngine,
    psiphon: chiselEngine,
    trusttunnel: trustTunnelEngine,
  },
};
