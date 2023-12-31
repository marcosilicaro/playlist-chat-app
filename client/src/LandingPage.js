import React from 'react';
import './LandingPage.css'; // Import the CSS file here

function LandingPage() {
    const handleLaunchApp = () => {
        window.location.href = 'http://localhost:4000/login';
    };

    return (
        <div className="App">
            <div className="menu">
                <a href="#home">Playlist Chat</a>
                <button className="menu-button" onClick={handleLaunchApp}>Launch App</button>
            </div>
            <div className="content"> {/* New div */}
                <h1>Create a music playlist just for you</h1>
                <p>Create music playlists tailored to your personality with the help of an AI music expert. Perfect for music lovers and geeks.</p>
                <button onClick={handleLaunchApp}>Launch App</button>
            </div>
        </div>
    );
}

export default LandingPage;