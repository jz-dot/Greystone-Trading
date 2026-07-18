/* Vercel entry point: every /api/* request is rewritten here (vercel.json)
   and handled by the same Express app that `npm start` runs locally. Static
   files (index.html, app.js, styles.css, services/*) are served by Vercel's
   CDN directly and never touch this function. */
module.exports = require('../server.js');
