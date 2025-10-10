// js/utils.js
(function(HL){
  HL.utils = HL.utils || {};

  HL.utils.escapeHtml = function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  HL.utils.truncateText = function truncateText(text, maxLength) {
    if (!text) return '';
    text = String(text);
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  HL.utils.scrollToTop = function scrollToTop() {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }
  };

  HL.utils.sanitizeForDisplay = function sanitizeForDisplay(obj) {
    try {
      const copy = Object.assign({}, obj);
      if (copy.csv_counter !== undefined) delete copy.csv_counter;
      if (copy._raw && typeof copy._raw === 'object' && copy._raw.csv_counter !== undefined) {
        const rawCopy = Object.assign({}, copy._raw);
        delete rawCopy.csv_counter;
        copy._raw = rawCopy;
      }
      return copy;
    } catch (e) {
      return obj;
    }
  };

})(window.HerboLive);
