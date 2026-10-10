// Injected by drive.py before the app loads. Records the print layout at the
// print-media change (window.__print, window.__layout), and, attached just before
// the button is pressed, the chart-to-answer gaps after the app's own redraw
// (window.__printedGaps).
window.__print = null;
const VIS = e => !!e && e.getClientRects().length > 0;
window.matchMedia('print').addEventListener('change', e => { if (!e.matches || window.__print) return;
  // Registered before the app's listeners; layout boxes are fixed, so positions are final.
  const range = document.createRange(); range.selectNodeContents(document.querySelector('.report-print-heading h2'));
  const R = e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  const tableCard = VIS(document.querySelector('.report-table-card')) ? document.querySelector('.report-table-card') : null;
  const mainCard = VIS(document.querySelector('.report-chart-card')) ? document.querySelector('.report-chart-card') : null;
  const CARDS = [...document.querySelectorAll('.analytics-question-item')].filter(VIS);
  window.__layout = {
    main: mainCard && { card: R(mainCard), anchor: R(document.querySelector('.report-card-title p')),
            canvas: R(document.querySelector('.report-chart-card canvas')) },
    table: tableCard && { card: R(tableCard), ths: [...tableCard.querySelectorAll('thead th')].map(R),
             rows: [...tableCard.querySelectorAll('tbody tr')].map(tr => [tr.cells[0].textContent, R(tr)]) },
    cards: CARDS.map(card => ({ title: card.querySelector('h4').textContent,
            card: R(card), anchor: R(card.querySelector('h4')) })),
    reports: [...document.querySelectorAll('.report-chart-card')].filter(VIS).map(cc => {
      const tc = cc.nextElementSibling;
      return { title: cc.querySelector('h3').textContent, subtitle: cc.querySelector('.report-card-title p').textContent,
               card: R(cc), anchor: R(cc.querySelector('.report-card-title p')), canvas: R(cc.querySelector('canvas')),
               table: { card: R(tc), ths: [...tc.querySelectorAll('thead th')].map(R), firstTh: tc.querySelector('thead th').textContent.replace(/[▲▼⇅]/g, '').trim(),
                        rows: [...tc.querySelectorAll('tbody tr')].map(tr => [tr.cells[0].textContent, R(tr)]) } }; }) };
  window.__print = {
    headingCssWidth: range.getBoundingClientRect().width,
    cards: CARDS.map(card => {
      const visual = card.querySelector('canvas') || card.querySelector('.radial-progress-widget, .insight-metric') || card.querySelector('h4').nextElementSibling;
      const answer = card.querySelector('p'); const cv = card.querySelector('canvas');
      const rv = visual.getBoundingClientRect(), ra = answer.getBoundingClientRect(), rc = card.getBoundingClientRect();
      return { title: card.querySelector('h4').textContent, answer: answer.textContent || '', hasChart: !!cv,
               visualBottom: rv.bottom, answerTop: ra.top, gap: ra.top - rv.bottom, card: [rc.width, rc.height],
               canvas: cv ? [cv.getBoundingClientRect().width, cv.getBoundingClientRect().height] : null,
               box: cv ? [cv.parentElement.getBoundingClientRect().width, cv.parentElement.getBoundingClientRect().height] : null }; }) };
});
// Attached just before the button is pressed, after the app's own print listener:
// it runs after the redraw, so the gaps are measured on the charts as printed.
window.__realMatchMedia = window.matchMedia.bind(window);
window.__addLateRecorder = () => window.__realMatchMedia('print').addEventListener('change', e => {
  if (!e.matches || window.__printedGaps) return;
  window.__printedGaps = [...document.querySelectorAll('.analytics-question-item')].filter(c => c.getClientRects().length).map(card => {
    const cv = card.querySelector('canvas'); const visual = cv || card.querySelector('.radial-progress-widget, .insight-stay, .insight-metric');
    const answer = card.querySelector('p');
    return { title: card.querySelector('h4').textContent, hasChart: !!cv,
             gap: answer.getBoundingClientRect().top - visual.getBoundingClientRect().bottom,
             canvas: cv ? [cv.getBoundingClientRect().width, cv.getBoundingClientRect().height] : null };
  });
});
