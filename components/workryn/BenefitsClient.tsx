/* AUTO-ASSEMBLED — do not hand-edit the embedded CSS/sprite/HTML blocks.
 * Static sections (health, gym showcase, rec, referral, pto, more) are v6's
 * approved markup verbatim (logos externalized to /benefits/*.png, gym Zoho
 * button removed). The gym/401k/mileage forms + supervisor rosters are real
 * React wired to app/actions/benefits.ts, styled with v6's own b2-* classes.
 */
'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { saveGymSelection, saveRetirementElection, submitMileage } from '@/app/actions/benefits'
import { FUNDS } from '@/lib/benefits/funds'

const CSS = `
  #ben2-app{
    --bg:#0a1020;--surface:#111a2e;--surface-2:#16213b;--surface-3:#1b2843;--border:#26334f;
    --text:#e9eef8;--dim:#9aa7c2;--faint:#6b7896;
    --rose:#fb7185;--rose-d:#e11d6b;--ok:#34d399;
    --shadow:0 14px 40px -18px rgba(0,0,0,.6);--radius:18px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
    color:var(--text);background:var(--bg);display:block;line-height:1.5;-webkit-font-smoothing:antialiased;
  }
  :root[data-theme="light"] #ben2-app{
    --bg:#f5f7fb;--surface:#fff;--surface-2:#f3f5fa;--surface-3:#eef1f8;--border:#e4e8f1;
    --text:#1d2536;--dim:#566081;--faint:#8893ab;--shadow:0 14px 34px -20px rgba(30,40,70,.3);
  }
  #ben2-app *{box-sizing:border-box}
  #ben2-app svg{display:block}
  .b2-icon{width:1em;height:1em;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

  .b2-toggle{position:sticky;top:12px;z-index:60;float:right;margin:12px 12px 0 0;display:inline-flex;gap:7px;align-items:center;
    cursor:pointer;user-select:none;background:var(--surface);border:1px solid var(--border);color:var(--dim);
    padding:8px 14px;border-radius:999px;font-size:12.5px;font-weight:650;box-shadow:var(--shadow)}
  .b2-toggle:hover{color:var(--text)}

  /* HERO */
  .b2-hero{position:relative;overflow:hidden;border-radius:var(--radius);margin:14px;padding:42px 40px;min-height:280px;
    display:grid;grid-template-columns:1.35fr .9fr;gap:24px;align-items:center;box-shadow:var(--shadow);
    background:
      radial-gradient(120% 150% at 8% 0%,rgba(251,113,133,.5),rgba(225,29,107,0) 55%),
      radial-gradient(120% 160% at 98% 8%,rgba(167,77,247,.42),rgba(167,77,247,0) 50%),
      radial-gradient(150% 200% at 70% 130%,rgba(244,114,182,.5),rgba(244,114,182,0) 55%),
      linear-gradient(135deg,#27102e 0%,#3c1333 45%,#561740 100%)}
  :root[data-theme="light"] #ben2-app .b2-hero{background:
      radial-gradient(120% 150% at 8% 0%,rgba(251,113,133,.85),rgba(225,29,107,0) 55%),
      radial-gradient(120% 160% at 98% 8%,rgba(192,132,252,.7),rgba(192,132,252,0) 50%),
      radial-gradient(150% 200% at 70% 130%,rgba(244,114,182,.85),rgba(244,114,182,0) 55%),
      linear-gradient(135deg,#f472a6,#e6498f 50%,#c026a3)}
  .b2-hero-l{position:relative;z-index:2}
  .b2-badgewrap{display:inline-flex;align-items:center;gap:11px;margin-bottom:18px}
  .b2-badge{width:60px;height:auto;background:transparent;padding:0;box-shadow:none}
  .b2-eyebrow{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:rgba(255,255,255,.82)}
  .b2-hero h1{margin:0 0 12px;font-size:38px;line-height:1.06;font-weight:800;letter-spacing:-.02em;color:#fff;max-width:17ch}
  .b2-hero p{margin:0;max-width:60ch;color:rgba(255,255,255,.9);font-size:14.5px}
  .b2-stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
  .b2-stat{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:13px;padding:10px 14px;color:#fff;backdrop-filter:blur(4px)}
  .b2-stat b{display:block;font-size:18px;font-weight:800;letter-spacing:-.01em}
  .b2-stat span{font-size:11px;color:rgba(255,255,255,.82)}
  .b2-hero-art{position:relative;z-index:2;justify-self:center}

  /* CHIP NAV */
  .b2-chips{position:sticky;top:0;z-index:50;display:flex;gap:8px;overflow-x:auto;padding:13px 14px;
    background:color-mix(in srgb,var(--bg) 84%,transparent);backdrop-filter:blur(9px);border-bottom:1px solid var(--border);scrollbar-width:thin}
  .b2-chip{flex:0 0 auto;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--dim);
    font-weight:650;font-size:12.5px;padding:8px 14px;border-radius:999px;white-space:nowrap;transition:.15s;display:inline-flex;gap:7px;align-items:center}
  .b2-chip:hover{color:var(--text);border-color:var(--rose)}
  .b2-chip .b2-icon{font-size:15px}

  .b2-wrap{padding:8px 14px 20px}
  .b2-sec{scroll-margin-top:62px;margin-top:34px}
  .b2-head{display:flex;align-items:center;gap:13px;margin:0 0 16px}
  .b2-head .ico{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;flex:0 0 auto;font-size:21px}
  .b2-head h2{margin:0;font-size:22px;font-weight:760;letter-spacing:-.01em}
  .b2-head .sub{font-size:13px;color:var(--faint);margin-top:2px}

  .b2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
  .b2-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .b2-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent,var(--rose))}
  .b2-prov{display:flex;align-items:center;gap:11px;margin-bottom:13px}
  .b2-prov .pv{width:46px;height:46px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto;
    background:color-mix(in srgb,var(--accent,var(--rose)) 15%,transparent);color:var(--accent,var(--rose))}
  .b2-prov .pv svg{width:25px;height:25px}
  .b2-prov h3{margin:0;font-size:16px;font-weight:720}
  .b2-prov .tag{font-size:11px;color:var(--faint);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
  .b2-card p{margin:0 0 12px;font-size:13.5px;color:var(--dim)}
  .b2-list{margin:0 0 14px;padding:0;list-style:none}
  .b2-list li{font-size:13px;color:var(--dim);padding:4px 0 4px 22px;position:relative}
  .b2-list li svg{position:absolute;left:2px;top:5px;width:14px;height:14px;color:var(--accent,var(--rose))}
  .b2-meta{font-size:12px;color:var(--faint);margin-bottom:12px}
  .b2-meta b{color:var(--text)}

  .b2-acts{display:flex;flex-wrap:wrap;gap:8px}
  .b2-btn{display:inline-flex;align-items:center;gap:7px;cursor:pointer;text-decoration:none;font-size:13px;font-weight:650;
    padding:9px 14px;border-radius:10px;transition:.15s;border:1px solid transparent;font-family:inherit}
  .b2-btn svg{width:15px;height:15px}
  .b2-pri{background:var(--accent,var(--rose));color:#fff}
  .b2-pri:hover{filter:brightness(1.08)}
  .b2-gh{background:transparent;border-color:var(--border);color:var(--text)}
  .b2-gh:hover{border-color:var(--accent,var(--rose));color:var(--accent,var(--rose))}

  /* brand logo chips for gyms */
  .b2-brandcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;box-shadow:var(--shadow);position:relative;overflow:hidden}
  .b2-brandcard::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent)}
  .b2-logo{height:46px;width:auto;object-fit:contain;margin-bottom:12px}
  .b2-logo.la{height:40px}
  .b2-plate{display:inline-flex;align-items:center;justify-content:center;gap:18px;border-radius:12px;padding:11px 16px;margin-bottom:13px;min-height:52px}
  .b2-plate.light{background:#fff;border:1px solid #e4e8f1}
  .b2-plate.dark{background:#1f2d2a;border:1px solid #2c3d39}
  .b2-plate img{height:28px;width:auto;display:block;object-fit:contain}
  .b2-plate.dual img{height:26px}
  .b2-ph{margin:0 0 2px;font-size:16px;font-weight:720}
  .b2-tag2{font-size:11px;color:var(--faint);font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:13px}

  /* FORM shell (editable, robust) */
  .b2-form{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:22px;margin-top:14px;position:relative}
  .b2-form-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:6px;flex-wrap:wrap}
  .b2-form-head h3{margin:0;font-size:17px;font-weight:740}
  .b2-saved-badge{display:none;align-items:center;gap:6px;font-size:12px;font-weight:650;color:var(--ok);
    background:color-mix(in srgb,var(--ok) 14%,transparent);padding:5px 11px;border-radius:999px}
  .b2-saved-badge.show{display:inline-flex}
  .b2-saved-badge svg{width:13px;height:13px}
  .b2-hint{font-size:12.5px;color:var(--faint);margin:0 0 18px;display:flex;gap:7px;align-items:center}
  .b2-hint svg{width:14px;height:14px;color:var(--rose)}
  .b2-hint b{color:var(--rose)}

  .b2-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:18px}
  .b2-choice{border:1.5px solid var(--border);border-radius:13px;padding:14px;cursor:pointer;transition:.15s;background:var(--surface);display:flex;gap:11px;align-items:center}
  .b2-choice:hover{border-color:var(--rose)}
  .b2-choice.sel{border-color:var(--rose);box-shadow:0 0 0 3px color-mix(in srgb,var(--rose) 22%,transparent)}
  .b2-choice .ck{width:20px;height:20px;border-radius:50%;border:2px solid var(--border);flex:0 0 auto;display:grid;place-items:center;transition:.15s}
  .b2-choice.sel .ck{border-color:var(--rose);background:var(--rose)}
  .b2-choice.sel .ck svg{width:11px;height:11px;color:#fff;stroke-width:3}
  .b2-choice .ck svg{opacity:0}
  .b2-choice.sel .ck svg{opacity:1}
  .b2-choice b{font-size:13.5px;display:block}
  .b2-choice span{font-size:11px;color:var(--faint)}

  .b2-fgrid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
  .b2-field{margin-bottom:14px}
  .b2-field label{display:block;font-size:12.5px;font-weight:650;color:var(--dim);margin-bottom:6px}
  .b2-field input,.b2-field select,.b2-field textarea{width:100%;background:var(--surface);border:1px solid var(--border);color:var(--text);
    border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit}
  .b2-field textarea{resize:vertical;min-height:64px}
  .b2-field input:focus,.b2-field select:focus,.b2-field textarea:focus{outline:none;border-color:var(--rose)}
  .b2-ack{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:var(--dim);margin:6px 0 18px}
  .b2-ack input{margin-top:2px;flex:0 0 auto}

  .b2-readonly{display:none}
  .b2-summary{background:var(--surface);border:1px dashed var(--border);border-radius:13px;padding:16px 18px;margin-bottom:14px}
  .b2-summary .row{display:flex;justify-content:space-between;gap:16px;font-size:13px;padding:5px 0;border-bottom:1px solid var(--border)}
  .b2-summary .row:last-child{border-bottom:0}
  .b2-summary .row span{color:var(--faint)}
  .b2-summary .row b{color:var(--text);text-align:right}

  /* 401k highlights panel */
  .b2-hl{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;margin-bottom:14px}
  .b2-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow)}
  .b2-panel h4{margin:0 0 12px;font-size:14px;font-weight:740;display:flex;align-items:center;gap:8px}
  .b2-panel h4 svg{width:17px;height:17px;color:var(--accent,var(--rose))}
  .b2-deflist{margin:0;font-size:13px}
  .b2-deflist dt{font-weight:700;color:var(--text);margin-top:12px;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .b2-deflist dt:first-child{margin-top:0}
  .b2-deflist dd{margin:3px 0 0;color:var(--dim)}
  .b2-note{font-size:11.5px;color:var(--faint);font-style:italic;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
  .b2-medgrid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .b2-spectitle{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);margin:2px 0 9px}
  .b2-fundgroup{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);margin:13px 0 7px;padding-left:2px}
  .b2-fundgroup:first-child{margin-top:2px}
  .b2-mininote{font-size:12px;color:var(--faint);margin:0 0 14px;max-width:72ch}
  .b2-benrow{display:grid;grid-template-columns:92px 1.5fr 1fr 78px;gap:9px;align-items:center;margin-bottom:9px}
  .b2-benlabel{font-size:12px;font-weight:650;color:var(--dim)}
  .b2-benrow .b2-field{margin:0}
  .b2-benrow .b2-field.pct input{text-align:right}
  @media(max-width:640px){.b2-medgrid{grid-template-columns:1fr}.b2-benrow{grid-template-columns:1fr 1fr}.b2-benlabel{grid-column:1/-1}}
  .b2-seclabel{font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dim);margin:6px 0 11px}
  .b2-alloc{margin:6px 0 18px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px}
  .b2-alloc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:13px;flex-wrap:wrap}
  .b2-alloc-title{margin:0 0 3px;font-size:14px;font-weight:740;display:flex;gap:8px;align-items:center}
  .b2-alloc-title svg{width:17px;height:17px;color:#818cf8}
  .b2-alloc-sub{margin:0;font-size:12px;color:var(--faint);max-width:64ch}
  .b2-mini{font-size:12px;font-weight:650;color:#818cf8;background:color-mix(in srgb,#818cf8 14%,transparent);border:0;border-radius:9px;padding:8px 13px;cursor:pointer;font-family:inherit;white-space:nowrap}
  .b2-mini:hover{background:color-mix(in srgb,#818cf8 22%,transparent)}
  .b2-fund{display:grid;grid-template-columns:auto auto 1fr auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:11px;margin-bottom:8px;transition:.15s;opacity:.62}
  .b2-fund.on{opacity:1;border-color:color-mix(in srgb,var(--fc) 55%,var(--border))}
  .b2-fund-tog{width:22px;height:22px;border-radius:6px;border:2px solid var(--border);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;transition:.15s}
  .b2-fund.on .b2-fund-tog{background:var(--fc);border-color:var(--fc)}
  .b2-fund-tog svg{width:12px;height:12px;color:#fff;opacity:0;stroke-width:3}
  .b2-fund.on .b2-fund-tog svg{opacity:1}
  .b2-fund-ico{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--fc) 16%,transparent);color:var(--fc);flex:0 0 auto}
  .b2-fund-ico svg{width:18px;height:18px}
  .b2-fund-name b{font-size:13.5px;display:block;line-height:1.3}
  .b2-fund-name span{font-size:11px;color:var(--faint)}
  .b2-fund-pct{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--faint)}
  .b2-fund-pct input{width:64px;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 9px;font-size:13px;text-align:right;font-family:inherit}
  .b2-fund-pct input:focus{outline:none;border-color:var(--fc)}
  .b2-fund:not(.on) .b2-fund-pct input{opacity:.35;pointer-events:none}
  .b2-allocbar{height:14px;border-radius:7px;overflow:hidden;background:var(--surface-2);border:1px solid var(--border);margin:15px 0 10px;display:flex}
  .b2-allocbar>div{display:flex;height:100%;width:100%}
  .b2-alloctotal{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--dim);padding:11px 15px;border-radius:11px;background:var(--surface-2);transition:.2s}
  .b2-alloctotal b{font-size:17px;font-weight:800}
  .b2-alloctotal.ok{background:color-mix(in srgb,var(--ok) 14%,transparent)}
  .b2-alloctotal.ok b{color:var(--ok)}
  .b2-alloctotal.warn b{color:#f59e0b}
  @media(max-width:640px){.b2-fund{grid-template-columns:auto 1fr auto}.b2-fund-ico{display:none}}

  /* estimator */
  .b2-est-controls{display:flex;align-items:center;gap:14px;margin:6px 0 16px;flex-wrap:wrap}
  .b2-est-controls .ctl{flex:1;min-width:180px}
  .b2-est-controls label{font-size:12px;color:var(--dim);font-weight:600;display:flex;justify-content:space-between}
  .b2-est-controls input[type=range]{width:100%;accent-color:var(--rose)}
  .b2-est-out{font-size:26px;font-weight:800;color:var(--accent,var(--rose));letter-spacing:-.01em}
  .b2-est-out small{display:block;font-size:11px;color:var(--faint);font-weight:600;letter-spacing:.03em;text-transform:uppercase}

  /* mileage trips */
  .b2-trip{display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:9px;align-items:end;margin-bottom:9px}
  .b2-trip .x{cursor:pointer;color:var(--faint);background:var(--surface);border:1px solid var(--border);border-radius:9px;width:38px;height:38px;display:grid;place-items:center}
  .b2-trip .x:hover{color:var(--rose);border-color:var(--rose)}
  .b2-addrow{font-size:12.5px;color:var(--rose);font-weight:650;cursor:pointer;display:inline-flex;gap:6px;align-items:center;margin:2px 0 14px}
  .b2-addrow svg{width:14px;height:14px}
  .b2-total{display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:13px 16px;margin-bottom:16px}
  .b2-total .lbl{font-size:13px;color:var(--dim)}
  .b2-total .amt{font-size:22px;font-weight:800;color:var(--accent,var(--rose))}
  .b2-sublist{margin-top:14px}
  .b2-sublist .s{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:11px 14px;margin-bottom:8px;font-size:13px}
  .b2-sublist .s .badge{font-size:10.5px;font-weight:700;color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent);padding:3px 9px;border-radius:999px}
  .b2-sublist .s .lk{font-size:12px;color:var(--rose);cursor:pointer;font-weight:650}

  /* steps */
  .b2-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
  .b2-step{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;text-align:center}
  .b2-step .si{width:44px;height:44px;margin:0 auto 10px;border-radius:12px;display:grid;place-items:center;
    background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}
  .b2-step .si svg{width:23px;height:23px}
  .b2-step b{font-size:13.5px;display:block;margin-bottom:3px}
  .b2-step span{font-size:12px;color:var(--faint)}

  .b2-foot{margin:34px 0 8px;padding:22px 24px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);
    box-shadow:var(--shadow);display:flex;flex-wrap:wrap;gap:16px 40px;align-items:center;justify-content:space-between}
  .b2-foot .brand{display:flex;gap:12px;align-items:center;font-weight:800;font-size:15px}
  .b2-foot .brand img{width:48px;height:auto}
  .b2-foot .contact{font-size:12.5px;color:var(--dim)}
  .b2-foot .contact b{color:var(--text)}
  .b2-foot a{color:var(--rose);text-decoration:none}
  .b2-compliance{font-size:11px;color:var(--faint);margin:14px 2px;max-width:88ch}
  .b2-compliance a{color:var(--faint)}

  @media(max-width:760px){.b2-hero{grid-template-columns:1fr}.b2-hero-art{display:none}.b2-hl{grid-template-columns:1fr}.b2-fgrid{grid-template-columns:1fr}.b2-steps{grid-template-columns:1fr}.b2-trip{grid-template-columns:1fr 1fr}.b2-hero h1{font-size:30px}}

  /* typography tune: stronger labels/body to match the numbers */
  :root[data-theme="light"] #ben2-app{ --dim:#454f68; --faint:#5f6a84; }
  #ben2-app .b2-summary .row span{ color:var(--text); font-weight:600; }
  #ben2-app .b2-card p, #ben2-app .b2-list li, #ben2-app .b2-deflist dd, #ben2-app .b2-head .sub{ font-weight:500; }
  #ben2-app .b2-spectitle{ color:var(--text); }

  /* rich form cards — accent bar + icon-badge header (matches the b2-card look) */
  #ben2-app .b2-richform{ overflow:hidden; }
  #ben2-app .b2-richform::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:5px; background:var(--rose); }
  #ben2-app .b2-formtitle{ display:flex; align-items:center; gap:11px; }
  #ben2-app .b2-formico{ width:40px; height:40px; border-radius:11px; display:grid; place-items:center; flex:0 0 auto; background:color-mix(in srgb,var(--rose) 16%,transparent); color:var(--rose); }
  #ben2-app .b2-formico svg{ width:22px; height:22px; }
  /* colorful choice tiles with icon badges */
  #ben2-app .b2-choice-rich{ align-items:center; gap:12px; }
  #ben2-app .b2-choiceico{ width:40px; height:40px; border-radius:11px; display:grid; place-items:center; flex:0 0 auto; background:color-mix(in srgb,var(--c,var(--rose)) 16%,transparent); color:var(--c,var(--rose)); }
  #ben2-app .b2-choiceico svg{ width:21px; height:21px; }
  #ben2-app .b2-choicetxt{ flex:1; min-width:0; }
  #ben2-app .b2-choice-rich .ck{ margin-left:auto; }
  #ben2-app .b2-choice-rich:hover{ border-color:var(--c,var(--rose)); }
  #ben2-app .b2-choice-rich.sel{ border-color:var(--c,var(--rose)); box-shadow:0 0 0 3px color-mix(in srgb,var(--c,var(--rose)) 20%,transparent); }
  #ben2-app .b2-choice-rich.sel .ck{ border-color:var(--c,var(--rose)); background:var(--c,var(--rose)); }
  #ben2-app .b2-choice-rich.sel .ck svg{ opacity:1; }
  /* accent the numbered step labels for color */
  #ben2-app .b2-richform .b2-seclabel{ color:var(--rose); }

  /* stat-card frame around section headers */
  #ben2-app .b2-head{ background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:15px 20px; box-shadow:var(--shadow); }

  /* section-title colors */
  :root[data-theme="light"] #ben2-app #health .b2-head h2{ color:#0d9488 !important; }
  :root[data-theme="light"] #ben2-app #gym .b2-head h2{ color:#e11d48 !important; }
  :root[data-theme="light"] #ben2-app #rec .b2-head h2{ color:#ea580c !important; }
  :root[data-theme="light"] #ben2-app #retire .b2-head h2{ color:#4f46e5 !important; }
  :root[data-theme="light"] #ben2-app #mileage .b2-head h2{ color:#d97706 !important; }
  :root[data-theme="light"] #ben2-app #referral .b2-head h2{ color:#e11d48 !important; }
  :root[data-theme="light"] #ben2-app #pto .b2-head h2{ color:#7c3aed !important; }
  :root[data-theme="light"] #ben2-app #more .b2-head h2{ color:#475569 !important; }
  :root[data-theme="light"] #ben2-app #rosters .b2-head h2{ color:#e11d48 !important; }
`

const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.6-9.2-9C1.3 7.7 3 4.5 6.2 4.5c1.9 0 3.2 1.1 3.8 2.2.6-1.1 1.9-2.2 3.8-2.2 3.2 0 4.9 3.2 3.4 6.5C19 15.4 12 20 12 20Z"/><path d="M12 9v4M10 11h4"/></symbol>
<symbol id="i-dumbbell" viewBox="0 0 24 24"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/></symbol>
<symbol id="i-ticket" viewBox="0 0 24 24"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2a2 2 0 0 0 0 3v2A1.5 1.5 0 0 1 19.5 17h-15A1.5 1.5 0 0 1 3 15.5v-2a2 2 0 0 0 0-3Z"/><path d="M12 7v10" stroke-dasharray="2 2"/></symbol>
<symbol id="i-sprout" viewBox="0 0 24 24"><path d="M12 21v-7M12 14c0-3 2.4-5 5.5-5C17.5 12 15.4 14 12 14ZM12 14c0-2.6-2-4.4-4.7-4.4C7.3 12.2 9.3 14 12 14Z"/></symbol>
<symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-1.6 5-5 1.6 1.6-5 5-1.6Z"/></symbol>
<symbol id="i-car" viewBox="0 0 24 24"><path d="M4 16v2M20 16v2M5 16h14l-1.4-5.2A2 2 0 0 0 15.7 9H8.3a2 2 0 0 0-1.9 1.4L5 16Z"/><path d="M3 16h18M7.5 13h9"/><circle cx="8" cy="16" r="1.3"/><circle cx="16" cy="16" r="1.3"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></symbol>
<symbol id="i-laptop" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20M9 16h6"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z"/><path d="m9 12 2 2 4-4"/></symbol>
<symbol id="i-cap" viewBox="0 0 24 24"><path d="m2 9 10-4 10 4-10 4L2 9Z"/><path d="M6 11v4c0 1.4 2.7 3 6 3s6-1.6 6-3v-4M22 9v5"/></symbol>
<symbol id="i-calstar" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8 3v3M16 3v3"/><path d="m12 11 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 13.3l2-.3 1-2Z"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></symbol>
<symbol id="i-pencil" viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></symbol>
<symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8M19 13v6H5V5h6"/></symbol>
<symbol id="i-phone" viewBox="0 0 24 24"><path d="M6 3h3l1.5 5L8 9.5a12 12 0 0 0 6.5 6.5L16 13.5 21 15v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"/></symbol>
<symbol id="i-gauge" viewBox="0 0 24 24"><path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 3.5-4.5"/><circle cx="12" cy="17" r="1.2"/></symbol>
<symbol id="i-doc" viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></symbol>
<symbol id="i-cash" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M6 9v6M18 9v6"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></symbol>
<symbol id="i-tree" viewBox="0 0 24 24"><path d="M12 21v-5M8 16a4 4 0 0 1-1-7.7A4 4 0 0 1 12 3a4 4 0 0 1 5 5.3A4 4 0 0 1 16 16H8Z"/></symbol>
<symbol id="i-cross" viewBox="0 0 24 24"><path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3Z"/></symbol>
<symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></symbol>
<symbol id="i-bars" viewBox="0 0 24 24"><path d="M5 20v-6M12 20V8M19 20V4"/></symbol>
<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></symbol>
<symbol id="i-vault" viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="13" rx="2"/><circle cx="12" cy="12" r="2.4"/><path d="M12 14.4V17"/></symbol>
<symbol id="i-gift" viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18v3H3zM12 9v11"/><path d="M12 9C12 6.5 10.2 4.5 8.3 5.3 6.6 6 8 9 12 9ZM12 9c0-2.5 1.8-4.5 3.7-3.7C17.4 6 16 9 12 9Z"/></symbol>
</defs></svg>`

const HTML: Record<string, string> = {
  health: `<div class="b2-sec" id="health">
    <div class="b2-head">
      <div class="ico" style="background:rgba(13,148,136,.16);color:#2dd4bf"><svg class="b2-icon" style="font-size:22px"><use href="#i-heart"/></svg></div>
      <div><h2>Health, Vision &amp; Dental</h2><div class="sub">Your plan at a glance — choose coverage and add eligible family members</div></div>
    </div>
    <div class="b2-grid">

      <div class="b2-card" style="--accent:#0891b2;grid-column:1/-1">
        <div class="b2-plate light dual"><img src="/benefits/cigna_t.png" alt="Cigna"><img src="/benefits/allstate_t.png" alt="Allstate Benefits"></div>
        <h3 class="b2-ph">Medical — Self-Funded PPO</h3>
        <div class="b2-tag2">Administered by Allstate Benefits · Cigna LocalPlus network &amp; PBM</div>
        <p>A self-funded PPO copay plan: see any provider, pay less in-network. It's the same plan whether you see the Cigna or the Allstate Benefits logo.</p>
        <div class="b2-medgrid">
          <div>
            <div class="b2-spectitle">Plan at a glance (in-network)</div>
            <div class="b2-summary">
              <div class="row"><span>Deductible (individual / family)</span><b>$3,500 / $7,000</b></div>
              <div class="row"><span>Out-of-pocket max (ind / family)</span><b>$9,100 / $18,200</b></div>
              <div class="row"><span>Coinsurance</span><b>80%</b></div>
              <div class="row"><span>PCP / specialist visit</span><b>$40 / $60 copay</b></div>
              <div class="row"><span>Urgent care</span><b>$75 copay</b></div>
              <div class="row"><span>Rx (generic / brand / non-pref.)</span><b>$20 / $50 / $75</b></div>
            </div>
            <ul class="b2-list" style="margin-top:12px">
              <li><svg class="b2-icon"><use href="#i-check"/></svg>Vori Health virtual muscle &amp; joint care — $0 copay</li>
              <li><svg class="b2-icon"><use href="#i-check"/></svg>Papa caregiver support — 10 hours per year</li>
              <li><svg class="b2-icon"><use href="#i-check"/></svg>Cancer Coach by Osara Health — included</li>
            </ul>
          </div>
          <div>
            <div class="b2-spectitle">Per paycheck <span style="font-weight:600;opacity:.65;font-size:12px">(bi-weekly · 26/yr)</span></div>
            <div class="b2-summary">
              <div class="row"><span>Employee</span><b>$215.18</b></div>
              <div class="row"><span>Employee + child</span><b>$419.59</b></div>
              <div class="row"><span>Employee + spouse</span><b>$548.70</b></div>
              <div class="row"><span>Employee + family</span><b>$710.08</b></div>
            </div>
            <div class="b2-acts" style="margin-top:14px">
              <a class="b2-btn b2-pri" href="mailto:bianca.parker@blhnurses.com?subject=Medical%20Plan%20Enrollment">Enroll — email Bianca <svg class="b2-icon"><use href="#i-arrow"/></svg></a>
              <a class="b2-btn b2-gh" href="https://my.cigna.com" target="_blank" rel="noopener">myCigna</a>
              <a class="b2-btn b2-gh" href="https://www.alliedbenefit.com" target="_blank" rel="noopener">Allied Benefit</a>
            </div>
          </div>
        </div>
      </div>

      <div class="b2-card" style="--accent:#0d9488">
        <div class="b2-plate light"><img src="/benefits/cigna_t.png" alt="Cigna"></div>
        <h3 class="b2-ph">Dental — Cigna Dental PPO SA</h3>
        <div class="b2-tag2">Select Plan · no waiting periods</div>
        <div class="b2-summary">
          <div class="row"><span>Deductible (family 3×)</span><b>$100</b></div>
          <div class="row"><span>Preventive (in / out)</span><b>100% / 70%</b></div>
          <div class="row"><span>Basic (in / out)</span><b>80% / 60%</b></div>
          <div class="row"><span>Major (in / out)</span><b>50% / 40%</b></div>
          <div class="row"><span>Annual maximum</span><b>$1,500</b></div>
        </div>
        <div class="b2-meta" style="margin-top:12px">Orthodontics not covered · From <b>$19.84</b> per paycheck (bi-weekly · 26/yr)</div>
        <div class="b2-acts">
          <a class="b2-btn b2-pri" href="https://www.cignadentalsa.com" target="_blank" rel="noopener">Find a dentist <svg class="b2-icon"><use href="#i-arrow"/></svg></a>
        </div>
      </div>

      <div class="b2-card" style="--accent:#14b8a6">
        <div class="b2-plate dark"><img src="/benefits/kaiser_w.png" alt="Kaiser Permanente"></div>
        <h3 class="b2-ph">Dental — Kaiser Permanente Smile</h3>
        <div class="b2-tag2">MD PPO / VA C-POS · no waiting periods</div>
        <div class="b2-summary">
          <div class="row"><span>Deductible (family 3×)</span><b>$25</b></div>
          <div class="row"><span>Diagnostic &amp; preventive (in / out)</span><b>100% / 80%</b></div>
          <div class="row"><span>Basic (in / out)</span><b>80% / 60%</b></div>
          <div class="row"><span>Major (in / out)</span><b>50% / 40%</b></div>
          <div class="row"><span>Annual maximum</span><b>$1,500</b></div>
        </div>
        <div class="b2-meta" style="margin-top:12px">OrthoPlus rider available (lifetime max $1,000) · Member Services (LIBERTY) 888-798-9868</div>
        <div class="b2-acts">
          <a class="b2-btn b2-pri" href="https://kp.org" target="_blank" rel="noopener">Find a dentist <svg class="b2-icon"><use href="#i-arrow"/></svg></a>
          <a class="b2-btn b2-gh" href="https://kp.org/dental/mas" target="_blank" rel="noopener">Dental portal</a>
        </div>
      </div>

      <div class="b2-card" style="--accent:#2dd4bf">
        <div class="b2-prov"><div class="pv"><svg viewBox="0 0 24 24" class="b2-icon"><use href="#i-mail"/></svg></div><div><h3>Ready to enroll?</h3><div class="tag">Start with Bianca</div></div></div>
        <p>Email Bianca Parker to begin. She confirms eligibility and walks you through medical and dental selection, family add-ons, and any vision options.</p>
        <div class="b2-acts">
          <a class="b2-btn b2-pri" href="mailto:bianca.parker@blhnurses.com?subject=Benefits%20Enrollment">Email Bianca <svg class="b2-icon"><use href="#i-arrow"/></svg></a>
        </div>
      </div>

    </div>
  </div>`,
  gym: `<div class="b2-sec" id="gym">
    <div class="b2-head">
      <div class="ico" style="background:rgba(244,114,182,.16);color:#fb7185"><svg class="b2-icon" style="font-size:22px"><use href="#i-dumbbell"/></svg></div>
      <div><h2>Gym Membership</h2><div class="sub">BLH covers a large share of the cost at both Planet Fitness and LA Fitness — you pay the discounted rate below</div></div>
    </div>
    <div class="b2-grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
      <div class="b2-brandcard" style="--accent:#a855f7">
        <img class="b2-logo" src="/benefits/logo_pf.png" alt="Planet Fitness">
        <p style="margin:0;font-size:13.5px;color:var(--dim)">Wide variety of equipment and the 30-minute Express circuit. Judgement-free zone with clubs nationwide — more affordable with the BLH discount.</p>
      </div>
      <div class="b2-brandcard" style="--accent:#6366f1">
        <img class="b2-logo la" src="/benefits/logo_la.png" alt="LA Fitness">
        <p style="margin:0;font-size:13.5px;color:var(--dim)">Pools, courts, unlimited group classes and personal training across 340+ clubs, with corporate-wellness pricing for BLH team members.</p>
      </div>
    </div>

    <!-- COMPANY CONTRIBUTION -->
    <div class="b2-card" style="--accent:#fb7185;grid-column:1/-1;margin-top:6px">
      <div class="b2-prov"><div class="pv" style="background:rgba(251,113,133,.16);color:#fb7185"><svg class="b2-icon"><use href="#i-heart"/></svg></div><div><h3>BLH contributes to your membership</h3><div class="tag">Both gyms · payroll-friendly</div></div></div>
      <p>Staying active matters to us, so BLH covers a meaningful portion of the monthly cost at <b>both</b> gyms. The prices below are what <b>you</b> pay after our contribution — well under the public rate. Pick the option that fits and enroll on the Gym Membership Election form.</p>
    </div>

    <!-- PRICING CARDS -->
    <div class="b2-grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr));margin-top:14px">

      <div class="b2-card" style="--accent:#a855f7">
        <h3 class="b2-ph">Planet Fitness — Option 1</h3>
        <div class="b2-tag2">Classic · your home club</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin:10px 0 2px">
          <span style="text-decoration:line-through;opacity:.5;font-size:17px">$15<span style="font-size:12px">/mo</span></span>
          <span style="font-size:30px;font-weight:800;color:var(--accent)">$11<span style="font-size:14px;font-weight:600">/mo</span></span>
        </div>
        <div class="b2-meta">You pay <b>$11/month</b> — BLH covers the rest</div>
        <ul class="b2-list">
          <li><svg class="b2-icon"><use href="#i-check"/></svg>First month free · no sign-up fee</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Unlimited home-club access &amp; free fitness training</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>$39 annual fee</li>
        </ul>
      </div>

      <div class="b2-card" style="--accent:#a855f7">
        <h3 class="b2-ph">Planet Fitness — Option 2</h3>
        <div class="b2-tag2">Black Card · all locations</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin:10px 0 2px">
          <span style="text-decoration:line-through;opacity:.5;font-size:17px">$24.99<span style="font-size:12px">/mo</span></span>
          <span style="font-size:30px;font-weight:800;color:var(--accent)">$16<span style="font-size:14px;font-weight:600">/mo</span></span>
        </div>
        <div class="b2-meta">You pay <b>$16/month</b> — BLH covers the rest</div>
        <ul class="b2-list">
          <li><svg class="b2-icon"><use href="#i-check"/></svg>First month free · no sign-up fee · family-eligible</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Any location nationwide · bring a guest free</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Total Body Enhancement, hydromassage, massage chairs, tanning</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>$39 annual fee</li>
        </ul>
      </div>

      <div class="b2-card" style="--accent:#6366f1">
        <h3 class="b2-ph">LA Fitness</h3>
        <div class="b2-tag2">Single membership</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin:10px 0 2px">
          <span style="text-decoration:line-through;opacity:.5;font-size:17px">$39.99<span style="font-size:12px">/mo</span></span>
          <span style="font-size:30px;font-weight:800;color:var(--accent)">$29.99<span style="font-size:14px;font-weight:600">/mo</span></span>
        </div>
        <div class="b2-meta">You pay <b>$29.99/month</b> · <b>reduced</b> registration fee (normally $100)</div>
        <ul class="b2-list">
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Pools, spa &amp; sauna, basketball &amp; racquetball</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Group classes (many free) · clubs across the US &amp; Canada</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Open 7 days · some locations 24 hours</li>
        </ul>
      </div>

    </div>

    
    <p class="b2-hint"><svg class="b2-icon"><use href="#i-info"/></svg>Enrollment, including your e-signature, is completed on the secure Gym Membership Election form. *Some LA Fitness amenities may carry an additional fee.</p>
  </div>`,
  rec: `<div class="b2-sec" id="rec">
    <div class="b2-head">
      <div class="ico" style="background:rgba(234,88,12,.16);color:#fb923c"><svg class="b2-icon" style="font-size:22px"><use href="#i-ticket"/></svg></div>
      <div><h2>Recreational Discounts</h2><div class="sub">Free and discounted tickets through Tickets at Work</div></div>
    </div>
    <div class="b2-grid">
      <div class="b2-card" style="--accent:#ea580c">
        <div class="b2-prov"><div class="pv"><svg viewBox="0 0 24 24" class="b2-icon"><use href="#i-ticket"/></svg></div><div><h3>Tickets at Work</h3><div class="tag">Travel · Events · Retail</div></div></div>
        <p>Exclusive savings on hotels, theme parks, concerts, Broadway &amp; Vegas shows, sporting events, movie tickets, rental cars, gift cards and more.</p>
        <div class="b2-meta">Company code: <b>Beatrice</b> · Support 1-800-331-6483</div>
        <div class="b2-acts">
          <a class="b2-btn b2-pri" href="https://www.ticketsatwork.com/tickets/account.php?sub=enroll" target="_blank" rel="noopener">Become a member <svg class="b2-icon"><use href="#i-arrow"/></svg></a>
          <a class="b2-btn b2-gh" href="mailto:customerservice@ticketsatwork.com">Contact support</a>
        </div>
      </div>
    </div>
  </div>`,
  referral: `<div class="b2-sec" id="referral">
    <div class="b2-head">
      <div class="ico" style="background:rgba(251,113,133,.16);color:#fb7185"><svg class="b2-icon" style="font-size:22px"><use href="#i-gift"/></svg></div>
      <div><h2>Employee Referral Program</h2><div class="sub">Know someone great? Bring them to the team and get rewarded</div></div>
    </div>
    <div class="b2-grid">
      <div class="b2-card" style="--accent:#fb7185;grid-column:1/-1">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:26px">
          <div style="flex:0 0 auto;text-align:center;padding:14px 30px;border-radius:18px;background:rgba(251,113,133,.12)">
            <div style="font-size:48px;font-weight:800;color:#fb7185;line-height:1">$800</div>
            <div style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;opacity:.7;margin-top:6px">per successful referral</div>
          </div>
          <div style="flex:1 1 300px;min-width:260px">
            <h3 class="b2-ph" style="margin-top:0">Refer a future teammate</h3>
            <p style="margin:6px 0 10px">Refer someone you'd vouch for. When they're hired and <b>successfully complete their probationary period</b>, you receive an <b>$800</b> referral bonus. There's no cap — the more great people you bring in, the more you earn.</p>
            <ul class="b2-list">
              <li><svg class="b2-icon"><use href="#i-check"/></svg>Open to all current employees</li>
              <li><svg class="b2-icon"><use href="#i-check"/></svg>Bonus paid once your referral passes probation</li>
              <li><svg class="b2-icon"><use href="#i-check"/></svg>Refer as many people as you like</li>
            </ul>
            <div class="b2-meta" style="margin-top:10px">No form to fill out — just make sure your referral names you when they apply, and let your supervisor or HR know.</div>
          </div>
        </div>
      </div>
    </div>
  </div>`,
  pto: `<div class="b2-sec" id="pto">
    <div class="b2-head">
      <div class="ico" style="background:rgba(139,92,246,.16);color:#a78bfa"><svg class="b2-icon" style="font-size:22px"><use href="#i-sun"/></svg></div>
      <div><h2>Paid Time Off</h2><div class="sub">A competitive accrual you can use any time in the year</div></div>
    </div>
    <div class="b2-grid">
      <div class="b2-card" style="--accent:#8b5cf6">
        <div class="b2-prov"><div class="pv"><svg viewBox="0 0 24 24" class="b2-icon"><use href="#i-sun"/></svg></div><div><h3>How your PTO accrues</h3><div class="tag">Vacation + sick combined</div></div></div>
        <ul class="b2-list">
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Accrue 2.0 hours every complete pay period</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Up to 55 hours per year</li>
          <li><svg class="b2-icon"><use href="#i-check"/></svg>Maximum balance of 64 hours</li>
        </ul>
        <div class="b2-acts"><a class="b2-btn b2-pri" href="/w/pto">Manage my PTO <svg class="b2-icon"><use href="#i-arrow"/></svg></a></div>
      </div>
    </div>
  </div>`,
  more: `<div class="b2-sec" id="more">
    <div class="b2-head">
      <div class="ico" style="background:rgba(100,116,139,.18);color:#94a3b8"><svg class="b2-icon" style="font-size:22px"><use href="#i-laptop"/></svg></div>
      <div><h2>Telework &amp; More</h2><div class="sub">Everything else in your package</div></div>
    </div>
    <div class="b2-grid">
      <div class="b2-card" style="--accent:#64748b"><div class="b2-prov"><div class="pv"><svg viewBox="0 0 24 24" class="b2-icon"><use href="#i-laptop"/></svg></div><div><h3>Telework equipment</h3></div></div><p style="margin:0">Eligible employees receive a personal laptop, printer and cell phone — serviced, preloaded with current software, and monitored for full functionality and HIPAA compliance.</p></div>
      <div class="b2-card" style="--accent:#0ea5e9"><div class="b2-prov"><div class="pv"><svg viewBox="0 0 24 24" class="b2-icon"><use href="#i-shield"/></svg></div><div><h3>Life insurance</h3></div></div><p style="margin:0">Coverage to help protect your family's financial security. Contact payroll to review options and add it to your benefits.</p></div>
      <div class="b2-card" style="--accent:#10b981"><div class="b2-prov"><div class="pv"><svg viewBox="0 0 24 24" class="b2-icon"><use href="#i-cap"/></svg></div><div><h3>Tuition reimbursement</h3></div></div><p style="margin:0">Support for continued education and professional growth. Ask your supervisor about eligibility and approved programs.</p></div>
      <div class="b2-card" style="--accent:#f59e0b"><div class="b2-prov"><div class="pv"><svg viewBox="0 0 24 24" class="b2-icon"><use href="#i-calstar"/></svg></div><div><h3>Paid holidays</h3></div></div><p style="margin:0">Recognized paid holidays throughout the year so you can rest and spend time with family.</p></div>
    </div>
  </div>`,
}

interface GymOwn {
  selection: string
  preferredStartDate: string | null
  authorizationAck: boolean
  signatureName: string
  emailedAt: string | null
  updatedAt: string | null
}
interface Beneficiary { tier: string; name: string; relationship: string; percent: number }
interface RetireOwn {
  deferralType: string
  deferralValue: number | null
  preTax: boolean
  allocations: Record<string, number>
  beneficiaries: Beneficiary[]
  signatureName: string
  emailedAt: string | null
  updatedAt: string | null
}
interface MileageRow {
  id: string
  tripDate: string | null
  miles: number | null
  purpose: string | null
  ratePerMile: number | null
  amount: number | null
  submittedAt: string | null
  emailedAt: string | null
}
interface GymRosterRow {
  userId: string; userName: string; selection: string
  preferredStartDate: string | null; signatureName: string
  emailedAt: string | null; updatedAt: string | null
}
interface RetireRosterRow {
  userId: string; userName: string; deferralValue: number | null
  signatureName: string; emailedAt: string | null; updatedAt: string | null
}

interface Props {
  bannerUrl: string | null
  profile: { name: string; email: string }
  elevated: boolean
  ownGym: GymOwn | null
  ownRetirement: RetireOwn | null
  ownMileage: MileageRow[]
  gymRoster: GymRosterRow[]
  retirementRoster: RetireRosterRow[]
}

function Static({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function SubmittedPopup({ label, accent, onClose }: { label: string; accent: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,15,.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f1117', border: '1px solid rgba(255,255,255,.12)', borderRadius: '18px', padding: '32px 28px', maxWidth: '360px', width: '100%', textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,.55)' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(52,211,153,.16)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Icon id="check" style={{ fontSize: '30px' }} />
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '19px', color: '#f1f5f9' }}>Submitted</h3>
        <p style={{ margin: '0 0 4px', color: '#e2e8f0', fontSize: '15px' }}>Your {label} has been submitted.</p>
        <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>A confirmation email is on its way to you.</p>
        <button type="button" className="b2-btn b2-pri" style={{ background: accent, width: '100%', justifyContent: 'center' }} onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

function Icon({ id, style }: { id: string; style?: React.CSSProperties }) {
  return (
    <svg className="b2-icon" style={style}>
      <use href={`#i-${id}`} />
    </svg>
  )
}

const GYM_OPTIONS = [
  { key: 'pf_option_1', title: 'Planet Fitness — Option 1', sub: 'Classic · home club · employee $11/mo', icon: 'dumbbell', c: '#F43F5E' },
  { key: 'pf_option_2', title: 'Planet Fitness — Option 2', sub: 'Black Card · all locations · employee $16/mo', icon: 'dumbbell', c: '#a855f7' },
  { key: 'la_fitness', title: 'LA Fitness', sub: 'Single membership · employee $29.99/mo', icon: 'dumbbell', c: '#0ea5e9' },
  { key: 'waive', title: 'Waive for now', sub: "I'll decline gym membership at this time", icon: 'x', c: '#94a3b8' },
]

const GYM_LABEL: Record<string, string> = Object.fromEntries(GYM_OPTIONS.map((o) => [o.key, o.title]))
const ROSE = '#F43F5E'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US')
}

// ─────────────────────────────────────────── Gym election form ───────────
function GymForm({ initial, name }: { initial: GymOwn | null; name: string }) {
  const [selection, setSelection] = useState(initial?.selection ?? '')
  const [start, setStart] = useState(initial?.preferredStartDate ? initial.preferredStartDate.slice(0, 10) : '')
  const [ack, setAck] = useState(initial?.authorizationAck ?? false)
  const [sig, setSig] = useState(initial?.signatureName ?? name)
  const [emailed, setEmailed] = useState(Boolean(initial?.emailedAt))
  const [saved, setSaved] = useState(Boolean(initial))
  const [err, setErr] = useState('')
  const [pending, start_] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)
  const waive = selection === 'waive'

  function submit() {
    setErr('')
    if (!selection) { setErr('Please choose a gym option to continue.'); return }
    start_(async () => {
      const r = await saveGymSelection({
        selection,
        preferredStartDate: start || null,
        authorizationAck: ack,
        signatureName: sig,
      })
      if (r.ok) {
        setSaved(true)
        setEmailed(true)
        setShowConfirm(true)
      } else setErr(r.error)
    })
  }

  return (
    <div className="b2-form b2-richform" id="gym-form" style={{ '--rose': ROSE } as React.CSSProperties}>
      {showConfirm && <SubmittedPopup label="gym election" accent={ROSE} onClose={() => setShowConfirm(false)} />}
      <div className="b2-form-head">
        <div className="b2-formtitle"><span className="b2-formico"><Icon id="dumbbell" /></span><h3>Your gym election</h3></div>
        {saved && (
          <span className="b2-saved-badge" style={{ color: ROSE, background: 'rgba(244,63,94,.14)' }}>
            <Icon id="check" />
            <span>{emailed ? 'Saved & emailed to Bianca' : 'Saved'}</span>
          </span>
        )}
      </div>
      <p className="b2-hint" style={{ '--rose': ROSE } as React.CSSProperties}>
        <Icon id="lock" style={{ color: ROSE }} />
        Saved to your profile and emailed to <b style={{ color: ROSE }}>bianca.parker@blhnurses.com</b>. Update any time.
      </p>

      <div className="b2-choices" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {GYM_OPTIONS.map((o) => (
          <div
            key={o.key}
            className={'b2-choice b2-choice-rich' + (selection === o.key ? ' sel' : '')}
            onClick={() => setSelection(o.key)}
            style={{ '--c': o.c } as React.CSSProperties}
          >
            <span className="b2-choiceico"><Icon id={o.icon} /></span>
            <div className="b2-choicetxt">
              <b>{o.title}</b>
              <span>{o.sub}</span>
            </div>
            <span className="ck"><Icon id="check" /></span>
          </div>
        ))}
      </div>

      {!waive && (
        <div className="b2-fgrid">
          <div className="b2-field">
            <label>Preferred start date</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
        </div>
      )}

      {!waive && (
        <label className="b2-ack">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I authorize the corresponding payroll deduction for the membership elected above.</span>
        </label>
      )}

      <div className="b2-fgrid">
        <div className="b2-field">
          <label>Signature (type your full name)</label>
          <input type="text" value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Your full name" />
        </div>
      </div>

      {err && <p className="b2-mininote" style={{ color: '#f87171' }}>{err}</p>}
      <div className="b2-acts">
        <button className="b2-btn b2-pri" style={{ background: ROSE }} disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Save & email to Bianca'}
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────── 401(k) election form ───────────
function RetirementForm({ initial, profile }: { initial: RetireOwn | null; profile: { name: string; email: string } }) {
  const IND = '#6366f1'
  const prim = initial?.beneficiaries?.find((b) => b.tier === 'primary')
  const cont = initial?.beneficiaries?.find((b) => b.tier === 'contingent')

  const [pct, setPct] = useState(initial?.deferralValue != null ? String(initial.deferralValue) : '')
  const [alloc, setAlloc] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const f of FUNDS) o[f.key] = initial?.allocations?.[f.key] != null ? String(initial.allocations[f.key]) : ''
    return o
  })
  const [p, setP] = useState({ name: prim?.name ?? '', rel: prim?.relationship ?? '', pct: prim?.percent != null ? String(prim.percent) : '', dob: '', ssn: '', address: '' })
  const [c, setC] = useState({ name: cont?.name ?? '', rel: cont?.relationship ?? '', pct: cont?.percent != null ? String(cont.percent) : '', dob: '', ssn: '', address: '' })
  const [pi, setPi] = useState({ ssn: '', dob: '', addr: '', city: '', state: '', zip: '', phone: '', hire: '' })
  const [ack, setAck] = useState(false)
  const [sig, setSig] = useState(initial?.signatureName ?? profile.name)
  const [emailed, setEmailed] = useState(Boolean(initial?.emailedAt))
  const [saved, setSaved] = useState(Boolean(initial))
  const [err, setErr] = useState('')
  const [pending, start_] = useTransition()

  const [showConfirm, setShowConfirm] = useState(false)
  const [showErr, setShowErr] = useState(false)
  const total = useMemo(() => FUNDS.reduce((s, f) => s + (parseInt(alloc[f.key] || '0', 10) || 0), 0), [alloc])
  const REQ: React.CSSProperties = { borderColor: '#f87171', boxShadow: '0 0 0 1px rgba(248,113,113,.5)' }
  const bad = (cond: boolean) => (showErr && cond ? REQ : undefined)

  function splitEven() {
    const chosen = FUNDS.filter((f) => (parseInt(alloc[f.key] || '0', 10) || 0) > 0)
    const pool = chosen.length ? chosen : FUNDS.slice(0, 1)
    const each = Math.floor(100 / pool.length)
    const rem = 100 - each * pool.length
    const next: Record<string, string> = {}
    for (const f of FUNDS) next[f.key] = ''
    pool.forEach((f, i) => (next[f.key] = String(each + (i < rem ? 1 : 0))))
    setAlloc(next)
  }

  function setFund(key: string, raw: string) {
    setAlloc((a) => {
      if (raw === '') return { ...a, [key]: '' }
      const others = FUNDS.reduce((s, f) => s + (f.key === key ? 0 : (parseInt(a[f.key] || '0', 10) || 0)), 0)
      let v = parseInt(raw, 10)
      if (!Number.isFinite(v) || v < 0) v = 0
      const headroom = Math.max(0, 100 - others)
      if (v > headroom) v = headroom
      return { ...a, [key]: String(v) }
    })
  }

  function submit() {
    setErr('')
    setShowErr(true)
    const blanks =
      !(parseFloat(pct || '0') > 0) ||
      !p.name.trim() || !p.rel.trim() || !(parseFloat(p.pct || '0') > 0) ||
      !pi.ssn.trim() || !pi.dob.trim() || !pi.hire.trim() || !pi.phone.trim() ||
      !pi.addr.trim() || !pi.city.trim() || !pi.state.trim() || !pi.zip.trim() ||
      !p.dob.trim() || !p.ssn.trim() || !sig.trim() || !ack
    if (blanks || total !== 100) {
      let m = blanks ? 'Please complete all the fields highlighted in red' : ''
      if (total !== 100) m += (m ? ', and make sure fund' : 'Fund') + ` allocations total 100% (now ${total}%)`
      setErr(m + '.')
      return
    }
    const allocations: Record<string, number> = {}
    for (const f of FUNDS) {
      const v = parseInt(alloc[f.key] || '0', 10) || 0
      if (v > 0) allocations[f.key] = v
    }
    start_(async () => {
      const r = await saveRetirementElection({
        deferralValue: parseFloat(pct || '0'),
        allocations,
        primary: { name: p.name, relationship: p.rel, percent: parseInt(p.pct || '0', 10) || 0, dob: p.dob, ssn: p.ssn, address: p.address },
        contingent: c.name.trim() ? { name: c.name, relationship: c.rel, percent: parseInt(c.pct || '0', 10) || 0, dob: c.dob, ssn: c.ssn, address: c.address } : null,
        signatureName: sig,
        participant: pi,
      })
      if (r.ok) {
        setSaved(true)
        setEmailed(true)
        setShowConfirm(true)
      } else setErr(r.error)
    })
  }

  return (
    <div className="b2-form b2-richform" id="retire-form" style={{ '--rose': '#818cf8' } as React.CSSProperties}>
      {showConfirm && <SubmittedPopup label="401(k) election" accent={IND} onClose={() => setShowConfirm(false)} />}
      <div className="b2-form-head">
        <div className="b2-formtitle"><span className="b2-formico"><Icon id="sprout" /></span><h3>Your 401(k) election</h3></div>
        {saved && (
          <span className="b2-saved-badge" style={{ color: '#818cf8', background: 'rgba(129,140,248,.14)' }}>
            <Icon id="check" />
            <span>{emailed ? 'Saved & emailed to Bianca' : 'Saved'}</span>
          </span>
        )}
      </div>
      <p className="b2-hint" style={{ '--rose': '#818cf8' } as React.CSSProperties}>
        <Icon id="lock" style={{ color: '#818cf8' }} />
        On save, your completed CDM enrollment form is generated and emailed to <b style={{ color: '#818cf8' }}>bianca.parker@blhnurses.com</b>. Visible to payroll & your supervisor.
      </p>

      <div className="b2-seclabel">1 · Salary deferral (pre-tax)</div>
      <div className="b2-fgrid">
        <div className="b2-field">
          <label>Contribution — % of my pay</label>
          <input type="number" min="1" max="100" step="1" value={pct} onChange={(e) => { const n = parseInt(e.target.value || '0', 10); setPct(e.target.value === '' ? '' : String(Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0)))) }} placeholder="e.g. 6" style={bad(!(parseFloat(pct || '0') > 0))} />
        </div>
      </div>
      <p className="b2-mininote">Your salary deferral is pre-tax and applies to all future pay until you change it.</p>

      <div className="b2-alloc">
        <div className="b2-alloc-head">
          <div>
            <h4 className="b2-alloc-title"><Icon id="bars" />2 · Choose your investments</h4>
            <p className="b2-alloc-sub">Set the percent of your contributions for each fund. Whole numbers only — must total 100%.</p>
          </div>
          <button className="b2-mini" type="button" onClick={splitEven}>Split evenly</button>
        </div>
        <div id="retire-funds">
          {FUNDS.map((f) => (
            <div className="b2-benrow" key={f.key} style={{ gridTemplateColumns: '1fr 80px' }}>
              <span style={{ fontSize: '13px' }}>{f.label}</span>
              <div className="b2-field pct">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={alloc[f.key]}
                  onChange={(e) => setFund(f.key, e.target.value)}
                  placeholder="%"
                  style={bad(total !== 100)}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="b2-allocbar"><div style={{ width: Math.min(total, 100) + '%', height: '100%', background: total === 100 ? '#34d399' : '#818cf8' }} /></div>
        <div className={'b2-alloctotal' + (total === 100 ? '' : ' warn')}>
          <span>Allocated across funds</span>
          <b>{total}%</b>
        </div>
        <div className="b2-note">Lineup from the Beatrice Loving Heart 401(k) PSP (02J). Not investment advice.</div>
      </div>

      <div className="b2-seclabel">3 · Beneficiaries</div>
      <p className="b2-mininote">Name who receives your account. Primary beneficiaries should total 100%.</p>
      <div className="b2-benrow">
        <span className="b2-benlabel">Primary</span>
        <div className="b2-field"><input type="text" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Full name" style={bad(!p.name.trim())} /></div>
        <div className="b2-field"><input type="text" value={p.rel} onChange={(e) => setP({ ...p, rel: e.target.value })} placeholder="Relationship" style={bad(!p.rel.trim())} /></div>
        <div className="b2-field pct"><input type="number" min="0" max="100" value={p.pct} onChange={(e) => setP({ ...p, pct: e.target.value })} placeholder="%" style={bad(!(parseFloat(p.pct || '0') > 0))} /></div>
      </div>
      <div className="b2-benrow">
        <span className="b2-benlabel">Contingent</span>
        <div className="b2-field"><input type="text" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Full name (optional)" /></div>
        <div className="b2-field"><input type="text" value={c.rel} onChange={(e) => setC({ ...c, rel: e.target.value })} placeholder="Relationship" /></div>
        <div className="b2-field pct"><input type="number" min="0" max="100" value={c.pct} onChange={(e) => setC({ ...c, pct: e.target.value })} placeholder="%" /></div>
      </div>

      <div className="b2-seclabel">4 · Details for your enrollment form</div>
      <p className="b2-mininote" style={{ color: '#fbbf24' }}>
        Used only to complete and email your CDM enrollment PDF — these are <b>not stored</b> in Workryn.
      </p>
      <div className="b2-fgrid">
        <div className="b2-field"><label>Your SSN</label><input type="text" value={pi.ssn} onChange={(e) => setPi({ ...pi, ssn: e.target.value })} placeholder="XXX-XX-XXXX" style={bad(!pi.ssn.trim())} /></div>
        <div className="b2-field"><label>Date of birth</label><input type="text" value={pi.dob} onChange={(e) => setPi({ ...pi, dob: e.target.value })} placeholder="MM/DD/YYYY" style={bad(!pi.dob.trim())} /></div>
        <div className="b2-field"><label>Date of hire</label><input type="text" value={pi.hire} onChange={(e) => setPi({ ...pi, hire: e.target.value })} placeholder="MM/DD/YYYY" style={bad(!pi.hire.trim())} /></div>
        <div className="b2-field"><label>Phone</label><input type="text" value={pi.phone} onChange={(e) => setPi({ ...pi, phone: e.target.value })} placeholder="(xxx) xxx-xxxx" style={bad(!pi.phone.trim())} /></div>
      </div>
      <div className="b2-fgrid">
        <div className="b2-field"><label>Street address</label><input type="text" value={pi.addr} onChange={(e) => setPi({ ...pi, addr: e.target.value })} placeholder="Street" style={bad(!pi.addr.trim())} /></div>
        <div className="b2-field"><label>City</label><input type="text" value={pi.city} onChange={(e) => setPi({ ...pi, city: e.target.value })} placeholder="City" style={bad(!pi.city.trim())} /></div>
        <div className="b2-field"><label>State</label><input type="text" value={pi.state} onChange={(e) => setPi({ ...pi, state: e.target.value })} placeholder="MD" style={bad(!pi.state.trim())} /></div>
        <div className="b2-field"><label>ZIP</label><input type="text" value={pi.zip} onChange={(e) => setPi({ ...pi, zip: e.target.value })} placeholder="ZIP" style={bad(!pi.zip.trim())} /></div>
      </div>
      <div className="b2-fgrid">
        <div className="b2-field"><label>Primary beneficiary DOB</label><input type="text" value={p.dob} onChange={(e) => setP({ ...p, dob: e.target.value })} placeholder="MM/DD/YYYY" style={bad(!p.dob.trim())} /></div>
        <div className="b2-field"><label>Primary beneficiary SSN</label><input type="text" value={p.ssn} onChange={(e) => setP({ ...p, ssn: e.target.value })} placeholder="XXX-XX-XXXX" style={bad(!p.ssn.trim())} /></div>
      </div>

      <label className="b2-ack" style={showErr && !ack ? { outline: '1px solid #f87171', outlineOffset: '3px', borderRadius: '8px' } : undefined}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>I’ve read the plan highlights and this records my election. My typed signature below authorizes the salary deferral above.</span>
      </label>
      <div className="b2-fgrid">
        <div className="b2-field"><label>Signature (type your full name)</label><input type="text" value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Your full name" style={bad(!sig.trim())} /></div>
      </div>

      {err && <p className="b2-mininote" style={{ color: '#f87171' }}>{err}</p>}
      <div className="b2-acts">
        <button
          className="b2-btn b2-pri"
          style={{ background: IND }}
          disabled={pending}
          onClick={submit}
        >
          {pending ? 'Saving…' : 'Save & email to Bianca'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────── Mileage form ────────────
function MileageForm({ history, name }: { history: MileageRow[]; name: string }) {
  const AMBER = '#d97706'
  const [tripDate, setTripDate] = useState('')
  const [miles, setMiles] = useState('')
  const [rate, setRate] = useState('0.70')
  const [purpose, setPurpose] = useState('')
  const [rows, setRows] = useState<MileageRow[]>(history)
  const [ok, setOk] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [err, setErr] = useState('')
  const [pending, start_] = useTransition()

  const amount = (parseFloat(miles || '0') || 0) * (parseFloat(rate || '0') || 0)

  function submit() {
    setErr('')
    setOk(false)
    const need: string[] = []
    if (!tripDate) need.push('a trip date')
    if (!(parseFloat(miles || '0') > 0)) need.push('miles greater than 0')
    if (need.length) { setErr('Still needed: ' + need.join(' and ') + '.'); return }
    start_(async () => {
      const r = await submitMileage({
        tripDate,
        miles: parseFloat(miles || '0') || 0,
        purpose: purpose || undefined,
        ratePerMile: parseFloat(rate || '0') || undefined,
      })
      if (r.ok) {
        setOk(true)
        setShowConfirm(true)
        setRows((rs) => [
          { id: Math.random().toString(36).slice(2), tripDate, miles: parseFloat(miles) || 0, purpose: purpose || null, ratePerMile: parseFloat(rate) || null, amount: Math.round(amount * 100) / 100, submittedAt: new Date().toISOString(), emailedAt: null },
          ...rs,
        ])
        setMiles('')
        setPurpose('')
      } else setErr(r.error)
    })
  }

  return (
    <div className="b2-form b2-richform" id="mileage-form" style={{ '--rose': AMBER } as React.CSSProperties}>
      {showConfirm && <SubmittedPopup label="mileage trip" accent={AMBER} onClose={() => setShowConfirm(false)} />}
      <div className="b2-form-head">
        <div className="b2-formtitle"><span className="b2-formico"><Icon id="car" /></span><h3>Submit a mileage trip</h3></div>
        {ok && (
          <span className="b2-saved-badge" style={{ color: AMBER, background: 'rgba(217,119,6,.14)' }}>
            <Icon id="mail" />
            <span>Sent to mileage@blhnurses.com</span>
          </span>
        )}
      </div>
      <p className="b2-hint" style={{ '--rose': AMBER } as React.CSSProperties}>
        <Icon id="mail" style={{ color: AMBER }} />
        On submit, the trip is emailed to <b style={{ color: AMBER }}>mileage@blhnurses.com</b> and added to your history below.
      </p>

      <div className="b2-fgrid">
        <div className="b2-field"><label>Trip date</label><input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} /></div>
        <div className="b2-field"><label>Miles</label><input type="number" min="0" step="0.1" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="e.g. 24.5" /></div>
        <div className="b2-field"><label>Rate per mile (IRS standard)</label><input type="number" step="0.001" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
      </div>
      <div className="b2-field"><label>Purpose (optional)</label><input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Client visit, errand…" /></div>

      <div className="b2-total"><span className="lbl">This trip</span><span className="amt">{(parseFloat(miles || '0') || 0)} mi · ${amount.toFixed(2)}</span></div>

      {err && <p className="b2-mininote" style={{ color: '#f87171' }}>{err}</p>}
      <div className="b2-acts">
        <button className="b2-btn b2-pri" style={{ background: AMBER }} disabled={pending} onClick={submit}>
          <Icon id="mail" />{pending ? 'Submitting…' : 'Submit to mileage@blhnurses.com'}
        </button>
      </div>

      {rows.length > 0 && (
        <div className="b2-sublist">
          <label style={{ fontSize: '12.5px', fontWeight: 650, color: 'var(--dim)', display: 'block', margin: '10px 0 8px' }}>Your submissions</label>
          {rows.map((m) => (
            <div className="b2-benrow" key={m.id} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <span>{fmtDate(m.tripDate)}</span>
              <span>{m.miles} mi</span>
              <span>{m.amount != null ? '$' + m.amount.toFixed(2) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────── Supervisor rosters ────────
function Rosters({ gym, retire }: { gym: GymRosterRow[]; retire: RetireRosterRow[] }) {
  return (
    <div className="b2-sec" id="rosters">
      <div className="b2-head">
        <div className="ico" style={{ background: 'rgba(244,63,94,.16)', color: ROSE }}><Icon id="shield" style={{ fontSize: '22px' }} /></div>
        <div><h2>Election rosters</h2><div className="sub">Supervisor view · gym &amp; 401(k) elections</div></div>
      </div>

      <div className="b2-form b2-richform" style={{ '--rose': ROSE } as React.CSSProperties}>
        <div className="b2-form-head"><div className="b2-formtitle"><span className="b2-formico"><Icon id="dumbbell" /></span><h3>Gym elections ({gym.length})</h3></div></div>
        {gym.length === 0 ? <p className="b2-mininote">No gym elections yet.</p> : gym.map((r) => (
          <div className="b2-benrow" key={r.userId} style={{ gridTemplateColumns: '1.4fr 1.6fr 1fr 0.8fr' }}>
            <span><b>{r.userName}</b></span>
            <span>{GYM_LABEL[r.selection] ?? r.selection}</span>
            <span>{fmtDate(r.updatedAt)}</span>
            <span>{r.emailedAt ? 'Emailed' : 'Saved'}</span>
          </div>
        ))}
      </div>

      <div className="b2-form b2-richform" style={{ marginTop: '16px', '--rose': '#818cf8' } as React.CSSProperties}>
        <div className="b2-form-head"><div className="b2-formtitle"><span className="b2-formico"><Icon id="sprout" /></span><h3>401(k) elections ({retire.length})</h3></div></div>
        {retire.length === 0 ? <p className="b2-mininote">No 401(k) elections yet.</p> : retire.map((r) => (
          <div className="b2-benrow" key={r.userId} style={{ gridTemplateColumns: '1.6fr 1fr 1fr 0.8fr' }}>
            <span><b>{r.userName}</b></span>
            <span>{r.deferralValue != null ? r.deferralValue + '% pre-tax' : '—'}</span>
            <span>{fmtDate(r.updatedAt)}</span>
            <span>{r.emailedAt ? 'Emailed' : 'Saved'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const CHIPS = [
  { id: 'health', label: 'Health', icon: 'heart' },
  { id: 'gym', label: 'Gym', icon: 'dumbbell' },
  { id: 'rec', label: 'Recreation', icon: 'ticket' },
  { id: 'retire', label: '401(k)', icon: 'sprout' },
  { id: 'mileage', label: 'Mileage', icon: 'car' },
  { id: 'referral', label: 'Referral', icon: 'gift' },
  { id: 'pto', label: 'PTO', icon: 'sun' },
  { id: 'more', label: 'More', icon: 'laptop' },
]

const CHIP_OPEN: Record<string, string> = { gym: 'gym-election', retire: 'retire', mileage: 'mileage' }

const COLLAPSE_CSS = `
  #ben2-app .b2-colhead{cursor:pointer;transition:border-color .15s}
  #ben2-app .b2-colhead:hover{border-color:var(--rose)}
  #ben2-app .b2-colhead:focus-visible{outline:2px solid var(--rose);outline-offset:2px}
  #ben2-app .b2-coltitle{flex:1;min-width:0}
  #ben2-app .b2-colstatus{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:650;flex:0 0 auto;white-space:nowrap}
  #ben2-app .b2-colchev{flex:0 0 auto;display:inline-flex;color:var(--dim);transition:transform .18s ease}
  @media(max-width:600px){
    #ben2-app .b2-colhead h2{font-size:18px}
    #ben2-app .b2-colstatus{display:none}
  }
`

function Collapse({ id, icon, iconBg, iconColor, title, sub, status, open, onToggle, children }: {
  id: string
  icon: string
  iconBg: string
  iconColor: string
  title: string
  sub: string
  status: { label: string; done: boolean }
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const bodyId = `${id}-body`
  return (
    <div className="b2-sec" id={id}>
      <div
        className="b2-head b2-colhead"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        style={{ marginBottom: open ? '16px' : 0 }}
      >
        <div className="ico" style={{ background: iconBg, color: iconColor }}>
          <Icon id={icon} style={{ fontSize: '22px' }} />
        </div>
        <div className="b2-coltitle">
          <h2>{title}</h2>
          <div className="sub">{sub}</div>
        </div>
        <span
          className="b2-colstatus"
          style={status.done ? { color: '#34d399', background: 'rgba(52,211,153,.14)', border: '1px solid rgba(52,211,153,.3)', padding: '5px 11px', borderRadius: '999px' } : { color: 'var(--dim)' }}
        >
          {status.done && <Icon id="check" style={{ fontSize: '14px' }} />}
          {status.label}
        </span>
        <span className="b2-colchev" style={{ transform: open ? 'rotate(90deg)' : 'none' }} aria-hidden="true">
          <Icon id="chev" style={{ fontSize: '20px' }} />
        </span>
      </div>
      <div id={bodyId} style={{ display: open ? 'block' : 'none' }}>
        {children}
      </div>
    </div>
  )
}

export default function BenefitsClient(props: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ 'gym-election': false, retire: false, mileage: false })
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))
  const openSection = (id: string) => setOpen((o) => (o[id] ? o : { ...o, [id]: true }))

  useEffect(() => {
    const openFromHash = () => {
      const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
      const target = CHIP_OPEN[h] ?? (h === 'retire' || h === 'mileage' || h === 'gym-election' ? h : '')
      if (target) openSection(target)
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const retireStatus = props.ownRetirement ? { label: 'Election on file', done: true } : { label: 'Make your election', done: false }
  const gymStatus = props.ownGym ? { label: 'Election on file', done: true } : { label: 'Choose your plan', done: false }
  const mileageStatus = props.ownMileage.length > 0 ? { label: `${props.ownMileage.length} ${props.ownMileage.length === 1 ? 'trip' : 'trips'} logged`, done: true } : { label: 'Submit a trip', done: false }

  return (
    <div id="ben2-app">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <style dangerouslySetInnerHTML={{ __html: COLLAPSE_CSS }} />
      <div style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: SPRITE }} />

      {props.bannerUrl && (
        <div className="b2-banner" style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', margin: '14px 14px 18px', minHeight: '260px' }}>
          <img src={props.bannerUrl} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, pointerEvents: 'none' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(0deg, rgba(8,10,24,0.82) 0%, rgba(8,10,24,0.30) 38%, rgba(8,10,24,0.06) 66%, transparent 100%)' }} />
          <div style={{ position: 'absolute', left: '32px', bottom: '26px', zIndex: 2 }}>
            <h1 className="banner-heading" style={{ margin: 0, fontSize: '34px', fontWeight: 800, letterSpacing: '-0.01em', textShadow: '0 2px 18px rgba(0,0,0,0.55)' }}>Employee Benefits</h1>
          </div>
        </div>
      )}

      <div className="b2-chips">
        {CHIPS.map((ch) => (
          <a className="b2-chip" key={ch.id} href={`#${ch.id}`} onClick={() => { const t = CHIP_OPEN[ch.id]; if (t) openSection(t) }}>
            <Icon id={ch.icon} />
            <span>{ch.label}</span>
          </a>
        ))}
      </div>

      <Static html={HTML.health} />

      <Static html={HTML.gym} />
      <Collapse id="gym-election" icon="dumbbell" iconBg="rgba(244,63,94,.16)" iconColor="#fb7185" title="Gym Membership Election" sub="Choose your plan and enroll with your e-signature" status={gymStatus} open={!!open['gym-election']} onToggle={() => toggle('gym-election')}>
        <GymForm initial={props.ownGym} name={props.profile.name} />
      </Collapse>

      <Static html={HTML.rec} />

      <Collapse id="retire" icon="sprout" iconBg="rgba(99,102,241,.16)" iconColor="#818cf8" title="401(k) Profit-Sharing Plan" sub="Beatrice Loving Heart 401(k) PSP (02J) · make your election below" status={retireStatus} open={!!open.retire} onToggle={() => toggle('retire')}>
        <RetirementForm initial={props.ownRetirement} profile={props.profile} />
      </Collapse>

      <Collapse id="mileage" icon="car" iconBg="rgba(217,119,6,.16)" iconColor="#fbbf24" title="Travel Mileage Reimbursement" sub="Track your miles and submit per trip" status={mileageStatus} open={!!open.mileage} onToggle={() => toggle('mileage')}>
        <MileageForm history={props.ownMileage} name={props.profile.name} />
      </Collapse>

      <Static html={HTML.referral} />
      <Static html={HTML.pto} />
      <Static html={HTML.more} />

      {props.elevated && <Rosters gym={props.gymRoster} retire={props.retirementRoster} />}
    </div>
  )
}
