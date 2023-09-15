// POOL VS CLIENT: https://capture.dropbox.com/rhHY9WL1kLIpXlfX

// Import the Pool object from the 'pg' module
const { Pool } = require('pg');
require('dotenv').config();

// Create a new Pool object with the database connection parameters
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Export the pool object for use in other modules
module.exports = pool;