import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:8080";

// ── API helpers ──────────────────────────────────────────────────────────────
const apiFetch = async (path, opts) => {
  try {
    const r = await fetch(API + path, opts);
    if (r.headers.get("content-type")?.includes("json")) return r.json();
    return {};
  } catch { return {}; }
};
const dqs = (d) => d ? `?domain=${encodeURIComponent(d)}` : "";

// ── Escape HTML ──────────────────────────────────────────────────────────────
const esc = (s) => String(s || "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Colors ───────────────────────────────────────────────────────────────────
const METHOD_COLOR = { GET: "#00e676", POST: "#ff9100", PUT: "#448aff", DELETE: "#ff5252" };
const TYPE_COLOR   = {
  request: "#00e676", response: "#29b6f6", response_body: "#448aff",
  auth_cookie: "#ffd740", cookies: "#ff9100", cookies_changed: "#444",
  websocket: "#ce93d8", dommap: "#00e5ff", debugger_status: "#b388ff",
};

// ── Badge ────────────────────────────────────────────────────────────────────
const Badge = ({ text, color = "#00e676" }) => (
  <span style={{
    fontSize: 9, padding: "2px 6px", borderRadius: 3,
    border: `1px solid ${color}44`, color, background: color + "11",
    fontFamily: "monospace", whiteSpace: "nowrap"
  }}>{text}</span>
);

// ── Sidebar domain list ──────────────────────────────────────────────────────
const Sidebar = ({ domains, active, onSelect }) => (
  <div style={{
    width: 180, background: "#0b0b0f", borderRight: "1px solid #1a1a2e",
    display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden"
  }}>
    <div style={{
      padding: "10px 12px", fontSize: 9, color: "#333", letterSpacing: 2,
      textTransform: "uppercase", borderBottom: "1px solid #1a1a2e"
    }}>Domains</div>
    <div style={{ flex: 1, overflowY: "auto", padding: "6px 4px" }}>
      {domains.length === 0 && (
        <div style={{ fontSize: 10, color: "#333", padding: "8px 10px" }}>
          No data yet — track a tab
        </div>
      )}
      {domains.map(d => (
        <div key={d} onClick={() => onSelect(d === active ? null : d)}
          style={{
            fontSize: 11, padding: "6px 10px", borderRadius: 3, cursor: "pointer",
            marginBottom: 2, display: "flex", alignItems: "center", gap: 6,
            color: d === active ? "#00e676" : "#666",
            background: d === active ? "#00e67611" : "transparent",
            borderLeft: d === active ? "2px solid #00e676" : "2px solid transparent",
            transition: "all .15s"
          }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: d === active ? "#00e676" : "#2a2a3a", flexShrink: 0
          }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d}</span>
        </div>
      ))}
    </div>
  </div>
);

// ── Tab bar ──────────────────────────────────────────────────────────────────
const TABS = ["Live", "Responses", "Intel", "Tokens", "Endpoints", "DOM Map", "Find", "Navigate", "Queue"];

const TabBar = ({ active, onChange }) => (
  <div style={{
    display: "flex", background: "#0b0b0f",
    borderBottom: "1px solid #1a1a2e", flexShrink: 0
  }}>
    {TABS.map(t => (
      <button key={t} onClick={() => onChange(t)}
        style={{
          background: "none", border: "none",
          borderBottom: active === t ? "2px solid #00e676" : "2px solid transparent",
          color: active === t ? "#00e676" : "#444",
          padding: "9px 16px", cursor: "pointer", fontSize: 11,
          fontFamily: "monospace", transition: "all .15s",
        }}
        onMouseEnter={e => { if (active !== t) e.target.style.color = "#aaa"; }}
        onMouseLeave={e => { if (active !== t) e.target.style.color = "#444"; }}
      >{t}</button>
    ))}
  </div>
);

// ── Btn ──────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "green", style: sx }) => {
  const colors = {
    green:  { border: "#00e676", color: "#00e676", bg: "#00e67611" },
    red:    { border: "#ff5252", color: "#ff5252", bg: "#ff525211" },
    yellow: { border: "#ffd740", color: "#ffd740", bg: "#ffd74011" },
  };
  const c = colors[variant];
  return (
    <button onClick={onClick} style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
      padding: "4px 14px", cursor: "pointer", fontFamily: "monospace",
      fontSize: 11, borderRadius: 3, transition: "all .15s", ...sx
    }}
      onMouseEnter={e => { e.currentTarget.style.background = c.border; e.currentTarget.style.color = "#000"; }}
      onMouseLeave={e => { e.currentTarget.style.background = c.bg; e.currentTarget.style.color = c.color; }}
    >{children}</button>
  );
};

// ── Token card ───────────────────────────────────────────────────────────────
const TokenCard = ({ token, domain }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText("Bearer " + token.token).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{
      background: "#0d0d15", border: "1px solid #1f1f00",
      borderRadius: 4, padding: "9px 13px", marginBottom: 7
    }}>
      <div style={{ fontSize: 10, color: "#444", marginBottom: 5, display: "flex", gap: 10 }}>
        {domain && <span style={{ color: "#00e676" }}>{domain}</span>}
        <span>{(token.url || "").slice(0, 70)}</span>
      </div>
      <div onClick={copy} style={{
        fontSize: 11, color: "#ffd740", wordBreak: "break-all",
        background: "#0c0c00", padding: "6px 8px", borderRadius: 3,
        cursor: "pointer", border: "1px solid #2a2a00", position: "relative"
      }}>
        Bearer {token.token}
        <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: copied ? "#00e676" : "#444" }}>
          {copied ? "✓ copied" : "click to copy"}
        </span>
      </div>
    </div>
  );
};

// ── Cookie card ──────────────────────────────────────────────────────────────
const CookieCard = ({ cookie, domain }) => {
  const c = cookie.cookie || cookie;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(c.value || "").catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{
      background: "#0d0d15", border: "1px solid #1a1200",
      borderRadius: 4, padding: "8px 12px", marginBottom: 5
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
        {domain && <span style={{ fontSize: 10, color: "#00e676" }}>{domain}</span>}
        <span style={{ fontSize: 11, color: "#ffd740" }}>{c.name}</span>
        {c.httpOnly && <Badge text="httpOnly" color="#ff9100" />}
        {c.secure && <Badge text="secure" color="#29b6f6" />}
      </div>
      <div onClick={copy} style={{
        fontSize: 10, color: "#666", wordBreak: "break-all", cursor: "pointer"
      }}>
        {(c.value || "").slice(0, 200)}
        {copied && <span style={{ color: "#00e676", marginLeft: 8 }}>✓</span>}
      </div>
    </div>
  );
};

// ── Request card ─────────────────────────────────────────────────────────────
const ReqCard = ({ req }) => {
  const [open, setOpen] = useState(false);
  const m = req.method || "GET";
  const flagColors = {
    BEARER_TOKEN: "#ffd740", API: "#448aff", AUTH_FLOW: "#ff5252",
    CF_CLEARANCE: "#ff9100", POST_DATA: "#ce93d8"
  };
  return (
    <div style={{
      background: "#0d0d15", border: "1px solid #1a1a2e",
      borderRadius: 4, marginBottom: 5, overflow: "hidden"
    }}>
      <div onClick={() => setOpen(!open)} style={{
        padding: "7px 11px", display: "flex", alignItems: "center",
        gap: 7, cursor: "pointer"
      }}>
        <span style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 2, fontWeight: "bold",
          minWidth: 36, textAlign: "center",
          color: METHOD_COLOR[m] || "#aaa",
          border: `1px solid ${(METHOD_COLOR[m] || "#aaa") + "44"}`,
          background: (METHOD_COLOR[m] || "#aaa") + "11"
        }}>{m}</span>
        <span style={{
          fontSize: 11, flex: 1, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#ccc"
        }}>{req.url}</span>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {(req.flags || []).map(f => (
            <Badge key={f} text={f} color={flagColors[f] || "#666"} />
          ))}
        </div>
      </div>
      {open && (
        <div style={{ padding: "9px 11px", borderTop: "1px solid #1a1a2e" }}>
          <pre style={{
            background: "#080810", padding: 7, borderRadius: 3,
            fontSize: 10, overflowX: "auto", whiteSpace: "pre-wrap",
            wordBreak: "break-all", maxHeight: 200, overflowY: "auto",
            color: "#aaa", lineHeight: 1.5
          }}>{JSON.stringify(req.headers || req.reqHeaders || {}, null, 2)}</pre>
          {(req.postData || req.reqPostData) && (
            <pre style={{
              background: "#080810", padding: 7, borderRadius: 3,
              fontSize: 10, marginTop: 5, color: "#ff9100",
              maxHeight: 150, overflowY: "auto"
            }}>{JSON.stringify(req.postData || req.reqPostData)}</pre>
          )}
        </div>
      )}
    </div>
  );
};

// ── LIVE TAB ─────────────────────────────────────────────────────────────────
const LiveTab = ({ events, onClear }) => (
  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
    <div style={{
      padding: "7px 12px", background: "#0b0b0f", borderBottom: "1px solid #1a1a2e",
      display: "flex", alignItems: "center", gap: 8, flexShrink: 0
    }}>
      <span style={{ fontSize: 11, color: "#333" }}>Real-time event stream</span>
      <Btn onClick={onClear} sx={{ marginLeft: "auto" }}>Clear</Btn>
    </div>
    <div style={{ flex: 1, overflowY: "auto" }}>
      {events.length === 0 && (
        <div style={{ padding: 20, color: "#333", fontSize: 12 }}>
          Waiting for events... Track a tab to start capturing.
        </div>
      )}
      {events.map((item, i) => {
        const type = item.type || "unknown";
        const color = TYPE_COLOR[type] || "#555";
        return (
          <div key={i} style={{
            fontSize: 11, padding: "4px 10px", borderBottom: "1px solid #111",
            display: "flex", gap: 8, alignItems: "center"
          }}>
            <span style={{
              fontSize: 9, padding: "1px 6px", borderRadius: 2,
              minWidth: 85, textAlign: "center",
              color, border: `1px solid ${color}44`, background: color + "11"
            }}>{type}</span>
            <span style={{ fontSize: 10, color: "#333", minWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.domain || ""}
            </span>
            <span style={{
              flex: 1, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", color: "#888"
            }}>{item.url || item.cookie?.name || ""}</span>
            <span style={{ fontSize: 9, color: "#2a2a3a" }}>
              {new Date(item.timestamp || Date.now()).toLocaleTimeString()}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

// ── INTEL TAB ────────────────────────────────────────────────────────────────
const IntelTab = ({ domain }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!domain) { setData(null); return; }
    setData("loading");
    apiFetch("/intel?domain=" + encodeURIComponent(domain)).then(setData);
  }, [domain]);

  if (!domain) return (
    <div style={{ padding: 30, color: "#333", fontSize: 13 }}>← Select a domain from the sidebar</div>
  );
  if (data === "loading" || !data) return (
    <div style={{ padding: 20, color: "#444" }}>Loading...</div>
  );

  return (
    <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          ["Bearer Tokens", data.tokens?.length || 0, "#ffd740"],
          ["Auth Cookies", data.auth?.length || 0, "#ff9100"],
          ["API Endpoints", data.endpoints?.length || 0, "#448aff"],
          ["DOM Map", data.dommap ? "✓" : "—", data.dommap ? "#00e5ff" : "#2a2a3a"],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: "#0d0d15", border: "1px solid #1a1a2e",
            borderRadius: 4, padding: 12
          }}>
            <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, color, fontWeight: "bold" }}>{val}</div>
          </div>
        ))}
      </div>

      {data.tokens?.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 6px", borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>Bearer Tokens</div>
          {data.tokens.map((t, i) => <TokenCard key={i} token={t} />)}
        </>
      )}
      {data.auth?.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 6px", borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>Auth Cookies</div>
          {data.auth.map((c, i) => <CookieCard key={i} cookie={c} />)}
        </>
      )}
      {data.endpoints?.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 6px", borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>API Endpoints</div>
          {data.endpoints.map((e, i) => <ReqCard key={i} req={e} />)}
        </>
      )}
    </div>
  );
};

// ── TOKENS TAB ───────────────────────────────────────────────────────────────
const TokensTab = ({ domain }) => {
  const [tokens, setTokens] = useState([]);
  const [auth, setAuth] = useState({});
  const load = useCallback(() => {
    apiFetch("/tokens" + dqs(domain)).then(d => setTokens(Array.isArray(d) ? d : []));
    apiFetch("/auth" + dqs(domain)).then(d => setAuth(d && typeof d === "object" ? d : {}));
  }, [domain]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn onClick={load}>Refresh</Btn>
      </div>
      <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
        Bearer Tokens ({tokens.length})
      </div>
      {tokens.length === 0 && <div style={{ color: "#333", fontSize: 12, marginBottom: 12 }}>None found yet.</div>}
      {tokens.map((t, i) => <TokenCard key={i} token={t} domain={t.domain} />)}

      <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 8px", borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>Auth Cookies</div>
      {Object.entries(auth).flatMap(([d, items]) =>
        items.map((item, i) => <CookieCard key={d + i} cookie={item} domain={d} />)
      )}
    </div>
  );
};

// ── ENDPOINTS TAB ────────────────────────────────────────────────────────────
const EndpointsTab = ({ domain }) => {
  const [data, setData] = useState({});
  const load = useCallback(() => {
    apiFetch("/endpoints" + dqs(domain)).then(setData);
  }, [domain]);
  useEffect(() => { load(); }, [load]);

  const entries = Object.entries(data);
  return (
    <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn onClick={load}>Refresh</Btn>
      </div>
      {entries.length === 0 && (
        <div style={{ color: "#333", fontSize: 12 }}>No API endpoints yet. Navigate to a site and track it.</div>
      )}
      {entries.map(([d, eps]) => (
        <div key={d}>
          <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 6px", borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
            {d} ({eps.length})
          </div>
          {eps.map((e, i) => <ReqCard key={i} req={e} />)}
        </div>
      ))}
    </div>
  );
};

// ── DOM MAP TAB ───────────────────────────────────────────────────────────────
const DomMapTab = ({ domain, onUseSelector }) => {
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    apiFetch("/dommaps" + dqs(domain)).then(raw => {
      const maps = domain ? (raw || []) : Object.values(raw || {}).flat();
      const latest = maps[maps.length - 1];
      setData(latest ? (latest.dommap || latest) : null);
    });
  }, [domain]);
  useEffect(() => { load(); }, [load]);

  if (!data) return (
    <div style={{ padding: 20, color: "#333", fontSize: 12 }}>
      No DOM maps yet. Navigate to a site then click Track Tab.
    </div>
  );

  const Chip = ({ label, color, onClick }) => (
    <span onClick={onClick} style={{
      display: "inline-block", fontSize: 10, padding: "2px 6px", borderRadius: 2,
      background: color + "11", color, border: `1px solid ${color}33`,
      margin: 2, cursor: "pointer", transition: "all .1s"
    }}
      onMouseEnter={e => { e.currentTarget.style.background = color; e.currentTarget.style.color = "#000"; }}
      onMouseLeave={e => { e.currentTarget.style.background = color + "11"; e.currentTarget.style.color = color; }}
    >{label}</span>
  );

  return (
    <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
      <div style={{ fontSize: 10, color: "#333", marginBottom: 10 }}>
        {data.url} — {(data.tags || []).length} tags · {(data.classes || []).length} classes · {(data.ids || []).length} IDs
        <Btn onClick={load} sx={{ marginLeft: 10, fontSize: 9 }}>Refresh</Btn>
      </div>
      <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, margin: "8px 0 5px" }}>Tags</div>
      <div style={{ marginBottom: 12 }}>
        {(data.tags || []).map(t => (
          <Chip key={t.tag} label={`${t.tag} ${t.count}`} color="#00e5ff" onClick={() => onUseSelector(t.tag)} />
        ))}
      </div>
      <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, margin: "8px 0 5px" }}>Classes</div>
      <div style={{ marginBottom: 12 }}>
        {(data.classes || []).slice(0, 200).map(c => (
          <Chip key={c.name} label={`.${c.name} ${c.count}`} color="#00e676" onClick={() => onUseSelector("." + c.name)} />
        ))}
      </div>
      <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, margin: "8px 0 5px" }}>IDs</div>
      <div>
        {(data.ids || []).map(id => (
          <Chip key={id} label={`#${id}`} color="#ffd740" onClick={() => onUseSelector("#" + id)} />
        ))}
      </div>
    </div>
  );
};


// ── RESPONSES TAB ─────────────────────────────────────────────────────────────
const ResponsesTab = ({ domain }) => {
  const [data, setData] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    apiFetch("/responses" + dqs(domain)).then(d => setData(Array.isArray(d) ? d : []));
  }, [domain]);
  useEffect(() => { load(); }, [load]);

  const filtered = data.filter(r =>
    !filter || (r.url || "").toLowerCase().includes(filter.toLowerCase())
  );

  const flagColors = {
    API: "#448aff", AUTH_FLOW: "#ff5252", BEARER_TOKEN: "#ffd740",
    CF_CLEARANCE: "#ff9100", CLOUDFLARE: "#ff9100", POST_DATA: "#ce93d8"
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: response list */}
      <div style={{ width: 420, borderRight: "1px solid #1a1a2e", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "7px 10px", borderBottom: "1px solid #1a1a2e", display: "flex", gap: 7 }}>
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter by URL..."
            style={{ flex: 1, background: "#161620", border: "1px solid #2a2a3a", color: "#e0e0e0", padding: "4px 8px", fontFamily: "monospace", fontSize: 11, borderRadius: 3, outline: "none" }} />
          <Btn onClick={load}>↻</Btn>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && <div style={{ padding: 16, color: "#333", fontSize: 11 }}>No responses yet. Track a tab and browse.</div>}
          {filtered.map((r, i) => {
            const isSelected = selected === i;
            const status = r.status || 0;
            const statusColor = status >= 400 ? "#ff5252" : status >= 300 ? "#ffd740" : "#00e676";
            return (
              <div key={i} onClick={() => setSelected(isSelected ? null : i)}
                style={{
                  padding: "6px 10px", borderBottom: "1px solid #111", cursor: "pointer",
                  background: isSelected ? "#0d1a0d" : "transparent",
                  borderLeft: isSelected ? "2px solid #00e676" : "2px solid transparent"
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 9, fontWeight: "bold", color: statusColor, minWidth: 28 }}>{status}</span>
                  <span style={{ fontSize: 9, color: "#444", minWidth: 30 }}>{r.reqMethod || "GET"}</span>
                  <span style={{ fontSize: 10, color: "#aaa", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(r.url || "").replace(/https?:\/\/[^/]+/, "")}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {(r.flags || []).map(f => (
                    <span key={f} style={{ fontSize: 8, padding: "0 4px", borderRadius: 2, color: flagColors[f] || "#555", border: `1px solid ${(flagColors[f] || "#555") + "44"}`, background: (flagColors[f] || "#555") + "11" }}>{f}</span>
                  ))}
                  {r.body && <span style={{ fontSize: 8, padding: "0 4px", borderRadius: 2, color: "#00e676", border: "1px solid #00e67633", background: "#00e67611" }}>HAS BODY</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: detail panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {!selected && selected !== 0 && (
          <div style={{ color: "#333", fontSize: 12, padding: 20 }}>← Select a response to inspect</div>
        )}
        {(selected === 0 || selected > 0) && filtered[selected] && (() => {
          const r = filtered[selected];
          return (
            <div>
              <div style={{ fontSize: 12, color: "#ccc", wordBreak: "break-all", marginBottom: 10 }}>{r.url}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <Badge text={r.reqMethod || "GET"} color="#00e676" />
                <Badge text={String(r.status)} color={r.status >= 400 ? "#ff5252" : "#00e676"} />
                <Badge text={r.mimeType || "unknown"} color="#448aff" />
                {(r.flags || []).map(f => <Badge key={f} text={f} color={flagColors[f] || "#555"} />)}
              </div>

              <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Response Headers</div>
              <pre style={{ background: "#080810", padding: 8, borderRadius: 3, fontSize: 10, color: "#888", marginBottom: 10, maxHeight: 150, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(r.headers || {}, null, 2)}
              </pre>

              <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Request Headers</div>
              <pre style={{ background: "#080810", padding: 8, borderRadius: 3, fontSize: 10, color: "#888", marginBottom: 10, maxHeight: 150, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(r.reqHeaders || {}, null, 2)}
              </pre>

              {r.body && (
                <>
                  <div style={{ fontSize: 9, color: "#00e676", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Response Body</div>
                  <pre style={{ background: "#080810", padding: 8, borderRadius: 3, fontSize: 10, color: "#ccc", maxHeight: 400, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {typeof r.body === "string" ? r.body : JSON.stringify(r.body, null, 2)}
                  </pre>
                </>
              )}
              {!r.body && (
                <div style={{ fontSize: 11, color: "#333", padding: "8px 0" }}>
                  No body captured. Enable body capture in the extension settings.
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

// ── FIND TAB ──────────────────────────────────────────────────────────────────
const FindTab = ({ domain, selectorInit }) => {
  const [url, setUrl] = useState("");
  const [selector, setSelector] = useState(selectorInit || "");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => { if (selectorInit) setSelector(selectorInit); }, [selectorInit]);

  const run = async () => {
    if (!selector.trim() || !url.trim()) return;
    setLoading(true);
    setResults(null);
    setStatus("Fetching " + url + "...");
    const data = await apiFetch("/scrape?url=" + encodeURIComponent(url) + "&selector=" + encodeURIComponent(selector));
    setResults(data);
    setStatus("");
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "7px 12px", background: "#0b0b0f", borderBottom: "1px solid #1a1a2e",
        display: "flex", gap: 7, flexShrink: 0, flexWrap: "wrap"
      }}>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder='https://example.com/products'
          style={{
            flex: 2, minWidth: 200, background: "#161620", border: "1px solid #2a2a3a",
            color: "#e0e0e0", padding: "5px 10px", fontFamily: "monospace",
            fontSize: 12, borderRadius: 3, outline: "none"
          }} />
        <input value={selector} onChange={e => setSelector(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder='CSS selector: div.price, h1, a[href]'
          style={{
            flex: 1, minWidth: 150, background: "#161620", border: "1px solid #2a2a3a",
            color: "#e0e0e0", padding: "5px 10px", fontFamily: "monospace",
            fontSize: 12, borderRadius: 3, outline: "none"
          }} />
        <Btn onClick={run}>{loading ? "..." : "Scrape"}</Btn>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {status && <div style={{ color: "#00e676", padding: "8px 10px", fontSize: 11 }}>{status}</div>}
        {results?.error && <div style={{ color: "#ff5252", padding: 10 }}>{results.error}</div>}
        {results && !results.error && (
          <>
            <div style={{ fontSize: 11, color: "#444", marginBottom: 8 }}>
              {results.count} match{results.count !== 1 ? "es" : ""} for <span style={{ color: "#00e676" }}>{results.selector}</span> on <span style={{ color: "#29b6f6" }}>{results.url}</span>
            </div>
            {(results.matches || []).map((m, i) => (
              <div key={i} style={{
                background: "#0d0d15", border: "1px solid #1a1a2e",
                borderRadius: 4, marginBottom: 5, overflow: "hidden"
              }}>
                <div style={{ padding: "7px 11px", fontSize: 11, display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: "#00e5ff" }}>&lt;{m.tag}&gt;</span>
                  <span style={{ color: "#ccc", flex: 1 }}>{(m.text || "").slice(0, 120)}</span>
                  {(m.attrs || []).filter(([k]) => ["href","src","class","id"].includes(k)).map(([k,v]) => (
                    <span key={k} style={{ fontSize: 9, color: "#555" }}>{k}=<span style={{ color: "#888" }}>{v.slice(0,40)}</span></span>
                  ))}
                </div>
                <pre style={{
                  background: "#080810", padding: "6px 11px", fontSize: 10,
                  color: "#aaa", overflowX: "auto", maxHeight: 150, overflowY: "auto",
                  whiteSpace: "pre-wrap", wordBreak: "break-all", borderTop: "1px solid #111"
                }}>{(m.html || "").slice(0, 500)}</pre>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

// ── NAVIGATE TAB ──────────────────────────────────────────────────────────────
const NavigateTab = () => {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");

  const nav = async () => {
    if (!url.trim()) return;
    setMsg("Navigating...");
    await apiFetch("/navigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    setUrl(""); setMsg("Done ✓");
    setTimeout(() => setMsg(""), 2000);
  };

  const cmd = async (command) => {
    setMsg(`Sending ${command}...`);
    await apiFetch("/cmd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command })
    });
    setMsg(`${command} sent ✓`);
    setTimeout(() => setMsg(""), 2000);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
        <input value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && nav()}
          placeholder="https://..."
          style={{
            flex: 1, background: "#161620", border: "1px solid #2a2a3a",
            color: "#e0e0e0", padding: "6px 12px", fontFamily: "monospace",
            fontSize: 12, borderRadius: 3, outline: "none"
          }} />
        <Btn onClick={nav}>Navigate + Track</Btn>
      </div>
      {msg && <div style={{ fontSize: 11, color: "#00e676", marginBottom: 12 }}>{msg}</div>}
      <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Active Tab Commands</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {["track", "cookies", "storage", "html", "screenshot"].map(c => (
          <Btn key={c} onClick={() => cmd(c)}>{c}</Btn>
        ))}
      </div>
    </div>
  );
};

// ── QUEUE TAB ─────────────────────────────────────────────────────────────────
const QueueTab = () => {
  const [urls, setUrls] = useState("");
  const [delay, setDelay] = useState(6);
  const [warmup, setWarmup] = useState(true);
  const [status, setStatus] = useState(null);

  const load = async () => {
    const data = await apiFetch("/queue");
    setStatus(data);
  };
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  const add = async () => {
    const list = urls.split("\n").map(u => u.trim()).filter(Boolean);
    if (!list.length) return;
    await apiFetch("/queue/add", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: list, delay, warmup })
    });
    setUrls(""); load();
  };

  const clear = async () => {
    await apiFetch("/queue/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    load();
  };

  return (
    <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
      <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Add URLs</div>
      <textarea value={urls} onChange={e => setUrls(e.target.value)}
        placeholder={"One URL per line\nhttps://example.com/page1\nhttps://example.com/page2"}
        style={{
          width: "100%", height: 80, background: "#161620", border: "1px solid #2a2a3a",
          color: "#e0e0e0", padding: 8, fontFamily: "monospace", fontSize: 11,
          borderRadius: 3, resize: "vertical", marginBottom: 8, outline: "none"
        }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: "#555" }}>Delay (sec):</label>
        <input type="number" value={delay} onChange={e => setDelay(+e.target.value)}
          min={1} max={60}
          style={{
            width: 55, background: "#161620", border: "1px solid #2a2a3a",
            color: "#e0e0e0", padding: "3px 8px", fontFamily: "monospace", fontSize: 11, borderRadius: 3, outline: "none"
          }} />
        <label style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 5 }}>
          <input type="checkbox" checked={warmup} onChange={e => setWarmup(e.target.checked)} />
          Warmup
        </label>
        <Btn onClick={add}>Add to Queue</Btn>
      </div>

      {status && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: status.running ? "#00e676" : "#444" }}>
              {status.running ? "● Running" : "○ Idle"}
            </span>
            <span style={{ fontSize: 11, color: "#555" }}>{status.pending} URL{status.pending !== 1 ? "s" : ""} pending</span>
            {status.pending > 0 && <Btn onClick={clear} variant="red">Clear</Btn>}
          </div>
          {(status.items || []).map((item, i) => (
            <div key={i} style={{
              fontSize: 11, padding: "4px 8px", borderBottom: "1px solid #111", color: "#888"
            }}>
              <span style={{ color: "#333" }}>{i + 1}.</span> {item.url}
              <span style={{ color: "#2a2a3a", marginLeft: 8, fontSize: 10 }}>
                {item.delay}s{item.warmup ? " +warmup" : ""}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("Live");
  const [domain, setDomain] = useState(null);
  const [domains, setDomains] = useState([]);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selectorFromDom, setSelectorFromDom] = useState("");

  // Load domains
  const loadDomains = useCallback(async () => {
    const data = await apiFetch("/domains");
    if (Array.isArray(data)) setDomains(data);
  }, []);

  useEffect(() => {
    loadDomains();
    const t = setInterval(loadDomains, 8000);
    return () => clearInterval(t);
  }, [loadDomains]);

  // SSE live feed
  useEffect(() => {
    let src;
    const connect = () => {
      src = new EventSource(API + "/live");
      src.onopen = () => setConnected(true);
      src.onerror = () => { setConnected(false); setTimeout(connect, 3000); };
      src.onmessage = (e) => {
        try {
          const item = JSON.parse(e.data);
          setEvents(prev => [item, ...prev].slice(0, 300));
          if (item.type === "dommap" || item.type === "debugger_status") loadDomains();
        } catch {}
      };
    };
    connect();
    return () => src?.close();
  }, [loadDomains]);

  const handleUseSelector = (sel) => {
    setSelectorFromDom(sel);
    setTab("Find");
  };

  return (
    <div style={{
      fontFamily: "'Courier New', monospace",
      background: "#080810", color: "#e0e0e0",
      height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      {/* Header */}
      <header style={{
        background: "#0b0b0f", borderBottom: "1px solid #1a1a2e",
        padding: "9px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0
      }}>
        <span style={{ fontSize: 15, color: "#00e676", letterSpacing: 3 }}>◈ SCRAPER</span>
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 3,
          border: connected ? "1px solid #00e676" : "1px solid #333",
          color: connected ? "#00e676" : "#444",
          background: connected ? "#00e67611" : "transparent"
        }}>{connected ? "LIVE" : "OFFLINE"}</span>
        <span style={{ fontSize: 11, color: "#333" }}>
          {connected ? "connected" : "reconnecting..."}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
          <Btn variant="yellow" onClick={() => {
            const a = document.createElement("a");
            a.href = API + "/export"; a.download = "all_data.zip";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
          }}>⬇ Export All</Btn>
          {domain && (
            <Btn variant="yellow" onClick={() => {
              const a = document.createElement("a");
              a.href = `${API}/export?domain=${encodeURIComponent(domain)}`;
              a.download = domain + ".zip";
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
            }}>⬇ Export Domain</Btn>
          )}
        </div>
      </header>

      <TabBar active={tab} onChange={setTab} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar domains={domains} active={domain} onSelect={setDomain} />
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {tab === "Live"      && <LiveTab events={events} onClear={() => setEvents([])} />}
          {tab === "Responses" && <ResponsesTab domain={domain} />}
          {tab === "Intel"     && <IntelTab domain={domain} />}
          {tab === "Tokens"    && <TokensTab domain={domain} />}
          {tab === "Endpoints" && <EndpointsTab domain={domain} />}
          {tab === "DOM Map"   && <DomMapTab domain={domain} onUseSelector={handleUseSelector} />}
          {tab === "Find"      && <FindTab domain={domain} selectorInit={selectorFromDom} />}
          {tab === "Navigate"  && <NavigateTab />}
          {tab === "Queue"     && <QueueTab />}
        </div>
      </div>
    </div>
  );
}