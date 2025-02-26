import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  SpeakerHigh, 
  SpeakerX,
  CaretUp,
  CaretDown
} from 'phosphor-react';
import { usePlayback } from '../contexts/PlaybackContext';
import '../styles/playback-controls.css';

const PlaybackControls = () => {
  const [expanded, setExpanded] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [contextName, setContextName] = useState(null);
  const progressTimerRef = useRef(null);
  const { playbackState, playbackDevices, sendPlaybackCommand, handlePlayerExpandToggle } = usePlayback();
  const apiRef = useRef(null);

  // Update local progress when playback state changes
  useEffect(() => {
    if (playbackState?.progress_ms !== undefined) {
      setLocalProgress(playbackState.progress_ms);
    }
  }, [playbackState?.progress_ms]);

  // Handle progress timer
  useEffect(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    if (playbackState?.is_playing) {
      progressTimerRef.current = setInterval(() => {
        setLocalProgress(prev => {
          if (prev >= (playbackState?.item?.duration_ms || 0)) {
            return prev;
          }
          return prev + 1000;
        });
      }, 1000);
    }

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, [playbackState?.is_playing, playbackState?.item?.duration_ms]);

  // Fetch context name if needed
  useEffect(() => {
    const fetchContextName = async () => {
      if (!playbackState?.context?.uri) {
        setContextName(null);
        return;
      }

      // If we already have the name, use it
      if (playbackState.context.name) {
        setContextName(playbackState.context.name);
        return;
      }

      // Otherwise, fetch it using the new getContextInfo method
      try {
        const contextInfo = await apiRef.current.playback.getContextInfo(
          playbackState.context.type,
          playbackState.context.uri
        );
        if (contextInfo) {
          setContextName(contextInfo.name);
        }
      } catch (error) {
        console.error('Error fetching context name:', error);
      }
    };

    fetchContextName();
  }, [playbackState?.context?.uri]);

  // Check if the current device supports volume control
  const supportsVolumeControl = () => {
    if (!playbackState?.device) return false;
    return playbackState.device.supports_volume;
  };

  // Toggle expanded state
  const toggleExpanded = () => {
    const newExpandedState = !expanded;
    setExpanded(newExpandedState);
    handlePlayerExpandToggle(newExpandedState);
  };

  // Format time in mm:ss
  const formatTime = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Return null if no playback state or no track
  if (!playbackState || !playbackState.item) {
    return null;
  }

  const { item, is_playing, device, context } = playbackState;
  
  return (
    <div className={`playback-controls ${expanded ? 'expanded' : 'collapsed'}`}>
      {!expanded && (
        <div className="playback-header" onClick={toggleExpanded}>
          {item.album.images && item.album.images.length > 0 && (
            <img 
              src={item.album.images[2]?.url || item.album.images[0].url} 
              alt={`${item.album.name} cover`} 
              className="mini-album-cover"
            />
          )}
          <div className="now-playing">
            <div className="track-name">{item.name}</div>
            <div className="artist-name">{item.artists.map(a => a.name).join(', ')}</div>
          </div>
          <div className="playback-mini-controls">
            <button 
              className="mini-control-button previous" 
              onClick={(e) => {
                e.stopPropagation();
                sendPlaybackCommand('previous');
              }}
            >
              <SkipBack size={16} weight="fill" />
            </button>
            <button 
              className="mini-control-button play-pause" 
              onClick={(e) => {
                e.stopPropagation();
                sendPlaybackCommand(is_playing ? 'pause' : 'play');
              }}
            >
              {is_playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
            </button>
            <button 
              className="mini-control-button next" 
              onClick={(e) => {
                e.stopPropagation();
                sendPlaybackCommand('next');
              }}
            >
              <SkipForward size={16} weight="fill" />
            </button>
          </div>
          <div className="expand-toggle">
            <CaretDown size={14} weight="fill" />
          </div>
        </div>
      )}
      
      {expanded && (
        <div className="playback-details">
          <div className="expanded-content">
            <div className="track-main-info">
              {item.album.images && item.album.images.length > 0 && (
                <img 
                  src={item.album.images[1]?.url || item.album.images[0].url} 
                  alt={`${item.album.name} cover`} 
                  className="album-cover"
                />
              )}
              
              <div className="track-info">
                <div className="track-title">{item.name}</div>
                <div className="track-artist">{item.artists.map(a => a.name).join(', ')}</div>
                <div className="album-name">{item.album.name}</div>
                {context && context.type !== 'album' && context.href && (
                  <a 
                    href={context.href} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="context-name"
                  >
                    {context.type === 'playlist' ? 'playlist: ' : ''}
                    {context.type === 'artist' ? 'artist radio: ' : ''}
                    {context.name || contextName}
                  </a>
                )}
              </div>
            </div>
            
            <div className="progress-section">
              <div className="progress-bar-container">
                <div className="time-elapsed">{formatTime(localProgress)}</div>
                <div 
                  className="progress-bar"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickPosition = (e.clientX - rect.left) / rect.width;
                    const duration = playbackState?.item?.duration_ms || 0;
                    const positionMs = Math.max(0, Math.min(duration, Math.floor(clickPosition * duration)));
                    setLocalProgress(positionMs);
                    sendPlaybackCommand('seek', { positionMs });
                  }}
                >
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${((localProgress || 0) / (playbackState?.item?.duration_ms || 1)) * 100}%` }}
                  ></div>
                </div>
                <div className="time-total">{formatTime(playbackState?.item?.duration_ms)}</div>
              </div>
            </div>
            
            <div className="playback-controls-buttons">
              <button 
                className="control-button previous" 
                onClick={() => sendPlaybackCommand('previous')}
                aria-label="Previous track"
              >
                <SkipBack size={20} weight="fill" />
              </button>
              <button 
                className="control-button play-pause" 
                onClick={() => sendPlaybackCommand(is_playing ? 'pause' : 'play')}
                aria-label={is_playing ? "Pause" : "Play"}
              >
                {is_playing ? <Pause size={24} weight="fill" /> : <Play size={24} weight="fill" />}
              </button>
              <button 
                className="control-button next" 
                onClick={() => sendPlaybackCommand('next')}
                aria-label="Next track"
              >
                <SkipForward size={20} weight="fill" />
              </button>
            </div>
            
            <div className="player-footer">
              <div className="player-controls-row">
                {supportsVolumeControl() ? (
                  <div className="volume-control">
                    <span className="volume-icon">
                      <SpeakerHigh size={12} weight="fill" />
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={device?.volume_percent || 50}
                      onChange={(e) => {
                        const volumePercent = parseInt(e.target.value, 10);
                        sendPlaybackCommand('volume', { volumePercent });
                      }}
                      className="volume-slider"
                    />
                  </div>
                ) : device && (
                  <div className="volume-control-unavailable">
                    <SpeakerX size={10} weight="fill" /> volume control not available
                  </div>
                )}
                
                {playbackDevices && playbackDevices.length > 0 && (
                  <div className="device-selector">
                    <select 
                      onChange={(e) => sendPlaybackCommand('transfer', { deviceId: e.target.value })}
                      value={device?.id || ''}
                    >
                      <option value="" disabled>select device</option>
                      {playbackDevices.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.is_active ? '(active)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="expanded-header" onClick={toggleExpanded}>
            <div className="collapse-indicator">
              <CaretUp size={14} weight="fill" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaybackControls; 