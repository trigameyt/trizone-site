document.addEventListener('DOMContentLoaded', async () => {
  trizoneHeader('legal');
  trizoneFooter({ showLegalIdentity: true });
  const { config } = await Trizone.boot();

  const operatorName = String(config.legal_operator_name || '').trim();
  const operatorAddress = String(config.legal_contact_address || '').trim();
  const operatorEmail = String(config.legal_contact_email || '').trim();
  const privacyEmail = String(config.privacy_contact_email || operatorEmail || '').trim();

  document.getElementById('privacy-email').textContent = privacyEmail || 'À renseigner';

  const footerName = document.getElementById('footer-operator-name');
  const footerAddress = document.getElementById('footer-operator-address');
  const footerEmail = document.getElementById('footer-operator-email');
  if (footerName) footerName.textContent = operatorName || 'À renseigner';
  if (footerAddress) footerAddress.textContent = operatorAddress || 'À renseigner';
  if (footerEmail) {
    footerEmail.textContent = operatorEmail || 'À renseigner';
    footerEmail.href = operatorEmail ? `mailto:${operatorEmail}` : '#';
    if (!operatorEmail) footerEmail.removeAttribute('href');
  }
  document.getElementById('legal-warning').hidden = !!(operatorName && operatorAddress && operatorEmail);

  if (location.hash === '#mentions') {
    requestAnimationFrame(() => document.getElementById('mentions')?.scrollIntoView({ block: 'start' }));
  }

  const extra = String(config.legal_extra_terms || '').trim();
  const extraRoot = document.getElementById('extra-terms');
  if (extra) {
    extraRoot.hidden = false;
    extraRoot.textContent = extra;
  }
});
