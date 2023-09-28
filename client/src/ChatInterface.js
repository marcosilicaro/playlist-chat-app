// ChatInterface.js
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom'; // Import the Link component
import './ChatInterface.css';
import axios from 'axios'; // Import axios at the top of your file

const ChatInterface = () => {
    // State for storing messages
    const [messages, setMessages] = useState([]);
    // State for storing user input in chat
    const [userInput, setUserInput] = useState('');

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(scrollToBottom, [messages]);

    // saves text in chat box to userInput state
    const handleInputChange = (event) => {
        setUserInput(event.target.value);
    }

    // Function to handle form submission
    const handleSubmit = async (event) => {
        event.preventDefault();
        // Add the user's message to the messages array
        setMessages(prevMessages => [...prevMessages, { role: 'user', content: userInput }]);
        // Add a loading message to the messages array
        const loadingMessageId = Date.now(); // Use the current timestamp as a unique id
        setMessages(prevMessages => [...prevMessages, { id: loadingMessageId, role: 'assistant', content: 'Loading...' }]);
        // Send a POST request to the chat endpoint
        try {
            const response = await axios.post('http://localhost:4000/chat', { message: userInput }, { withCredentials: true });
            // Replace the loading message with the assistant's message
            setMessages(prevMessages => prevMessages.map(message => message.id === loadingMessageId ? { ...message, content: response.data.message } : message));
        } catch (error) {
            console.error('Error sending message:', error);
            // Optionally, you can replace the loading message with an error message
            setMessages(prevMessages => prevMessages.map(message => message.id === loadingMessageId ? { ...message, content: 'An error occurred. Please try again.' } : message));
        }
        // Clear the user input
        setUserInput('');
    }

    const handleClean = async (event) => {
        try {
            // Make a GET request to the /clean endpoint
            await axios.get('http://localhost:4000/clean');
        } catch (error) {
            console.error('Error cleaning conversation:', error);
        }
    };

    const groupMessages = (messages) => {
        const groupedMessages = [];
        let currentGroup = [];

        for (let i = 0; i < messages.length; i++) {
            currentGroup.push(messages[i]);

            // If the next message is by a different user, or if this is the last message
            if (i === messages.length - 1 || messages[i].role !== messages[i + 1].role) {
                groupedMessages.push(currentGroup);
                currentGroup = [];
            }
        }

        return groupedMessages;
    };

    // Render the chat interface
    return (
        <div className="chat-interface">
            <div className="left-column">
                <h2>Playlist Chat</h2>
                <Link to="/" onClick={handleClean}>Home</Link>
                <a href="#contact">Placeholder 2</a>
                <a href="#about">Placeholder 3</a>
            </div>
            <div className="right-column">

                <div className="chat-messages">
                    <div class="message-group assistant">
                        <div class="message-role">
                            <div class="assistant-indicator"></div>
                        </div>
                        <div class="message-content">
                            <div class="chat-message ">Hi there...I'm your spotify assitant.</div>
                            <div class="chat-message ">I'm going to ask you questions about you and, based on your answers I'm gonna give you a spotify playslist tailored just for you.</div>
                            <div class="chat-message ">Let's start. What do you like to do in your free time?</div>
                        </div>
                    </div>

                    {/* Map through messages and render each one */}
                    {groupMessages(messages).map((group, index, array) => (
                        <div key={index} className={`message-group ${group[0].role}`} ref={index === array.length - 1 ? messagesEndRef : null}>
                            <div className={`message-role`}>
                                {group[0].role === 'assistant' ? <div className="assistant-indicator"></div> : group[0].role}
                            </div>
                            <div className="message-content">
                                {group.map((message, index) => (
                                    <div key={index} className={`chat-message`}>
                                        {message.content}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                {/* Form for user input */}
                <form onSubmit={handleSubmit} className="chat-input">
                    <input
                        type="text"
                        value={userInput}
                        onChange={handleInputChange}
                        placeholder="Type your message here"
                    />
                    <button type="submit">&gt;</button>
                </form>
            </div>
        </div>
    );
}

export default ChatInterface;