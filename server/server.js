const express = require('express');
require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

function generateRandomString(length) {
    return crypto.randomBytes(length).toString('hex');
}

const app = express();
const port = 3000;

// Middleware used to store the state parameter across multiple requests
// This middleware adds a session object to every request (req) that your Express application handles.
const session = require('express-session');
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));

app.get('/', (req, res) => {
    res.send('This is supposed to be the homepage');
});

app.get('/login', (req, res) => {
    const scope = 'user-read-private user-read-email';
    const state = generateRandomString(16);

    // Store the state in the user session (thanks to the middleware)
    req.session.state = state;

    res.redirect('https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + process.env.SPOTIFY_CLIENT_ID +
        (scope ? '&scope=' + encodeURIComponent(scope) : '') +
        '&redirect_uri=' + encodeURIComponent(process.env.REDIRECT_URI) +
        '&state=' + state);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;

    // Check if the state matches the stored state
    if (state !== req.session.state) {
        res.send('State mismatch: Request may have been intercepted');
        return;
    }

    try {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            'grant_type=authorization_code' +
            '&code=' + code +
            '&redirect_uri=' + encodeURIComponent(process.env.REDIRECT_URI) +
            '&client_id=' + process.env.SPOTIFY_CLIENT_ID +
            '&client_secret=' + process.env.SPOTIFY_CLIENT_SECRET,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const accessToken = response.data.access_token;
        const refreshToken = response.data.refresh_token;

        // Now you can use the access token to make authorized requests on behalf of the user
        const userResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        console.log('user profile:', userResponse.data);

    } catch (error) {
        console.error(error);
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
