document.addEventListener('DOMContentLoaded', async () => {
  trizoneHeader('legal');
  trizoneFooter();
  const { config } = await Trizone.boot();

  const operatorName = String(config.legal_operator_name || '').trim();
  const operatorAddress = String(config.legal_contact_address || '').trim();
  const operatorEmail = String(config.legal_contact_email || '').trim();
  const privacyEmail = String(config.privacy_contact_email || operatorEmail || '').trim();

  document.getElementById('operator-name').textContent = operatorName || 'À renseigner';
  document.getElementById('operator-address').textContent = operatorAddress || 'À renseigner';
  document.getElementById('operator-email').textContent = operatorEmail || 'À renseigner';
  document.getElementById('privacy-email').textContent = privacyEmail || 'À renseigner';
  document.getElementById('legal-warning').hidden = !!(operatorName && operatorAddress && operatorEmail);

  const extra = String(config.legal_extra_terms || '').trim();
  const extraRoot = document.getElementById('extra-terms');
  if (extra) {
    extraRoot.hidden = false;
    extraRoot.textContent = extra;
  }
});
