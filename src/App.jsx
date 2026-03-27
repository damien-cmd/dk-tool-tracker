import { useState, useEffect, useRef } from "react";
import {
  Home, Package, ArrowUpDown, Wrench, BarChart3,
  Bell, LogOut, Search, Plus, X, Check, ChevronRight,
  AlertCircle, CheckCircle, Shield, MapPin, DollarSign,
  Camera, ChevronDown, ChevronUp, FileText, Download, Edit2,
  QrCode, List, Settings, Printer, Tag, Users
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "./contexts/AuthContext";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useLiveTracking } from "./hooks/useLiveTracking";
import jsQR from "jsqr";

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const injectStyles = () => {
  if (document.getElementById("dktt-styles")) return;
  const el = document.createElement("style");
  el.id = "dktt-styles";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
    #dktt-root * { box-sizing: border-box; margin: 0; padding: 0; }
    #dktt-root { font-family: 'DM Sans', sans-serif; }
    #dktt-root .syne { font-family: 'Syne', sans-serif !important; }
    #dktt-root ::-webkit-scrollbar { width: 3px; height: 3px; }
    #dktt-root ::-webkit-scrollbar-track { background: transparent; }
    #dktt-root ::-webkit-scrollbar-thumb { background: #F97316; border-radius: 2px; }
    #dktt-root .tap { transition: transform 0.12s, opacity 0.12s; cursor: pointer; }
    #dktt-root .tap:active { transform: scale(0.97); opacity: 0.85; }
    #dktt-root input, #dktt-root select, #dktt-root textarea { outline: none; font-family: 'DM Sans', sans-serif; }
    #dktt-root .fade-in { animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(el);
};

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE
// ─────────────────────────────────────────────────────────────────────────────
const P = {
  bg: "#0F1117", surface: "#1A1D27", elevated: "#252A3A", border: "#2E3347",
  orange: "#F97316", green: "#22C55E", red: "#EF4444", yellow: "#EAB308",
  blue: "#60A5FA", muted: "#64748B", sub: "#94A3B8", text: "#F8FAFC",
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA MOVED TO useLiveTracking.js
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const TODAY     = new Date("2026-03-18");
const fmt       = d => new Date(d).toLocaleDateString("en-ZA", { day:"2-digit", month:"short", year:"numeric" });
const isOverdue = d => d && new Date(d) < TODAY;
const currency  = n => `R ${Number(n || 0).toLocaleString("en-ZA")}`;
const uid       = () => `id_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

const STATUS_CFG = {
  available:   { label:"Available",   color:P.green,  bg:"rgba(34,197,94,0.12)"   },
  checked_out: { label:"Checked Out", color:P.orange, bg:"rgba(249,115,22,0.12)"  },
  in_repair:   { label:"In Repair",   color:P.red,    bg:"rgba(239,68,68,0.12)"   },
  retired:     { label:"Retired",     color:P.muted,  bg:"rgba(100,116,139,0.12)" },
};
const COND_CFG = {
  good: { label:"Good", color:P.green  },
  fair: { label:"Fair", color:P.yellow },
  poor: { label:"Poor", color:P.red    },
};
const ROLE_CFG = {
  admin:            { label:"Administrator",    color:P.orange },
  asset_controller: { label:"Asset Controller", color:P.green  },
  foreman:          { label:"Foreman",          color:P.blue   },
  unauthorized:     { label:"Pending Role",     color:P.muted  },
};
const REPAIR_STATUS_CFG = {
  pending:     { label:"Pending",     color:P.yellow },
  in_progress: { label:"In Progress", color:P.orange },
  complete:    { label:"Complete",    color:P.green  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LOAD EXTERNAL LIBS
// ─────────────────────────────────────────────────────────────────────────────
const loadScript = (src, checkFn) => new Promise((res, rej) => {
  if (checkFn()) return res();
  const s = document.createElement("script");
  s.src = src; s.onload = res; s.onerror = rej;
  document.head.appendChild(s);
});


// ─────────────────────────────────────────────────────────────────────────────
// SELF-CONTAINED QR CODE GENERATOR
// Zero external dependencies — pure JS running entirely in the browser.
// All codes encode "DKTP-{toolId}" making them unique to DK Turf & Paving.
// Implements: Byte mode · ECC level M · Versions 1-4 · All 8 mask patterns
// ─────────────────────────────────────────────────────────────────────────────
const buildQR = (() => {
  // GF(256) arithmetic (primitive polynomial 0x11D = x^8+x^4+x^3+x^2+1)
  const EX = new Uint8Array(512), LG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++, x = (x << 1) ^ (x & 128 ? 0x11D : 0)) {
    EX[i] = x; LG[x] = i;
  }
  for (let i = 255; i < 512; i++) EX[i] = EX[i - 255];
  const gm = (a, b) => (a && b) ? EX[LG[a] + LG[b]] : 0;

  // Reed-Solomon: generator polynomial for n EC codewords
  const makeGen = n => {
    let p = [1];
    for (let i = 0; i < n; i++) {
      const q = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) { q[j] ^= p[j]; q[j+1] ^= gm(p[j], EX[i]); }
      p = q;
    }
    return p;
  };

  // Reed-Solomon encode
  const rsEncode = (data, n) => {
    const g = makeGen(n), r = new Array(n).fill(0);
    for (const b of data) {
      const lead = b ^ r.shift(); r.push(0);
      if (lead) for (let i = 0; i < g.length - 1; i++) r[i] ^= gm(g[i], lead);
    }
    return r;
  };

  // ECC-M version params: [dataCW, ecCW, remainderBits]
  const VP = { 1:[16,10,0], 2:[28,16,7], 3:[44,26,7], 4:[64,36,7] };

  // Format information strings for ECC-M masks 0-7
  // (15-bit BCH-encoded format word, XORed with mask 0x5412)
  const FM = [21522, 20773, 24188, 23371, 17913, 16590, 20375, 19104];

  // Single alignment pattern center per version (pre-filtered, no finder overlap)
  const AC = { 2:[[18,18]], 3:[[22,22]], 4:[[26,26]] };

  // 8 mask pattern functions
  const MK = [
    (r,c) => (r+c)%2===0,
    (r,c) => r%2===0,
    (r,c) => c%3===0,
    (r,c) => (r+c)%3===0,
    (r,c) => (Math.floor(r/2)+Math.floor(c/3))%2===0,
    (r,c) => (r*c%2+r*c%3)===0,
    (r,c) => (r*c%2+r*c%3)%2===0,
    (r,c) => ((r+c)%2+r*c%3)%2===0,
  ];

  // Penalty score for mask selection
  const calcPenalty = (mat, sz) => {
    let s = 0;
    // Rule 1: runs of 5+
    const runP = arr => {
      let run = 1, prev = arr[0];
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] === prev) run++;
        else { if (run >= 5) s += run - 2; run = 1; prev = arr[i]; }
      }
      if (run >= 5) s += run - 2;
    };
    for (let r = 0; r < sz; r++) runP(mat[r]);
    for (let c = 0; c < sz; c++) runP(mat.map(row => row[c]));
    // Rule 2: 2×2 blocks
    for (let r = 0; r < sz-1; r++)
      for (let c = 0; c < sz-1; c++)
        if (mat[r][c]===mat[r][c+1] && mat[r][c]===mat[r+1][c] && mat[r][c]===mat[r+1][c+1]) s += 3;
    // Rule 4: dark ratio
    const dark = mat.flat().reduce((a, v) => a + v, 0);
    s += Math.floor(Math.abs(dark / (sz * sz) * 100 - 50) / 5) * 10;
    return s;
  };

  return function buildQR(text) {
    const bytes = [...text].map(c => c.charCodeAt(0));
    const n = bytes.length;
    const v = n <= 14 ? 1 : n <= 26 ? 2 : n <= 42 ? 3 : 4;
    const sz = 17 + 4 * v;
    const [dCW, eCW, rem] = VP[v];

    // ── 1. Build data bit stream ──────────────────────────────────────────
    const bits = [];
    const push = (val, len) => { for (let i = len-1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4);        // byte mode indicator
    push(n, 8);        // character count
    bytes.forEach(b => push(b, 8));
    for (let i = 0; i < 4 && bits.length < dCW*8; i++) bits.push(0); // terminator
    while (bits.length % 8) bits.push(0);                              // byte-align
    const pad = [0xEC, 0x11]; let pi = 0;
    while (bits.length < dCW * 8) push(pad[pi++ % 2], 8);             // pad codewords

    const dw = [];
    for (let i = 0; i < dCW; i++) {
      let val = 0;
      for (let j = 0; j < 8; j++) val = (val << 1) | bits[i*8+j];
      dw.push(val);
    }
    const ew = rsEncode(dw, eCW);
    const db = [];
    [...dw, ...ew].forEach(w => { for (let i = 7; i >= 0; i--) db.push((w >> i) & 1); });
    for (let i = 0; i < rem; i++) db.push(0);

    // ── 2. Build matrix ──────────────────────────────────────────────────
    const mat = Array.from({length:sz}, () => new Array(sz).fill(0));
    const fn  = Array.from({length:sz}, () => new Array(sz).fill(false));
    const sf = (r, c, val) => {
      if (r >= 0 && r < sz && c >= 0 && c < sz) { mat[r][c] = val; fn[r][c] = true; }
    };

    // Finder patterns (7×7) + separators
    const addFinder = (tr, tc) => {
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++)
          sf(tr+r, tc+c, (r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4)) ? 1 : 0);
      for (let i = -1; i <= 7; i++) {
        sf(tr-1, tc+i, 0); sf(tr+7, tc+i, 0);
        sf(tr+i, tc-1, 0); sf(tr+i, tc+7, 0);
      }
    };
    addFinder(0, 0); addFinder(0, sz-7); addFinder(sz-7, 0);

    // Timing patterns (row 6, col 6)
    for (let i = 8; i < sz-8; i++) { sf(6, i, i%2===0?1:0); sf(i, 6, i%2===0?1:0); }

    // Dark module
    sf(4*v+9, 8, 1);

    // Alignment patterns
    (AC[v] || []).forEach(([ar, ac]) => {
      for (let r = -2; r <= 2; r++)
        for (let c = -2; c <= 2; c++)
          if (!fn[ar+r][ac+c])
            sf(ar+r, ac+c, (Math.abs(r)===2||Math.abs(c)===2||(r===0&&c===0)) ? 1 : 0);
    });

    // Reserve format info areas (mark as function so data doesn't overwrite)
    for (let c = 0; c <= 8; c++) { if (!fn[8][c]) fn[8][c] = true; }
    for (let r = 0; r <= 8; r++) { if (!fn[r][8]) fn[r][8] = true; }
    for (let r = sz-8; r < sz; r++) { if (!fn[r][8]) fn[r][8] = true; }
    for (let c = sz-8; c < sz; c++) { if (!fn[8][c]) fn[8][c] = true; }

    // ── 3. Place data bits (zigzag) ───────────────────────────────────────
    let bi = 0, up = true, col = sz - 1;
    while (col >= 0) {
      if (col === 6) { col--; continue; }
      for (let ri = 0; ri < sz; ri++) {
        const r = up ? sz-1-ri : ri;
        for (const c of [col, col-1]) {
          if (c >= 0 && !fn[r][c]) { mat[r][c] = bi < db.length ? db[bi++] : 0; }
        }
      }
      up = !up; col -= 2;
    }

    // ── 4. Try all 8 masks, pick lowest penalty ───────────────────────────
    let best = null, bestP = Infinity;
    for (let m = 0; m < 8; m++) {
      const mm = mat.map(row => [...row]);
      // Apply mask to data modules only
      for (let r = 0; r < sz; r++)
        for (let c = 0; c < sz; c++)
          if (!fn[r][c] && MK[m](r, c)) mm[r][c] ^= 1;

      // Write format information (both copies)
      const fv = FM[m], bit = i => (fv >> i) & 1;
      // Copy 1: around top-left finder
      for (let c = 0; c <= 5; c++) mm[8][c] = bit(14 - c);
      mm[8][7] = bit(8); mm[8][8] = bit(7); mm[7][8] = bit(6);
      for (let r = 5; r >= 0; r--) mm[r][8] = bit(r);
      // Copy 2: bottom-left col and top-right row
      for (let k = 0; k <= 6; k++) mm[sz-1-k][8] = bit(14 - k);
      for (let j = 0; j <= 7; j++) mm[8][sz-8+j] = bit(7 - j);

      const p = calcPenalty(mm, sz);
      if (p < bestP) { bestP = p; best = mm; }
    }
    return best;
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// QR CODE DISPLAY — canvas-based, zero network requests, always works
// ─────────────────────────────────────────────────────────────────────────────
function QRCodeDisplay({ toolId, size = 160 }) {
  const canvasRef = useRef(null);
  const [done, setDone] = useState(false);
  const data = `DKTP-${toolId}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const matrix = buildQR(data);
      const sz     = matrix.length;
      const quiet  = 4; // quiet zone modules on each side (QR spec minimum)
      const total  = sz + quiet * 2;
      const mod    = Math.max(2, Math.floor(size / total));
      const px     = mod * total;
      canvas.width  = px;
      canvas.height = px;
      const ctx = canvas.getContext("2d");
      // White quiet zone background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, px, px);
      // Orange dark modules
      ctx.fillStyle = "#F97316";
      for (let r = 0; r < sz; r++)
        for (let c = 0; c < sz; c++)
          if (matrix[r][c] === 1)
            ctx.fillRect((quiet + c) * mod, (quiet + r) * mod, mod, mod);
      setDone(true);
    } catch (e) { console.error("QR render error", e); }
  }, [data, size]);

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
      <div style={{ background:"#fff", borderRadius:10, padding:6, display:"inline-block", border:`2px solid ${P.orange}44` }}>
        <canvas ref={canvasRef} style={{ display:"block", borderRadius:6 }} />
        {!done && <div style={{ fontSize:10, color:P.muted, padding:8 }}>Generating…</div>}
      </div>
      <div style={{ fontSize:11, color:P.sub, marginTop:6, fontFamily:"monospace" }}>{data}</div>
      <div style={{ fontSize:10, color:P.muted, marginTop:2 }}>Print & stick to tool · Scannable now</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QR SCANNER (Raw WebRTC + jsQR) - Zero-latency native camera engine
// ─────────────────────────────────────────────────────────────────────────────
function QRScanner({ onScan, onClose, title = "Scan QR Code" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stream = null;
    let mounted = true;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!mounted || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", true);
        await videoRef.current.play();
        scanFrame();
      } catch (err) {
        if (mounted) setError("Camera access denied or unavailable: " + err.message);
      }
    }

    function scanFrame() {
      if (!mounted || !videoRef.current || !canvasRef.current) return;
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        
        // Define optimal processing size to obliterate high-res noise 
        const size = 400;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        
        // Center crop the video feed to match the exact middle of the screen (where the UI target is)
        const vW = video.videoWidth;
        const vH = video.videoHeight;
        const minDim = Math.min(vW, vH);
        const sx = (vW - minDim) / 2;
        const sy = (vH - minDim) / 2;
        
        ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        
        // Force jsQR to aggressively hunt for inverted matrix markers
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
        if (code && code.data) {
          onScan(code.data.replace("DKTP-", "").trim());
          return; // Terminate scan loop on success
        }
      }
      requestRef.current = requestAnimationFrame(scanFrame);
    }

    startCamera();

    return () => {
      mounted = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:13, color:P.sub, marginBottom:16, padding:"0 20px" }}>
          Point your camera at a equipment label or generic QR code.
        </div>
        <div style={{ position:"relative", width:"100%", maxWidth:400, margin:"0 auto", minHeight: 300, borderRadius:12, overflow:"hidden", border:`1px solid ${P.border}`, background:"#000" }}>
          {error ? (
            <div style={{ color: P.red, padding: 20 }}>{error}</div>
          ) : (
            <>
              <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <canvas ref={canvasRef} style={{ display: "none" }} />
              {/* Hardware-style Viewfinder Overlay */}
              <div style={{ position:"absolute", top:"20%", bottom:"20%", left:"15%", right:"15%", border:`3px solid ${P.orange}`, borderRadius:12, pointerEvents:"none", boxShadow:"0 0 0 4000px rgba(0,0,0,0.6)" }}></div>
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
                <div style={{ width:"40%", height:"2px", background:`${P.orange}aa`, opacity:0.5, animation:"scanline 2s infinite linear" }} />
              </div>
              <style>{`@keyframes scanline { 0% { transform: translateY(-100px); } 50% { transform: translateY(100px); opacity:1; } 100% { transform: translateY(-100px); } }`}</style>
            </>
          )}
        </div>
        <div style={{ padding:"20px" }}>
          <Btn full variant="secondary" onClick={onClose}>Cancel Scan</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────────────────────────────────────
function Lightbox({ onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, zIndex:2000,
      background:"rgba(0,0,0,0.93)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:20,
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        maxWidth:"100%", maxHeight:"90vh",
        display:"flex", flexDirection:"column", alignItems:"center", gap:12,
      }}>
        {children}
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)" }}>Tap anywhere to close</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QR DATA-URL HELPER — renders QR to offscreen canvas, returns PNG data URL
// ─────────────────────────────────────────────────────────────────────────────
function getQRDataURL(toolId, px = 200) {
  const canvas = document.createElement("canvas");
  try {
    const matrix = buildQR("DKTP-" + toolId);
    const sz = matrix.length;
    const quiet = 4;
    const total = sz + quiet * 2;
    const mod = Math.max(2, Math.floor(px / total));
    const size = mod * total;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < sz; r++)
      for (let c = 0; c < sz; c++)
        if (matrix[r][c] === 1)
          ctx.fillRect((quiet + c) * mod, (quiet + r) * mod, mod, mod);
    return canvas.toDataURL("image/png");
  } catch(e) { return ""; }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT TOOL LIST — opens print window with photo + details + QR per row
// ─────────────────────────────────────────────────────────────────────────────
function printToolList(filteredTools, title) {
  title = title || "DK Turf & Paving — Tool Register";
  const date = new Date().toLocaleDateString("en-ZA");
  const rows = filteredTools.map(function(t) {
    const qr = getQRDataURL(t.id, 80);
    const statusLabel = {available:"Available",checked_out:"Checked Out",in_repair:"In Repair",retired:"Retired"}[t.status] || t.status;
    const condLabel   = {good:"Good",fair:"Fair",poor:"Poor"}[t.condition] || t.condition;
    const statusColor = {available:"#16a34a",checked_out:"#ea580c",in_repair:"#dc2626",retired:"#6b7280"}[t.status] || "#333";
    const photoCell   = t.photo
      ? '<img src="' + t.photo + '" style="width:48px;height:48px;object-fit:cover;border-radius:4px;"/>'
      : '<div style="width:48px;height:48px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999">No photo</div>';
    return "<tr><td style=\"text-align:center\">" + photoCell + "</td>" +
      "<td><strong>" + t.name + "</strong><br/><small>" + (t.brand||"") + (t.model?" · "+t.model:"") + "</small></td>" +
      "<td>" + (t.category||"") + "</td>" +
      "<td style=\"font-family:monospace;font-size:10px\">" + (t.serial||"—") + "</td>" +
      "<td><span style=\"color:" + statusColor + "\">" + statusLabel + "</span></td>" +
      "<td>" + condLabel + "</td>" +
      "<td style=\"text-align:right\">R " + Number(t.cost||0).toLocaleString("en-ZA") + "</td>" +
      "<td style=\"text-align:center\"><img src=\"" + qr + "\" width=\"56\" height=\"56\"/><br/><small style=\"font-size:8px;font-family:monospace\">DKTP-" + t.id + "</small></td></tr>";
  }).join("");
  const total = filteredTools.reduce(function(s,t){return s+(t.cost||0);},0);
  const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>" + title + "</title>" +
    "<style>body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:20px}" +
    "h1{font-size:16px;color:#ea580c;margin-bottom:2px}.meta{font-size:10px;color:#666;margin-bottom:12px}" +
    "table{width:100%;border-collapse:collapse}" +
    "th{background:#ea580c;color:white;padding:6px 8px;text-align:left;font-size:10px}" +
    "td{padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:middle}" +
    "tr:nth-child(even) td{background:#f9fafb}" +
    ".total{text-align:right;font-weight:bold;padding:8px;font-size:12px;color:#ea580c}" +
    "@media print{body{margin:10mm}}</style></head><body>" +
    "<h1>" + title + "</h1>" +
    "<div class=\"meta\">Generated: " + date + " &nbsp;|&nbsp; " + filteredTools.length + " tools &nbsp;|&nbsp; Total value: R " + Number(total).toLocaleString("en-ZA") + "</div>" +
    "<table><thead><tr><th>Photo</th><th>Tool</th><th>Category</th><th>Serial No.</th><th>Status</th><th>Condition</th><th>Cost</th><th>QR Code</th></tr></thead>" +
    "<tbody>" + rows + "</tbody></table>" +
    "<div class=\"total\">Total asset value: R " + Number(total).toLocaleString("en-ZA") + "</div>" +
    "</body></html>";
  const w = window.open("", "_blank");
  if (!w) { alert("Pop-up blocked — please allow pop-ups for this page and try again."); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(function(){ w.focus(); w.print(); }, 700);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT QR LABEL SHEET — L45UPB: 5 cols × 9 rows, 39.2 × 29.88mm per label
// ─────────────────────────────────────────────────────────────────────────────
function printQRLabels(filteredTools) {
  const cells = filteredTools.map(function(t) {
    const qr   = getQRDataURL(t.id, 180);
    const name = t.name.length > 22 ? t.name.slice(0,20) + "…" : t.name;
    return "<div class=\"label\">" +
      "<img src=\"" + qr + "\" class=\"qrimg\"/>" +
      "<div class=\"toolid\">DKTP-" + t.id + "</div>" +
      "<div class=\"toolname\">" + name + "</div>" +
      "</div>";
  }).join("");
  const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>DK Tool QR Labels</title>" +
    "<style>*{box-sizing:border-box;margin:0;padding:0}body{background:white;font-family:Arial,sans-serif}" +
    ".sheet{width:210mm;padding-top:13.54mm;padding-left:7mm;display:flex;flex-wrap:wrap}" +
    ".label{width:39.2mm;height:29.88mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.8mm;overflow:hidden;padding:1mm}" +
    ".qrimg{width:20mm;height:20mm;display:block}" +
    ".toolid{font-size:5.5pt;font-family:monospace;color:#333;line-height:1}" +
    ".toolname{font-size:5pt;color:#555;text-align:center;line-height:1.2;max-width:37mm;overflow:hidden}" +
    "@media print{@page{size:A4;margin:0}body{margin:0}}</style></head><body>" +
    "<div class=\"sheet\">" + cells + "</div></body></html>";
  const w = window.open("", "_blank");
  if (!w) { alert("Pop-up blocked — please allow pop-ups for this page and try again."); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(function(){ w.focus(); w.print(); }, 700);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT EXCEL — native XLSX generator
// ─────────────────────────────────────────────────────────────────────────────
function exportCSV(filteredTools) {
  const esc = function(v){ return '"' + String(v||"").replace(/"/g,'""') + '"'; };
  const header = ["Tool ID","Name","Category","Brand","Model","Serial No.","Status","Condition","Cost (ZAR)","Purchase Date"];
  const rows = filteredTools.map(function(t) {
    return [
      t.id, t.name, t.category, t.brand||"", t.model||"", t.serial||"",
      {available:"Available",checked_out:"Checked Out",in_repair:"In Repair",retired:"Retired"}[t.status]||t.status,
      {good:"Good",fair:"Fair",poor:"Poor"}[t.condition]||t.condition,
      t.cost||0, t.purchaseDate||""
    ];
  });
  const csv = [header, ...rows].map(function(r){ return r.map(esc).join(","); }).join("\n");
  
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csv], { type: "text/csv;charset=utf-8" });
  
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  a.href = url;
  a.download = "DK-Tool-Register.csv";
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE CATEGORIES MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ManageCategoriesModal({ categories, tools, onSave, onClose }) {
  const [cats,    setCats]    = useState([...categories]);
  const [newCat,  setNewCat]  = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [renames, setRenames] = useState({});
  const [deleted, setDeleted] = useState([]);

  const add = () => {
    const v = newCat.trim();
    if (!v) return;
    if (cats.includes(v)) { alert("Category already exists"); return; }
    setCats(c => [...c, v]);
    setNewCat("");
  };
  const startEdit = i => { setEditIdx(i); setEditVal(cats[i]); };
  const saveEdit  = () => {
    const v = editVal.trim();
    if (!v) return;
    if (cats.includes(v) && cats[editIdx] !== v) { alert("Name already used"); return; }
    const oldName = cats[editIdx];
    if (oldName !== v) {
      setRenames(prev => {
        const map = { ...prev };
        const original = Object.keys(map).find(k => map[k] === oldName) || oldName;
        map[original] = v;
        return map;
      });
    }
    setCats(c => c.map((x,i) => i===editIdx ? v : x));
    setEditIdx(null);
  };
  const remove = i => {
    const cat  = cats[i];
    const used = tools.filter(t=>{
      const origDataCat = Object.keys(renames).find(k=>renames[k]===cat) || cat;
      return t.category===origDataCat;
    }).length;
    if (used > 0 && !window.confirm(used + " tool(s) are in \"" + cat + "\". Remove category anyway?")) return;
    setCats(c => c.filter((_,j) => j!==i));
    setDeleted(prev => [...prev, cat]);
  };

  return (
    <Modal title="Manage Categories" onClose={onClose}>
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:12, color:P.sub, marginBottom:8, fontWeight:500 }}>Add New Category</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={newCat} onChange={e=>setNewCat(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&add()}
            placeholder="e.g. Irrigation" style={{
              flex:1, background:P.elevated, border:"1px solid " + P.border,
              borderRadius:9, padding:"9px 12px", color:P.text, fontSize:13,
            }}/>
          <Btn small onClick={add}>Add</Btn>
        </div>
      </div>
      <SectionLabel>Current Categories ({cats.length})</SectionLabel>
      {cats.map((cat,i) => {
        const used = tools.filter(t=> {
           const origDataCat = Object.keys(renames).find(k=>renames[k]===cat) || cat;
           return t.category===origDataCat;
        }).length;
        return (
          <div key={cat+i} style={{ background:P.elevated, borderRadius:10, padding:"9px 12px", marginBottom:7, display:"flex", alignItems:"center", gap:9 }}>
            {editIdx===i ? (
              <>
                <input autoFocus value={editVal}
                  onChange={e=>setEditVal(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") saveEdit(); if(e.key==="Escape") setEditIdx(null); }}
                  style={{ flex:1, background:P.surface, border:"1px solid "+P.orange, borderRadius:7, padding:"6px 10px", color:P.text, fontSize:13 }}/>
                <Btn small onClick={saveEdit}>Save</Btn>
                <button onClick={()=>setEditIdx(null)} style={{ background:"none", border:"none", cursor:"pointer", color:P.muted }}><X size={14}/></button>
              </>
            ) : (
              <>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:13, color:P.text, fontWeight:500 }}>{cat}</span>
                  <span style={{ fontSize:11, color:P.muted, marginLeft:8 }}>{used} tool{used!==1?"s":""}</span>
                </div>
                <button onClick={()=>startEdit(i)} style={{ background:P.surface, border:"1px solid "+P.border, borderRadius:7, padding:"5px 8px", cursor:"pointer", color:P.sub }}>
                  <Edit2 size={12}/>
                </button>
                <button onClick={()=>remove(i)} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, padding:"5px 8px", cursor:"pointer", color:P.red }}>
                  <X size={12}/>
                </button>
              </>
            )}
          </div>
        );
      })}
      <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:14 }}>
        <Btn small variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn small onClick={()=>onSave({cats, renames, deleted})}>Save Categories</Btn>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI
// ─────────────────────────────────────────────────────────────────────────────
const Badge = ({ label, color, bg }) => (
  <span style={{
    fontSize:11, fontWeight:600, letterSpacing:"0.04em",
    color, background: bg || color+"22", padding:"3px 9px",
    borderRadius:20, whiteSpace:"nowrap", border:`1px solid ${color}40`, display:"inline-block",
  }}>{label}</span>
);

const Btn = ({ children, onClick, variant="primary", small, full, disabled }) => {
  const v = {
    primary:   { background:P.orange,   color:"#000", border:"none" },
    secondary: { background:P.elevated, color:P.text, border:`1px solid ${P.border}` },
    danger:    { background:P.red,      color:"#fff", border:"none" },
    ghost:     { background:"transparent", color:P.sub, border:`1px solid ${P.border}` },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} className="tap" style={{
      ...v, padding:small?"7px 14px":"11px 20px", borderRadius:10,
      fontWeight:600, fontSize:small?13:14, cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.45:1, width:full?"100%":"auto",
      fontFamily:"'DM Sans', sans-serif", transition:"opacity 0.15s",
    }}>{children}</button>
  );
};

const Field = ({ label, value, onChange, placeholder, type="text", required, disabled }) => (
  <div style={{ marginBottom:14 }}>
    {label && <div style={{ fontSize:12, color:P.sub, marginBottom:5, fontWeight:500 }}>{label}{required&&" *"}</div>}
    <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} disabled={disabled} placeholder={placeholder||""} style={{
      width:"100%", background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10,
      padding:"10px 12px", color:disabled?P.muted:P.text, fontSize:14, opacity:disabled?0.6:1, cursor:disabled?"not-allowed":"text"
    }} />
  </div>
);

const Dropdown = ({ label, value, onChange, options, required }) => (
  <div style={{ marginBottom:14 }}>
    {label && <div style={{ fontSize:12, color:P.sub, marginBottom:5, fontWeight:500 }}>{label}{required&&" *"}</div>}
    <select value={value||""} onChange={e=>onChange(e.target.value)} style={{
      width:"100%", background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10,
      padding:"10px 12px", color:value?P.text:P.muted, fontSize:14, appearance:"none",
    }}>
      <option value="">Select…</option>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// Searchable dropdown for tools
function SearchableToolPicker({ label, value, onChange, tools, required }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = tools.find(t => t.id === value);
  const filtered = tools.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()) || (t.serial||"").toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ marginBottom:14, position:"relative" }}>
      {label && <div style={{ fontSize:12, color:P.sub, marginBottom:5, fontWeight:500 }}>{label}{required&&" *"}</div>}
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%", background:P.elevated, border:`1px solid ${open?P.orange:P.border}`,
        borderRadius:10, padding:"10px 12px", color:chosen?P.text:P.muted, fontSize:14,
        display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
      }}>
        <span>{chosen ? chosen.name : "Search or select tool…"}</span>
        {open ? <ChevronUp size={14} color={P.sub}/> : <ChevronDown size={14} color={P.sub}/>}
      </button>
      {open && (
        <div style={{ position:"absolute", zIndex:50, width:"100%", background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10, marginTop:4, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
          <div style={{ padding:"8px 10px", borderBottom:`1px solid ${P.border}`, display:"flex", alignItems:"center", gap:7 }}>
            <Search size={13} color={P.muted}/>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Type to filter…" style={{
              background:"transparent", border:"none", color:P.text, fontSize:13, flex:1,
            }}/>
          </div>
          <div style={{ maxHeight:180, overflowY:"auto" }}>
            {filtered.length === 0
              ? <div style={{ padding:"12px 14px", fontSize:12, color:P.muted }}>No tools found</div>
              : filtered.map(t => (
                  <button key={t.id} onClick={()=>{ onChange(t.id); setOpen(false); setQ(""); }} style={{
                    width:"100%", background:value===t.id?P.orange+"18":"transparent",
                    border:"none", padding:"9px 14px", textAlign:"left", cursor:"pointer",
                    color:value===t.id?P.orange:P.text, fontSize:13, borderBottom:`1px solid ${P.border}44`,
                    display:"flex", justifyContent:"space-between",
                  }}>
                    <span>{t.name}</span>
                    <span style={{ fontSize:11, color:P.muted }}>{t.serial||""}</span>
                  </button>
                ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

const Modal = ({ title, onClose, children }) => (
  <div style={{
    position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", zIndex:1000,
    display:"flex", alignItems:"flex-end", justifyContent:"center",
  }} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} className="fade-in" style={{
      background:P.surface, borderRadius:"20px 20px 0 0",
      width:"100%", maxWidth:480, maxHeight:"91vh", overflow:"hidden",
      display:"flex", flexDirection:"column",
    }}>
      <div style={{ padding:"17px 20px 13px", borderBottom:`1px solid ${P.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <span className="syne" style={{ fontSize:16, fontWeight:700, color:P.text }}>{title}</span>
        <button onClick={onClose} style={{ background:P.elevated, border:"none", color:P.sub, borderRadius:8, padding:"6px 8px", cursor:"pointer" }}><X size={15}/></button>
      </div>
      <div style={{ overflowY:"auto", flex:1, padding:20 }}>{children}</div>
    </div>
  </div>
);

const SectionLabel = ({ children }) => (
  <div style={{ fontSize:11, color:P.sub, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:10 }}>{children}</div>
);

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return setError("Please enter username and password.");
    setLoading(true); setError("");
    
    const authEmail = email.includes("@") ? email : `${email}@dkpaving.app`;
    try {
      await signInWithEmailAndPassword(auth, authEmail, password);
    } catch (err) {
      setError("Failed to sign in. Please check your credentials.");
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div style={{ background:P.bg, minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 20px" }}>
      <div style={{ marginBottom:36, textAlign:"center" }}>
        <div style={{ width:66, height:66, background:P.orange, borderRadius:20, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
          <Package size={32} color="#000" />
        </div>
        <div className="syne" style={{ fontSize:24, fontWeight:800, color:P.text, letterSpacing:"-0.5px" }}>DK TOOL TRACKER</div>
        <div style={{ fontSize:12, color:P.muted, marginTop:4 }}>DK Turf & Paving · Asset Management</div>
      </div>
      <div style={{ width:"100%", maxWidth:380 }}>
        {error && <div style={{ background:P.red+"22", border:`1px solid ${P.red}`, borderRadius:10, padding:"10px 12px", color:P.red, fontSize:13, marginBottom:16 }}>{error}</div>}
        <Field label="Username or Email" value={email} onChange={setEmail} type="text" placeholder="e.g. johndoe" required />
        <Field label="Password" value={password} onChange={setPassword} type="password" placeholder="••••••••" required />
        <Btn full onClick={handleLogin} disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP BAR
// ─────────────────────────────────────────────────────────────────────────────
function TopBar({ user, notifCount, onNotifClick, onLogout }) {
  return (
    <div style={{
      position:"fixed", top:0, left:"50%", transform:"translateX(-50%)",
      width:"100%", maxWidth:480, height:58, background:P.surface,
      borderBottom:`1px solid ${P.border}`, zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px",
    }}>
      <div className="syne" style={{ fontSize:15, fontWeight:800, color:P.text, letterSpacing:"0.04em" }}>
        DK <span style={{ color:P.orange }}>TRACKER</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <button onClick={onNotifClick} style={{ position:"relative", background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10, padding:"7px 9px", cursor:"pointer" }}>
          <Bell size={15} color={notifCount>0?P.orange:P.sub} />
          {notifCount>0 && <span style={{ position:"absolute", top:5, right:5, width:7, height:7, background:P.red, borderRadius:"50%", border:`1.5px solid ${P.surface}` }} />}
        </button>
        <div style={{ width:34, height:34, borderRadius:10, background:ROLE_CFG[user.role].color+"22", border:`1px solid ${ROLE_CFG[user.role].color}44`, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:11, fontWeight:800, color:ROLE_CFG[user.role].color }}>{user.initials}</span>
        </div>
        <button onClick={onLogout} style={{ background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10, padding:"7px 9px", cursor:"pointer" }}>
          <LogOut size={15} color={P.sub} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOTTOM NAV
// ─────────────────────────────────────────────────────────────────────────────
function BottomNav({ active, setActive, alertCount, isAdmin }) {
  const { canSeeReports } = useAuth();
  const tabs = [
    { id:"dashboard",  Icon:Home,        label:"Home"    },
    { id:"tools",      Icon:Package,     label:"Tools"   },
    { id:"movements",  Icon:ArrowUpDown, label:"Move"    },
    { id:"repairs",    Icon:Wrench,      label:"Repairs" },
  ];
  if (canSeeReports) {
    tabs.push({ id:"reports",    Icon:BarChart3,   label:"Reports" });
  }
  if (isAdmin) {
    tabs.push({ id:"team", Icon:Users, label:"Team" });
  }
  return (
    <div style={{
      position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
      width:"100%", maxWidth:480, background:P.surface,
      borderTop:`1px solid ${P.border}`, height:70,
      display:"flex", alignItems:"center", zIndex:200,
    }}>
      {tabs.map(({ id, Icon, label }) => {
        const on = active === id;
        return (
          <button key={id} onClick={()=>setActive(id)} className="tap" style={{
            flex:1, display:"flex", flexDirection:"column", alignItems:"center",
            gap:3, background:"none", border:"none", cursor:"pointer", padding:"6px 0", position:"relative",
          }}>
            {id==="dashboard" && alertCount>0 && (
              <span style={{ position:"absolute", top:5, right:"28%", width:7, height:7, background:P.red, borderRadius:"50%" }} />
            )}
            <Icon size={19} color={on?P.orange:P.muted} strokeWidth={on?2.5:1.8} />
            <span style={{ fontSize:10, fontWeight:on?700:400, color:on?P.orange:P.muted }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — stat cards navigate on tap
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ tools, checkouts, repairs, sites, users, onNavigate }) {
  const { canSeeFinancials } = useAuth();
  const available  = tools.filter(t=>t.status==="available").length;
  const checkedOut = tools.filter(t=>t.status==="checked_out").length;
  const inRepair   = tools.filter(t=>t.status==="in_repair").length;
  const totalValue = tools.reduce((s,t)=>s+(t.cost||0),0);
  const activeOuts = checkouts.filter(c=>!c.returnDate);
  const overdueOuts= activeOuts.filter(c=>isOverdue(c.dueDate));

  const stats = [
    { label:"Available",   value:available,    color:P.green,  Icon:CheckCircle, nav:{ tab:"tools",     filter:"available"   } },
    { label:"Out on Site", value:checkedOut,   color:P.orange, Icon:MapPin,      nav:{ tab:"tools",     filter:"checked_out" } },
    { label:"In Repair",   value:inRepair,     color:P.red,    Icon:Wrench,      nav:{ tab:"repairs",   filter:null          } },
    { label:"Total Tools", value:tools.length, color:P.blue,   Icon:Package,     nav:{ tab:"tools",     filter:null          } },
  ];

  return (
    <div style={{ padding:"18px 16px" }}>
      <div style={{ marginBottom:18 }}>
        <div className="syne" style={{ fontSize:21, fontWeight:800, color:P.text }}>Good morning 👋</div>
        <div style={{ fontSize:13, color:P.sub, marginTop:3 }}>
          {overdueOuts.length > 0
            ? `⚠ ${overdueOuts.length} overdue return${overdueOuts.length>1?"s":""} need attention`
            : "All tools accounted for — looking good"}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        {stats.map(({ label, value, color, Icon, nav }) => (
          <button key={label} onClick={()=>onNavigate(nav)} className="tap" style={{
            background:P.surface, borderRadius:14, padding:"14px 13px",
            border:`1px solid ${P.border}`, cursor:"pointer", textAlign:"left",
            transition:"border-color 0.15s",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div className="syne" style={{ fontSize:26, fontWeight:800, color }}>{value}</div>
                <div style={{ fontSize:12, color:P.sub, marginTop:2 }}>{label}</div>
              </div>
              <div style={{ background:color+"18", borderRadius:9, padding:8 }}>
                <Icon size={15} color={color} />
              </div>
            </div>
            <div style={{ marginTop:7, fontSize:10, color:color, fontWeight:600, letterSpacing:"0.04em" }}>TAP TO VIEW →</div>
          </button>
        ))}
      </div>

      {canSeeFinancials && (
        <div style={{ background:`linear-gradient(135deg,#1a1d27,#252a3a)`, borderRadius:14, padding:"15px 18px", border:`1px solid ${P.border}`, marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, color:P.sub, marginBottom:4, fontWeight:500 }}>Total Asset Value</div>
            <div className="syne" style={{ fontSize:22, fontWeight:800, color:P.text }}>{currency(totalValue)}</div>
          </div>
          <div style={{ background:P.orange+"18", borderRadius:12, padding:11 }}>
            <DollarSign size={20} color={P.orange} />
          </div>
        </div>
      )}

      {overdueOuts.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <SectionLabel>Overdue Returns</SectionLabel>
          {overdueOuts.map(co => {
            const tool    = tools.find(t=>t.id===co.toolId);
            const foreman = users.find(u=>u.id===co.foremanId);
            const site    = sites.find(s=>s.id===co.siteId);
            return (
              <div key={co.id} style={{ background:"rgba(239,68,68,0.07)", border:`1px solid rgba(239,68,68,0.24)`, borderRadius:12, padding:"11px 13px", marginBottom:8, display:"flex", alignItems:"center", gap:11 }}>
                <AlertCircle size={17} color={P.red} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{tool?.name}</div>
                  <div style={{ fontSize:12, color:P.sub }}>{foreman?.name} · {site?.name} · Due {fmt(co.dueDate)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SectionLabel>Currently Out on Site ({activeOuts.length})</SectionLabel>
      {activeOuts.length === 0
        ? <div style={{ textAlign:"center", color:P.muted, fontSize:13, padding:"20px 0" }}>No tools currently out</div>
        : activeOuts.map(co => {
            const tool    = tools.find(t=>t.id===co.toolId);
            const foreman = users.find(u=>u.id===co.foremanId);
            const site    = sites.find(s=>s.id===co.siteId);
            const late    = isOverdue(co.dueDate);
            return (
              <div key={co.id} style={{ background:P.surface, border:`1px solid ${late?P.red+"44":P.border}`, borderRadius:12, padding:"11px 13px", marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{tool?.name}</div>
                    <div style={{ fontSize:12, color:P.sub, marginTop:2 }}>{foreman?.name} · {site?.name}</div>
                  </div>
                  <div style={{ fontSize:11, textAlign:"right", color:late?P.red:P.sub }}>
                    {late?"OVERDUE":"Due"}<br/>
                    <span style={{ fontWeight:700 }}>{fmt(co.dueDate)}</span>
                  </div>
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLS SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function ToolsScreen({ tools, checkouts, repairs, sites, users, onAdd, onEdit, initialStatusFilter, categories, onManageCategories }) {
  const { canAddTool, canEditTool, canSeeFinancials, canManageSystem } = useAuth();
  const [search,       setSearch]       = useState("");
  const [catFilter,    setCatFilter]    = useState("All");
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || "All");
  const [detail,       setDetail]       = useState(null);

  useEffect(() => { if (initialStatusFilter) setStatusFilter(initialStatusFilter); }, [initialStatusFilter]);

  const filtered = tools.filter(t => {
    const q = search.toLowerCase();
    const m = !search || t.name.toLowerCase().includes(q) || (t.serial||"").toLowerCase().includes(q) || (t.brand||"").toLowerCase().includes(q);
    return m && (catFilter==="All"||t.category===catFilter) && (statusFilter==="All"||t.status===statusFilter);
  });

  return (
    <div style={{ padding:"16px 0 8px" }}>
      <div style={{ padding:"0 16px 12px", display:"flex", gap:9 }}>
        <div style={{ flex:1, position:"relative" }}>
          <Search size={14} color={P.muted} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)" }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, serial, brand…" style={{
            width:"100%", background:P.surface, border:`1px solid ${P.border}`, borderRadius:10,
            padding:"9px 12px 9px 32px", color:P.text, fontSize:13,
          }} />
        </div>
        {canAddTool && (
          <button onClick={onAdd} className="tap" style={{ background:P.orange, border:"none", borderRadius:10, padding:"9px 13px", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
            <Plus size={15} color="#000" />
            <span style={{ fontSize:13, fontWeight:700, color:"#000" }}>Add</span>
          </button>
        )}
      </div>

      <div style={{ display:"flex", gap:7, padding:"0 16px 10px", overflowX:"auto" }}>
        {["All",...Object.keys(STATUS_CFG)].map(s => (
          <button key={s} onClick={()=>setStatusFilter(s)} style={{
            padding:"5px 11px", borderRadius:20, border:`1px solid ${statusFilter===s?P.orange:P.border}`,
            background:statusFilter===s?P.orange+"18":"transparent",
            color:statusFilter===s?P.orange:P.sub, fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap",
          }}>{s==="All"?"All":STATUS_CFG[s]?.label}</button>
        ))}
      </div>

      <div style={{ display:"flex", gap:7, padding:"0 16px 12px", overflowX:"auto" }}>
        {["All",...categories].map(c => (
          <button key={c} onClick={()=>setCatFilter(c)} style={{
            padding:"5px 11px", borderRadius:20, border:`1px solid ${catFilter===c?P.blue:P.border}`,
            background:catFilter===c?P.blue+"18":"transparent",
            color:catFilter===c?P.blue:P.muted, fontSize:11, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
          }}>{c}</button>
        ))}
        {canManageSystem && (
          <button onClick={onManageCategories} style={{
            padding:"5px 11px", borderRadius:20, border:`1px solid ${P.border}`,
            background:"transparent", color:P.muted, fontSize:11, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
            display:"flex", alignItems:"center", gap:4,
          }}><Settings size={11}/> Manage</button>
        )}
      </div>

      {/* Export row */}
      <div style={{ display:"flex", gap:7, padding:"0 16px 10px", overflowX:"auto" }}>
        <button onClick={()=>printToolList(filtered)} className="tap" style={{
          background:P.surface, border:`1px solid ${P.border}`, borderRadius:9,
          padding:"6px 11px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, flexShrink:0,
        }}>
          <Printer size={12} color={P.sub}/>
          <span style={{ fontSize:11, color:P.sub, fontWeight:600 }}>Print List ({filtered.length})</span>
        </button>
        <button onClick={()=>printQRLabels(filtered)} className="tap" style={{
          background:P.surface, border:`1px solid ${P.border}`, borderRadius:9,
          padding:"6px 11px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, flexShrink:0,
        }}>
          <Tag size={12} color={P.sub}/>
          <span style={{ fontSize:11, color:P.sub, fontWeight:600 }}>Print QR Labels ({filtered.length})</span>
        </button>
        <button onClick={()=>exportCSV(filtered)} className="tap" style={{
          background:P.surface, border:`1px solid ${P.border}`, borderRadius:9,
          padding:"6px 11px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, flexShrink:0,
        }}>
          <Download size={12} color={P.sub}/>
          <span style={{ fontSize:11, color:P.sub, fontWeight:600 }}>Export CSV</span>
        </button>
      </div>

      <div style={{ padding:"0 16px 4px", fontSize:11, color:P.muted }}>{filtered.length} tool{filtered.length!==1?"s":""}</div>

      <div style={{ padding:"4px 16px" }}>
        {filtered.map(t => {
          const co      = checkouts.find(c=>c.toolId===t.id&&!c.returnDate);
          const foreman = co ? users.find(u=>u.id===co.foremanId) : null;
          const site    = co ? sites.find(s=>s.id===co.siteId) : null;
          return (
            <button key={t.id} onClick={()=>setDetail(t)} className="tap" style={{
              width:"100%", background:P.surface, border:`1px solid ${P.border}`, borderRadius:13,
              padding:13, marginBottom:8, textAlign:"left", cursor:"pointer", display:"block",
            }}>
              <div style={{ display:"flex", gap:11, alignItems:"flex-start" }}>
                {/* Tool photo thumbnail */}
                <div style={{ width:46, height:46, borderRadius:10, background:P.elevated, border:`1px solid ${P.border}`, flexShrink:0, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {t.photo
                    ? <img src={t.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                    : <Package size={18} color={P.muted}/>
                  }
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:P.text, marginBottom:3 }}>{t.name}</div>
                  <div style={{ fontSize:12, color:P.sub }}>{t.brand}{t.model?` · ${t.model}`:""}</div>
                  {t.serial && <div style={{ fontSize:10, color:P.muted, marginTop:2, fontFamily:"monospace" }}>S/N: {t.serial}</div>}
                  {co && site && <div style={{ fontSize:11, color:P.orange, marginTop:4 }}>📍 {foreman?.name} → {site.name}</div>}
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5, flexShrink:0 }}>
                  <Badge label={COND_CFG[t.condition].label} color={COND_CFG[t.condition].color} />
                  {canSeeFinancials && <div style={{ fontSize:11, color:P.muted }}>{currency(t.cost)}</div>}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length===0 && <div style={{ textAlign:"center", padding:"30px 0", color:P.muted, fontSize:13 }}>No tools found</div>}
      </div>

      {detail && (
        <ToolDetailModal
          tool={detail} checkouts={checkouts} repairs={repairs} sites={sites} users={users} canEdit={canEditTool}
          onClose={()=>setDetail(null)} onEdit={()=>{ onEdit(detail); setDetail(null); }}
        />
      )}
    </div>
  );
}

function ToolDetailModal({ tool, checkouts, repairs, sites, users, canEdit, onClose, onEdit }) {
  const { canSeeFinancials } = useAuth();
  const co     = checkouts.find(c=>c.toolId===tool.id&&!c.returnDate);
  const repair = repairs.find(r=>r.toolId===tool.id&&r.status!=="complete");
  const foreman= co ? users.find(u=>u.id===co.foremanId) : null;
  const site   = co ? sites.find(s=>s.id===co.siteId) : null;
  const [lightbox, setLightbox] = useState(null); // "photo" | "qr"

  return (
    <>
    <Modal title={tool.name} onClose={onClose}>
      {/* Photo + QR — tap to expand */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        <button onClick={()=>tool.photo&&setLightbox("photo")} style={{
          background:P.elevated, borderRadius:12, padding:10,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:130,
          border:`1px solid ${P.border}`, cursor:tool.photo?"zoom-in":"default",
          position:"relative",
        }}>
          {tool.photo
            ? <>
                <img src={tool.photo} alt={tool.name} style={{ width:"100%", borderRadius:8, objectFit:"cover", maxHeight:130 }}/>
                <div style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.55)", borderRadius:5, padding:"2px 5px", fontSize:9, color:"#fff" }}>TAP TO EXPAND</div>
              </>
            : <><Package size={32} color={P.muted}/><div style={{ fontSize:10, color:P.muted, marginTop:8, textAlign:"center" }}>No photo yet<br/>Edit to add</div></>
          }
        </button>
        <button onClick={()=>setLightbox("qr")} style={{
          background:P.elevated, borderRadius:12, padding:10,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          border:`1px solid ${P.border}`, cursor:"zoom-in", position:"relative",
        }}>
          <QRCodeDisplay toolId={tool.id} size={110} />
          <div style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.55)", borderRadius:5, padding:"2px 5px", fontSize:9, color:"#fff" }}>TAP TO EXPAND</div>
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9, marginBottom:14 }}>
        {[
          ["Status",     <Badge {...STATUS_CFG[tool.status]} />],
          ["Condition",  <Badge label={COND_CFG[tool.condition].label} color={COND_CFG[tool.condition].color} />],
          ["Category",   tool.category],
          ["Brand",      tool.brand||"—"],
          ["Model",      tool.model||"—"],
          ["Serial No.", tool.serial||"—"],
          ...(canSeeFinancials ? [
            ["Cost",       currency(tool.cost)],
            ["Purchased",  fmt(tool.purchaseDate)]
          ] : [])
        ].map(([lbl, val]) => (
          <div key={lbl} style={{ background:P.elevated, borderRadius:10, padding:"9px 11px" }}>
            <div style={{ fontSize:10, color:P.muted, marginBottom:4 }}>{lbl}</div>
            {typeof val==="string"
              ? <div style={{ fontSize:12, fontWeight:600, color:P.text, fontFamily:lbl==="Serial No."?"monospace":"inherit" }}>{val}</div>
              : val}
          </div>
        ))}
      </div>

      {co && (
        <div style={{ background:"rgba(249,115,22,0.07)", border:`1px solid rgba(249,115,22,0.25)`, borderRadius:12, padding:"11px 13px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:P.orange, marginBottom:5 }}>CURRENTLY OUT ON SITE</div>
          <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{foreman?.name} → {site?.name}</div>
          <div style={{ fontSize:12, color:P.sub, marginTop:2 }}>Out {fmt(co.checkoutDate)} · Due {fmt(co.dueDate)}</div>
          {isOverdue(co.dueDate) && <div style={{ fontSize:12, color:P.red, fontWeight:700, marginTop:5 }}>⚠ OVERDUE — Follow up with {foreman?.name}</div>}
        </div>
      )}

      {repair && (
        <div style={{ background:"rgba(239,68,68,0.07)", border:`1px solid rgba(239,68,68,0.25)`, borderRadius:12, padding:"11px 13px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:P.red, marginBottom:5 }}>REPAIR IN PROGRESS</div>
          <div style={{ fontSize:13, color:P.text }}>{repair.issue}</div>
          <div style={{ fontSize:12, color:P.sub, marginTop:2 }}>Assigned: {repair.assignedTo} · Est. back {fmt(repair.estimatedReturn)}</div>
          <div style={{ fontSize:12, color:P.muted, marginTop:1 }}>Est. cost: {currency(repair.estimatedCost)}</div>
        </div>
      )}

      {canEdit && <Btn full onClick={onEdit} variant="secondary">✏️  Edit Tool Details</Btn>}
    </Modal>

    {lightbox === "photo" && tool.photo && (
      <Lightbox onClose={()=>setLightbox(null)}>
        <img src={tool.photo} alt={tool.name} style={{ maxWidth:"90vw", maxHeight:"80vh", borderRadius:12, objectFit:"contain" }}/>
        <div style={{ fontSize:13, color:"rgba(255,255,255,0.7)", fontWeight:600 }}>{tool.name}</div>
      </Lightbox>
    )}

    {lightbox === "qr" && (
      <Lightbox onClose={()=>setLightbox(null)}>
        <div style={{ background:"#fff", borderRadius:16, padding:20 }}>
          <QRCodeDisplay toolId={tool.id} size={260} />
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", textAlign:"center" }}>
          Scan to verify · Point camera at this QR code
        </div>
      </Lightbox>
    )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL FORM — with image capture
// ─────────────────────────────────────────────────────────────────────────────
function ToolFormModal({ tool, onSave, onDelete, onClose, categories }) {
  const { canDeleteTool } = useAuth();
  const isNew     = !tool;
  const fileRef   = useRef(null);
  const [form, setForm] = useState(tool ? {...tool} : {
    name:"", category:categories[0]||"Power Tools", brand:"", model:"", serial:"",
    cost:"", purchaseDate:new Date().toISOString().split("T")[0], condition:"good", photo:null,
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set("photo", ev.target.result);
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!form.name.trim()) { alert("Tool name is required"); return; }
    onSave({ ...form, cost:Number(form.cost)||0 });
  };

  return (
    <Modal title={isNew?"Add New Tool":"Edit Tool"} onClose={onClose}>
      {/* Photo capture */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:12, color:P.sub, marginBottom:7, fontWeight:500 }}>Tool Photo</div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <div style={{ width:64, height:64, borderRadius:10, background:P.elevated, border:`1px solid ${P.border}`, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            {form.photo
              ? <img src={form.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
              : <Package size={24} color={P.muted}/>
            }
          </div>
          <div style={{ flex:1 }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display:"none" }} />
            <Btn small variant="secondary" onClick={()=>fileRef.current?.click()}>
              <Camera size={13} style={{ marginRight:5, display:"inline" }}/>
              {form.photo ? "Retake / Change" : "Take Photo or Choose"}
            </Btn>
            <div style={{ fontSize:10, color:P.muted, marginTop:5 }}>Opens camera or gallery on your phone</div>
          </div>
        </div>
      </div>

      <Field label="Tool Name" value={form.name} onChange={v=>set("name",v)} required placeholder="e.g. Bosch Rotary Hammer" />
      <Dropdown label="Category" value={form.category} onChange={v=>set("category",v)} options={categories.map(c=>({value:c,label:c}))} required />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Brand" value={form.brand} onChange={v=>set("brand",v)} placeholder="e.g. Bosch" />
        <Field label="Model" value={form.model} onChange={v=>set("model",v)} placeholder="e.g. GBH 2-26" />
      </div>
      <Field label="Serial Number" value={form.serial} onChange={v=>set("serial",v)} placeholder="Leave blank if none" />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Cost (ZAR)" value={form.cost} onChange={v=>set("cost",v)} type="number" placeholder="0.00" />
        <Field label="Purchase Date" value={form.purchaseDate} onChange={v=>set("purchaseDate",v)} type="date" />
      </div>
      <Dropdown label="Condition" value={form.condition} onChange={v=>set("condition",v)}
        options={Object.entries(COND_CFG).map(([k,v])=>({value:k,label:v.label}))} />

      {!isNew && (
        <div style={{ background:P.elevated, borderRadius:10, padding:"10px 12px", marginBottom:14 }}>
          <div style={{ fontSize:12, color:P.orange, fontWeight:600, marginBottom:4 }}>QR Code Preview</div>
          <QRCodeDisplay toolId={tool.id} size={90} />
        </div>
      )}

      <div style={{ display:"flex", gap:9, marginTop:4, justifyContent:"flex-end" }}>
        {!isNew && canDeleteTool && <Btn variant="danger" small onClick={()=>{ if(window.confirm("Delete this tool?")) onDelete(tool.id); }}>Delete</Btn>}
        <Btn variant="secondary" small onClick={onClose}>Cancel</Btn>
        <Btn small onClick={save}>{isNew?"Add Tool":"Save Changes"}</Btn>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE SITES MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ManageSitesModal({ sites, onSave, onDelete, onClose }) {
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddr, setNewSiteAddr] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editAddr, setEditAddr] = useState("");

  const handleAdd = () => {
    if (!newSiteName.trim()) return;
    onSave({ name: newSiteName.trim(), address: newSiteAddr.trim() });
    setNewSiteName("");
    setNewSiteAddr("");
  };

  const handleSaveEdit = (id) => {
    if (!editName.trim()) return;
    onSave({ id, name: editName.trim(), address: editAddr.trim() });
    setEditId(null);
  };

  return (
    <Modal title="Manage Sites" onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ background:P.surface, padding:14, borderRadius:12, border:`1px solid ${P.border}` }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Add New Site</div>
          <Field label="Site Name" value={newSiteName} onChange={setNewSiteName} placeholder="e.g. Constantia Residence" />
          <Field label="Address (Optional)" value={newSiteAddr} onChange={setNewSiteAddr} placeholder="e.g. 12 Main Rd" />
          <Btn small onClick={handleAdd} disabled={!newSiteName.trim()}>Add Site</Btn>
        </div>

        <div>
          {sites.map(s => (
            <div key={s.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${P.border}` }}>
              {editId === s.id ? (
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8 }}>
                  <input className="input-field" value={editName} onChange={e=>setEditName(e.target.value)} />
                  <input className="input-field" value={editAddr} onChange={e=>setEditAddr(e.target.value)} placeholder="Address" />
                  <div style={{ display:"flex", gap:8 }}>
                    <Btn small variant="secondary" onClick={()=>setEditId(null)}>Cancel</Btn>
                    <Btn small onClick={()=>handleSaveEdit(s.id)}>Save</Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:P.text }}>{s.name}</div>
                    {s.address && <div style={{ fontSize:12, color:P.muted }}>{s.address}</div>}
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="tap" onClick={()=>{setEditId(s.id); setEditName(s.name); setEditAddr(s.address||"");}} style={{ background:P.border, width:28, height:28, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}><Edit2 size={14} color={P.text}/></button>
                    <button className="tap" onClick={()=>onDelete(s.id)} style={{ background:P.red+"22", width:28, height:28, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}><X size={14} color={P.red}/></button>
                  </div>
                </>
              )}
            </div>
          ))}
          {sites.length === 0 && <div style={{ fontSize:13, color:P.muted, textAlign:"center", padding:20 }}>No sites added yet.</div>}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVEMENTS — QR scan + manual with search
// ─────────────────────────────────────────────────────────────────────────────
function MovementsScreen({ tools, checkouts, onCheckout, onCheckin, sites, users, onManageSites }) {
  const { canCheckOut, canCheckIn, canManageSystem } = useAuth();
  const [mode,       setMode]       = useState(canCheckOut ? "out" : "in");       // out | in
  const [inputMode,  setInputMode]  = useState("scan");      // scan | manual
  const [selected,   setSelected]   = useState([]);
  const [step,       setStep]       = useState(1);
  const [assignment, setAssignment] = useState({ foremanId:"", siteId:"", dueDate:"", notes:"" });
  const [flash,      setFlash]      = useState(null);
  const [scanning,   setScanning]   = useState(false);
  const [scanSearch, setScanSearch] = useState("");
  const [scanError,  setScanError]  = useState(null);

  const setA = (k,v) => setAssignment(a=>({...a,[k]:v}));
  const toggleOut = id => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  const toggleIn  = id => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);

  const switchMode = m => {
    setMode(m); setSelected([]); setStep(1);
    setAssignment({ foremanId:"", siteId:"", dueDate:"", notes:"" });
    setScanSearch(""); setScanError(null);
  };

  const availableTools  = tools.filter(t=>t.status==="available");
  const activeCheckouts = checkouts.filter(c=>!c.returnDate).map(c=>({
    ...c,
    tool:    tools.find(t=>t.id===c.toolId),
    site:    sites.find(s=>s.id===c.siteId),
    foreman: users.find(u=>u.id===c.foremanId),
  }));

  const handleScanResult = (toolId) => {
    setScanning(false);
    if (mode === "out") {
      const tool = tools.find(t=>t.id===toolId);
      if (!tool) { setScanError(`Tool ${toolId} not found in register`); return; }
      if (tool.status !== "available") { setScanError(`${tool.name} is not available (status: ${STATUS_CFG[tool.status]?.label})`); return; }
      if (!selected.includes(toolId)) setSelected(s=>[...s, toolId]);
      setScanError(null);
    } else {
      const co = checkouts.find(c=>c.toolId===toolId&&!c.returnDate);
      if (!co) { setScanError(`Tool ${toolId} not currently checked out`); return; }
      if (!selected.includes(co.id)) setSelected(s=>[...s, co.id]);
      setScanError(null);
    }
  };

  const doCheckout = async () => {
    if (!assignment.foremanId || !assignment.siteId || !assignment.dueDate) { alert("Fill in all required fields"); return; }
    await onCheckout(selected, assignment);
    switchMode("out");
    setFlash("checkout"); setTimeout(()=>setFlash(null), 3500);
  };

  const doCheckin = async () => {
    await onCheckin(selected);
    setSelected([]);
    setFlash("checkin"); setTimeout(()=>setFlash(null), 3500);
  };

  const filteredAvailable = availableTools.filter(t =>
    !scanSearch || t.name.toLowerCase().includes(scanSearch.toLowerCase()) || (t.serial||"").toLowerCase().includes(scanSearch.toLowerCase())
  );
  const filteredOut = activeCheckouts.filter(co =>
    !scanSearch || co.tool?.name.toLowerCase().includes(scanSearch.toLowerCase()) || co.foreman?.name.toLowerCase().includes(scanSearch.toLowerCase())
  );

  if (!canCheckOut && !canCheckIn) return (
    <div style={{ padding:32, textAlign:"center" }}>
      <Shield size={38} color={P.muted} style={{ marginBottom:12 }} />
      <div style={{ fontSize:14, color:P.sub }}>Your role doesn't have permission to manage movements.</div>
    </div>
  );

  const availableModes = [];
  if (canCheckOut) availableModes.push(["out","Check Out →"]);
  if (canCheckIn) availableModes.push(["in","← Check In"]);

  return (
    <div style={{ padding:16 }}>
      {/* Mode toggle */}
      {availableModes.length > 1 && (
        <div style={{ display:"flex", background:P.surface, borderRadius:12, padding:4, marginBottom:14, border:`1px solid ${P.border}` }}>
          {availableModes.map(([m,lbl])=>(
            <button key={m} onClick={()=>switchMode(m)} className="tap" style={{
              flex:1, padding:"10px", borderRadius:9, border:"none",
              background:mode===m?P.orange:"transparent",
              color:mode===m?"#000":P.sub, fontWeight:700, fontSize:13, cursor:"pointer",
            }}>{lbl}</button>
          ))}
        </div>
      )}

      {/* Input mode toggle */}
      {step===1 && (
        <div style={{ display:"flex", background:P.surface, borderRadius:10, padding:3, marginBottom:14, border:`1px solid ${P.border}` }}>
          {[["scan","Scan QR","QrCode"],["manual","Manual List","List"]].map(([m,lbl,icon])=>(
            <button key={m} onClick={()=>{ setInputMode(m); setScanError(null); setScanSearch(""); }} className="tap" style={{
              flex:1, padding:"8px", borderRadius:8, border:"none",
              background:inputMode===m?P.elevated:"transparent",
              color:inputMode===m?P.text:P.muted, fontSize:12, fontWeight:600, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}>
              {m==="scan" ? <QrCode size={13}/> : <List size={13}/>} {lbl}
            </button>
          ))}
        </div>
      )}

      {/* Flash */}
      {flash && (
        <div style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:11, padding:"11px 15px", marginBottom:14, display:"flex", alignItems:"center", gap:9 }}>
          <CheckCircle size={17} color={P.green} />
          <span style={{ fontSize:13, color:P.green, fontWeight:600 }}>
            {flash==="checkout" ? "Tools successfully checked out!" : "Tools successfully checked back in!"}
          </span>
        </div>
      )}

      {scanError && (
        <div style={{ background:"rgba(239,68,68,0.08)", border:`1px solid rgba(239,68,68,0.3)`, borderRadius:10, padding:"9px 13px", marginBottom:12, display:"flex", gap:9, alignItems:"center" }}>
          <AlertCircle size={15} color={P.red}/>
          <span style={{ fontSize:12, color:P.red }}>{scanError}</span>
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && step===1 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {selected.map(id => {
            const t = mode==="out"
              ? tools.find(x=>x.id===id)
              : (() => { const co=checkouts.find(c=>c.id===id); return tools.find(t=>t.id===co?.toolId); })();
            return (
              <div key={id} style={{ background:P.orange+"18", border:`1px solid ${P.orange}44`, borderRadius:20, padding:"4px 10px", fontSize:12, color:P.orange, display:"flex", alignItems:"center", gap:6 }}>
                {t?.name}
                <button onClick={()=>setSelected(s=>s.filter(x=>x!==id))} style={{ background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  <X size={11} color={P.orange}/>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── STEP 1 ── */}
      {step===1 && (
        <>
          {inputMode==="scan" ? (
            <div style={{ textAlign:"center" }}>
              <button onClick={()=>setScanning(true)} className="tap" style={{
                background:P.orange, border:"none", borderRadius:14, padding:"16px 24px",
                cursor:"pointer", display:"inline-flex", flexDirection:"column", alignItems:"center", gap:8, width:"100%",
              }}>
                <QrCode size={32} color="#000"/>
                <span style={{ fontSize:14, fontWeight:700, color:"#000" }}>Tap to Scan QR Code</span>
                <span style={{ fontSize:11, color:"#00000088" }}>Point camera at sticker on tool</span>
              </button>
              {selected.length>0 && (
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:12, color:P.sub, marginBottom:8 }}>{selected.length} tool{selected.length>1?"s":""} scanned — scan more or continue</div>
                  <Btn full onClick={()=>mode==="out"?setStep(2):doCheckin()}>
                    {mode==="out"?`Assign ${selected.length} Tool${selected.length>1?"s":""} →`:`Check In ${selected.length} Tool${selected.length>1?"s":""}`}
                  </Btn>
                </div>
              )}
            </div>
          ) : (
            // Manual list
            <>
              <div style={{ position:"relative", marginBottom:10 }}>
                <Search size={14} color={P.muted} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)" }}/>
                <input value={scanSearch} onChange={e=>setScanSearch(e.target.value)} placeholder={mode==="out"?"Search available tools…":"Search checked-out tools…"} style={{
                  width:"100%", background:P.surface, border:`1px solid ${P.border}`, borderRadius:10,
                  padding:"9px 12px 9px 32px", color:P.text, fontSize:13,
                }}/>
              </div>
              {mode==="out" ? (
                filteredAvailable.length===0
                  ? <div style={{ textAlign:"center", color:P.muted, padding:"20px 0", fontSize:13 }}>No available tools</div>
                  : filteredAvailable.map(t => {
                      const sel = selected.includes(t.id);
                      return (
                        <button key={t.id} onClick={()=>toggleOut(t.id)} className="tap" style={{
                          width:"100%", background:sel?"rgba(249,115,22,0.09)":P.surface,
                          border:`1px solid ${sel?P.orange:P.border}`, borderRadius:12,
                          padding:"11px 13px", marginBottom:7, textAlign:"left", cursor:"pointer",
                          display:"flex", alignItems:"center", gap:11,
                        }}>
                          <div style={{ width:21, height:21, borderRadius:6, border:`2px solid ${sel?P.orange:P.border}`, background:sel?P.orange:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {sel && <Check size={12} color="#000" strokeWidth={3}/>}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{t.name}</div>
                            <div style={{ fontSize:11, color:P.sub }}>{t.category} · {t.brand}</div>
                          </div>
                          <Badge label={COND_CFG[t.condition].label} color={COND_CFG[t.condition].color}/>
                        </button>
                      );
                    })
              ) : (
                filteredOut.length===0
                  ? <div style={{ textAlign:"center", color:P.muted, padding:"20px 0", fontSize:13 }}>No tools out</div>
                  : filteredOut.map(co => {
                      const sel  = selected.includes(co.id);
                      const late = isOverdue(co.dueDate);
                      return (
                        <button key={co.id} onClick={()=>toggleIn(co.id)} className="tap" style={{
                          width:"100%", background:sel?"rgba(34,197,94,0.09)":P.surface,
                          border:`1px solid ${sel?P.green:late?P.red+"44":P.border}`,
                          borderRadius:12, padding:"11px 13px", marginBottom:7, textAlign:"left", cursor:"pointer",
                          display:"flex", alignItems:"center", gap:11,
                        }}>
                          <div style={{ width:21, height:21, borderRadius:6, border:`2px solid ${sel?P.green:P.border}`, background:sel?P.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {sel && <Check size={12} color="#000" strokeWidth={3}/>}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{co.tool?.name}</div>
                            <div style={{ fontSize:11, color:P.sub }}>{co.foreman?.name} · {co.site?.name}</div>
                            <div style={{ fontSize:11, color:late?P.red:P.muted }}>{late?"⚠ OVERDUE":"Due"}: {fmt(co.dueDate)}</div>
                          </div>
                        </button>
                      );
                    })
              )}
              {selected.length>0 && (
                <div style={{ position:"sticky", bottom:0, paddingTop:10, background:P.bg }}>
                  <Btn full onClick={()=>mode==="out"?setStep(2):doCheckin()}>
                    {mode==="out"?`Assign ${selected.length} Tool${selected.length>1?"s":""} →`:`Check In ${selected.length} Tool${selected.length>1?"s":""}`}
                  </Btn>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── STEP 2 — Assignment ── */}
      {step===2 && mode==="out" && (
        <>
          <button onClick={()=>setStep(1)} style={{ background:P.elevated, border:`1px solid ${P.border}`, borderRadius:9, padding:"7px 12px", cursor:"pointer", color:P.sub, fontSize:13, marginBottom:16 }}>← Back</button>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
            {selected.map(id => {
              const t = tools.find(x=>x.id===id);
              return (
                <div key={id} style={{ background:P.orange+"18", border:`1px solid ${P.orange}44`, borderRadius:20, padding:"4px 10px", fontSize:12, color:P.orange }}>
                  {t?.name}
                </div>
              );
            })}
          </div>
          <Dropdown label="Assign to Foreman *" value={assignment.foremanId} onChange={v=>setA("foremanId",v)}
            options={users.filter(u=>u.role==="foreman").map(u=>({value:u.id,label:u.name}))} required />
          <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
            <div style={{ flex:1 }}>
              <Dropdown label="Site *" value={assignment.siteId} onChange={v=>setA("siteId",v)}
                options={sites.map(s=>({value:s.id,label:s.name}))} required />
            </div>
            {canManageSystem && (
              <button className="tap" onClick={onManageSites} style={{ 
                background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10, 
                padding:"10px 14px", height:41, marginBottom:14, cursor:"pointer",
                display:"flex", alignItems:"center", gap:6, color:P.text, fontSize:13, fontWeight:600
              }}>
                <Settings size={14}/> Manage
              </button>
            )}
          </div>
          <Field label="Due Back Date *" value={assignment.dueDate} onChange={v=>setA("dueDate",v)} type="date" required />
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, color:P.sub, marginBottom:5, fontWeight:500 }}>Notes</div>
            <textarea value={assignment.notes} onChange={e=>setA("notes",e.target.value)} placeholder="Optional…" rows={3} style={{
              width:"100%", background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10,
              padding:"10px 12px", color:P.text, fontSize:13, resize:"none",
            }}/>
          </div>
          <Btn full onClick={doCheckout}>Confirm Check Out →</Btn>
        </>
      )}

      {scanning && <QRScanner onScan={handleScanResult} onClose={()=>setScanning(false)} title={mode==="out"?"Scan Tool to Check Out":"Scan Tool to Check In"} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPAIRS — QR scan, searchable picker, editable
// ─────────────────────────────────────────────────────────────────────────────
function RepairsScreen({ tools, repairs, onAddRepair, onUpdateRepair, onSetStatus }) {
  const { canLogRepair, canUpdateRepair } = useAuth();
  const [showAdd,    setShowAdd]    = useState(false);
  const [filter,     setFilter]     = useState("active");
  const [editRepair, setEditRepair] = useState(null);
  const [scanning,   setScanning]   = useState(false);
  const [form, setForm] = useState({ toolId:"", issue:"", assignedTo:"", estimatedReturn:"", estimatedCost:"" });
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const displayed = filter==="active" ? repairs.filter(r=>r.status!=="complete") : repairs;

  const handleScan = (toolId) => {
    setScanning(false);
    const tool = tools.find(t=>t.id===toolId);
    if (tool) setForm(f=>({...f, toolId}));
  };

  const addRepair = async () => {
    if (!form.toolId || !form.issue.trim()) { alert("Tool and issue are required"); return; }
    await onAddRepair(form);
    setShowAdd(false);
    setForm({ toolId:"", issue:"", assignedTo:"", estimatedReturn:"", estimatedCost:"" });
  };

  const updateRepair = async (updated) => {
    await onUpdateRepair(updated);
    setEditRepair(null);
  };

  const setStatus = async (id, status) => {
    await onSetStatus(id, status);
  };

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div className="syne" style={{ fontSize:17, fontWeight:700, color:P.text }}>Repairs & Maintenance</div>
        {canLogRepair && <Btn small onClick={()=>setShowAdd(true)}>+ Log Repair</Btn>}
      </div>

      <div style={{ display:"flex", gap:7, marginBottom:14 }}>
        {[["active","Active"],["all","All History"]].map(([f,l])=>(
          <button key={f} onClick={()=>setFilter(f)} style={{
            padding:"5px 12px", borderRadius:20, border:`1px solid ${filter===f?P.orange:P.border}`,
            background:filter===f?P.orange+"18":"transparent", color:filter===f?P.orange:P.muted,
            fontSize:11, fontWeight:600, cursor:"pointer",
          }}>{l}</button>
        ))}
      </div>

      {displayed.map(r => {
        const tool  = tools.find(t=>t.id===r.toolId);
        const late  = r.status!=="complete" && isOverdue(r.estimatedReturn);
        const scfg  = REPAIR_STATUS_CFG[r.status];
        return (
          <div key={r.id} style={{ background:P.surface, border:`1px solid ${late?P.red+"44":P.border}`, borderRadius:13, padding:13, marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{tool?.name||"Unknown Tool"}</div>
                <div style={{ fontSize:12, color:P.sub, marginTop:2, lineHeight:1.4 }}>{r.issue}</div>
                {r.notes && <div style={{ fontSize:11, color:P.muted, marginTop:3, fontStyle:"italic" }}>{r.notes}</div>}
              </div>
              <Badge label={scfg.label} color={scfg.color}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginBottom:10 }}>
              <div style={{ fontSize:11, color:P.muted }}>Assigned: <span style={{ color:P.sub, fontWeight:600 }}>{r.assignedTo||"—"}</span></div>
              <div style={{ fontSize:11, color:P.muted }}>Est. return: <span style={{ color:late?P.red:P.sub, fontWeight:600 }}>{r.estimatedReturn?fmt(r.estimatedReturn):"—"}{late?" ⚠":""}</span></div>
              <div style={{ fontSize:11, color:P.muted }}>Est. cost: <span style={{ color:P.sub, fontWeight:600 }}>{currency(r.estimatedCost)}</span></div>
              {r.actualCost!=null && <div style={{ fontSize:11, color:P.muted }}>Actual cost: <span style={{ color:P.red, fontWeight:700 }}>{currency(r.actualCost)}</span></div>}
            </div>
            {canUpdateRepair && (
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                <Btn small variant="secondary" onClick={()=>setEditRepair(r)}>
                  <Edit2 size={11} style={{ marginRight:4, display:"inline" }}/>Edit
                </Btn>
                {r.status==="pending"     && <Btn small variant="secondary" onClick={()=>setStatus(r.id,"in_progress")}>Mark In Progress</Btn>}
                {r.status!=="complete"    && <Btn small variant="secondary" onClick={()=>setStatus(r.id,"complete")}>Mark Complete ✓</Btn>}
              </div>
            )}
          </div>
        );
      })}
      {displayed.length===0 && (
        <div style={{ textAlign:"center", padding:"28px 0", color:P.muted, fontSize:13 }}>
          {filter==="active" ? "No active repairs ✓" : "No repair history"}
        </div>
      )}

      {/* Add Repair Modal */}
      {showAdd && (
        <Modal title="Log Repair" onClose={()=>setShowAdd(false)}>
          <div style={{ display:"flex", gap:9, marginBottom:14 }}>
            <button onClick={()=>setScanning(true)} className="tap" style={{
              flex:1, background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10,
              padding:"10px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:5,
            }}>
              <QrCode size={18} color={P.orange}/>
              <span style={{ fontSize:11, color:P.sub, fontWeight:600 }}>Scan QR</span>
            </button>
            <div style={{ width:1, background:P.border }}/>
            <div style={{ flex:3 }}>
              <SearchableToolPicker label="Or select tool *" value={form.toolId} onChange={v=>setF("toolId",v)} tools={tools.filter(t=>t.status!=="retired")} required/>
            </div>
          </div>
          {form.toolId && (
            <div style={{ background:P.orange+"12", borderRadius:9, padding:"7px 12px", marginBottom:12, fontSize:12, color:P.orange }}>
              ✓ {tools.find(t=>t.id===form.toolId)?.name}
            </div>
          )}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, color:P.sub, marginBottom:5, fontWeight:500 }}>Issue Description *</div>
            <textarea value={form.issue} onChange={e=>setF("issue",e.target.value)} placeholder="Describe the fault or maintenance required…" rows={3} style={{
              width:"100%", background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10,
              padding:"10px 12px", color:P.text, fontSize:13, resize:"none",
            }}/>
          </div>
          <Field label="Assigned To" value={form.assignedTo} onChange={v=>setF("assignedTo",v)} placeholder="e.g. Authorized Service Centre" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Field label="Est. Return Date" value={form.estimatedReturn} onChange={v=>setF("estimatedReturn",v)} type="date" />
            <Field label="Est. Cost (ZAR)" value={form.estimatedCost} onChange={v=>setF("estimatedCost",v)} type="number" placeholder="0"/>
          </div>
          <div style={{ display:"flex", gap:9, justifyContent:"flex-end" }}>
            <Btn small variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn small onClick={addRepair}>Log Repair</Btn>
          </div>
        </Modal>
      )}

      {/* Edit Repair Modal */}
      {editRepair && (
        <RepairEditModal repair={editRepair} tools={tools} onSave={updateRepair} onClose={()=>setEditRepair(null)}/>
      )}

      {scanning && <QRScanner onScan={handleScan} onClose={()=>setScanning(false)} title="Scan Tool for Repair"/>}
    </div>
  );
}

function RepairEditModal({ repair, tools, onSave, onClose }) {
  const [form, setForm] = useState({ ...repair });
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));
  const tool = tools.find(t=>t.id===repair.toolId);

  return (
    <Modal title={`Edit Repair — ${tool?.name}`} onClose={onClose}>
      <div style={{ background:P.elevated, borderRadius:10, padding:"9px 12px", marginBottom:14 }}>
        <div style={{ fontSize:11, color:P.muted }}>Tool</div>
        <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{tool?.name}</div>
      </div>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12, color:P.sub, marginBottom:5, fontWeight:500 }}>Issue Description</div>
        <textarea value={form.issue} onChange={e=>setF("issue",e.target.value)} rows={3} style={{
          width:"100%", background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10,
          padding:"10px 12px", color:P.text, fontSize:13, resize:"none",
        }}/>
      </div>
      <Field label="Assigned To" value={form.assignedTo} onChange={v=>setF("assignedTo",v)}/>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Field label="Est. Return Date" value={form.estimatedReturn} onChange={v=>setF("estimatedReturn",v)} type="date"/>
        <Field label="Est. Cost (ZAR)" value={form.estimatedCost} onChange={v=>setF("estimatedCost",v)} type="number"/>
      </div>
      <Field label="Actual Cost (ZAR) — fill when complete" value={form.actualCost||""} onChange={v=>setF("actualCost",Number(v)||null)} type="number" placeholder="0"/>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12, color:P.sub, marginBottom:5, fontWeight:500 }}>Additional Notes</div>
        <textarea value={form.notes||""} onChange={e=>setF("notes",e.target.value)} rows={2} placeholder="Parts ordered, updates, etc…" style={{
          width:"100%", background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10,
          padding:"10px 12px", color:P.text, fontSize:13, resize:"none",
        }}/>
      </div>
      <Dropdown label="Status" value={form.status} onChange={v=>setF("status",v)}
        options={Object.entries(REPAIR_STATUS_CFG).map(([k,v])=>({value:k,label:v.label}))}/>
      <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:6 }}>
        <Btn small variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn small onClick={()=>onSave(form)}>Save Changes</Btn>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS — expandable categories, PDF + Excel export
// ─────────────────────────────────────────────────────────────────────────────
function ReportsScreen({ tools, checkouts, repairs, onImportTools }) {
  const [expanded,    setExpanded]    = useState({});
  const [importing,   setImporting]   = useState(false);
  const fileInputRef = useRef(null);

  const totalValue  = tools.reduce((s,t)=>s+(t.cost||0),0);
  const repairCosts = repairs.reduce((s,r)=>s+(r.estimatedCost||0),0);
  const activeOuts  = checkouts.filter(c=>!c.returnDate).length;

  const allCats = [...new Set(tools.map(t=>t.category).filter(Boolean))];
  const byCat = allCats.map(cat => ({
    name:     cat.split(" ").map(w=>w[0]).join(""),
    fullName: cat,
    tools:    tools.filter(t=>t.category===cat),
    count:    tools.filter(t=>t.category===cat).length,
    value:    tools.filter(t=>t.category===cat).reduce((s,t)=>s+(t.cost||0),0),
  })).filter(c=>c.count>0);

  const toggleCat = cat => setExpanded(e=>({...e,[cat]:!e[cat]}));

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];
    const delimiter = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
    
    const rows = []; let currentRow = []; let currentCell = ''; let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], nextC = text[i+1];
      if (c === '"' && inQuotes && nextC === '"') { currentCell += '"'; i++; }
      else if (c === '"') { inQuotes = !inQuotes; }
      else if (c === delimiter && !inQuotes) { currentRow.push(currentCell); currentCell = ''; }
      else if (c === '\n' && !inQuotes) {
        if (currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
        currentRow.push(currentCell); rows.push(currentRow);
        currentRow = []; currentCell = '';
      } else { currentCell += c; }
    }
    if (currentCell || currentRow.length > 0) {
      if (currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
      currentRow.push(currentCell); rows.push(currentRow);
    }
    return rows;
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let text = ev.target.result;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        
        const rows = parseCSV(text);
        if (rows.length < 2) {
          alert("File appears empty or invalid.");
          return;
        }
        
        const header = rows[0].map(h => String(h||"").trim());
        if (header[1] !== "Name" || header[2] !== "Category") {
          alert(`Invalid CSV format. Please use the exact template exported from the system.\n\nExpected Column 2: 'Name', Column 3: 'Category'.\nFound: '${header[1]}' and '${header[2]}'.`);
          return;
        }

        setImporting(true);
        const toolsToImport = [];
        const statusMap = { "Available":"available", "Checked Out":"checked_out", "In Repair":"in_repair", "Retired":"retired" };
        const condMap = { "Good":"good", "Fair":"fair", "Poor":"poor" };

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length < 3 || !String(row[1]).trim()) continue; // skip empty rows or rows without names
          toolsToImport.push({
            id: String(row[0]||"").trim() || null,
            name: String(row[1]||"").trim(),
            category: String(row[2]||"").trim(),
            brand: String(row[3]??"").trim() || "",
            model: String(row[4]??"").trim() || "",
            serial: String(row[5]??"").trim() || "",
            status: statusMap[String(row[6]??"").trim()] || "available",
            condition: condMap[String(row[7]??"").trim()] || "good",
            cost: Number(row[8]) || 0,
            purchaseDate: String(row[9]??"").trim() || "",
          });
        }
        
        if (confirm(`Ready to import ${toolsToImport.length} tools. Proceed?`)) {
          await onImportTools(toolsToImport);
          alert("Import successful! The tools have been added to your register and assigned scannable QR codes.");
        }
      } catch (err) {
        console.error("Import error:", err);
        alert("An error occurred while importing: " + err.message);
      } finally {
        setImporting(false);
        e.target.value = null; // Always clear so the same file can be clicked again
      }
    };
    reader.readAsError = () => {
      alert("Browser failed to read the file.");
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const doExportCSV  = () => exportCSV(tools);
  const doExportPDF  = () => printToolList(tools, "DK Turf & Paving — Full Asset Register");

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div className="syne" style={{ fontSize:17, fontWeight:700, color:P.text }}>Asset Report</div>
        <div style={{ display:"flex", gap:7 }}>
          <input type="file" accept=".csv" ref={fileInputRef} style={{ display: "none" }} onChange={handleImport} />
          {onImportTools && (
            <button onClick={() => fileInputRef.current?.click()} className="tap" disabled={importing} style={{
              background:P.elevated, border:`1px solid ${P.border}`, borderRadius:9,
              padding:"7px 11px", cursor:importing?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:5, opacity: importing ? 0.5 : 1
            }}>
              <ArrowUpDown size={13} color={P.sub}/>
              <span style={{ fontSize:12, color:P.sub }}>{importing ? "Importing...":"Import CSV"}</span>
            </button>
          )}
          <button onClick={doExportCSV} className="tap" style={{
            background:P.elevated, border:`1px solid ${P.border}`, borderRadius:9,
            padding:"7px 11px", cursor:"pointer", display:"flex", alignItems:"center", gap:5,
          }}>
            <Download size={13} color={P.sub}/>
            <span style={{ fontSize:12, color:P.sub }}>CSV / Excel</span>
          </button>
          <button onClick={doExportPDF} className="tap" style={{
            background:P.elevated, border:`1px solid ${P.border}`, borderRadius:9,
            padding:"7px 11px", cursor:"pointer", display:"flex", alignItems:"center", gap:5,
          }}>
            <Printer size={13} color={P.sub}/>
            <span style={{ fontSize:12, color:P.sub }}>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9, marginBottom:18 }}>
        {[
          ["Total Asset Value",   currency(totalValue),  P.orange],
          ["Repair Costs Logged", currency(repairCosts), P.red   ],
          ["Tools Registered",    tools.length,          P.blue  ],
          ["Active Checkouts",    activeOuts,            P.yellow],
        ].map(([l,v,c])=>(
          <div key={l} style={{ background:P.surface, borderRadius:13, padding:"13px 12px", border:`1px solid ${P.border}` }}>
            <div style={{ fontSize:10, color:P.sub, marginBottom:5 }}>{l}</div>
            <div className="syne" style={{ fontSize:18, fontWeight:800, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ marginBottom:18 }}>
        <SectionLabel>Asset Value by Category</SectionLabel>
        <div style={{ background:P.surface, borderRadius:13, padding:"14px 8px 8px", border:`1px solid ${P.border}` }}>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={byCat} margin={{ top:4, right:4, left:-22, bottom:18 }}>
              <XAxis dataKey="name" tick={{ fontSize:10, fill:P.sub }} />
              <YAxis tick={{ fontSize:9, fill:P.sub }} tickFormatter={v=>`R${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v,n,p) => [currency(v), p.payload.fullName]}
                contentStyle={{ background:P.elevated, border:`1px solid ${P.border}`, borderRadius:8, fontSize:12 }}
                cursor={{ fill:P.elevated }}
              />
              <Bar dataKey="value" radius={[4,4,0,0]} fill={P.orange} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expandable category rows */}
      <SectionLabel>Category Breakdown — tap to expand tools</SectionLabel>
      {byCat.map((c, i) => (
        <div key={c.fullName} style={{ marginBottom:8 }}>
          <button onClick={()=>toggleCat(c.fullName)} className="tap" style={{
            width:"100%", background:P.surface, border:`1px solid ${expanded[c.fullName]?P.orange:P.border}`,
            borderRadius:expanded[c.fullName]?"13px 13px 0 0":13, padding:"11px 13px",
            display:"flex", alignItems:"center", cursor:"pointer", gap:10,
          }}>
            <div style={{ flex:1, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, fontWeight:600, color:P.text }}>{c.fullName}</span>
              <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                <span style={{ fontSize:12, color:P.sub }}>{c.count} tool{c.count!==1?"s":""}</span>
                <span style={{ fontSize:13, fontWeight:700, color:P.orange }}>{currency(c.value)}</span>
              </div>
            </div>
            {expanded[c.fullName] ? <ChevronUp size={14} color={P.orange}/> : <ChevronDown size={14} color={P.muted}/>}
          </button>
          {expanded[c.fullName] && (
            <div style={{ background:P.elevated, border:`1px solid ${P.orange}`, borderTop:"none", borderRadius:"0 0 13px 13px", overflow:"hidden" }}>
              {c.tools.map((t, ti) => (
                <div key={t.id} style={{
                  padding:"9px 13px", display:"flex", justifyContent:"space-between", alignItems:"center",
                  borderBottom: ti<c.tools.length-1?`1px solid ${P.border}`:"none",
                }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:P.text }}>{t.name}</div>
                    <div style={{ fontSize:10, color:P.muted }}>{t.brand}{t.serial?` · S/N: ${t.serial}`:""}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Badge {...STATUS_CFG[t.status]} />
                    <span style={{ fontSize:12, fontWeight:700, color:P.sub }}>{currency(t.cost)}</span>
                  </div>
                </div>
              ))}
              <div style={{ padding:"8px 13px", display:"flex", justifyContent:"flex-end", borderTop:`1px solid ${P.border}` }}>
                <span style={{ fontSize:11, color:P.orange, fontWeight:700 }}>Category total: {currency(c.value)}</span>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Grand total row */}
      <div style={{ background:P.elevated, borderRadius:12, padding:"12px 14px", marginTop:6, display:"flex", justifyContent:"space-between", border:`1px solid ${P.border}` }}>
        <span style={{ fontSize:13, fontWeight:700, color:P.text }}>TOTAL REGISTER</span>
        <div style={{ display:"flex", gap:16 }}>
          <span style={{ fontSize:13, color:P.sub }}>{tools.length} tools</span>
          <span style={{ fontSize:14, fontWeight:800, color:P.orange }}>{currency(totalValue)}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS — clickable to navigate to tool
// ─────────────────────────────────────────────────────────────────────────────
function NotificationsPanel({ checkouts, repairs, tools, sites, users, onClose, onNavigateToTool }) {
  const overdueOuts    = checkouts.filter(c=>!c.returnDate&&isOverdue(c.dueDate));
  const overdueRepairs = repairs.filter(r=>r.status!=="complete"&&r.estimatedReturn&&isOverdue(r.estimatedReturn));

  return (
    <Modal title={`Notifications (${overdueOuts.length+overdueRepairs.length})`} onClose={onClose}>
      {overdueOuts.length===0 && overdueRepairs.length===0 ? (
        <div style={{ textAlign:"center", padding:"28px 0", color:P.muted }}>
          <CheckCircle size={34} color={P.green} style={{ marginBottom:10, opacity:0.6 }}/>
          <div style={{ fontSize:13 }}>No active notifications — all clear</div>
        </div>
      ) : (
        <>
          {overdueOuts.map(co => {
            const tool    = tools.find(t=>t.id===co.toolId);
            const foreman = users.find(u=>u.id===co.foremanId);
            const site    = sites.find(s=>s.id===co.siteId);
            return (
              <button key={co.id} onClick={()=>{ onNavigateToTool(co.toolId); onClose(); }} className="tap" style={{
                width:"100%", textAlign:"left", background:"rgba(249,115,22,0.07)",
                border:`1px solid rgba(249,115,22,0.28)`, borderRadius:12,
                padding:"11px 13px", marginBottom:9, cursor:"pointer", display:"block",
              }}>
                <div style={{ fontSize:11, fontWeight:700, color:P.orange, marginBottom:4 }}>⚠ OVERDUE TOOL RETURN — tap to view</div>
                <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{tool?.name}</div>
                <div style={{ fontSize:12, color:P.sub }}>{foreman?.name} · {site?.name}</div>
                <div style={{ fontSize:12, color:P.red, fontWeight:600, marginTop:2 }}>Was due: {fmt(co.dueDate)}</div>
              </button>
            );
          })}
          {overdueRepairs.map(r => {
            const tool = tools.find(t=>t.id===r.toolId);
            return (
              <button key={r.id} onClick={()=>{ onNavigateToTool(r.toolId); onClose(); }} className="tap" style={{
                width:"100%", textAlign:"left", background:"rgba(239,68,68,0.07)",
                border:`1px solid rgba(239,68,68,0.28)`, borderRadius:12,
                padding:"11px 13px", marginBottom:9, cursor:"pointer", display:"block",
              }}>
                <div style={{ fontSize:11, fontWeight:700, color:P.red, marginBottom:4 }}>🔧 OVERDUE REPAIR — tap to view</div>
                <div style={{ fontSize:13, fontWeight:600, color:P.text }}>{tool?.name}</div>
                <div style={{ fontSize:12, color:P.sub }}>{r.issue}</div>
                <div style={{ fontSize:12, color:P.red, fontWeight:600, marginTop:2 }}>Was due back: {fmt(r.estimatedReturn)}</div>
              </button>
            );
          })}
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM (Admin Only)
// ─────────────────────────────────────────────────────────────────────────────
function TeamScreen({ users, onCreateUser, onUpdateUser, onRemoveUser }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"foreman" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (editUser) {
      if (!form.name || !form.email) { setError("Name and username are required"); return; }
      setLoading(true); setError(null);
      try {
        await onUpdateUser(editUser.id, { name: form.name.trim(), email: form.email.trim(), role: form.role, password: form.password });
        setEditUser(null);
        setForm({ name:"", email:"", password:"", role:"foreman" });
      } catch(err) { setError(err.message); }
      setLoading(false);
    } else {
      if (!form.name || !form.email || !form.password) { setError("Please fill all fields"); return; }
      if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }
      setLoading(true); setError(null);
      try {
        await onCreateUser(form);
        setShowAdd(false);
        setForm({ name:"", email:"", password:"", role:"foreman" });
      } catch(err) {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div className="syne" style={{ fontSize:17, fontWeight:700, color:P.text }}>Team Management</div>
        <Btn small onClick={()=>setShowAdd(true)}>+ Add User</Btn>
      </div>

      <div style={{ marginBottom:14 }}>
        <SectionLabel>Current Users ({users.length})</SectionLabel>
        {users.map(u => (
          <div key={u.id} style={{ background:P.surface, border:`1px solid ${P.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:ROLE_CFG[u.role]?.color+"22", border:`1px solid ${ROLE_CFG[u.role]?.color}44`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <span style={{ fontWeight:800, fontSize:12, color:ROLE_CFG[u.role]?.color }}>{u.initials || "U"}</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:P.text }}>{u.name}</div>
              <div style={{ fontSize:12, color:P.sub }}>{ROLE_CFG[u.role]?.label || u.role}</div>
            </div>
            {u.email && <div style={{ fontSize:11, color:P.muted }}>{u.email}</div>}
            <button className="tap" onClick={() => {
              setEditUser(u);
              setForm({ name:u.name, email:u.email, password:u.password||"", role:u.role });
            }} style={{ background:P.elevated, border:`1px solid ${P.border}`, borderRadius:10, padding:"8px", color:P.sub, cursor:"pointer" }}>
              <Edit2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {(showAdd || editUser) && (
        <Modal title={editUser ? "Edit User" : "Add New User"} onClose={()=>{setShowAdd(false); setEditUser(null);}}>
          {error && <div style={{ background:P.red+"22", border:`1px solid ${P.red}`, borderRadius:10, padding:"10px 12px", color:P.red, fontSize:13, marginBottom:16 }}>{error}</div>}
          <Field label="Full Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="John Doe" required />
          <Field label="Username or Email" value={form.email} onChange={v=>setForm(f=>({...f,email:v}))} type="text" placeholder="e.g. johndoe" required />
          <Field label="Password" value={form.password} onChange={v=>setForm(f=>({...f,password:v}))} type={editUser && !editUser.password ? "text" : "password"} placeholder={editUser && !editUser.password ? "Old profile (recreate to change)" : "Min 6 characters"} disabled={editUser && !editUser.password} required={!editUser} />
          <Dropdown label="Role" value={form.role} onChange={v=>setForm(f=>({...f,role:v}))} options={Object.entries(ROLE_CFG).filter(([k])=>k!=="unauthorized").map(([k,v])=>({value:k,label:v.label}))} />
          
          <div style={{ display:"flex", gap:9, justifyContent:"space-between", marginTop:14 }}>
            <div>
              {editUser && (
                <button
                  type="button"
                  onClick={async () => {
                    if(confirm(`Remove ${editUser.name} from the team?`)) {
                      setLoading(true);
                      await onRemoveUser(editUser.id);
                      setShowAdd(false); setEditUser(null);
                      setLoading(false);
                    }
                  }}
                  style={{ background:"transparent", border:"none", color:P.red, fontSize:13, fontWeight:600, cursor:"pointer", padding:"8px 0" }}
                >
                  Delete User
                </button>
              )}
            </div>
            <div style={{ display:"flex", gap:9 }}>
              <Btn small variant="secondary" onClick={()=>{setShowAdd(false); setEditUser(null);}}>Cancel</Btn>
              <Btn small onClick={handleSave} disabled={loading}>{loading ? "Saving..." : editUser ? "Save Changes" : "Create User"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => { injectStyles(); }, []);

  const { currentUser, userRole, canEdit } = useAuth();

  const [tab,         setTab]         = useState("dashboard");
  const [showNotif,   setShowNotif]   = useState(false);
  const [toolModal,   setToolModal]   = useState(null);
  const [navFilter,   setNavFilter]   = useState(null);
  const [deepLinkTool,setDeepLinkTool]= useState(null);
  const [showCatMgr,  setShowCatMgr]  = useState(false);
  const [showSiteMgr, setShowSiteMgr] = useState(false);

  const { tools, checkouts, repairs, categories, users, sites, loading, saveTool, importTools, removeTool, checkoutTools, checkinTools, logRepair, updateRepair, updateRepairStatus, saveCategories, createTeamMember, updateTeamMember, removeTeamMember, saveSite, removeSite } = useLiveTracking(currentUser?.uid);

  if (!currentUser) return <div id="dktt-root"><LoginScreen /></div>;
  if (loading) return <div id="dktt-root" style={{ background:P.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:P.muted }}>Loading Data...</div>;

  const user = {
    id: currentUser.uid,
    name: currentUser.displayName || currentUser.email.split("@")[0],
    role: ROLE_CFG[userRole] ? userRole : "unauthorized",
    initials: (currentUser.displayName || currentUser.email.split("@")[0]).slice(0, 2).toUpperCase()
  };

  const isAdmin = userRole === "admin";

  const alertCount = checkouts.filter(c=>!c.returnDate&&isOverdue(c.dueDate)).length
                   + repairs.filter(r=>r.status!=="complete"&&r.estimatedReturn&&isOverdue(r.estimatedReturn)).length;

  const handleNavigate = ({ tab: t, filter }) => {
    setTab(t);
    setNavFilter(filter || null);
  };

  const handleNavigateToTool = (toolId) => {
    setTab("tools");
    setNavFilter(null);
    setDeepLinkTool(toolId);
    setTimeout(() => setDeepLinkTool(null), 500);
  };

  return (
    <div id="dktt-root" style={{ background:P.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto", color:P.text, position:"relative" }}>
      <TopBar user={user} notifCount={alertCount} onNotifClick={()=>setShowNotif(true)} onLogout={async ()=>{ await signOut(auth); setTab("dashboard"); }} />

      <div style={{ paddingTop:58, paddingBottom:80, minHeight:"100vh" }}>
        {tab==="dashboard"  && <Dashboard tools={tools} checkouts={checkouts} repairs={repairs} sites={sites} users={users} onNavigate={handleNavigate}/>}
        {tab==="tools"      && <ToolsScreen tools={tools} checkouts={checkouts} repairs={repairs} sites={sites} users={users} canEdit={canEdit} onAdd={()=>setToolModal("add")} onEdit={t=>setToolModal(t)} initialStatusFilter={navFilter} deepLinkTool={deepLinkTool} categories={categories} onManageCategories={()=>setShowCatMgr(true)}/>}
        {tab==="movements"  && <MovementsScreen tools={tools} checkouts={checkouts} onCheckout={checkoutTools} onCheckin={checkinTools} sites={sites} users={users} canEdit={canEdit} onManageSites={()=>setShowSiteMgr(true)}/>}
        {tab==="repairs"    && <RepairsScreen tools={tools} repairs={repairs} onAddRepair={(form) => logRepair({...form, reportedBy: user.id})} onUpdateRepair={updateRepair} onSetStatus={updateRepairStatus} canEdit={canEdit}/>}
        {tab==="reports"    && <ReportsScreen tools={tools} checkouts={checkouts} repairs={repairs} onImportTools={importTools}/>}
        {tab==="team"       && isAdmin && <TeamScreen users={users} onCreateUser={createTeamMember} onUpdateUser={updateTeamMember} onRemoveUser={removeTeamMember} />}
      </div>

      <BottomNav active={tab} setActive={t=>{ setTab(t); setNavFilter(null); }} alertCount={alertCount} isAdmin={isAdmin}/>

      {toolModal && (
        <ToolFormModal
          tool={toolModal==="add"?null:toolModal}
          categories={categories}
          onSave={async data => {
            await saveTool(data);
            setToolModal(null);
          }}
          onDelete={async id => { 
            await removeTool(id);
            setToolModal(null); 
          }}
          onClose={()=>setToolModal(null)}
        />
      )}

      {showSiteMgr && (
        <ManageSitesModal
          sites={sites}
          onSave={async data => { await saveSite(data); setShowSiteMgr(false); }}
          onDelete={async id => { await removeSite(id); }}
          onClose={()=>setShowSiteMgr(false)}
        />
      )}

      {showCatMgr && (
        <ManageCategoriesModal
          categories={categories}
          tools={tools}
          onSave={async (data) => {
            await saveCategories(data);
            setShowCatMgr(false);
          }}
          onClose={()=>setShowCatMgr(false)}
        />
      )}

      {showNotif && (
        <NotificationsPanel
          checkouts={checkouts} repairs={repairs} tools={tools} sites={sites} users={users}
          onClose={()=>setShowNotif(false)} onNavigateToTool={handleNavigateToTool}
        />
      )}
    </div>
  );
}
