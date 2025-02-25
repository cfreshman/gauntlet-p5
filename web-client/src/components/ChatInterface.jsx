import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import '../styles/chat-interface.css';

const ChatInterface = ({ messages, sendMessage, isLoading, hideInput = false }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  
  // Log when component mounts
  useEffect(() => {
    console.log('ChatInterface mounted');
    return () => {
      console.log('ChatInterface unmounted');
    };
  }, []);
  
  // Log when messages or loading state changes
  useEffect(() => {
    console.log('Messages updated:', messages);
    console.log('Loading state:', isLoading);
  }, [messages, isLoading]);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      console.log('Form submitted with input:', input);
      sendMessage(input);
      setInput('');
    } else {
      console.log('Form submission prevented - empty input or loading:', { 
        inputEmpty: !input.trim(), 
        isLoading 
      });
    }
  };
  
  const handleInputChange = (e) => {
    setInput(e.target.value);
    console.log('Input changed:', e.target.value);
  };
  
  // auto-scroll to bottom when messages change
  useEffect(() => {
    console.log('Scrolling to bottom of messages');
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  return (
    <div className={`chat-interface ${hideInput ? 'input-hidden' : ''}`}>
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>ask about music, create playlists, or discover new artists</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <div className="message-content">
                {msg.role === 'assistant' ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="message assistant loading">
            <div className="loading-indicator">
              <span>.</span><span>.</span><span>.</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {!hideInput && (
        <form className="input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="type your message..."
            disabled={isLoading}
            className="message-input"
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()} 
            className="send-button"
            onClick={() => console.log('Send button clicked')}
          >
            send
          </button>
        </form>
      )}
    </div>
  );
};

export default ChatInterface; 