import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:8080";

const apiFetch = async (path, opts) => {
  try {
    const r = await fetch(API + path, opts);
    if (r.headers.get("content-type")?.includes("json")) return r.json();
    return {};
  } catch { return {}; }
};
const dqs = (d) => d ? `?domain=${encodeURIComponent(d)}` : "";

const T = {
  bg:"#07070c",bgCard:"#0c0c14",bgHover:"#111120",
  border:"#1c1c2e",border2:"#252538",
  green:"#00ff88",cyan:"#00e5ff",yellow:"#ffe066",
  orange:"#ff9500",red:"#ff4560",purple:"#b388ff",
  text:"#d0d0e8",textDim:"#606080",textMid:"#9090b0",
  font:"'JetBrains Mono','Fira Code','Cascadia Code',monospace",
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:${T.font};background:${T.bg};color:${T.text};height:100vh;overflow:hidden}
  ::-webkit-scrollbar{width:3px;height:3px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:${T.border2};border-radius:2px}
  *{scrollbar-width:thin;scrollbar-color:${T.border2} transparent}
  @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes fade-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slide-in{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  .fade-in{animation:fade-in .2s ease}
  .slide-in{animation:slide-in .15s ease}
  .spin{animation:spin 1s linear infinite;display:inline-block}
`;
if (!document.getElementById("scrapy-styles")) {
  const s = document.createElement("style");
  s.id = "scrapy-styles"; s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

const esc = (s) => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtTime = (ts) => new Date(ts||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"});

const TYPE_META = {
  request:{icon:"→",label:"REQ",color:T.green},
  response:{icon:"←",label:"RES",color:"#29d4f5"},
  response_body:{icon:"⬡",label:"BODY",color:"#448aff"},
  auth_cookie:{icon:"⚿",label:"AUTH",color:T.yellow},
  cookies:{icon:"◈",label:"COOKIE",color:T.orange},
  cookies_changed:{icon:"◌",label:"COOKIE△",color:"#333355"},
  websocket:{icon:"⟳",label:"WS",color:T.purple},
  dommap:{icon:"⊞",label:"DOM",color:T.cyan},
  debugger_status:{icon:"◉",label:"DBG",color:"#9c60ff"},
  html:{icon:"⌨",label:"HTML",color:T.green},
  screenshot:{icon:"⬜",label:"SHOT",color:"#ff6090"},
  storage:{icon:"⊟",label:"STORE",color:T.orange},
};
const getMeta = (t) => TYPE_META[t]||{icon:"·",label:(t||"?").slice(0,6).toUpperCase(),color:T.textDim};
const METHOD_COLOR = {GET:T.green,POST:T.orange,PUT:"#448aff",DELETE:T.red,PATCH:T.purple,HEAD:T.textDim};
const FLAG_COLORS = {BEARER_TOKEN:T.yellow,API:"#448aff",AUTH_FLOW:T.red,CF_CLEARANCE:T.orange,POST_DATA:T.purple,CLOUDFLARE:T.orange,WEBSOCKET:T.cyan,BASIC_AUTH:T.yellow};

// ── Base components ───────────────────────────────────────────────────────────
const Label = ({text,color=T.textDim}) => (
  <span style={{fontSize:9,padding:"2px 5px",borderRadius:2,letterSpacing:.5,border:`1px solid ${color}33`,color,background:color+"0f",fontFamily:T.font,whiteSpace:"nowrap",fontWeight:500}}>{text}</span>
);
const SectionHead = ({children,action}) => (
  <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:2,padding:"14px 0 6px",borderBottom:`1px solid ${T.border}`,marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
    <span>{children}</span>{action}
  </div>
);
const Btn = ({children,onClick,variant="green",small,disabled,style:sx}) => {
  const pal = {green:[T.green,T.green+"18"],red:[T.red,T.red+"18"],yellow:[T.yellow,T.yellow+"18"],ghost:[T.textDim,T.border],cyan:[T.cyan,T.cyan+"18"],orange:[T.orange,T.orange+"18"]};
  const [c,bg] = pal[variant]||pal.green;
  const [hov,setHov] = useState(false);
  return <button onClick={onClick} disabled={disabled} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
    style={{background:hov?c:bg,border:`1px solid ${c}${hov?"ff":"66"}`,color:hov?T.bg:c,padding:small?"2px 8px":"4px 12px",cursor:disabled?"not-allowed":"pointer",fontFamily:T.font,fontSize:small?9:11,borderRadius:3,transition:"all .1s",opacity:disabled?.4:1,...sx}}>{children}</button>;
};
const Input = ({value,onChange,placeholder,onKeyDown,style:sx}) => (
  <input value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown}
    style={{background:T.bgCard,border:`1px solid ${T.border2}`,color:T.text,padding:"5px 10px",fontFamily:T.font,fontSize:11,borderRadius:3,outline:"none",transition:"border .15s",...sx}}
    onFocus={e=>e.target.style.borderColor=T.green+"88"} onBlur={e=>e.target.style.borderColor=T.border2}
  />
);
const Toolbar = ({children}) => (
  <div style={{padding:"8px 12px",background:T.bgCard,borderBottom:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>{children}</div>
);
const TypeBadge = ({type,small}) => {
  const {icon,label,color} = getMeta(type);
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:small?8:9,padding:small?"1px 4px":"2px 6px",borderRadius:2,whiteSpace:"nowrap",fontWeight:500,border:`1px solid ${color}33`,color,background:color+"0f",minWidth:small?40:56,justifyContent:"center"}}><span>{icon}</span><span style={{letterSpacing:.5}}>{label}</span></span>;
};
const MethodBadge = ({method}) => {
  const c = METHOD_COLOR[method]||T.textDim;
  return <span style={{fontSize:9,padding:"2px 5px",borderRadius:2,fontWeight:600,color:c,border:`1px solid ${c}33`,background:c+"0f",minWidth:34,textAlign:"center"}}>{method}</span>;
};
const Empty = ({icon="◌",message}) => (
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,opacity:.3}}>
    <div style={{fontSize:32,color:T.textDim}}>{icon}</div>
    <div style={{fontSize:11,color:T.textDim,textAlign:"center",lineHeight:1.7}}>{message}</div>
  </div>
);
const CodeBlock = ({data,maxHeight=220}) => {
  const [col,setCol] = useState(false);
  const content = typeof data==="string"?data:JSON.stringify(data,null,2);
  return (
    <div style={{position:"relative"}}>
      <div onClick={()=>setCol(c=>!c)} style={{position:"absolute",top:5,right:7,zIndex:1,fontSize:8,color:T.textDim,cursor:"pointer",background:T.bg,padding:"1px 5px",borderRadius:2}}>{col?"▼ expand":"▲ collapse"}</div>
      {!col && <pre style={{background:T.bg,padding:"8px 10px",borderRadius:3,fontSize:10,overflowX:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all",maxHeight,overflowY:"auto",color:T.textMid,lineHeight:1.6,border:`1px solid ${T.border}`}}>{content}</pre>}
    </div>
  );
};
const ReqCard = ({req,defaultOpen}) => {
  const [open,setOpen] = useState(defaultOpen||false);
  const m = req.method||req.reqMethod||"GET";
  return (
    <div className="fade-in" style={{border:`1px solid ${T.border}`,borderRadius:4,marginBottom:4,overflow:"hidden",background:T.bgCard}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"6px 10px",display:"flex",alignItems:"center",gap:6,cursor:"pointer",background:open?T.bgHover:"transparent",transition:"background .1s"}}
        onMouseEnter={e=>e.currentTarget.style.background=T.bgHover} onMouseLeave={e=>e.currentTarget.style.background=open?T.bgHover:"transparent"}>
        <span style={{color:T.textDim,fontSize:9,width:8}}>{open?"▼":"▶"}</span>
        <MethodBadge method={m}/>
        <span style={{fontSize:10,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.text}}>{req.url}</span>
        <div style={{display:"flex",gap:3}}>{(req.flags||[]).slice(0,4).map(f=><Label key={f} text={f} color={FLAG_COLORS[f]||T.textDim}/>)}</div>
        {req.status && <span style={{fontSize:9,color:req.status>=400?T.red:T.green,fontWeight:600,minWidth:26}}>{req.status}</span>}
      </div>
      {open && <div style={{padding:"8px 10px",borderTop:`1px solid ${T.border}`}}>
        {(req.headers||req.reqHeaders) && <><div style={{fontSize:9,color:T.textDim,marginBottom:4}}>HEADERS</div><CodeBlock data={req.headers||req.reqHeaders} maxHeight={140}/></>}
        {(req.postData||req.reqPostData) && <><div style={{fontSize:9,color:T.orange,margin:"8px 0 4px"}}>POST DATA</div><CodeBlock data={req.postData||req.reqPostData} maxHeight={120}/></>}
        {req.body && <><div style={{fontSize:9,color:T.cyan,margin:"8px 0 4px"}}>BODY</div><CodeBlock data={req.body} maxHeight={240}/></>}
      </div>}
    </div>
  );
};
const TokenCard = ({token,domain}) => {
  const [copied,setCopied] = useState(false);
  return (
    <div className="fade-in" style={{background:T.bgCard,border:`1px solid ${T.yellow}22`,borderRadius:4,padding:"9px 12px",marginBottom:6}}>
      <div style={{fontSize:9,color:T.textDim,marginBottom:5,display:"flex",gap:10}}>
        {domain && <span style={{color:T.green}}>{domain}</span>}
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(token.url||"").slice(0,80)}</span>
      </div>
      <div onClick={()=>{navigator.clipboard.writeText("Bearer "+token.token).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),1400);}}
        style={{fontSize:10,color:T.yellow,wordBreak:"break-all",background:T.bg,padding:"6px 10px",borderRadius:3,cursor:"pointer",border:`1px solid ${T.yellow}22`,position:"relative"}}>
        Bearer {token.token}
        <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",fontSize:8,color:copied?T.green:T.textDim}}>{copied?"✓ copied":"click to copy"}</span>
      </div>
    </div>
  );
};
const CookieCard = ({cookie,domain}) => {
  const c = cookie.cookie||cookie;
  const [copied,setCopied] = useState(false);
  return (
    <div className="fade-in" style={{background:T.bgCard,border:`1px solid ${T.orange}22`,borderRadius:4,padding:"8px 12px",marginBottom:5}}>
      <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:4}}>
        {domain && <span style={{fontSize:9,color:T.green}}>{domain}</span>}
        <span style={{fontSize:11,color:T.yellow,fontWeight:500}}>{c.name}</span>
        {c.httpOnly && <Label text="httpOnly" color={T.orange}/>}
        {c.secure && <Label text="secure" color="#29b6f6"/>}
      </div>
      <div onClick={()=>{navigator.clipboard.writeText(c.value||"").catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),1400);}}
        style={{fontSize:10,color:copied?T.green:T.textMid,wordBreak:"break-all",cursor:"pointer",transition:"color .2s"}}>
        {(c.value||"").slice(0,300)}
      </div>
    </div>
  );
};

// ── Sidebar ───────────────────────────────────────────────────────────────────
const Sidebar = ({domains,active,onSelect}) => (
  <div style={{width:176,background:T.bgCard,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
    <div style={{padding:"10px 12px 8px",fontSize:9,color:T.textDim,letterSpacing:2,textTransform:"uppercase",borderBottom:`1px solid ${T.border}`}}>Domains</div>
    <div style={{flex:1,overflowY:"auto",padding:"5px 4px"}}>
      {domains.length===0 && <div style={{fontSize:10,color:"#2a2a40",padding:"10px 10px",lineHeight:1.6}}>No sessions yet.<br/>Track a tab to start.</div>}
      {domains.map(d => {
        const isActive = d===active;
        return <div key={d} onClick={()=>onSelect(d===active?null:d)} className="slide-in"
          style={{fontSize:10,padding:"6px 9px",borderRadius:3,cursor:"pointer",marginBottom:1,display:"flex",alignItems:"center",gap:6,color:isActive?T.green:T.textMid,background:isActive?T.green+"0d":"transparent",borderLeft:`2px solid ${isActive?T.green:"transparent"}`,transition:"all .12s"}}>
          <div style={{width:4,height:4,borderRadius:"50%",flexShrink:0,background:isActive?T.green:T.border2,animation:isActive?"pulse-dot 2s infinite":"none"}}/>
          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{d}</span>
        </div>;
      })}
    </div>
  </div>
);

// ── TabBar ────────────────────────────────────────────────────────────────────
const TABS = ["Live","Responses","Intel","Tokens","Endpoints","DOM","Find","Nav","Queue"];
const TabBar = ({active,onChange}) => (
  <div style={{display:"flex",background:T.bgCard,borderBottom:`1px solid ${T.border}`,flexShrink:0,overflowX:"auto"}}>
    {TABS.map(t => {
      const isActive = active===t;
      return <button key={t} onClick={()=>onChange(t)}
        style={{background:"none",border:"none",borderBottom:isActive?`2px solid ${T.green}`:"2px solid transparent",borderTop:"2px solid transparent",color:isActive?T.green:T.textDim,padding:"9px 14px",cursor:"pointer",fontSize:10,fontFamily:T.font,fontWeight:isActive?600:400,letterSpacing:1,transition:"all .12s",whiteSpace:"nowrap"}}
        onMouseEnter={e=>{if(!isActive)e.target.style.color=T.textMid;}}
        onMouseLeave={e=>{if(!isActive)e.target.style.color=T.textDim;}}>{t}</button>;
    })}
  </div>
);

// ── LIVE ──────────────────────────────────────────────────────────────────────
const LiveTab = ({events,onClear}) => {
  const [filter,setFilter] = useState("all");
  const TYPE_FILTERS = [["all","All"],["request","Requests"],["response_body","Bodies"],["auth","Auth"],["websocket","WS"],["dommap","DOM"]];
  const filtered = filter==="all"?events:events.filter(e=>e.type===filter||(filter==="auth"&&["auth_cookie","storage","cookies"].includes(e.type)));
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <Toolbar>
        <div style={{display:"flex",gap:4,flex:1,flexWrap:"wrap"}}>
          {TYPE_FILTERS.map(([val,lbl])=>(
            <button key={val} onClick={()=>setFilter(val)}
              style={{background:filter===val?T.green+"20":"transparent",border:`1px solid ${filter===val?T.green+"66":T.border}`,color:filter===val?T.green:T.textDim,padding:"3px 9px",cursor:"pointer",fontFamily:T.font,fontSize:9,borderRadius:3}}>{lbl}</button>
          ))}
        </div>
        <Btn variant="ghost" small onClick={onClear}>Clear</Btn>
      </Toolbar>
      <div style={{flex:1,overflowY:"auto"}}>
        {filtered.length===0 && <Empty icon="◎" message={"No events yet.\nTrack a tab to start capturing."}/>}
        {filtered.map((item,i)=>(
          <div key={i} style={{fontSize:10,padding:"4px 10px",borderBottom:`1px solid ${T.bg}`,display:"flex",gap:8,alignItems:"center"}}
            onMouseEnter={e=>e.currentTarget.style.background=T.bgHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <TypeBadge type={item.type} small/>
            <span style={{fontSize:9,color:T.green,minWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.domain||""}</span>
            <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.textMid}}>{item.url||item.cookie?.name||""}</span>
            <span style={{fontSize:8,color:T.border2,flexShrink:0}}>{fmtTime(item.timestamp)}</span>
          </div>
        ))}
      </div>
      <div style={{padding:"4px 12px",borderTop:`1px solid ${T.border}`,fontSize:9,color:T.textDim}}>{filtered.length} events</div>
    </div>
  );
};

// ── RESPONSES ─────────────────────────────────────────────────────────────────
const ResponsesTab = ({domain}) => {
  const [data,setData] = useState([]);
  const [sel,setSel] = useState(null);
  const [filter,setFilter] = useState("");
  const load = useCallback(()=>{apiFetch("/responses"+dqs(domain)).then(d=>setData(Array.isArray(d)?d:[]));}, [domain]);
  useEffect(()=>{load();},[load]);
  const filtered = data.filter(r=>!filter||(r.url||"").toLowerCase().includes(filter.toLowerCase()));
  return (
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      <div style={{width:400,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <Toolbar><Input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter URL..." style={{flex:1}}/><Btn variant="ghost" small onClick={load}>↻</Btn></Toolbar>
        <div style={{flex:1,overflowY:"auto"}}>
          {filtered.length===0 && <Empty icon="←" message="No responses captured.\nTrack a tab and browse."/>}
          {filtered.map((r,i)=>{
            const isSel=sel===i;
            const sc=r.status>=400?T.red:r.status>=300?T.yellow:T.green;
            return <div key={i} onClick={()=>setSel(isSel?null:i)}
              style={{padding:"6px 10px",borderBottom:`1px solid ${T.bg}`,cursor:"pointer",background:isSel?T.green+"0a":"transparent",borderLeft:`2px solid ${isSel?T.green:"transparent"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                <span style={{fontSize:9,fontWeight:700,color:sc,minWidth:26}}>{r.status}</span>
                <span style={{fontSize:9,color:T.textDim,minWidth:28}}>{r.reqMethod||"GET"}</span>
                <span style={{fontSize:10,color:T.textMid,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(r.url||"").replace(/https?:\/\/[^/]+/,"")}</span>
              </div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {(r.flags||[]).map(f=><Label key={f} text={f} color={FLAG_COLORS[f]||T.textDim}/>)}
                {r.body && <Label text="body" color={T.cyan}/>}
              </div>
            </div>;
          })}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:12}}>
        {sel==null ? <Empty icon="←" message="Select a response to inspect"/> : <div className="fade-in"><ReqCard req={filtered[sel]} defaultOpen/></div>}
      </div>
    </div>
  );
};

// ── INTEL ─────────────────────────────────────────────────────────────────────
const IntelTab = ({domain}) => {
  const [data,setData] = useState(null);
  const load = useCallback(()=>{if(!domain)return;apiFetch("/intel?domain="+encodeURIComponent(domain)).then(setData);},[domain]);
  useEffect(()=>{load();},[load]);
  if(!domain) return <Empty icon="⊕" message="Select a domain from the sidebar"/>;
  if(!data) return <Empty icon="◌" message="Loading..."/>;
  return (
    <div style={{padding:12,overflowY:"auto",flex:1}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:8,marginBottom:14}}>
        {[["Bearer Tokens",data.tokens?.length||0,T.yellow],["Auth Cookies",data.auth?.length||0,T.orange],["API Endpoints",data.endpoints?.length||0,"#448aff"],["DOM Map",data.dommap?"✓":"—",data.dommap?T.cyan:T.border2]].map(([lbl,val,color])=>(
          <div key={lbl} style={{background:T.bgCard,border:`1px solid ${color}22`,borderRadius:4,padding:"12px 14px"}}>
            <div style={{fontSize:8,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>{lbl}</div>
            <div style={{fontSize:24,color,fontWeight:700}}>{val}</div>
          </div>
        ))}
      </div>
      {data.tokens?.length>0 && (<><SectionHead>Bearer Tokens</SectionHead>{data.tokens.map((t,i)=><TokenCard key={i} token={t}/>)}</>)}
      {data.auth?.length>0 && (<><SectionHead>Auth Cookies</SectionHead>{data.auth.map((c,i)=><CookieCard key={i} cookie={c}/>)}</>)}
      {data.endpoints?.length>0 && (<><SectionHead>API Endpoints ({data.endpoints.length})</SectionHead>{data.endpoints.map((e,i)=><ReqCard key={i} req={e}/>)}</>)}
    </div>
  );
};

// ── TOKENS ────────────────────────────────────────────────────────────────────
const TokensTab = ({domain}) => {
  const [tokens,setTokens] = useState([]);
  const [auth,setAuth] = useState({});
  const load = useCallback(()=>{apiFetch("/tokens"+dqs(domain)).then(d=>setTokens(Array.isArray(d)?d:[]));apiFetch("/auth"+dqs(domain)).then(d=>setAuth(d&&typeof d==="object"?d:{}));},[domain]);
  useEffect(()=>{load();},[load]);
  return (
    <div style={{padding:12,overflowY:"auto",flex:1}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><Btn small variant="ghost" onClick={load}>↻ Refresh</Btn></div>
      <SectionHead>Bearer Tokens ({tokens.length})</SectionHead>
      {tokens.length===0 && <div style={{fontSize:11,color:T.textDim,padding:"8px 0"}}>None yet.</div>}
      {tokens.map((t,i)=><TokenCard key={i} token={t} domain={t.domain}/>)}
      <SectionHead>Auth Cookies</SectionHead>
      {Object.entries(auth).flatMap(([d,items])=>items.map((item,i)=><CookieCard key={d+i} cookie={item} domain={d}/>))}
    </div>
  );
};

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────
const EndpointsTab = ({domain}) => {
  const [data,setData] = useState({});
  const load = useCallback(()=>{apiFetch("/endpoints"+dqs(domain)).then(setData);},[domain]);
  useEffect(()=>{load();},[load]);
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <Toolbar><span style={{fontSize:10,color:T.textDim,flex:1}}>{Object.values(data).flat().length} endpoints</span><Btn small variant="ghost" onClick={load}>↻</Btn></Toolbar>
      <div style={{flex:1,overflowY:"auto",padding:12}}>
        {Object.entries(data).length===0 && <Empty icon="⊡" message="No endpoints yet.\nTrack a tab and browse."/>}
        {Object.entries(data).map(([d,eps])=>(
          <div key={d}><SectionHead>{d} ({eps.length})</SectionHead>{eps.map((e,i)=><ReqCard key={i} req={e}/>)}</div>
        ))}
      </div>
    </div>
  );
};

// ── DOM MAP ───────────────────────────────────────────────────────────────────
const TreeNode = ({label,count,color,children,onLeafClick,depth=0}) => {
  const [open,setOpen] = useState(depth<1);
  const hasKids = children&&children.length>0;
  return (
    <div style={{marginLeft:depth*14}}>
      <div onClick={()=>hasKids?setOpen(o=>!o):onLeafClick?.(label)}
        style={{display:"flex",alignItems:"center",gap:5,padding:"3px 6px",borderRadius:3,cursor:"pointer"}}
        onMouseEnter={e=>e.currentTarget.style.background=T.bgHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <span style={{fontSize:8,color:T.textDim,width:8}}>{hasKids?(open?"▼":"▶"):" "}</span>
        <span style={{fontSize:10,color:color||T.text}}>{label}</span>
        {count!==undefined && <span style={{fontSize:8,color:T.textDim}}>×{count}</span>}
      </div>
      {open&&hasKids && <div className="fade-in">{children.map((c,i)=><TreeNode key={i} {...c} depth={depth+1} onLeafClick={onLeafClick}/>)}</div>}
    </div>
  );
};

const DomTab = ({domain,onUseSelector}) => {
  const [data,setData] = useState(null);
  const [view,setView] = useState("tree");
  const [search,setSearch] = useState("");
  const load = useCallback(()=>{
    apiFetch("/dommaps"+dqs(domain)).then(raw=>{
      const maps = domain?(raw||[]):Object.values(raw||{}).flat();
      const latest = maps[maps.length-1];
      setData(latest?(latest.dommap||latest):null);
    });
  },[domain]);
  useEffect(()=>{load();},[load]);

  if(!data) return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <Toolbar><span style={{fontSize:10,color:T.textDim}}>DOM Map</span><Btn small variant="ghost" onClick={load}>↻</Btn></Toolbar>
      <Empty icon="⊞" message={"No DOM map yet.\nTrack a tab — the extension maps every page load automatically."}/>
    </div>
  );

  const q = search.toLowerCase();
  const filt = (items,keyFn) => items.filter(i=>!q||keyFn(i).toLowerCase().includes(q));
  const tags    = filt(data.tags||[],t=>t.tag);
  const classes = filt(data.classes||[],c=>c.name);
  const ids     = filt(data.ids||[],id=>id);

  const Chip = ({label,color}) => (
    <span onClick={()=>onUseSelector(label)}
      style={{display:"inline-block",fontSize:10,padding:"2px 6px",borderRadius:2,background:color+"11",color,border:`1px solid ${color}33`,margin:2,cursor:"pointer",transition:"all .1s"}}
      onMouseEnter={e=>{e.currentTarget.style.background=color;e.currentTarget.style.color=T.bg;}}
      onMouseLeave={e=>{e.currentTarget.style.background=color+"11";e.currentTarget.style.color=color;}}
    >{label}</span>
  );

  const treeData = [
    {label:`Tags (${tags.length})`,color:T.textDim,children:tags.map(t=>({label:t.tag,count:t.count,color:T.cyan}))},
    {label:`Classes (${classes.length})`,color:T.textDim,children:classes.slice(0,200).map(c=>({label:"."+c.name,count:c.count,color:T.green}))},
    {label:`IDs (${ids.length})`,color:T.textDim,children:ids.map(id=>({label:"#"+id,color:T.yellow}))},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <Toolbar>
        <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{flex:1}}/>
        {["tree","flat"].map(v=>(
          <button key={v} onClick={()=>setView(v)}
            style={{background:view===v?T.green+"20":"transparent",border:`1px solid ${view===v?T.green+"66":T.border}`,color:view===v?T.green:T.textDim,padding:"3px 9px",cursor:"pointer",fontFamily:T.font,fontSize:9,borderRadius:3}}>{v}</button>
        ))}
        <Btn small variant="ghost" onClick={load}>↻</Btn>
      </Toolbar>
      <div style={{padding:"5px 10px 4px",fontSize:9,color:T.textDim,borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        {data.url && <span style={{color:T.textMid}}>{data.url.slice(0,80)}</span>}
        <span style={{marginLeft:8,color:T.green+"88"}}>click any item → auto-scrape</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:10}}>
        {view==="tree"
          ? treeData.map((n,i)=><TreeNode key={i} {...n} depth={0} onLeafClick={onUseSelector}/>)
          : (<>
              <SectionHead>Tags ({tags.length})</SectionHead>
              <div style={{marginBottom:12}}>{tags.map(t=><Chip key={t.tag} label={t.tag} color={T.cyan}/>)}</div>
              <SectionHead>Classes ({classes.length})</SectionHead>
              <div style={{marginBottom:12}}>{classes.slice(0,200).map(c=><Chip key={c.name} label={"."+c.name} color={T.green}/>)}</div>
              <SectionHead>IDs ({ids.length})</SectionHead>
              <div>{ids.map(id=><Chip key={id} label={"#"+id} color={T.yellow}/>)}</div>
            </>)}
      </div>
    </div>
  );
};

// ── FIND TAB — navigate + track + wait DOM + extract ─────────────────────────
const FindTab = ({domain,selectorInit}) => {
  const [url,setUrl]           = useState("");
  const [selector,setSelector] = useState(selectorInit||"");
  const [results,setResults]   = useState(null);
  const [phase,setPhase]       = useState("idle"); // idle|navigating|waiting_dom|extracting|done|error
  const [statusMsg,setStatusMsg] = useState("");
  const pollRef = useRef(null);

  useEffect(()=>{if(selectorInit)setSelector(selectorInit);},[selectorInit]);
  useEffect(()=>()=>{if(pollRef.current)clearInterval(pollRef.current);},[]);

  const getDomain = (u)=>{try{return new URL(u).hostname.replace(/^www\./,"");}catch{return "";}};

  const run = async () => {
    if(!selector.trim()||!url.trim()) return;
    if(pollRef.current) clearInterval(pollRef.current);
    setResults(null);
    setPhase("navigating");
    setStatusMsg("Opening tab in Brave and attaching tracker…");

    const navResp = await apiFetch("/navigate",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({url})
    });
    if(navResp?.error){setPhase("error");setStatusMsg("Navigation failed: "+navResp.error);return;}

    const targetDomain = getDomain(url);
    setPhase("waiting_dom");
    setStatusMsg(`Waiting for page to render… (${targetDomain})`);

    let attempts = 0;
    const MAX = 40;

    pollRef.current = setInterval(async()=>{
      attempts++;
      if(attempts>MAX){
        clearInterval(pollRef.current);
        setPhase("error");
        setStatusMsg("Timed out. Make sure the extension is active and the page loaded.");
        return;
      }
      setStatusMsg(`Waiting for page render… (${attempts*500}ms elapsed)`);
      const dommaps = await apiFetch("/dommaps?domain="+encodeURIComponent(targetDomain));
      const maps = Array.isArray(dommaps)?dommaps:Object.values(dommaps||{}).flat();
      if(maps.length===0) return;

      clearInterval(pollRef.current);
      setPhase("extracting");
      setStatusMsg("Page captured! Running selector against live HTML…");

      // Try direct scrape first (rust_finder on fetched HTML)
      let finalResult = await apiFetch(
        "/scrape?url="+encodeURIComponent(url)+"&selector="+encodeURIComponent(selector)+"&limit=100"
      );

      // Fallback: use /find against already-captured HTML files for this domain
      if((!finalResult?.matches?.length)&&!finalResult?.error){
        const findResult = await apiFetch("/find?selector="+encodeURIComponent(selector)+"&domain="+encodeURIComponent(targetDomain));
        if(findResult?.results?.length){
          const matches = findResult.results.flatMap(r=>r.matches||[]);
          finalResult = {...findResult,url,selector,count:matches.length,matches};
        }
      }

      setResults(finalResult);
      setPhase("done");
      setStatusMsg("");
    },500);
  };

  const cancel = ()=>{
    if(pollRef.current) clearInterval(pollRef.current);
    setPhase("idle");setStatusMsg("");setResults(null);
  };

  const isRunning = ["navigating","waiting_dom","extracting"].includes(phase);
  const PHASE_STEPS = [
    ["navigating","Open Tab"],
    ["waiting_dom","Render"],
    ["extracting","Extract"],
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <Toolbar>
        <Input value={url} onChange={e=>setUrl(e.target.value)}
          placeholder="https://books.toscrape.com/catalogue/page-1.html"
          onKeyDown={e=>e.key==="Enter"&&run()} style={{flex:2,minWidth:200}}/>
        <Input value={selector} onChange={e=>setSelector(e.target.value)}
          placeholder="p.price_color, h2.title, a[href]"
          onKeyDown={e=>e.key==="Enter"&&run()} style={{flex:1,minWidth:140}}/>
        {!isRunning
          ? <Btn onClick={run} disabled={!url.trim()||!selector.trim()}>⟶ Scrape</Btn>
          : <Btn onClick={cancel} variant="red">✕ Cancel</Btn>}
      </Toolbar>

      {/* How it works */}
      <div style={{padding:"5px 12px",background:T.cyan+"08",borderBottom:`1px solid ${T.cyan}18`,fontSize:9,color:T.textDim,display:"flex",alignItems:"center",gap:6}}>
        <span style={{color:T.cyan}}>⊞</span>
        <span>Opens URL in a real Brave tab → extension tracks it live → DOM captured → selector runs against real rendered HTML. JS executes. No puppeteer.</span>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:12}}>

        {/* Phase status bar */}
        {(isRunning||phase==="error"||phase==="done") && (
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:12,borderRadius:4,
            background:phase==="error"?T.red+"0d":phase==="done"?T.green+"0d":T.cyan+"0d",
            border:`1px solid ${phase==="error"?T.red:phase==="done"?T.green:T.cyan}22`}}>
            <span className={isRunning?"spin":""} style={{fontSize:14,color:phase==="error"?T.red:phase==="done"?T.green:T.cyan}}>
              {phase==="error"?"✕":phase==="done"?"✓":"◌"}
            </span>
            <div>
              <div style={{fontSize:11,color:phase==="error"?T.red:phase==="done"?T.green:T.cyan,marginBottom:2}}>
                {phase==="navigating"&&"Opening tab…"}
                {phase==="waiting_dom"&&"Waiting for page render…"}
                {phase==="extracting"&&"Extracting elements…"}
                {phase==="error"&&"Failed"}
                {phase==="done"&&`Done — ${results?.count||0} match${results?.count!==1?"es":""}`}
              </div>
              {statusMsg && <div style={{fontSize:9,color:T.textDim}}>{statusMsg}</div>}
            </div>
            {isRunning && (
              <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
                {PHASE_STEPS.map(([p,lbl],i)=>{
                  const phases=["navigating","waiting_dom","extracting"];
                  const idx=phases.indexOf(phase);
                  const done=idx>i,active=idx===i;
                  return <div key={p} style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:16,height:16,borderRadius:"50%",border:`1px solid ${active?T.cyan:done?T.green:T.border2}`,background:done?T.green+"33":active?T.cyan+"22":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:active?T.cyan:done?T.green:T.textDim}}>{done?"✓":i+1}</div>
                    <span style={{fontSize:8,color:active?T.cyan:done?T.green:T.textDim}}>{lbl}</span>
                    {i<2&&<span style={{fontSize:8,color:T.border2}}>→</span>}
                  </div>;
                })}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results&&!results.error&&(results.matches||[]).length>0 && (
          <>
            <div style={{fontSize:10,color:T.textDim,marginBottom:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <Label text={`${results.count} match${results.count!==1?"es":""}`} color={T.green}/>
              <span>selector: <span style={{color:T.green}}>{results.selector}</span></span>
              {results.url && <span style={{color:T.textDim}}>from: <span style={{color:T.cyan}}>{results.url.slice(0,50)}</span></span>}
              <Btn small variant="ghost" onClick={()=>navigator.clipboard.writeText(results.matches.map(m=>m.text).join("\n")).catch(()=>{})}>Copy Text</Btn>
              <Btn small variant="ghost" onClick={()=>navigator.clipboard.writeText(JSON.stringify(results.matches,null,2)).catch(()=>{})}>Copy JSON</Btn>
            </div>
            {(results.matches||[]).map((m,i)=>(
              <div key={i} className="fade-in" style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:4,marginBottom:4,overflow:"hidden"}}>
                <div style={{padding:"6px 10px",display:"flex",gap:8,alignItems:"baseline"}}>
                  <Label text={`<${m.tag}>`} color={T.cyan}/>
                  <span style={{fontSize:10,color:T.text,flex:1}}>{(m.text||"").slice(0,120)}</span>
                  {(m.attrs||[]).filter(([k])=>["href","src","class","id"].includes(k)).map(([k,v])=>(
                    <span key={k} style={{fontSize:9,color:T.textDim}}>{k}=<span style={{color:T.textMid}}>{v.slice(0,40)}</span></span>
                  ))}
                </div>
                <pre style={{background:T.bg,padding:"5px 10px",fontSize:9,color:T.textMid,overflowX:"auto",maxHeight:120,overflowY:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all",borderTop:`1px solid ${T.border}`}}>
                  {(m.html||"").slice(0,500)}
                </pre>
              </div>
            ))}
          </>
        )}

        {results?.error && (
          <div style={{color:T.red,padding:12,background:T.red+"0d",borderRadius:3,fontSize:11}}>✕ {results.error}</div>
        )}

        {/* Idle examples */}
        {phase==="idle"&&!results && (
          <div style={{padding:"20px 10px"}}>
            <div style={{fontSize:10,color:T.textDim,marginBottom:14}}>Quick examples:</div>
            {[
              ["https://books.toscrape.com","p.price_color","Book prices"],
              ["https://news.ycombinator.com","span.titleline a","HN headlines"],
              ["https://quotes.toscrape.com","span.text","Quotes"],
            ].map(([u,sel,desc])=>(
              <div key={u} onClick={()=>{setUrl(u);setSelector(sel);}}
                style={{padding:"8px 12px",marginBottom:4,borderRadius:3,cursor:"pointer",background:T.bgCard,border:`1px solid ${T.border}`,display:"flex",gap:10,alignItems:"center"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=T.green+"44"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                <span style={{fontSize:9,color:T.textDim,minWidth:60}}>{desc}</span>
                <span style={{fontSize:10,color:T.textMid,flex:1}}>{u}</span>
                <Label text={sel} color={T.green}/>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── NAV ───────────────────────────────────────────────────────────────────────
const NavTab = () => {
  const [url,setUrl] = useState("");
  const [msg,setMsg] = useState("");
  const [msgType,setMsgType] = useState("ok");
  const [tracking,setTracking] = useState(false);
  const notify=(text,type="ok",ms=2500)=>{setMsg(text);setMsgType(type);if(ms<9999)setTimeout(()=>setMsg(""),ms);};
  const nav=async()=>{if(!url.trim())return;notify(`Opening ${url}…`,"ok",9999);await apiFetch("/navigate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});setUrl("");notify("Tab opened + tracking started ✓");};
  const cmd=async(command,label)=>{notify(`${label}…`,"ok",9999);await apiFetch("/cmd",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({command})});if(command==="track")setTracking(true);if(command==="untrack")setTracking(false);notify(`${label} ✓`);};
  return (
    <div style={{padding:16,overflowY:"auto",flex:1}}>
      <SectionHead>Navigate + Auto-Track</SectionHead>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <Input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&nav()} placeholder="https://..." style={{flex:1}}/>
        <Btn onClick={nav}>Open + Track</Btn>
      </div>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:4,padding:"10px 14px",marginBottom:14}}>
        <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Active Tab Tracking</div>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",marginBottom:10,background:tracking?T.green+"0a":T.border+"20",border:`1px solid ${tracking?T.green+"44":T.border}`,borderRadius:3}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:tracking?T.green:T.textDim,animation:tracking?"pulse-dot 1.5s infinite":"none"}}/>
          <span style={{fontSize:10,color:tracking?T.green:T.textDim}}>{tracking?"Tracking active":"Not tracking"}</span>
        </div>
        <div style={{fontSize:9,color:T.textDim,lineHeight:1.9,marginBottom:10,padding:"8px 10px",background:T.bg+"80",borderRadius:3,border:`1px solid ${T.border}`}}>
          <strong style={{color:T.cyan}}>Tip:</strong> Click the Scrapy icon in Brave's toolbar to track/capture while on the site.
        </div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          <Btn onClick={()=>cmd("track","Track")} variant={tracking?"ghost":"green"}>● Track Active Tab</Btn>
          <Btn onClick={()=>cmd("untrack","Untrack")} variant="red" disabled={!tracking}>○ Untrack</Btn>
        </div>
      </div>
      <SectionHead>Page Commands</SectionHead>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
        {[["cookies","◈ Cookies"],["storage","⊟ Storage"],["html","⌨ HTML"],["screenshot","⬜ Screenshot"]].map(([c,lbl])=>(
          <Btn key={c} onClick={()=>cmd(c,lbl)} variant="ghost">{lbl}</Btn>
        ))}
      </div>
      {msg && <div style={{fontSize:11,padding:"7px 12px",borderRadius:3,color:msgType==="ok"?T.green:T.red,background:(msgType==="ok"?T.green:T.red)+"0d",border:`1px solid ${(msgType==="ok"?T.green:T.red)}33`}}>{msg}</div>}
    </div>
  );
};

// ── QUEUE ─────────────────────────────────────────────────────────────────────
const QueueTab = () => {
  const [urls,setUrls] = useState("");
  const [delay,setDelay] = useState(6);
  const [warmup,setWarmup] = useState(true);
  const [status,setStatus] = useState(null);
  const load=async()=>{const d=await apiFetch("/queue");setStatus(d);};
  useEffect(()=>{load();const t=setInterval(load,3000);return()=>clearInterval(t);},[]);
  const add=async()=>{const list=urls.split("\n").map(u=>u.trim()).filter(Boolean);if(!list.length)return;await apiFetch("/queue/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({urls:list,delay,warmup})});setUrls("");load();};
  const clear=async()=>{await apiFetch("/queue/clear",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});load();};
  return (
    <div style={{padding:12,overflowY:"auto",flex:1}}>
      <SectionHead>Batch URL Queue</SectionHead>
      <textarea value={urls} onChange={e=>setUrls(e.target.value)} placeholder={"https://example.com/page1\nhttps://example.com/page2"}
        style={{width:"100%",height:90,background:T.bgCard,border:`1px solid ${T.border2}`,color:T.text,padding:8,fontFamily:T.font,fontSize:11,borderRadius:3,resize:"vertical",marginBottom:8,outline:"none"}}
        onFocus={e=>e.target.style.borderColor=T.green+"66"} onBlur={e=>e.target.style.borderColor=T.border2}/>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
        <label style={{fontSize:10,color:T.textDim}}>Delay (sec):</label>
        <input type="number" value={delay} onChange={e=>setDelay(+e.target.value)} min={1} max={60}
          style={{width:55,background:T.bgCard,border:`1px solid ${T.border2}`,color:T.text,padding:"3px 8px",fontFamily:T.font,fontSize:11,borderRadius:3,outline:"none"}}/>
        <label style={{fontSize:10,color:T.textDim,display:"flex",alignItems:"center",gap:5}}>
          <input type="checkbox" checked={warmup} onChange={e=>setWarmup(e.target.checked)}/> Warmup
        </label>
        <Btn onClick={add}>Add to Queue</Btn>
      </div>
      {status && (
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:4,padding:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:status.running?T.green:T.textDim,animation:status.running?"pulse-dot 1.5s infinite":"none"}}/>
            <span style={{fontSize:11,color:status.running?T.green:T.textDim}}>{status.running?"Running":"Idle"}</span>
            <span style={{fontSize:10,color:T.textDim}}>{status.pending} pending</span>
            {status.pending>0 && <Btn onClick={clear} variant="red" small>Clear All</Btn>}
          </div>
          {(status.items||[]).map((item,i)=>(
            <div key={i} style={{fontSize:10,padding:"4px 8px",borderBottom:`1px solid ${T.border}`,color:T.textMid,display:"flex",gap:8}}>
              <span style={{color:T.textDim,minWidth:18}}>{i+1}.</span>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.url}</span>
              <span style={{fontSize:9,color:T.border2}}>{item.delay}s{item.warmup?" +warmup":""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]             = useState("Live");
  const [domain,setDomain]       = useState(null);
  const [domains,setDomains]     = useState([]);
  const [events,setEvents]       = useState([]);
  const [connected,setConnected] = useState(false);
  const [selectorFromDom,setSelectorFromDom] = useState("");

  const loadDomains = useCallback(async()=>{const d=await apiFetch("/domains");if(Array.isArray(d))setDomains(d);},[]);
  useEffect(()=>{loadDomains();const t=setInterval(loadDomains,8000);return()=>clearInterval(t);},[loadDomains]);

  useEffect(()=>{
    let src;
    const connect=()=>{
      src=new EventSource(API+"/live");
      src.onopen=()=>setConnected(true);
      src.onerror=()=>{setConnected(false);setTimeout(connect,3000);};
      src.onmessage=(e)=>{
        try{const item=JSON.parse(e.data);setEvents(prev=>[item,...prev].slice(0,500));if(["dommap","debugger_status"].includes(item.type))loadDomains();}catch{}
      };
    };
    connect();
    return()=>src?.close();
  },[loadDomains]);

  const handleUseSelector=(sel)=>{setSelectorFromDom(sel);setTab("Find");};
  const exportData=(d)=>{const a=document.createElement("a");a.href=d?`${API}/export?domain=${encodeURIComponent(d)}`:`${API}/export`;a.download=(d||"all_data")+".zip";document.body.appendChild(a);a.click();document.body.removeChild(a);};

  return (
    <div style={{fontFamily:T.font,background:T.bg,color:T.text,height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,136,.008) 2px,rgba(0,255,136,.008) 4px)"}}>
      <header style={{background:T.bgCard,borderBottom:`1px solid ${T.border}`,padding:"8px 16px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <span style={{fontSize:14,color:T.green,letterSpacing:3,fontWeight:700}}>◈ SCRAPY</span>
        <span style={{fontSize:8,color:T.textDim,letterSpacing:1}}>v2.1</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:connected?T.green:T.red,animation:connected?"pulse-dot 2s infinite":"none"}}/>
          <span style={{fontSize:9,color:connected?T.green:T.red,letterSpacing:1}}>{connected?"LIVE":"OFFLINE"}</span>
        </div>
        <span style={{fontSize:9,color:T.textDim}}>{events.length} events</span>
        {domain && (
          <div style={{padding:"3px 9px",borderRadius:3,border:`1px solid ${T.green}33`,background:T.green+"0a",fontSize:9,color:T.green,display:"flex",alignItems:"center",gap:5}}>
            <span style={{color:T.textDim}}>scope:</span>{domain}
            <span onClick={()=>setDomain(null)} style={{cursor:"pointer",color:T.textDim,marginLeft:2}}>×</span>
          </div>
        )}
        <div style={{marginLeft:"auto",display:"flex",gap:7}}>
          <Btn variant="yellow" small onClick={()=>exportData()}>⬇ Export All</Btn>
          {domain && <Btn variant="yellow" small onClick={()=>exportData(domain)}>⬇ {domain}</Btn>}
        </div>
      </header>
      <TabBar active={tab} onChange={setTab}/>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        <Sidebar domains={domains} active={domain} onSelect={setDomain}/>
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {tab==="Live"      && <LiveTab events={events} onClear={()=>setEvents([])}/>}
          {tab==="Responses" && <ResponsesTab domain={domain}/>}
          {tab==="Intel"     && <IntelTab domain={domain}/>}
          {tab==="Tokens"    && <TokensTab domain={domain}/>}
          {tab==="Endpoints" && <EndpointsTab domain={domain}/>}
          {tab==="DOM"       && <DomTab domain={domain} onUseSelector={handleUseSelector}/>}
          {tab==="Find"      && <FindTab domain={domain} selectorInit={selectorFromDom}/>}
          {tab==="Nav"       && <NavTab/>}
          {tab==="Queue"     && <QueueTab/>}
        </div>
      </div>
    </div>
  );
}