import React, { useState, useEffect } from 'react';

function Overlay() {
  const [bboxData, setBboxData] = useState(null);
  const [hudData, setHudData] = useState(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onDrawBbox((data) => {
        setBboxData(data);
      });
      window.electronAPI.onDrawHud((data) => {
        setHudData(data);
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllDrawBboxListeners();
        window.electronAPI.removeAllDrawHudListeners();
      }
    };
  }, []);

  const dpr = window.devicePixelRatio || 1;

  // Has Bounding Box target?
  const hasBbox = bboxData && bboxData.bbox && (bboxData.bbox[2] > 0 || bboxData.bbox[3] > 0);
  const x = hasBbox ? bboxData.bbox[0] / dpr : 0;
  const y = hasBbox ? bboxData.bbox[1] / dpr : 0;
  const width = hasBbox ? bboxData.bbox[2] / dpr : 0;
  const height = hasBbox ? bboxData.bbox[3] / dpr : 0;
  const targetX = hasBbox ? bboxData.x / dpr : 0;
  const targetY = hasBbox ? bboxData.y / dpr : 0;
  const isMicro = bboxData && bboxData.is_micro_target;

  // Has HUD info to display? (Shows when agent is running or has recent status)
  const showHud = hudData && hudData.isRunning;

  if (!hasBbox && !showHud) return null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
      {/* ── Floating Live HUD Capsule (Always on Top over all external apps) ── */}
      {showHud && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '24px',
            maxWidth: '380px',
            backgroundColor: 'rgba(9, 9, 11, 0.88)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '9999px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(59, 130, 246, 0.25)',
            zIndex: 10000,
            pointerEvents: 'none',
            animation: 'fadeInSlide 0.3s ease-out',
          }}
        >
          {/* Glowing Status Pulse */}
          <div style={{ position: 'relative', width: '10px', height: '10px', flexShrink: 0 }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                backgroundColor: '#3b82f6',
                animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                opacity: 0.75,
              }}
            />
            <div
              style={{
                position: 'relative',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
              }}
            />
          </div>

          {/* Castor Brand & Status Info */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.05em' }}>
                CASTOR LIVE
              </span>
              {hudData.stepCount && (
                <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>
                  STEP {hudData.stepCount}
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: '11px',
                color: '#e2e8f0',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '260px',
              }}
              title={hudData.status || 'Castor is acting...'}
            >
              {hudData.status || 'Operating on desktop...'}
            </span>
          </div>
        </div>
      )}

      {/* ── Target Bounding Box ── */}
      {hasBbox && (
        <div
          style={{
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
            border: '2px solid rgba(239, 68, 68, 0.9)',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            boxShadow: '0 0 12px rgba(239, 68, 68, 0.6), inset 0 0 8px rgba(239, 68, 68, 0.15)',
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: 9999,
            animation: 'pulse-border 1.5s ease-in-out infinite',
          }}
        >
          {/* Exact Click Point */}
          <div
            style={{
              position: 'absolute',
              left: `${targetX - x - 5}px`,
              top: `${targetY - y - 5}px`,
              width: '10px',
              height: '10px',
              backgroundColor: 'rgba(250, 204, 21, 0.95)',
              borderRadius: '50%',
              boxShadow: '0 0 8px rgba(250, 204, 21, 0.8), 0 0 20px rgba(250, 204, 21, 0.4)',
              border: '2px solid white',
            }}
          />
          {/* Label */}
          <div
            style={{
              position: 'absolute',
              top: '-25px',
              left: '0',
              backgroundColor: 'red',
              color: 'white',
              padding: '2px 6px',
              fontSize: '12px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              borderRadius: '4px',
            }}
          >
            {isMicro ? 'MICRO-TARGET (TAB)' : 'TARGET'}
          </div>
        </div>
      )}
    </div>
  );
}

export default Overlay;

