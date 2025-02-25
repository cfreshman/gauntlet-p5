import React, { useState, useEffect } from 'react';
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
import '../styles/playback-controls.css';

const PlaybackControls = ({ playbackState, playbackDevices, socket, sendPlaybackCommand, onExpandToggle }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [volumeError, setVolumeError] = useState(false);

  // Update loading state when playbackState changes
  useEffect(() => {
    if (playbackState !== null) {
      setLoading(false);
      
      // Reset volume error when playback state changes
      setVolumeError(false);
    }
  }, [playbackState]);

  // Fetch playback state and devices on component mount if not provided
  useEffect(() => {
    if (!sendPlaybackCommand) return;
    
    // If no playback state, request it
    if (playbackState === null) {
      sendPlaybackCommand('get-playback-state');
    }
    
    // If no devices, request them
    if (!playbackDevices || playbackDevices.length === 0) {
      sendPlaybackCommand('get-devices');
    }
    
    // Set up polling for playback state
    const interval = setInterval(() => {
      sendPlaybackCommand('get-playback-state');
    }, 5000);
    
    return () => clearInterval(interval);
  }, [sendPlaybackCommand, playbackState, playbackDevices]);

  // Handle playback control actions
  const handlePlaybackAction = (action, params = {}) => {
    if (!sendPlaybackCommand) {
      setError('playback control not available');
      return;
    }
    
    try {
      // If this is a volume action and we've already had an error, don't try again
      if (action === 'volume' && volumeError) {
        return;
      }
      
      sendPlaybackCommand(action, params);
      
      // If this is a volume action, set a timeout to check for errors
      if (action === 'volume') {
        setTimeout(() => {
          // If we still have the same volume after a second, assume it worked
          // This is a simple way to detect if the volume change failed
          const currentVolume = playbackState?.device?.volume_percent;
          if (currentVolume !== params.volumePercent) {
            setVolumeError(true);
          }
        }, 1000);
      }
    } catch (err) {
      console.error(`error with playback action ${action}:`, err);
      setError(`failed to ${action}`);
      
      // If this is a volume action, mark that we've had an error
      if (action === 'volume') {
        setVolumeError(true);
      }
    }
  };

  // Check if the current device supports volume control
  const supportsVolumeControl = () => {
    // Some devices like iPhones don't support volume control via the API
    if (!playbackState || !playbackState.device) return false;
    
    // If we've had a volume error, assume the device doesn't support it
    if (volumeError) return false;
    
    // Check device type - mobile devices often don't support volume control
    const deviceType = playbackState.device.type?.toLowerCase() || '';
    if (deviceType.includes('iphone') || deviceType.includes('ios')) {
      return false;
    }
    
    return true;
  };

  // Toggle expanded state
  const toggleExpanded = () => {
    const newExpandedState = !expanded;
    setExpanded(newExpandedState);
    
    // Notify parent component of expanded state change
    if (onExpandToggle) {
      onExpandToggle(newExpandedState);
    }
  };

  // Format time in mm:ss
  const formatTime = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="playback-controls loading">
        <div className="playback-status">loading playback status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="playback-controls error">
        <div className="playback-status">{error}</div>
      </div>
    );
  }

  if (!playbackState || !playbackState.item) {
    return (
      <div className="playback-controls inactive">
        <div className="playback-status">no active playback</div>
      </div>
    );
  }

  const { item, is_playing, progress_ms, device } = playbackState;
  
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
                handlePlaybackAction('previous');
              }}
            >
              <SkipBack size={16} weight="fill" />
            </button>
            <button 
              className="mini-control-button play-pause" 
              onClick={(e) => {
                e.stopPropagation();
                handlePlaybackAction(is_playing ? 'pause' : 'play');
              }}
            >
              {is_playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
            </button>
            <button 
              className="mini-control-button next" 
              onClick={(e) => {
                e.stopPropagation();
                handlePlaybackAction('next');
              }}
            >
              <SkipForward size={16} weight="fill" />
            </button>
          </div>
          <div className="expand-toggle">
            <CaretUp size={14} weight="fill" />
          </div>
        </div>
      )}
      
      {expanded && (
        <div className="playback-details">
          <div className="expanded-header" onClick={toggleExpanded}>
            <div className="header-spacer"></div>
            <div className="collapse-indicator">
              <CaretDown size={14} weight="fill" />
            </div>
          </div>
          
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
              </div>
            </div>
            
            <div className="progress-section">
              <div className="progress-bar-container">
                <div className="time-elapsed">{formatTime(progress_ms)}</div>
                <div 
                  className="progress-bar"
                  onClick={(e) => {
                    // Calculate position based on click location
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickPosition = (e.clientX - rect.left) / rect.width;
                    const positionMs = Math.floor(clickPosition * item.duration_ms);
                    handlePlaybackAction('seek', { positionMs });
                  }}
                >
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${(progress_ms / item.duration_ms) * 100}%` }}
                  ></div>
                </div>
                <div className="time-total">{formatTime(item.duration_ms)}</div>
              </div>
            </div>
            
            <div className="playback-controls-buttons">
              <button 
                className="control-button previous" 
                onClick={() => handlePlaybackAction('previous')}
                aria-label="Previous track"
              >
                <SkipBack size={20} weight="fill" />
              </button>
              <button 
                className="control-button play-pause" 
                onClick={() => handlePlaybackAction(is_playing ? 'pause' : 'play')}
                aria-label={is_playing ? "Pause" : "Play"}
              >
                {is_playing ? <Pause size={24} weight="fill" /> : <Play size={24} weight="fill" />}
              </button>
              <button 
                className="control-button next" 
                onClick={() => handlePlaybackAction('next')}
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
                        handlePlaybackAction('volume', { volumePercent });
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
                      onChange={(e) => handlePlaybackAction('transfer', { deviceId: e.target.value })}
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
        </div>
      )}
    </div>
  );
};

export default PlaybackControls; 