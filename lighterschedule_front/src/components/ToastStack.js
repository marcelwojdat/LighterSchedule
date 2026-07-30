import React from 'react';
import { createPortal } from 'react-dom';

const variantClass = {
  success: 'toastSuccess',
  error: 'toastError',
  warning: 'toastWarning',
};

/**
 * Fixed viewport toast stack (ported to document.body so position:fixed
 * is never trapped by transformed/overflow ancestors).
 *
 * items: [{ key, message, variant: 'success'|'error'|'warning', onClose }]
 */
export const ToastStack = ({ items }) => {
  const visible = (items || []).filter((item) => item?.message);
  if (!visible.length || typeof document === 'undefined') return null;

  return createPortal(
    <div className="toastStack" role="status" aria-live="polite">
      {visible.map((item) => (
        <div
          key={item.key || item.message}
          className={`toast ${variantClass[item.variant] || variantClass.success}`}
        >
          <span className="toastMessage">{item.message}</span>
          <button
            type="button"
            className="toastClose"
            aria-label="Zamknij"
            onClick={item.onClose}
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
};

export default ToastStack;
