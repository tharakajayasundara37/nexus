/**
 * NEXUS Bespoke Atelier — Luxury Invoice Popup & Premium PDF Certificate Generator
 * Renders an interactive full-screen Royal Champagne-Gold & Ivory Atelier Invoice popup
 * right upon order settlement, plus exports a crisp vector A4 PDF via jsPDF + AutoTable.
 */
(function (root) {
  'use strict';

  const LAST_ORDER_KEY = 'nexus_last_order_v1';

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney(num) {
    const n = Number(num) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatAtelierDate(isoOrDate) {
    const d = isoOrDate ? new Date(isoOrDate) : new Date();
    if (isNaN(d.getTime())) return '28 Nov 2026';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    let hr = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    return `${day} ${mon} ${yr} at ${String(hr).padStart(2, '0')}:${min} ${ampm}`;
  }

  function normalizeOrderRecord(raw) {
    const r = raw || {};
    const orderId = r.id || ('#NX-' + Math.floor(10000 + Math.random() * 90000));
    const cleanDigits = orderId.replace(/\D/g, '').padEnd(6, '8').slice(0, 6);
    const invoiceRef = r.invoiceRef || ('NXA-INV-' + cleanDigits);
    const provenanceSerial = r.provenanceSerial || ('PVN-' + String(Math.floor(100000 + (parseInt(cleanDigits, 10) % 899999))));

    const rawItems = Array.isArray(r.items) ? r.items : [];
    const items = rawItems.map((it, i) => {
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      const unitPrice = typeof it.priceNum === 'number'
        ? it.priceNum
        : (parseFloat(String(it.price || '0').replace(/[^0-9.]/g, '')) || 0);
      return {
        index: String(i + 1).padStart(2, '0'),
        id: it.id || ('nx-item-' + (i + 1)),
        title: it.title || it.name || 'Nexus Atelier Garment',
        size: it.size || 'M',
        quantity: qty,
        unitPrice: unitPrice,
        lineTotal: unitPrice * qty,
        category: it.category || 'Runway Edition'
      };
    });

    const subtotal = typeof r.subtotal === 'number'
      ? r.subtotal
      : items.reduce((s, it) => s + it.lineTotal, 0);
    const shippingFee = typeof r.shippingFee === 'number' ? r.shippingFee : 0;
    const discountAmount = typeof r.discountAmount === 'number' ? r.discountAmount : 0;
    const total = typeof r.total === 'number'
      ? r.total
      : Math.max(0, subtotal + shippingFee - discountAmount);

    const method = r.paymentMethod || 'cod';
    const cardLast4 = (r.cardLast4 || '').replace(/\D/g, '').slice(-4);
    let paymentChannelLabel = 'Cash on Delivery (Doorstep Cash)';
    let statusBadge = 'CONFIRMED • DISPATCH SCHEDULED';
    let isPaidOnline = false;

    if (method === 'card') {
      paymentChannelLabel = `Card Online (•••• •••• •••• ${cardLast4 || '4242'})`;
      statusBadge = 'PAID & VERIFIED FOR DISPATCH';
      isPaidOnline = true;
    } else if (method === 'bank' || method === 'bank_receipt') {
      paymentChannelLabel = 'Bank Deposit (Verified Slip)';
      statusBadge = 'RECEIPT LOGGED & VERIFIED';
      isPaidOnline = true;
    }

    return {
      id: orderId,
      invoiceRef,
      provenanceSerial,
      customerName: r.customerName || 'Atelier Patron',
      phone: r.phone || 'Not Provided',
      customerEmail: r.customerEmail || 'concierge@nexus-atelier.com',
      address: r.address || 'Colombo Delivery District',
      city: r.city || '',
      postal: r.postal || '',
      items,
      subtotal,
      shippingFee,
      discountAmount,
      total,
      paymentMethod: method,
      cardLast4,
      paymentChannelLabel,
      statusBadge,
      isPaidOnline,
      createdAt: r.createdAt || new Date().toISOString(),
      formattedDate: formatAtelierDate(r.createdAt)
    };
  }

  function injectStyles() {
    if (document.getElementById('nexus-invoice-styles')) return;
    const style = document.createElement('style');
    style.id = 'nexus-invoice-styles';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&family=Great+Vibes&display=swap');

      dialog#nexus-bill-modal {
        border: none;
        padding: 0;
        margin: auto;
        width: min(940px, 95vw);
        max-height: 93vh;
        background: transparent;
        overflow: visible;
        box-shadow: none;
      }
      dialog#nexus-bill-modal::backdrop {
        background: rgba(15, 14, 12, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .nxb-shell {
        display: flex;
        flex-direction: column;
        max-height: 92vh;
        background: #191715;
        border: 1px solid rgba(184, 150, 76, 0.42);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 32px 80px rgba(0, 0, 0, 0.65);
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .nxb-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 22px;
        background: linear-gradient(90deg, #161513 0%, #211d17 50%, #161513 100%);
        border-bottom: 1px solid rgba(184, 150, 76, 0.35);
        color: #f6f1e6;
        flex-shrink: 0;
      }
      .nxb-toolbar-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .nxb-toolbar-crest {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 1px solid #b8964c;
        color: #d7b76e;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }
      .nxb-toolbar-title {
        font-size: 12.5px;
        font-weight: 700;
        letter-spacing: 1.4px;
        text-transform: uppercase;
        color: #f5efe2;
      }
      .nxb-toolbar-sub {
        font-size: 11px;
        color: #b5a78b;
      }
      .nxb-toolbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .nxb-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: none;
        border-radius: 999px;
        padding: 9px 18px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
      }
      .nxb-btn-gold {
        background: linear-gradient(135deg, #cfa95a 0%, #9b772e 100%);
        color: #14120e;
        box-shadow: 0 4px 16px rgba(184, 150, 76, 0.35);
      }
      .nxb-btn-gold:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
      }
      .nxb-btn-ghost {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: #f4efe6;
      }
      .nxb-btn-ghost:hover {
        background: rgba(255, 255, 255, 0.16);
      }
      .nxb-btn-close {
        width: 34px;
        height: 34px;
        padding: 0;
        justify-content: center;
        font-size: 18px;
      }

      .nxb-scroll-area {
        overflow-y: auto;
        padding: 26px 28px;
        background: #23201b;
      }

      /* The Printable Parchment Invoice Sheet */
      .nxb-paper {
        background: #fdfbf7;
        color: #1c1915;
        padding: 16px;
        box-shadow: 0 18px 46px rgba(0, 0, 0, 0.35);
        border-radius: 4px;
        max-width: 820px;
        margin: 0 auto;
      }
      .nxb-outer-frame {
        border: 1.8px solid #b8964c;
        padding: 5px;
      }
      .nxb-inner-frame {
        border: 0.8px solid #d9c598;
        padding: 28px 30px 24px 30px;
        background: #fdfbf7;
      }

      .nxb-masthead {
        text-align: center;
        padding-bottom: 18px;
        border-bottom: 1px solid #e6dcc6;
        margin-bottom: 20px;
      }
      .nxb-fleur {
        font-size: 18px;
        color: #b8964c;
        margin-bottom: 6px;
      }
      .nxb-brand {
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 5.5px;
        color: #151413;
        margin: 0 0 4px 0;
        text-transform: uppercase;
      }
      .nxb-brand-sub {
        font-size: 9.5px;
        font-weight: 600;
        letter-spacing: 2.6px;
        color: #6d614b;
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      .nxb-studio-meta {
        font-size: 10.5px;
        color: #5b5346;
        line-height: 1.65;
        margin-bottom: 14px;
      }
      .nxb-doc-pill {
        display: inline-block;
        padding: 6px 24px;
        border: 1px solid #b8964c;
        border-radius: 4px;
        background: #faf6ec;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 2.8px;
        color: #7c5f24;
        text-transform: uppercase;
      }

      .nxb-card {
        background: #f8f5ed;
        border: 1px solid #e4dac2;
        border-radius: 8px;
        padding: 15px 18px;
        margin-bottom: 14px;
      }
      .nxb-card-title {
        font-size: 10.5px;
        font-weight: 800;
        letter-spacing: 1.6px;
        color: #8b6c2b;
        text-transform: uppercase;
        padding-bottom: 8px;
        margin-bottom: 10px;
        border-bottom: 1px solid #e6dcc6;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .nxb-kv-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 16px;
        padding: 3.5px 0;
        font-size: 12px;
      }
      .nxb-kv-label {
        color: #6a6255;
        font-weight: 500;
      }
      .nxb-kv-val {
        color: #151413;
        font-weight: 700;
        text-align: right;
      }
      .nxb-ref-gold {
        color: #8b6c2b;
        font-weight: 800;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .nxb-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 11px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.7px;
        background: #ecfdf5;
        border: 1px solid #86efac;
        color: #166534;
      }

      .nxb-section-heading {
        font-size: 10.5px;
        font-weight: 800;
        letter-spacing: 1.6px;
        color: #8b6c2b;
        text-transform: uppercase;
        margin: 18px 0 8px 0;
      }

      .nxb-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 14px;
        font-size: 11.5px;
      }
      .nxb-table thead th {
        background: #efe9da;
        color: #5d4a22;
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        padding: 9px 10px;
        text-align: left;
        border-top: 1px solid #d9c598;
        border-bottom: 1px solid #d9c598;
      }
      .nxb-table thead th.num,
      .nxb-table tbody td.num {
        text-align: right;
      }
      .nxb-table thead th.ctr,
      .nxb-table tbody td.ctr {
        text-align: center;
      }
      .nxb-table tbody td {
        padding: 12px 10px;
        border-bottom: 1px solid #ebe3d0;
        vertical-align: top;
        color: #1d1b18;
      }
      .nxb-item-title {
        font-weight: 800;
        font-size: 12.5px;
        color: #151413;
        margin-bottom: 2px;
      }
      .nxb-item-sub {
        font-size: 10.5px;
        color: #6b6356;
        margin-bottom: 6px;
      }
      .nxb-spec-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .nxb-spec-pill {
        display: inline-block;
        font-size: 9px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 4px;
        background: #f5efe0;
        border: 1px solid #e0d3b4;
        color: #65522a;
      }
      .nxb-auth-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 5px;
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #166534;
        font-size: 9.5px;
        font-weight: 700;
        white-space: nowrap;
      }
      .nxb-priv-badge {
        background: #fef9c3;
        border-color: #eab308;
        color: #854d0e;
      }

      .nxb-covenant-list {
        margin: 0 0 12px 16px;
        padding: 0;
        font-size: 11px;
        color: #4f483d;
        line-height: 1.65;
      }
      .nxb-totals-box {
        border-top: 1px dashed #d6c59f;
        padding-top: 10px;
        margin-top: 8px;
      }
      .nxb-total-line {
        display: flex;
        justify-content: space-between;
        font-size: 11.5px;
        color: #4f483d;
        padding: 2.5px 0;
      }
      .nxb-grand-total {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1.2px solid #b8964c;
        font-size: 15px;
        font-weight: 900;
        color: #8b6c2b;
      }

      .nxb-guarantees {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        background: #f8f5ed;
        border: 1px solid #e4dac2;
        border-radius: 8px;
        padding: 13px 15px;
        margin-bottom: 18px;
      }
      .nxb-g-item h5 {
        margin: 0 0 2px 0;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.8px;
        color: #7c5f24;
        text-transform: uppercase;
      }
      .nxb-g-item p {
        margin: 0;
        font-size: 10px;
        color: #5b5346;
        line-height: 1.45;
      }

      .nxb-sign-row {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: end;
        gap: 18px;
        padding: 10px 8px 14px 8px;
        border-bottom: 1px solid #e6dcc6;
        margin-bottom: 10px;
      }
      .nxb-sign-col {
        text-align: center;
      }
      .nxb-sign-script {
        font-family: 'Great Vibes', Georgia, serif;
        font-size: 27px;
        color: #151413;
        line-height: 1;
        margin-bottom: 4px;
      }
      .nxb-sign-line {
        border-top: 1px solid #a99567;
        padding-top: 6px;
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 1px;
        color: #151413;
        text-transform: uppercase;
      }
      .nxb-sign-sub {
        font-size: 9.5px;
        color: #6b6356;
        margin-top: 2px;
      }

      .nxb-seal-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .nxb-seal-circle {
        width: 92px;
        height: 92px;
        border-radius: 50%;
        border: 2px dashed #b8964c;
        background: #faf5e8;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 6px;
        box-shadow: inset 0 0 0 3px #fdfbf7, inset 0 0 0 4px #d9c598;
      }
      .nxb-seal-stars {
        color: #b8964c;
        font-size: 8px;
        letter-spacing: 2px;
      }
      .nxb-seal-main {
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.2px;
        color: #7c5f24;
        line-height: 1.15;
        margin: 2px 0;
      }
      .nxb-seal-caption {
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #7c5f24;
        text-transform: uppercase;
      }

      .nxb-legal-foot {
        text-align: center;
        font-size: 9.5px;
        color: #6b6356;
        line-height: 1.5;
      }

      @media (max-width: 640px) {
        .nxb-scroll-area { padding: 12px; }
        .nxb-inner-frame { padding: 16px 14px; }
        .nxb-brand { font-size: 20px; letter-spacing: 3px; }
        .nxb-guarantees { grid-template-columns: 1fr; }
        .nxb-sign-row { grid-template-columns: 1fr; gap: 16px; }
      }

      @media print {
        body > *:not(#nexus-bill-modal) { display: none !important; }
        dialog#nexus-bill-modal {
          position: static;
          width: 100%;
          max-height: none;
          margin: 0;
          padding: 0;
        }
        .nxb-shell { border: none; box-shadow: none; background: #fff; max-height: none; }
        .nxb-toolbar { display: none !important; }
        .nxb-scroll-area { padding: 0; background: #fff; overflow: visible; }
        .nxb-paper { box-shadow: none; padding: 0; max-width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    injectStyles();
    let dlg = document.getElementById('nexus-bill-modal');
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = 'nexus-bill-modal';
    dlg.setAttribute('aria-label', 'Official NEXUS Atelier Invoice & Provenance Certificate');
    dlg.innerHTML = `
      <div class="nxb-shell">
        <div class="nxb-toolbar">
          <div class="nxb-toolbar-left">
            <div class="nxb-toolbar-crest">✦</div>
            <div>
              <div class="nxb-toolbar-title">Official Atelier Invoice Ready</div>
              <div class="nxb-toolbar-sub" id="nxb-toolbar-ref">Order Confirmed</div>
            </div>
          </div>
          <div class="nxb-toolbar-actions">
            <button type="button" class="nxb-btn nxb-btn-gold" id="nxb-btn-download-pdf">
              <span>⬇</span> Download Premium PDF
            </button>
            <button type="button" class="nxb-btn nxb-btn-ghost" id="nxb-btn-print">
              <span>🖨</span> Print
            </button>
            <button type="button" class="nxb-btn nxb-btn-ghost nxb-btn-close" id="nxb-btn-close" aria-label="Close invoice">&times;</button>
          </div>
        </div>
        <div class="nxb-scroll-area" id="nxb-bill-body"></div>
      </div>
    `;
    document.body.appendChild(dlg);

    dlg.querySelector('#nxb-btn-close').addEventListener('click', () => {
      if (dlg.open) dlg.close();
    });
    dlg.querySelector('#nxb-btn-print').addEventListener('click', () => {
      window.print();
    });
    dlg.querySelector('#nxb-btn-download-pdf').addEventListener('click', () => {
      if (root.__nexusCurrentBill) {
        NexusInvoice.downloadPDF(root.__nexusCurrentBill);
      }
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });

    return dlg;
  }

  function renderHtmlInvoice(order) {
    const destParts = [order.address, order.city, order.postal].filter(Boolean).join(', ');
    const itemRows = order.items.map((it) => `
      <tr>
        <td style="font-weight:700; color:#6b6356;">${escHtml(it.index)}</td>
        <td>
          <div class="nxb-item-title">${escHtml(it.title)}</div>
          <div class="nxb-item-sub">Size: ${escHtml(it.size)} &bull; Tailored Atelier Edition</div>
          <div class="nxb-spec-tags">
            <span class="nxb-spec-pill">Certified Runway Edition</span>
            <span class="nxb-spec-pill">Atelier Cut &amp; Sew</span>
            <span class="nxb-spec-pill">Provenance Tag #${escHtml(order.provenanceSerial)}</span>
          </div>
        </td>
        <td><span class="nxb-auth-badge">&#10003; Verified Piece</span></td>
        <td class="ctr" style="font-weight:700;">${it.quantity}</td>
        <td class="num">${formatMoney(it.unitPrice)}</td>
        <td class="num" style="font-weight:800;">${formatMoney(it.lineTotal)}</td>
      </tr>
    `).join('');

    const shippingRowIndex = String(order.items.length + 1).padStart(2, '0');
    const shippingText = order.shippingFee > 0 ? formatMoney(order.shippingFee) : 'Complimentary';
    const shippingRow = `
      <tr>
        <td style="font-weight:700; color:#6b6356;">${escHtml(shippingRowIndex)}</td>
        <td>
          <div class="nxb-item-title">Insured Express Atelier Courier Dispatch</div>
          <div class="nxb-item-sub">Tamper-evident garment carrier &amp; tracked doorstep delivery (${escHtml(order.city || 'Sri Lanka')})</div>
        </td>
        <td><span class="nxb-auth-badge">Direct Atelier Handover</span></td>
        <td class="ctr" style="font-weight:700;">1</td>
        <td class="num">${shippingText}</td>
        <td class="num" style="font-weight:800;">${formatMoney(order.shippingFee)}</td>
      </tr>
    `;

    const discountRow = order.discountAmount > 0 ? `
      <tr>
        <td style="font-weight:700; color:#6b6356;">${String(order.items.length + 2).padStart(2, '0')}</td>
        <td>
          <div class="nxb-item-title">Atelier Patron Privilege Credit</div>
          <div class="nxb-item-sub">Exclusive settlement privilege applied</div>
        </td>
        <td><span class="nxb-auth-badge nxb-priv-badge">Privilege Credit</span></td>
        <td class="ctr" style="font-weight:700;">1</td>
        <td class="num">-${formatMoney(order.discountAmount)}</td>
        <td class="num" style="font-weight:800;">-${formatMoney(order.discountAmount)}</td>
      </tr>
    ` : '';

    return `
      <div class="nxb-paper" id="nexus-bill-sheet">
        <div class="nxb-outer-frame">
          <div class="nxb-inner-frame">

            <div class="nxb-masthead">
              <div class="nxb-fleur">&#10022;</div>
              <h1 class="nxb-brand">NEXUS BESPOKE ATELIER</h1>
              <div class="nxb-brand-sub">HAUTE-COUTURE STREETWEAR &bull; ARCHITECTURAL SILHOUETTES &amp; RUNWAY ARCHIVE</div>
              <div class="nxb-studio-meta">
                Flagship Maison: Colombo 07 Heritage District &bull; Atelier Desk: +94 11 268 8900<br>
                Official Concierge: concierge@nexus-atelier.com &bull; Archive Reg: NX-AT-2026-SL
              </div>
              <div class="nxb-doc-pill">OFFICIAL ATELIER INVOICE &amp; PROVENANCE CERTIFICATE</div>
            </div>

            <div class="nxb-card">
              <div class="nxb-card-title">&#9670; PATRON &amp; DELIVERY DOSSIER</div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Patron:</span><span class="nxb-kv-val">${escHtml(order.customerName)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Contact:</span><span class="nxb-kv-val">${escHtml(order.phone)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Email:</span><span class="nxb-kv-val">${escHtml(order.customerEmail)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Destination:</span><span class="nxb-kv-val">${escHtml(destParts)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Transit Timeframe:</span><span class="nxb-kv-val">Express Insured Courier (2–3 Business Days)</span></div>
            </div>

            <div class="nxb-card">
              <div class="nxb-card-title">&#9670; REGISTRATION &amp; ATELIER LEDGER</div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Order Reference:</span><span class="nxb-kv-val nxb-ref-gold">${escHtml(order.id)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Invoice Reference:</span><span class="nxb-kv-val">${escHtml(order.invoiceRef)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Provenance Serial:</span><span class="nxb-kv-val">${escHtml(order.provenanceSerial)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Date of Issue:</span><span class="nxb-kv-val">${escHtml(order.formattedDate)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Payment Channel:</span><span class="nxb-kv-val">${escHtml(order.paymentChannelLabel)}</span></div>
              <div class="nxb-kv-row"><span class="nxb-kv-label">Atelier Status:</span><span class="nxb-kv-val"><span class="nxb-status-pill">&#10003; ${escHtml(order.statusBadge)}</span></span></div>
            </div>

            <div class="nxb-section-heading">ITEMIZED GARMENT &amp; ATELIER VALUATION SCHEDULE</div>
            <table class="nxb-table">
              <thead>
                <tr>
                  <th style="width:36px;">#</th>
                  <th>BESPOKE PIECE &amp; SPECIFICATIONS</th>
                  <th style="width:138px;">PROVENANCE</th>
                  <th class="ctr" style="width:42px;">QTY</th>
                  <th class="num" style="width:80px;">RATE</th>
                  <th class="num" style="width:88px;">NET (USD)</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
                ${shippingRow}
                ${discountRow}
              </tbody>
            </table>

            <div class="nxb-card">
              <div class="nxb-card-title">&#9670; SETTLEMENT COVENANT &amp; ATELIER GUARANTEE</div>
              <ul class="nxb-covenant-list">
                <li>Every garment is inspected in our quality studio for stitch density, silhouette drape, and hardware integrity.</li>
                <li>${order.isPaidOnline ? 'Electronic Settlement Confirmed: 100% net settlement authorized. Prioritized atelier dispatch queued.' : 'Doorstep Cash Settlement Scheduled: Insured courier handover verified upon receipt.'}</li>
                <li>Includes complimentary 30-day size adjustment &amp; garment concierge support.</li>
              </ul>
              <div class="nxb-totals-box">
                <div class="nxb-total-line"><span>Pieces Subtotal:</span><strong>${formatMoney(order.subtotal)}</strong></div>
                <div class="nxb-total-line"><span>Insured Atelier Transit:</span><strong>${formatMoney(order.shippingFee)}</strong></div>
                ${order.discountAmount > 0 ? `<div class="nxb-total-line"><span>Privilege Benefit:</span><strong>-${formatMoney(order.discountAmount)}</strong></div>` : ''}
                <div class="nxb-grand-total">
                  <span>TOTAL NET SETTLEMENT:</span>
                  <span>${formatMoney(order.total)}</span>
                </div>
              </div>
            </div>

            <div class="nxb-guarantees">
              <div class="nxb-g-item">
                <h5>&#10022; ATELIER AUTHENTICITY</h5>
                <p>Recorded permanently in the NEXUS Master Archive under Serial #${escHtml(order.provenanceSerial)}.</p>
              </div>
              <div class="nxb-g-item">
                <h5>&#10022; ARCHITECTURAL TAILORING</h5>
                <p>Precision pattern-cutting with reinforced seam finishing and studio steamed presentation.</p>
              </div>
              <div class="nxb-g-item">
                <h5>&#10022; INSURED COURIER TRANSIT</h5>
                <p>Protective garment carrier with full transit coverage to your designated doorstep.</p>
              </div>
              <div class="nxb-g-item">
                <h5>&#10022; 30-DAY CONCIERGE CARE</h5>
                <p>Complimentary sizing consultation, exchange priority, and garment aftercare support.</p>
              </div>
            </div>

            <div class="nxb-sign-row">
              <div class="nxb-sign-col">
                <div style="height:28px;"></div>
                <div class="nxb-sign-line">PATRON CONFIRMATION</div>
                <div class="nxb-sign-sub">${escHtml(order.customerName)}<br>Order Accepted &amp; Registered</div>
              </div>

              <div class="nxb-seal-wrap">
                <div class="nxb-seal-circle">
                  <div class="nxb-seal-stars">&#9733; &#9733; &#9733;</div>
                  <div class="nxb-seal-main">NEXUS<br>MASTER ATELIER<br>EST. 2026</div>
                  <div class="nxb-seal-stars">&#9733; &#9733; &#9733;</div>
                </div>
                <div class="nxb-seal-caption">EMBOSSED PROVENANCE SEAL</div>
              </div>

              <div class="nxb-sign-col">
                <div class="nxb-sign-script">Nexus Atelier</div>
                <div class="nxb-sign-line">DIRECTOR OF RUNWAY CURATION</div>
                <div class="nxb-sign-sub">Chief Creative Director &amp; Tailoring Maison<br>Colombo Flagship Studio Hub</div>
              </div>
            </div>

            <div class="nxb-legal-foot">
              This digital commercial instrument &amp; provenance deed is officially recorded under Certificate #${escHtml(order.provenanceSerial)}.<br>
              For atelier concierge, sizing requests, or dispatch tracking, please quote Reference ${escHtml(order.id)}. NEXUS Bespoke Atelier.
            </div>

          </div>
        </div>
      </div>
    `;
  }

  function show(rawOrder) {
    const order = normalizeOrderRecord(rawOrder);
    root.__nexusCurrentBill = order;
    try {
      localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
    } catch (_) {}

    const dlg = ensureModal();
    const body = dlg.querySelector('#nxb-bill-body');
    const refEl = dlg.querySelector('#nxb-toolbar-ref');
    if (refEl) {
      refEl.textContent = `${order.id} • ${order.invoiceRef} • ${formatMoney(order.total)}`;
    }
    if (body) {
      body.innerHTML = renderHtmlInvoice(order);
    }
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', 'true');
    }
    return order;
  }

  function drawPageBorder(doc) {
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(253, 251, 247);
    doc.rect(0, 0, pw, ph, 'F');
    doc.setDrawColor(184, 150, 76);
    doc.setLineWidth(0.55);
    doc.rect(7, 7, pw - 14, ph - 14);
    doc.setDrawColor(217, 197, 152);
    doc.setLineWidth(0.25);
    doc.rect(9.5, 9.5, pw - 19, ph - 19);
  }

  function downloadPDF(rawOrder) {
    const order = normalizeOrderRecord(rawOrder || root.__nexusCurrentBill);
    if (!root.jspdf || !root.jspdf.jsPDF) {
      window.print();
      return;
    }

    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const marginX = 16;
    const contentW = pw - marginX * 2;

    drawPageBorder(doc);

    // Masthead
    let y = 18;
    doc.setTextColor(184, 150, 76);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text('***', pw / 2, y, { align: 'center' });

    y += 7;
    doc.setTextColor(21, 20, 19);
    doc.setFont('times', 'bold');
    doc.setFontSize(19);
    doc.text('N E X U S   B E S P O K E   A T E L I E R', pw / 2, y, { align: 'center' });

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(109, 97, 75);
    doc.text('HAUTE-COUTURE STREETWEAR  |  ARCHITECTURAL SILHOUETTES  |  RUNWAY ARCHIVE', pw / 2, y, { align: 'center' });

    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(91, 83, 70);
    doc.text('Flagship Maison: Colombo 07 Heritage District  |  +94 11 268 8900  |  concierge@nexus-atelier.com', pw / 2, y, { align: 'center' });

    // Pill Title
    y += 6;
    doc.setFillColor(250, 246, 236);
    doc.setDrawColor(184, 150, 76);
    doc.setLineWidth(0.35);
    doc.roundedRect(36, y, pw - 72, 8.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(124, 95, 36);
    doc.text('OFFICIAL ATELIER INVOICE & PROVENANCE CERTIFICATE', pw / 2, y + 5.7, { align: 'center' });

    y += 14;

    // Box 1: Patron & Delivery Dossier
    const destStr = [order.address, order.city, order.postal].filter(Boolean).join(', ');
    doc.setFillColor(248, 245, 237);
    doc.setDrawColor(228, 218, 194);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, y, contentW, 38, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(139, 108, 43);
    doc.text('PATRON & DELIVERY DOSSIER', marginX + 5, y + 6.5);
    doc.setDrawColor(230, 220, 198);
    doc.line(marginX + 5, y + 8.5, marginX + contentW - 5, y + 8.5);

    const patronRows = [
      ['Patron:', order.customerName],
      ['Contact:', order.phone],
      ['Email:', order.customerEmail],
      ['Destination:', destStr],
      ['Transit Timeframe:', 'Express Insured Courier (2-3 Business Days)']
    ];
    let ry = y + 13.5;
    patronRows.forEach(([k, v]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(106, 98, 85);
      doc.text(k, marginX + 5, ry);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(21, 20, 19);
      doc.text(String(v).slice(0, 72), marginX + contentW - 5, ry, { align: 'right' });
      ry += 5;
    });

    y += 42;

    // Box 2: Registration & Atelier Ledger
    doc.setFillColor(248, 245, 237);
    doc.setDrawColor(228, 218, 194);
    doc.roundedRect(marginX, y, contentW, 43, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(139, 108, 43);
    doc.text('REGISTRATION & ATELIER LEDGER', marginX + 5, y + 6.5);
    doc.setDrawColor(230, 220, 198);
    doc.line(marginX + 5, y + 8.5, marginX + contentW - 5, y + 8.5);

    const ledgerRows = [
      ['Order Reference:', order.id, true],
      ['Invoice Reference:', order.invoiceRef, false],
      ['Provenance Serial:', order.provenanceSerial, false],
      ['Date of Issue:', order.formattedDate, false],
      ['Payment Channel:', order.paymentChannelLabel, false]
    ];
    ry = y + 13.5;
    ledgerRows.forEach(([k, v, isGold]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(106, 98, 85);
      doc.text(k, marginX + 5, ry);
      doc.setFont('helvetica', 'bold');
      if (isGold) doc.setTextColor(139, 108, 43);
      else doc.setTextColor(21, 20, 19);
      doc.text(String(v), marginX + contentW - 5, ry, { align: 'right' });
      ry += 5;
    });

    // Status pill row
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(106, 98, 85);
    doc.text('Atelier Status:', marginX + 5, ry);
    const badgeW = 68;
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(134, 239, 172);
    doc.roundedRect(marginX + contentW - badgeW - 5, ry - 4, badgeW, 5.5, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(22, 101, 52);
    doc.text(order.statusBadge, marginX + contentW - 5 - badgeW / 2, ry - 0.3, { align: 'center' });

    y += 49;

    // Section 3: Itemized Valuation Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(139, 108, 43);
    doc.text('ITEMIZED GARMENT & ATELIER VALUATION SCHEDULE', marginX, y);
    y += 3;

    const tableRows = order.items.map((it) => [
      it.index,
      `${it.title}\nSize: ${it.size}  |  Certified Runway Edition  |  Tag #${order.provenanceSerial}`,
      'Verified Piece',
      String(it.quantity),
      formatMoney(it.unitPrice),
      formatMoney(it.lineTotal)
    ]);
    tableRows.push([
      String(order.items.length + 1).padStart(2, '0'),
      `Insured Express Atelier Courier Dispatch\nTracked doorstep handover (${order.city || 'Sri Lanka'})`,
      'Direct Handover',
      '1',
      order.shippingFee > 0 ? formatMoney(order.shippingFee) : 'Complimentary',
      formatMoney(order.shippingFee)
    ]);
    if (order.discountAmount > 0) {
      tableRows.push([
        String(order.items.length + 2).padStart(2, '0'),
        'Atelier Patron Privilege Credit\nExclusive settlement privilege applied',
        'Privilege Credit',
        '1',
        '-' + formatMoney(order.discountAmount),
        '-' + formatMoney(order.discountAmount)
      ]);
    }

    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX, top: 18, bottom: 20 },
        head: [['#', 'BESPOKE PIECE & SPECIFICATIONS', 'PROVENANCE', 'QTY', 'RATE', 'NET (USD)']],
        body: tableRows,
        theme: 'plain',
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 3,
          textColor: [29, 27, 24],
          lineColor: [235, 227, 208],
          lineWidth: 0.25,
          fillColor: [253, 251, 247]
        },
        headStyles: {
          fillColor: [239, 233, 218],
          textColor: [93, 74, 34],
          fontStyle: 'bold',
          fontSize: 7.5
        },
        columnStyles: {
          0: { cellWidth: 10 },
          2: { cellWidth: 28, textColor: [22, 101, 52], fontStyle: 'bold' },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 24, halign: 'right' },
          5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
        },
        didDrawPage: function (hookData) {
          if (hookData.pageNumber > 1) {
            drawPageBorder(doc);
          }
        }
      });
      y = doc.lastAutoTable.finalY + 7;
    } else {
      y += 10;
    }

    // Ensure enough room for Settlement box + Guarantees + Seal (~115mm); otherwise add clean Page 2
    if (y + 110 > ph - 14) {
      doc.addPage();
      drawPageBorder(doc);
      y = 18;
    }

    // Settlement Covenant & Totals Card
    doc.setFillColor(248, 245, 237);
    doc.setDrawColor(228, 218, 194);
    doc.roundedRect(marginX, y, contentW, 42, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(139, 108, 43);
    doc.text('SETTLEMENT COVENANT & ATELIER GUARANTEE', marginX + 5, y + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(79, 72, 61);
    doc.text('• Every garment passes stitch-density, drape, and hardware quality verification.', marginX + 5, y + 12.5);
    doc.text(
      order.isPaidOnline
        ? '• Electronic Settlement Confirmed: Prioritized atelier dispatch registered.'
        : '• Doorstep Cash Settlement Scheduled: Verified courier handover upon delivery.',
      marginX + 5,
      y + 17.5
    );

    doc.setDrawColor(214, 197, 159);
    doc.line(marginX + 5, y + 21, marginX + contentW - 5, y + 21);

    doc.setFontSize(8.5);
    doc.text('Pieces Subtotal:', marginX + 5, y + 26.5);
    doc.setFont('helvetica', 'bold');
    doc.text(formatMoney(order.subtotal), marginX + contentW - 5, y + 26.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('Insured Atelier Transit:', marginX + 5, y + 31.5);
    doc.setFont('helvetica', 'bold');
    doc.text(formatMoney(order.shippingFee), marginX + contentW - 5, y + 31.5, { align: 'right' });

    doc.setDrawColor(184, 150, 76);
    doc.line(marginX + 5, y + 34, marginX + contentW - 5, y + 34);

    doc.setFontSize(10.5);
    doc.setTextColor(139, 108, 43);
    doc.text('TOTAL NET SETTLEMENT:', marginX + 5, y + 39.5);
    doc.text(formatMoney(order.total), marginX + contentW - 5, y + 39.5, { align: 'right' });

    y += 48;

    // 2x2 Luxury Guarantees Grid
    doc.setFillColor(248, 245, 237);
    doc.setDrawColor(228, 218, 194);
    doc.roundedRect(marginX, y, contentW, 28, 2, 2, 'FD');

    const gMid = marginX + contentW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(124, 95, 36);
    doc.text('ATELIER AUTHENTICITY', marginX + 5, y + 6.5);
    doc.text('ARCHITECTURAL TAILORING', gMid + 3, y + 6.5);
    doc.text('INSURED COURIER TRANSIT', marginX + 5, y + 19.5);
    doc.text('30-DAY CONCIERGE CARE', gMid + 3, y + 19.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(91, 83, 70);
    doc.text(`Recorded permanently under Serial #${order.provenanceSerial}.`, marginX + 5, y + 11);
    doc.text('Precision cut, seam reinforcement & studio steam finish.', gMid + 3, y + 11);
    doc.text('Tamper-evident garment carrier & insured doorstep delivery.', marginX + 5, y + 24);
    doc.text('Complimentary size consultation & exchange concierge.', gMid + 3, y + 24);

    y += 35;

    // Patron Confirmation + Embossed Provenance Seal + Signature
    const signY = y + 15;
    doc.setDrawColor(169, 149, 103);
    doc.line(marginX + 4, signY, marginX + 54, signY);
    doc.line(pw - marginX - 54, signY, pw - marginX - 4, signY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(21, 20, 19);
    doc.text('PATRON CONFIRMATION', marginX + 29, signY + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(91, 83, 70);
    doc.text(order.customerName.slice(0, 32), marginX + 29, signY + 8.5, { align: 'center' });
    doc.text('Order Accepted & Registered', marginX + 29, signY + 12, { align: 'center' });

    // Gold Seal in Center
    const sealX = pw / 2;
    const sealY = signY - 2;
    doc.setFillColor(250, 245, 232);
    doc.setDrawColor(184, 150, 76);
    doc.setLineWidth(0.5);
    doc.circle(sealX, sealY, 12.5, 'FD');
    doc.setDrawColor(217, 197, 152);
    doc.setLineWidth(0.25);
    doc.circle(sealX, sealY, 10.5, 'S');
    doc.setFont('times', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(124, 95, 36);
    doc.text('* * *', sealX, sealY - 4.5, { align: 'center' });
    doc.text('NEXUS', sealX, sealY - 0.5, { align: 'center' });
    doc.text('MASTER ATELIER', sealX, sealY + 3, { align: 'center' });
    doc.text('EST. 2026', sealX, sealY + 6.2, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('EMBOSSED PROVENANCE SEAL', sealX, sealY + 16.5, { align: 'center' });

    // Right Signature
    doc.setFont('times', 'italic');
    doc.setFontSize(14);
    doc.setTextColor(21, 20, 19);
    doc.text('Nexus Atelier', pw - marginX - 29, signY - 3, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('DIRECTOR OF CURATION', pw - marginX - 29, signY + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(91, 83, 70);
    doc.text('Chief Runway Director & Atelier Hub', pw - marginX - 29, signY + 8.5, { align: 'center' });
    doc.text('Colombo Flagship Maison', pw - marginX - 29, signY + 12, { align: 'center' });

    // Footer provenance line
    doc.setDrawColor(230, 220, 198);
    doc.line(marginX, signY + 21, marginX + contentW, signY + 21);
    doc.setFontSize(7);
    doc.setTextColor(107, 99, 86);
    doc.text(
      `Recorded under Provenance Certificate #${order.provenanceSerial}. Reference ${order.id} for concierge support. NEXUS Bespoke Atelier.`,
      pw / 2,
      signY + 25.5,
      { align: 'center' }
    );

    const safeFileRef = order.id.replace(/[^a-zA-Z0-9_-]/g, '');
    doc.save(`NEXUS-Atelier-Invoice-${safeFileRef}.pdf`);
  }

  function showLast() {
    if (root.__nexusCurrentBill) return show(root.__nexusCurrentBill);
    try {
      const saved = localStorage.getItem(LAST_ORDER_KEY);
      if (saved) return show(JSON.parse(saved));
    } catch (_) {}
  }

  root.NexusInvoice = {
    show,
    showLast,
    downloadPDF,
    normalizeOrderRecord
  };
})(typeof window !== 'undefined' ? window : this);
