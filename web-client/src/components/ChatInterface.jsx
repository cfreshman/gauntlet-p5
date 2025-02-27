import React, { useState, useRef, useEffect } from 'react';
import { PaperPlaneTilt } from 'phosphor-react';
import ReactMarkdown from 'react-markdown';
import { useApp } from '../contexts/AppContext';
import '../styles/chat-interface.css';

const ChatInterface = () => {
  const { messages, sendMessage, isLoading } = useApp();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [inputValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading || !inputValue.trim()) {
      return;
    }
    sendMessage(inputValue.trim());
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) {
        handleSubmit(e);
      }
    }
  };

  const getMessageContent = (msg) => {
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    if (typeof msg.content === 'object') {
      if (Array.isArray(msg.content)) {
        return msg.content.map(item => item.text || '').join('\n');
      }
      return msg.content.text || '';
    }
    return '';
  };

  return (
    <div className="chat-interface">
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>ask about music, create playlists, or discover new artists</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role} ${msg.style || ''}`}>
              <div className="message-content">
                <ReactMarkdown>{getMessageContent(msg)}</ReactMarkdown>
              </div>
            </div>
          ))
        )}
        {isLoading && !messages.some(m => m.isThinking) && (
          <div className="message assistant loading">
            <div className="loading-indicator">
              <span>.</span><span>.</span><span>.</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form className="input-container" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className={`message-input ${isLoading ? 'loading' : ''}`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button 
          type="submit" 
          className={`send-button ${isLoading ? 'loading' : ''}`} 
          disabled={!inputValue.trim() || isLoading}
        >
          <PaperPlaneTilt weight="bold" size={20} />
        </button>
      </form>
    </div>
  );
};

export default ChatInterface; 