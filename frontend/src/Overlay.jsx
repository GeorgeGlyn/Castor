import React, { useState, useEffect } from 'react';

function Overlay() {
  const [bboxData, setBboxData] = useState(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onDrawBbox((data) => {
        setBboxData(data);
      });
    }

    return () => {
      if (window.electronAPI) window.electronAPI.removeAllDrawBboxListeners();
    };
  }, []);

  if (!bboxData || !bboxData.bbox) return null;

  // Account for High-DPI displays mapping Physical Pixels -> Electron DIPs
  const dpr = window.devicePixelRatio || 1;
  const x = bboxData.bbox[0] / dpr;
  const y = bboxData.bbox[1] / dpr;
  const width = bboxData.bbox[2] / dpr;
  const height = bboxData.bbox[3] / dpr;

  const targetX = bboxData.x / dpr;
  const targetY = bboxData.y / dpr;
  const isMicro = bboxData.is_micro_target;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Target Bounding Box */}
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
          overflow: 'visible',  // Allow click-dot to render outside bbox bounds
          zIndex: 9999,
          animation: 'pulse-border 1.5s ease-in-out infinite',
        }}
      >
        {/* Exact Click Point — centered on the target coordinate */}
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
        <div style={{
          position: 'absolute',
          top: '-25px',
          left: '0',
          backgroundColor: 'red',
          color: 'white',
          padding: '2px 6px',
          fontSize: '12px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          borderRadius: '4px'
        }}>
          {isMicro ? 'MICRO-TARGET (TAB)' : 'TARGET'}
        </div>
      </div>
    </div>
  );
}

export default Overlay;
