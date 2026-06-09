const translations = { /* ... pega aquí TODO el objeto translations de settings.html ... */ };

function applyTranslations(lang) {
  const t = translations[lang] || translations['es'];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key]) el.textContent = t[key];
  });
  document.documentElement.lang = lang;
}

// Aplicar automáticamente al cargar cualquier página
document.addEventListener('DOMContentLoaded', () => {
  const savedLang = localStorage.getItem('sg_lang') || 'es';
  applyTranslations(savedLang);
});
