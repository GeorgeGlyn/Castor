import React, { useState, useEffect } from 'react';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

function Overlay() {
  const [bboxData, setBboxData] = useState(null);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('draw-bbox', (event, data) => {
        setBboxData(data);
      });
    }

    return () => {
      if (ipcRenderer) ipcRenderer.removeAllListeners('draw-bbox');
    };
  }, []);

  if (!bboxData || !bboxData.bbox) return null;

  const [x, y, width, height] = bboxData.bbox;
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
          border: '2px solid red',
          backgroundColor: 'rgba(255, 0, 0, 0.2)',
          boxShadow: '0 0 10px red, inset 0 0 10px red',
          pointerEvents: 'none', // Ensure it doesn't block clicks
          zIndex: 9999
        }}
      >
        {/* Exact Click Point */}
        <div
          style={{
            position: 'absolute',
            left: `${bboxData.x - x - 3}px`, // Center the dot
            top: `${bboxData.y - y - 3}px`,
            width: '6px',
            height: '6px',
            backgroundColor: 'yellow',
            borderRadius: '50%',
            boxShadow: '0 0 5px yellow'
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
