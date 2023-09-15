// POOL VS CLIENT: https://capture.dropbox.com/rhHY9WL1kLIpXlfX

// Import the Pool object from the 'pg' module
const { Pool } = require('pg');

// Create a new Pool object with the database connection parameters
const pool = new Pool({
    // The host of the PostgreSQL server
    host: 'localhost',
    // The port of the PostgreSQL server
    port: 5555,
    // The name of the database to connect to
    database: 'playlist-chat',
    // The username to authenticate with
    user: 'your_username',
    // The password to authenticate with
    password: 'your_password'
});

// Export the pool object for use in other modules
module.exports = pool;