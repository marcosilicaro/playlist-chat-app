const express = require('express');
require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const bodyParser = require('body-parser');
const pool = require('./db');
const OpenAI = require('openai');
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


function generateRandomString(length) {
    return crypto.randomBytes(length).toString('hex');
}

const app = express();
const port = 4000;

// Middleware used to store the state parameter across multiple requests
// This middleware adds a session object to every request (req) that your Express application handles.
const session = require('express-session');
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

async function createPlaylist(accessToken, userId, playlistName) {

    // Check if the access token and user ID are present
    if (!accessToken || !userId) {
        // If not, send a 400 status code and an error message
        console.log('Missing access token or user ID');
        return;
    }

    try {
        // Make a POST request to the Spotify API to create a new playlist
        const playlistResponse = await axios.post(
            `https://api.spotify.com/v1/users/${userId}/playlists`,
            {
                // The body of the request contains the details of the new playlist
                name: playlistName,
                description: 'Created with playlist-chat app',
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

        // Extract the playlist's Spotify ID and details from the response data
        const playlistId = playlistResponse.data.id;
        const playlistDescription = playlistResponse.data.description;
        const playlistPublic = playlistResponse.data.public;

        // Insert the playlist's Spotify ID and details into the database, if it doesn't already exist
        pool.query(
            'INSERT INTO playlists (spotify_id, name, description, public, user_id) VALUES ($1, $2, $3, $4, (SELECT id FROM users WHERE spotify_id = $5)) ON CONFLICT (spotify_id) DO NOTHING',
            [playlistId, playlistName, playlistDescription, playlistPublic, userId]
        )
            .catch(error => console.error(error));


        // Log the response data (the new playlist)
        console.log('Created playlist id:', playlistId);
        return playlistId
    } catch (error) {
        // Log any errors that occur during the request
        console.error(error);
        throw (error)
    }
}

async function addTrack(accessToken, playlistId, trackUri) {

    // Check if the access token, playlist ID, and track URI are present
    if (!accessToken) {
        // If not, throw an error
        throw new Error('Missing access token');
    } else if (!playlistId) {
        // If not, throw an error
        throw new Error('Missing playlistId');
    } else if (!trackUri) {
        // If not, throw an error
        throw new Error('Missing trackUri');
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
        console.log('Track added successfully');
        return response

    } catch (error) {
        // Log any errors that occur during the request
        console.error(error);
        throw (error)
    }
}

// Define a function to generate a playlist name based on the conversation
async function generatePlaylistName(conversation) {
    // Add a system message to the conversation asking the assistant to generate a playlist name
    conversation.push({ role: 'system', content: 'Assistant, please generate a 2-word creative Spotify playlist name based on the previous conversation. The name should reflect the user\'s preferences and the mood of the conversation. Please respond with just the 2-word playlist name.' });

    // Use OpenAI's GPT-3 model to generate a playlist name based on the conversation
    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: conversation,
    });

    // Extract the assistant's message from the response
    let playlistName = response.choices[0].message.content;
    console.log('running playlist name generator:', playlistName)

    return playlistName;
}

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

        // Extract the user's Spotify ID from the response data
        const userId = userResponse.data.id;
        // Insert the user's Spotify ID into the database, if it doesn't already exist
        pool.query('INSERT INTO users (spotify_id) VALUES ($1) ON CONFLICT (spotify_id) DO NOTHING', [userId])
            .catch(error => console.error(error));

        // Store the user's Spotify ID in the session
        req.session.userId = userId;

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

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error(err);
            res.status(500).send('Could not log out. Please try again.');
        } else {
            res.send('Logout successful');
        }
    });
});

app.get('/clean', async (req, res) => {
    const spotifyId = '11123332839';

    try {
        // Update the conversation column for the user with the specified spotify_id
        await pool.query('UPDATE users SET conversation = NULL WHERE spotify_id = $1', [spotifyId]);

        // Send a success message
        res.send('Conversation cleared successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error clearing conversation');
    }
});

app.post('/chat', async (req, res) => {
    const userId = req.session.userId || req.body.userId;
    const accessToken = req.session.accessToken || req.body.accessToken;
    const message = req.body.message;

    // Define required parameters
    const requiredParams = { message, userId, accessToken };
    // Loop through each parameter
    for (let param in requiredParams) {
        // Check if the parameter is missing
        if (!requiredParams[param]) {
            // If it is, send a 400 status code and an error message
            res.status(400).send(`Missing ${param}`);
            // Stop execution
            return;
        }
    }

    // Get the conversation history for this user from the database
    const retrievedConversation = await pool.query('SELECT conversation FROM users WHERE spotify_id = $1', [userId]);
    // The '?' is the optional chaining operator. 
    // It returns undefined if the operand is null or undefined, instead of causing an error.
    // This is used to prevent errors when trying to access properties of undefined or null values.
    let conversation = retrievedConversation.rows[0]?.conversation;

    // If there's no conversation history, start a new one
    // Remember: first question assistant asks is: What do you like to do in your free time
    if (!conversation) {
        conversation = [
            { role: 'system', content: 'As a music expert and psychologist, your task is to curate a personalized 20-track Spotify playlist for the user. Start by asking the user two questions, beginning with their movie preferences, to gauge their personality. After the questions, provide the 20-track playlist in an array using Spotify URI notation, like so: ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh", "spotify:track:1301WleyT98MSxVHPZCA6M"] (and 18 more songs)' },
            { role: 'assistant', content: 'Hi, I\'m your spotify assitant. I\'m going to ask you questions about you and, based on your answers, I\'m gonna give you a spotify playslist tailored just for you. Let\'s start. What do you like to do in your free time?' },
        ];
    } else {
        // Convert the conversation from an array of strings to an array of objects
        // Necessary as PostgreSQL returns arrays of JSON objects as arrays of strings
        // JSON.parse turns each string back into a JavaScript object
        conversation = conversation.map(JSON.parse);
    }

    // Add the user's message to the conversation history
    conversation.push({ role: 'user', content: message });
    try {
        // Check if the user's message is "yes" and a playlist is stored in the session - && req.session.playlist
        if (message.toLowerCase() === 'yes' && req.session.playlist) {
            // Call  createPlaylist to create a new playlist
            const playlistId = await createPlaylist(accessToken, userId, await generatePlaylistName(conversation))

            // Call the add-track fn with all track URIs in the playlist
            await addTrack(accessToken, playlistId, req.session.playlist)

            const saveConfirmationMessage = 'Your playlist has been saved to your Spotify account.';
            conversation.push({ role: 'assistant', content: saveConfirmationMessage });

            // Send the confirmation message back to the user
            res.send({ message: saveConfirmationMessage });
            return;
        }

        // Attempt to generate a response from OpenAI's GPT-3 model

        // Use OpenAI's GPT-3 model to generate a response based on the conversation history
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: conversation,
        });

        // Add the assistant's message to the conversation history
        let assistantMessage = response.choices[0].message.content;
        conversation.push({ role: 'assistant', content: assistantMessage });

        // Check if the assistant's message contains a playlist
        if (assistantMessage.includes('spotify:track:')) {
            // Extract the playlist from the assistant's message
            const playlist = assistantMessage.match(/spotify:track:\w+/g);
            // Append a question to the assistant's message asking the user if they want to save the playlist
            assistantMessage += ' Would you like to save this playlist to your Spotify account?';
            // Store the playlist in the session
            req.session.playlist = playlist;
        }

        // Update the conversation history in the database
        await pool.query('UPDATE users SET conversation = $1 WHERE spotify_id = $2', [conversation, userId]);

        // Send the assistant's message back to the user
        res.send({ message: assistantMessage });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating response');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
