/**
 * Cross-platform `npm start`: run the production server that serves `dist/`.
 * (Setting NODE_ENV inline only works in POSIX shells.)
 */
process.env.NODE_ENV = 'production';
import('../server/index.js');
