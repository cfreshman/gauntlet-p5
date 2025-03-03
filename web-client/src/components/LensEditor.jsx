import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { X, CaretRight } from 'phosphor-react';
import '../styles/lens-editor.css';

const LensEditor = ({ isOpen, onClose }) => {
  const { lens, setLens } = useApp();
  const [localLens, setLocalLens] = useState(lens || '');
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    setLocalLens(lens || '');
  }, [lens]);

  const handleSave = () => {
    setLens(localLens);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="lens-editor">
      <div className="lens-editor-header">
        <h2>lens</h2>
        <button onClick={onClose} className="close-button">
          <X size={16} weight="bold" />
        </button>
      </div>
      <button 
        className={`examples-toggle ${showExamples ? 'open' : ''}`}
        onClick={() => setShowExamples(!showExamples)}
      >
        <CaretRight size={10} weight="bold" />
        <span>examples</span>
      </button>
      {showExamples && (
        <ul className="lens-examples">
          <li>- prefer similar artists over top charts</li>
          <li>- focus on genres: ambient, electronic, jazz</li>
          <li>- use my playlists for recommendations</li>
          <li>- find new music instead of familiar tracks</li>
          <li>- use tags: melancholic, energetic, atmospheric</li>
        </ul>
      )}
      <textarea
        value={localLens}
        onChange={(e) => setLocalLens(e.target.value)}
        placeholder="enter your music preferences..."
        className="lens-input"
        rows={12}
      />
      <div className="lens-editor-footer">
        <button onClick={handleSave} className="save-button" disabled={localLens === lens}>
          save
        </button>
      </div>
    </div>
  );
};

export default LensEditor; 