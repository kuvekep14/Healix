// ── CONFIRM MODAL ──
// Reusable in-app confirmation dialog that replaces browser confirm().
//
// Usage:
//   var confirmed = await confirmModal('Delete this document?');
//   if (!confirmed) return;
//
// Options:
//   confirmModal('Message', {
//     title: 'Confirm Delete',       // optional heading
//     confirmText: 'Delete',         // confirm button label (default: 'Confirm')
//     cancelText: 'Cancel',          // cancel button label (default: 'Cancel')
//     danger: true                   // red confirm button
//   });

(function () {
  // Inject styles
  var style = document.createElement('style');
  style.textContent = ''
    + '.confirm-overlay {'
    + '  position: fixed; inset: 0; z-index: 9999;'
    + '  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);'
    + '  display: flex; align-items: center; justify-content: center;'
    + '  opacity: 0; transition: opacity .15s ease;'
    + '}'
    + '.confirm-overlay.open { opacity: 1; }'
    + '.confirm-dialog {'
    + '  background: var(--dark-3, #141414); border: 1px solid var(--gold-border, rgba(184,151,90,0.18));'
    + '  border-radius: 12px; padding: 28px 32px 24px; max-width: 400px; width: 90vw;'
    + '  transform: translateY(8px) scale(0.97); transition: transform .15s ease;'
    + '}'
    + '.confirm-overlay.open .confirm-dialog { transform: translateY(0) scale(1); }'
    + '.confirm-title {'
    + '  font-family: var(--F, serif); font-size: 18px; font-weight: 400;'
    + '  color: var(--cream, #F5F0E8); margin-bottom: 8px; letter-spacing: .04em;'
    + '}'
    + '.confirm-message {'
    + '  font-family: var(--B, sans-serif); font-size: 13.5px; font-weight: 300;'
    + '  color: var(--cream-dim, rgba(245,240,232,0.5)); line-height: 1.5; margin-bottom: 24px;'
    + '}'
    + '.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }'
    + '.confirm-btn {'
    + '  font-family: var(--B, sans-serif); font-size: 12px; font-weight: 500;'
    + '  letter-spacing: .12em; text-transform: uppercase; border: none; border-radius: 6px;'
    + '  padding: 10px 22px; cursor: pointer; transition: background .15s, opacity .15s;'
    + '}'
    + '.confirm-btn:hover { opacity: 0.85; }'
    + '.confirm-btn-cancel {'
    + '  background: transparent; color: var(--cream-dim, rgba(245,240,232,0.5));'
    + '  border: 1px solid var(--gold-border, rgba(184,151,90,0.18));'
    + '}'
    + '.confirm-btn-confirm {'
    + '  background: var(--gold, #B8975A); color: var(--dark, #0B0B0B);'
    + '}'
    + '.confirm-btn-danger {'
    + '  background: var(--down, #e07070); color: #fff;'
    + '}';
  document.head.appendChild(style);

  window.confirmModal = function (message, opts) {
    opts = opts || {};
    var title = opts.title || 'Confirm';
    var confirmText = opts.confirmText || 'Confirm';
    var cancelText = opts.cancelText || 'Cancel';
    var danger = opts.danger || false;

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = ''
        + '<div class="confirm-dialog">'
        + '  <div class="confirm-title">' + escapeHtml(title) + '</div>'
        + '  <div class="confirm-message">' + escapeHtml(message) + '</div>'
        + '  <div class="confirm-actions">'
        + (cancelText ? '    <button class="confirm-btn confirm-btn-cancel" data-action="cancel">' + escapeHtml(cancelText) + '</button>' : '')
        + '    <button class="confirm-btn ' + (danger ? 'confirm-btn-danger' : 'confirm-btn-confirm') + '" data-action="confirm">' + escapeHtml(confirmText) + '</button>'
        + '  </div>'
        + '</div>';

      function close(result) {
        overlay.classList.remove('open');
        setTimeout(function () { overlay.remove(); }, 150);
        resolve(result);
      }

      // Button clicks
      var cancelBtn = overlay.querySelector('[data-action="cancel"]');
      if (cancelBtn) cancelBtn.addEventListener('click', function () { close(false); });
      overlay.querySelector('[data-action="confirm"]').addEventListener('click', function () { close(true); });

      // Click outside dialog to cancel
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(false);
      });

      // Escape key to cancel
      function onKey(e) {
        if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); }
      }
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      // Trigger animation on next frame
      requestAnimationFrame(function () { overlay.classList.add('open'); });
    });
  };
})();
