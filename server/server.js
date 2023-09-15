const express = require('express');
require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const bodyParser = require('body-parser');

function generateRandomString(length) {
    return crypto.randomBytes(length).toString('hex');
}

const app = express();
const port = 3000;

// Middleware used to store the state parameter across multiple requests
// This middleware adds a session object to every request (req) that your Express application handles.
const session = require('express-session');
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('This is supposed to be the homepage');
});

app.get('/login', (req, res) => {
    const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private';
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
    // Extract the code and state from the request query
    const code = req.query.code;
    const state = req.query.state;

    // Check if the state matches the stored state
    if (state !== req.session.state) {
        // If the state doesn't match, send an error message
        res.send('State mismatch: Request may have been intercepted');
        return;
    }

    try {
        // Make a POST request to the Spotify API to get an access token
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

        // Extract the access token from the response
        const accessToken = response.data.access_token;
        // Store the access token in the session
        req.session.accessToken = accessToken;

        // Extract the refresh token from the response
        const refreshToken = response.data.refresh_token;

        // Use the access token to make authorized requests on behalf of the user
        const userResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        // Store the user's Spotify ID in the session
        req.session.userId = userResponse.data.id;

        // Save the session data
        // Explanation why is method req.session.save() needed (https://capture.dropbox.com/1z8Am6QLkKocHwf1) 
        // --> because you're making two async requests post and get to get 'userID' and 'accessToken'
        req.session.save(err => {
            if (err) {
                console.error(err);
            } else {
                console.log('running LOGIN')
                console.log('userId', req.session.userId)
                console.log('accessToken', req.session.accessToken)
            }
        });


    } catch (error) {
        // Log any errors that occur during the request
        console.error(error);
    }
});

app.get('/create-playlist', async (req, res) => {
    // Extract the access token and user ID from the session
    const accessToken = req.session.accessToken;
    const userId = req.session.userId;

    console.log('running CREATE PLAYLIST')
    console.log('userId', req.session.userId)
    console.log('accessToken', req.session.accessToken)

    // Check if the access token and user ID are present
    if (!accessToken || !userId) {
        // If not, send a 400 status code and an error message
        res.status(400).send('Missing access token or user ID');
        return;
    }

    try {
        // Make a POST request to the Spotify API to create a new playlist
        const playlistResponse = await axios.post(
            `https://api.spotify.com/v1/users/${userId}/playlists`,
            {
                // The body of the request contains the details of the new playlist
                name: 'New Playlist',
                description: 'Created with my app',
                public: false
            },
            {
                // The headers of the request contain the access token for authorization
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Log the response data (the new playlist)
        console.log('Created playlist:', playlistResponse.data);
        // Send a success message
        res.send('Playlist created successfully');

    } catch (error) {
        // Log any errors that occur during the request
        console.error(error);
        // Send a 500 status code and an error message
        res.status(500).send('Error creating playlist');
    }
});

app.post('/add-track', async (req, res) => {
    // Extract the access token from the session or the request body
    const accessToken = req.session.accessToken || req.body.accessToken

    // Extract the playlist ID and track URI from the request body
    const { playlistId, trackUri } = req.body;

    // Check if the access token, playlist ID, and track URI are present
    if (!accessToken) {
        // If not, send a 400 status code and an error message
        res.status(400).send('Missing access token');
        return;
    } else if (!playlistId) {
        // If not, send a 400 status code and an error message
        res.status(400).send('Missing playlistId');
        return;
    } else if (!trackUri) {
        // If not, send a 400 status code and an error message
        res.status(400).send('Missing trackUri');
        return;
    }

    try {
        // Make a POST request to the Spotify API to add the track to the playlist
        const response = await axios.post(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            {
                // The body of the request contains the track URIs
                uris: trackUri
            },
            {
                // The headers of the request contain the access token for authorization
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Send a success message
        res.send('Track added successfully');

    } catch (error) {
        // Log any errors that occur during the request
        console.error(error);
        // Send a 500 status code and an error message
        res.status(500).send('Error adding track');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
