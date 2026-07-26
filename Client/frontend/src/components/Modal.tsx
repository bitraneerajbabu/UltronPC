import React, { useEffect } from 'react';

interface ModalAction {
  label: string;
  cls?: string;
  action: () => void;
}

interface ModalProps {
  isOpen?: boolean;
  title?: string;
  size?: string;
  onClose?: () => void;
  actions?: ModalAction[];
  children?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = React.memo(({
  isOpen = false,
  title = '',
  size = '',
  onClose = () => {},
  actions = [],
  children
}) => {
  
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div id="modalOverlay" className="open" onClick={(e) => {
      // Close modal on clicking outside overlay
      const target = e.target as HTMLElement;
      if (target.id === 'modalOverlay') {
        onClose();
      }
    }}>
      <div id="modalContainer" className={`modal-container ${size}`.trim()}>
        <div className="modal-header">
          <div id="modalTitle" className="modal-title">{title}</div>
          <button id="modalCloseBtn" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div id="modalBody" className="modal-body">
          {children}
        </div>
        {(actions && actions.length > 0) && (
          <div id="modalFooter" className="modal-footer">
            {actions.map((act, index) => (
              <button 
                key={index}
                className={`btn ${act.cls || ''}`.trim()}
                onClick={() => act.action()}
              >
                {act.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
