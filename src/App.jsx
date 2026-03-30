import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

/* ─── SUPABASE ───────────────────────────────────────────────────────── */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

async function loadAll() {
  try {
    const { data, error } = await supabase
      .from("app_data")
      .select("data")
      .eq("id", "main")
      .single();
    if (error || !data) return null;
    return data.data;
  } catch (e) {
    console.error("Load failed:", e);
    return null;
  }
}

async function saveAll(users, transactions) {
  try {
    const { error } = await supabase
      .from("app_data")
      .upsert({ id: "main", data: { users, transactions } });
    if (error) console.error("Save failed:", error);
  } catch (e) {
    console.error("Save error:", e);
  }
}

/* ─── CONSTANTS ─────────────────────────────────────────────────────── */
const LOAD_PRESETS = [100, 200, 500];
const SEED_USERS = [
  { id: "economia",  name: "Economía Admin", password: "CargarSaldo", role: "economia",  balance: 0 },
  { id: "cafeteria", name: "Cafeteria",       password: "Admin123",    role: "cafeteria", balance: 0 },
];

/* ─── THEME ─────────────────────────────────────────────────────────── */
const c = {
  bg: "#F7F5F0", card: "#FFFFFF",
  green: "#2A6049", greenLight: "#E6F2EE",
  teal: "#5BBAC2", tealLight: "#EAF6F8",
  text: "#1C1C1C", muted: "#8A8A8A", border: "#E5E2DA",
  danger: "#C94040", dangerLight: "#FDEAEA",
  orange: "#C97A20", orangeLight: "#FEF3E2",
};

const inputStyle = {
  padding: "12px 14px", borderRadius: 10,
  border: `1.5px solid ${c.border}`, background: c.card,
  fontSize: 15, color: c.text, fontFamily: "'Nunito', sans-serif",
  width: "100%", outline: "none",
};

/* ─── ROOT ──────────────────────────────────────────────────────────── */
export default function App() {
  const [appUsers, setAppUsers]         = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [currentUser, setCurrentUser]   = useState(null);
  const [ready, setReady]               = useState(false);

  useEffect(() => {
    (async () => {
      const data = await loadAll();
      if (data) {
        setAppUsers(data.users || SEED_USERS);
        setTransactions(data.transactions || []);
      } else {
        setAppUsers(SEED_USERS);
        setTransactions([]);
        await saveAll(SEED_USERS, []);
      }
      setReady(true);
    })();
  }, []);

  // Single storage call — users and transactions always saved together
  const persist = async (newUsers, newTxns) => {
    setAppUsers(newUsers);
    setTransactions(newTxns);
    await saveAll(newUsers, newTxns);
  };

  /* ── actions ── */
  const login = (name, password) => {
    const u = appUsers.find(u => u.name.trim().toLowerCase() === name.trim().toLowerCase() && u.password === password);
    if (u) { setCurrentUser(u); return true; }
    return false;
  };

  const logout = () => setCurrentUser(null);

  const credit = async (userId, amount) => {
    const newUsers = appUsers.map(u => u.id === userId ? { ...u, balance: u.balance + amount } : u);
    const txn = { id: `${Date.now()}`, userId, type: "credit", amount, date: new Date().toISOString() };
    const newTxns = [txn, ...transactions];
    await persist(newUsers, newTxns);
  };

  const debit = async (userId, amount) => {
    const newUsers = appUsers.map(u => u.id === userId ? { ...u, balance: u.balance - amount } : u);
    const txn = { id: `${Date.now()}`, userId, type: "debit", amount, date: new Date().toISOString() };
    const newTxns = [txn, ...transactions];
    await persist(newUsers, newTxns);
    return { updatedUsers: newUsers };
  };

  const revert = async (txnId) => {
    const txn = transactions.find(t => t.id === txnId);
    if (!txn || txn.reverted) return;
    // Debit revert → devuelve saldo (+). Credit revert → quita saldo (−).
    const delta = txn.type === "debit" ? txn.amount : -txn.amount;
    const newUsers = appUsers.map(u => u.id === txn.userId ? { ...u, balance: u.balance + delta } : u);
    const newTxns  = transactions.map(t => t.id === txnId ? { ...t, reverted: true } : t);
    await persist(newUsers, newTxns);
  };

  const createUser = async (name, password) => {
    const newUser = { id: `${Date.now()}`, name: name.trim(), password, role: "user", balance: 0 };
    const newUsers = [...appUsers, newUser];
    await persist(newUsers, transactions);
    return newUser;
  };

  const changePassword = async (userId, newPassword) => {
    const newUsers = appUsers.map(u => u.id === userId ? { ...u, password: newPassword } : u);
    await persist(newUsers, transactions);
    if (currentUser?.id === userId) setCurrentUser(prev => ({ ...prev, password: newPassword }));
  };

  if (!ready) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"Georgia", color:c.muted, background:c.bg }}>
      Cargando...
    </div>
  );

  const volunteers = appUsers.filter(u => u.role === "user");
  const shared = { appUsers, volunteers, transactions, currentUser, credit, debit, revert, createUser, changePassword, logout };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Nunito:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { cursor: pointer; border: none; font-family: 'Nunito', sans-serif; }
        input { font-family: 'Nunito', sans-serif; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>
      <div style={{ minHeight:"100vh", background:c.bg, fontFamily:"'Nunito', sans-serif", maxWidth:480, margin:"0 auto" }}>
        {!currentUser
          ? <LoginView login={login} />
          : currentUser.role === "economia"  ? <EconomiaView  {...shared} />
          : currentUser.role === "cafeteria" ? <CafeteriaView {...shared} />
          : <SaldoView {...shared} />
        }
      </div>
    </>
  );
}

/* ─── LOGIN ─────────────────────────────────────────────────────────── */
function LoginView({ login }) {
  const [name, setName]   = useState("");
  const [pw, setPw]       = useState("");
  const [err, setErr]     = useState(false);

  const handleLogin = () => {
    const ok = login(name, pw);
    if (!ok) { setErr(true); setTimeout(() => setErr(false), 3000); }
  };

  return (
    <div style={{ padding:"64px 28px 0", display:"flex", flexDirection:"column", alignItems:"center" }}>
      <div style={{ fontSize:48, marginBottom:14 }}>☕</div>
      <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:30, color:c.text, fontWeight:700, textAlign:"center", lineHeight:1.1, marginBottom:6 }}>
        Cafetería Camelot
      </h1>
      <p style={{ color:c.muted, fontSize:14, marginBottom:40 }}>Ingresá con tu usuario</p>

      <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:12 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Usuario" style={inputStyle} autoFocus />
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Contraseña" style={inputStyle}
          onKeyDown={e => e.key === "Enter" && handleLogin()} />
        {err && <p style={{ color:c.danger, fontSize:13, fontWeight:600, textAlign:"center" }}>⚠ Usuario o contraseña incorrectos</p>}
        <Btn onClick={handleLogin} bg={c.green} color="#FFF" style={{ marginTop:4 }}>Ingresar</Btn>
      </div>
    </div>
  );
}

/* ─── ECONOMÍA ──────────────────────────────────────────────────────── */
function EconomiaView({ appUsers, volunteers, transactions, currentUser, credit, revert, createUser, changePassword, logout }) {
  const [tab, setTab]           = useState("cargar");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);
  const [newName, setNewName]   = useState("");
  const [newPw, setNewPw]       = useState("");
  const [showNew, setShowNew]   = useState(false);
  const [custom, setCustom]     = useState("");
  const [flash, setFlash]       = useState(null);

  const filtered = volunteers.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));

  const handleLoad = async (amount, user = selected) => {
    await credit(user.id, amount);
    setFlash({ name: user.name, amount });
    setSelected(null); setSearch("");
    setTimeout(() => setFlash(null), 3000);
  };

  const handleCustomLoad = () => {
    const amt = parseInt(custom);
    if (!amt || amt <= 0) return;
    handleLoad(amt); setCustom("");
  };

  const handleCreateUser = async () => {
    if (!newName.trim() || !newPw.trim()) return;
    await createUser(newName, newPw);
    setShowNew(false); setNewName(""); setNewPw("");
    setFlash({ name: newName.trim(), amount: null });
    setTimeout(() => setFlash(null), 3000);
  };

  const TABS = [
    { id:"cargar",    label:"Cargar" },
    { id:"historial", label:"Historial" },
    { id:"reporte",   label:"Reporte" },
    { id:"usuarios",  label:"Usuarios" },
  ];

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding:"16px 20px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${c.border}`, background:c.card, position:"sticky", top:0, zIndex:10 }}>
        <h2 style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:700, color:c.text }}>Economía</h2>
        <button onClick={logout} style={{ background:"none", color:c.muted, fontSize:13, fontWeight:600 }}>Salir</button>
      </div>

      <div style={{ padding:"16px 20px 0" }}>
        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:18, background:c.bg, borderRadius:12, padding:4, border:`1px solid ${c.border}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSelected(null); setSearch(""); }}
              style={{ flex:1, padding:"8px 0", borderRadius:9, fontWeight:700, fontSize:12,
                background: tab===t.id ? c.green : "transparent",
                color: tab===t.id ? "#FFF" : c.muted }}>
              {t.label}
            </button>
          ))}
        </div>

        {flash && (
          <Alert color={c.green} light={c.greenLight}>
            {flash.amount !== null ? <>✓ Se cargaron <strong>${flash.amount}</strong> a {flash.name}</> : <>✓ Usuario <strong>{flash.name}</strong> creado</>}
          </Alert>
        )}

        {/* ── CARGAR ── */}
        {tab === "cargar" && (!selected ? (
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar voluntario…" />
            <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
              {filtered.length > 0
                ? filtered.map(u => <UserRow key={u.id} user={u} onClick={() => setSelected(u)} showBalance />)
                : <EmptyMsg text={search ? `No se encontró "${search}"` : "No hay voluntarios aún"} />}
            </div>
          </>
        ) : (
          <>
            <UserCard user={selected} appUsers={appUsers} onBack={() => setSelected(null)} />
            <p style={{ fontWeight:700, marginBottom:12, color:c.text }}>Importe a cargar</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
              {LOAD_PRESETS.map(amt => (
                <button key={amt} onClick={() => handleLoad(amt)}
                  style={{ padding:"18px 8px", borderRadius:14, background:c.green, color:"#FFF", fontWeight:700, fontSize:20 }}>
                  ${amt}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input type="number" value={custom} onChange={e => setCustom(e.target.value)} placeholder="Otro monto" style={{ ...inputStyle, flex:1 }} />
              <Btn onClick={handleCustomLoad} bg={c.teal} color="#FFF" style={{ paddingLeft:20, paddingRight:20 }}>Cargar</Btn>
            </div>
          </>
        ))}

        {/* ── HISTORIAL ── */}
        {tab === "historial" && <HistorialCargas appUsers={appUsers} transactions={transactions} revert={revert} />}

        {/* ── REPORTE ── */}
        {tab === "reporte" && <RegistrosInner appUsers={appUsers} transactions={transactions} />}

        {/* ── USUARIOS ── */}
        {tab === "usuarios" && (
          <UsuariosAdmin
            appUsers={appUsers} changePassword={changePassword}
            showNew={showNew} setShowNew={setShowNew}
            newName={newName} setNewName={setNewName}
            newPw={newPw} setNewPw={setNewPw}
            handleCreateUser={handleCreateUser}
          />
        )}
      </div>
    </div>
  );
}

function HistorialCargas({ appUsers, transactions, revert }) {
  const [revertFlash, setRevertFlash] = useState(null);
  const userName = (uid) => appUsers.find(u => u.id === uid)?.name ?? "Desconocido";
  const fmt = (d) => new Date(d).toLocaleDateString("es-UY", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
  const credits = transactions.filter(t => t.type === "credit");

  const handleRevert = async (txnId) => {
    const txn = transactions.find(t => t.id === txnId);
    await revert(txnId);
    setRevertFlash(`Se anuló la carga de $${txn.amount} a ${userName(txn.userId)}`);
    setTimeout(() => setRevertFlash(null), 3000);
  };

  const downloadExcel = () => {
    const rows = credits.map(t => ({
      Voluntario: userName(t.userId),
      "Fecha y hora": fmt(t.date),
      "Monto ($)": t.amount,
      Estado: t.reverted ? "Anulado" : "Activo",
    }));
    const total = credits.filter(t => !t.reverted).reduce((s, t) => s + t.amount, 0);
    rows.push({});
    rows.push({ Voluntario: "TOTAL ACTIVO", "Fecha y hora": "", "Monto ($)": total, Estado: "" });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch:24 }, { wch:20 }, { wch:12 }, { wch:12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Historial cargas");
    XLSX.writeFile(wb, "camelot_historial_cargas.xlsx");
  };

  if (credits.length === 0) return <EmptyMsg text="Todavía no se registraron cargas" />;

  return (
    <div>
      {revertFlash && <Alert color={c.orange} light={c.orangeLight}>↩ {revertFlash}</Alert>}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
        <button onClick={downloadExcel}
          style={{ background:c.green, color:"#FFF", borderRadius:10, padding:"9px 16px", fontWeight:700, fontSize:13 }}>
          ⬇ Excel
        </button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {credits.map(t => (
          <div key={t.id} style={{ background: t.reverted ? "#FAFAFA" : c.card, borderRadius:12, padding:"12px 14px", border:`1px solid ${c.border}`, opacity: t.reverted ? 0.55 : 1 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <p style={{ fontWeight:600, fontSize:14, color:c.text }}>{userName(t.userId)}</p>
                <p style={{ color:c.muted, fontSize:12, marginTop:2 }}>{fmt(t.date)}</p>
                {t.reverted && <p style={{ color:c.orange, fontSize:11, fontWeight:600, marginTop:3 }}>ANULADO</p>}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontWeight:700, color:c.green, fontSize:15, textDecoration: t.reverted ? "line-through" : "none" }}>
                  +${t.amount}
                </span>
                {!t.reverted && (
                  <button onClick={() => handleRevert(t.id)}
                    style={{ background:c.orangeLight, color:c.orange, border:`1px solid ${c.orange}40`, borderRadius:8, padding:"5px 11px", fontSize:12, fontWeight:700 }}>
                    Anular
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsuariosAdmin({ appUsers, changePassword, showNew, setShowNew, newName, setNewName, newPw, setNewPw, handleCreateUser }) {
  const [editingId, setEditingId]   = useState(null);
  const [editPw, setEditPw]         = useState("");
  const [pwFlash, setPwFlash]       = useState(null);

  const handleChangePw = async (userId) => {
    if (!editPw.trim()) return;
    await changePassword(userId, editPw.trim());
    setPwFlash(userId);
    setEditingId(null); setEditPw("");
    setTimeout(() => setPwFlash(null), 3000);
  };

  const volunteers = appUsers.filter(u => u.role === "user");

  return (
    <div>
      {pwFlash && <Alert color={c.green} light={c.greenLight}>✓ Contraseña actualizada</Alert>}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <p style={{ fontWeight:700, color:c.text }}>Voluntarios ({volunteers.length})</p>
        <button onClick={() => setShowNew(v => !v)}
          style={{ background:c.green, color:"#FFF", borderRadius:9, padding:"7px 14px", fontWeight:700, fontSize:13 }}>
          + Nuevo
        </button>
      </div>

      {showNew && (
        <div style={{ background:c.card, borderRadius:14, padding:16, border:`1px solid ${c.border}`, marginBottom:14 }}>
          <p style={{ fontWeight:600, marginBottom:10, color:c.text }}>Nuevo usuario</p>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre" style={inputStyle} autoFocus />
            <input value={newPw}   onChange={e => setNewPw(e.target.value)}   placeholder="Contraseña" style={inputStyle}
              onKeyDown={e => e.key==="Enter" && handleCreateUser()} />
          </div>
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <Btn onClick={handleCreateUser} bg={c.green} color="#FFF">Crear</Btn>
            <Btn onClick={() => { setShowNew(false); setNewName(""); setNewPw(""); }} bg={c.bg} color={c.muted} border={`1px solid ${c.border}`}>Cancelar</Btn>
          </div>
        </div>
      )}

      {volunteers.length === 0
        ? <EmptyMsg text="No hay voluntarios aún" />
        : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {volunteers.map(u => (
              <div key={u.id} style={{ background:c.card, borderRadius:12, border:`1px solid ${c.border}`, overflow:"hidden" }}>
                <div style={{ padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:c.greenLight, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:c.green, fontSize:14, fontFamily:"'Playfair Display', serif" }}>
                      {u.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontWeight:600, fontSize:14, color:c.text }}>{u.name}</p>
                      <p style={{ color:c.muted, fontSize:12 }}>Saldo: ${u.balance}</p>
                    </div>
                  </div>
                  <button onClick={() => { setEditingId(editingId===u.id ? null : u.id); setEditPw(""); }}
                    style={{ background:c.bg, color:c.muted, border:`1px solid ${c.border}`, borderRadius:8, padding:"5px 11px", fontSize:12, fontWeight:700 }}>
                    {editingId===u.id ? "Cancelar" : "🔑 Clave"}
                  </button>
                </div>
                {editingId===u.id && (
                  <div style={{ padding:"0 14px 14px", borderTop:`1px solid ${c.border}`, paddingTop:12 }}>
                    <div style={{ display:"flex", gap:8 }}>
                      <input value={editPw} onChange={e => setEditPw(e.target.value)} placeholder="Nueva contraseña"
                        style={{ ...inputStyle, flex:1, fontSize:13 }} autoFocus
                        onKeyDown={e => e.key==="Enter" && handleChangePw(u.id)} />
                      <Btn onClick={() => handleChangePw(u.id)} bg={c.green} color="#FFF" style={{ fontSize:13, paddingLeft:16, paddingRight:16 }}>Guardar</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

/* ─── CAFETERÍA ─────────────────────────────────────────────────────── */
function CafeteriaView({ appUsers, volunteers, transactions, debit, revert, logout }) {
  const [tab, setTab]                 = useState("cobrar");
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState(null);
  const [custom, setCustom]           = useState("");
  const [flash, setFlash]             = useState(null);
  const [err, setErr]                 = useState(null);
  const [revertFlash, setRevertFlash] = useState(null);

  const filtered = volunteers.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));
  const liveUser = selected ? appUsers.find(u => u.id === selected.id) : null;
  const userName = (uid) => appUsers.find(u => u.id === uid)?.name ?? "—";
  const fmtTime  = (d) => new Date(d).toLocaleTimeString("es-UY", { hour:"2-digit", minute:"2-digit" });
  const fmtFull  = (d) => new Date(d).toLocaleDateString("es-UY", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });

  const allDebits = transactions.filter(t => t.type === "debit");

  const handleDebit = async (amount) => {
    if (!liveUser || liveUser.balance < amount) {
      setErr(`Saldo insuficiente (disponible: $${liveUser?.balance ?? 0})`);
      setTimeout(() => setErr(null), 3000); return;
    }
    const { updatedUsers } = await debit(selected.id, amount);
    const after = updatedUsers.find(u => u.id === selected.id)?.balance ?? 0;
    setFlash({ amount, after, name: selected.name });
    setSelected(null); setSearch("");
    setTimeout(() => setFlash(null), 5000);
  };

  const handleCustomDebit = () => {
    const amt = parseInt(custom);
    if (!amt || amt <= 0) return;
    handleDebit(amt); setCustom("");
  };

  const handleRevert = async (txnId) => {
    const txn  = transactions.find(t => t.id === txnId);
    const user = appUsers.find(u => u.id === txn?.userId);
    await revert(txnId);
    setRevertFlash(`Se anuló el cobro de $${txn.amount} a ${user?.name}`);
    setTimeout(() => setRevertFlash(null), 3000);
  };

  const TABS = [{ id:"cobrar", label:"Cobrar" }, { id:"transacciones", label:"Transacciones" }];

  return (
    <div style={{ paddingBottom:40 }}>
      <div style={{ padding:"16px 20px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${c.border}`, background:c.card, position:"sticky", top:0, zIndex:10 }}>
        <h2 style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:700, color:c.text }}>Cafetería</h2>
        <button onClick={logout} style={{ background:"none", color:c.muted, fontSize:13, fontWeight:600 }}>Salir</button>
      </div>
      <div style={{ padding:"16px 20px 0" }}>
        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:18, background:c.bg, borderRadius:12, padding:4, border:`1px solid ${c.border}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSelected(null); setSearch(""); }}
              style={{ flex:1, padding:"9px 0", borderRadius:9, fontWeight:700, fontSize:14,
                background: tab===t.id ? c.teal : "transparent",
                color: tab===t.id ? "#FFF" : c.muted }}>
              {t.label}
            </button>
          ))}
        </div>

        {flash && <Alert color="#1A6A70" light={c.tealLight}>✓ Cobro de <strong>${flash.amount}</strong> a {flash.name} · Saldo restante: <strong>${flash.after}</strong></Alert>}
        {revertFlash && <Alert color={c.orange} light={c.orangeLight}>↩ {revertFlash}</Alert>}
        {err && <Alert color={c.danger} light={c.dangerLight}>⚠ {err}</Alert>}

        {/* ── TAB COBRAR ── */}
        {tab === "cobrar" && (!selected ? (
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar voluntario…" />
            <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
              {filtered.length > 0
                ? filtered.map(u => <UserRow key={u.id} user={u} onClick={() => setSelected(u)} showBalance />)
                : <EmptyMsg text={search ? `No se encontró "${search}"` : "No hay voluntarios aún"} />}
            </div>
          </>
        ) : (
          <>
            <div style={{ background:c.tealLight, borderRadius:14, padding:"18px 20px", marginBottom:20, border:`1px solid ${c.teal}40` }}>
              <p style={{ color:"#1A6A70", fontSize:13 }}>Voluntario</p>
              <p style={{ fontWeight:700, fontSize:20, fontFamily:"'Playfair Display', serif", color:c.text, marginTop:2 }}>{liveUser?.name}</p>
              <p style={{ color:"#1A6A70", fontWeight:700, fontSize:26, marginTop:6 }}>
                ${liveUser?.balance}<span style={{ fontSize:13, fontWeight:500, opacity:0.65 }}> disponible</span>
              </p>
            </div>
            <p style={{ fontWeight:700, marginBottom:12, color:c.text }}>¿Cuánto consumió?</p>
            <div style={{ display:"flex", gap:8 }}>
              <input type="number" value={custom} onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key==="Enter" && handleCustomDebit()}
                placeholder="Ej: 153" style={{ ...inputStyle, flex:1, fontSize:22, fontWeight:700 }} autoFocus />
              <Btn onClick={handleCustomDebit} bg={c.teal} color="#FFF" style={{ paddingLeft:24, paddingRight:24, fontSize:17 }}>Cobrar</Btn>
            </div>
            <button onClick={() => setSelected(null)} style={{ marginTop:14, background:"none", color:c.muted, fontSize:13, fontWeight:600 }}>
              ‹ Volver
            </button>
          </>
        ))}

        {/* ── TAB TRANSACCIONES ── */}
        {tab === "transacciones" && (
          allDebits.length === 0
            ? <EmptyMsg text="No hay transacciones aún" />
            : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {allDebits.map(t => (
                  <div key={t.id} style={{ background: t.reverted ? "#FAFAFA" : c.card, borderRadius:12, padding:"12px 14px", border:`1px solid ${c.border}`, opacity: t.reverted ? 0.55 : 1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <p style={{ fontWeight:600, fontSize:14, color:c.text }}>{userName(t.userId)}</p>
                        <p style={{ color:c.muted, fontSize:12, marginTop:2 }}>{fmtFull(t.date)}</p>
                        {t.reverted && <p style={{ color:c.orange, fontSize:11, fontWeight:600, marginTop:3 }}>ANULADO</p>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontWeight:700, color:c.danger, fontSize:15, textDecoration: t.reverted?"line-through":"none" }}>
                          −${t.amount}
                        </span>
                        {!t.reverted && (
                          <button onClick={() => handleRevert(t.id)}
                            style={{ background:c.orangeLight, color:c.orange, border:`1px solid ${c.orange}40`, borderRadius:8, padding:"5px 11px", fontSize:12, fontWeight:700 }}>
                            Anular
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  );
}

/* ─── MI SALDO ──────────────────────────────────────────────────────── */
function SaldoView({ currentUser, appUsers, transactions, logout }) {
  const liveUser = appUsers.find(u => u.id === currentUser.id);
  const txns = transactions.filter(t => t.userId === currentUser.id && t.type !== "revert").slice(0, 50);
  const fmt = (d) => new Date(d).toLocaleDateString("es-UY", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });

  return (
    <div style={{ paddingBottom:40 }}>
      <div style={{ padding:"16px 20px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${c.border}`, background:c.card, position:"sticky", top:0, zIndex:10 }}>
        <h2 style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:700, color:c.text }}>Mi Saldo</h2>
        <button onClick={logout} style={{ background:"none", color:c.muted, fontSize:13, fontWeight:600 }}>Salir</button>
      </div>
      <div style={{ padding:"20px 20px 0" }}>
        <div style={{ background:c.card, borderRadius:16, padding:"28px 20px 22px", marginBottom:24, border:`1px solid ${c.border}`, textAlign:"center", boxShadow:"0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ width:60, height:60, borderRadius:"50%", background:c.green, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", fontSize:26, color:"#FFF", fontWeight:700, fontFamily:"'Playfair Display', serif" }}>
            {liveUser?.name[0].toUpperCase()}
          </div>
          <p style={{ fontFamily:"'Playfair Display', serif", fontSize:22, fontWeight:700, color:c.text }}>{liveUser?.name}</p>
          <p style={{ color:c.muted, fontSize:13, marginTop:4 }}>Saldo disponible</p>
          <p style={{ fontSize:52, fontWeight:700, color:c.green, fontFamily:"'Playfair Display', serif", lineHeight:1.1, marginTop:8 }}>
            ${liveUser?.balance}
          </p>
        </div>

        <p style={{ fontWeight:700, marginBottom:10, color:c.text }}>Movimientos</p>
        {txns.length === 0
          ? <EmptyMsg text="Sin movimientos aún" />
          : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {txns.map(t => (
                <div key={t.id} style={{ background: t.reverted?"#FAFAFA":c.card, borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", border:`1px solid ${c.border}`, opacity:t.reverted?0.5:1 }}>
                  <div>
                    <p style={{ fontWeight:600, fontSize:14, color:c.text }}>
                      {t.type==="credit" ? "Carga de saldo" : t.reverted ? "Consumo (anulado)" : "Consumo cafetería"}
                    </p>
                    <p style={{ color:c.muted, fontSize:12, marginTop:2 }}>{fmt(t.date)}</p>
                  </div>
                  <p style={{ fontWeight:700, fontSize:16, color:t.type==="credit"?c.green:c.danger, textDecoration:t.reverted?"line-through":"none" }}>
                    {t.type==="credit"?"+":"−"}${t.amount}
                  </p>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

/* ─── REGISTROS INNER ───────────────────────────────────────────────── */
function RegistrosInner({ appUsers, transactions }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const userName = (uid) => appUsers.find(u => u.id === uid)?.name ?? "Desconocido";
  const fmt = (d) => new Date(d).toLocaleTimeString("es-UY", { hour:"2-digit", minute:"2-digit" });

  // Group by YYYY-MM-DD (ISO, locale-safe) then display nicely
  const isoDay = (d) => d.slice(0, 10); // "2026-03-30"
  const displayDay = (iso) => {
    const [y,m,d] = iso.split("-");
    const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
  };

  const byDate = {};
  transactions.filter(t => t.type === "debit" && !t.reverted).forEach(t => {
    const day = isoDay(t.date);
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(t);
  });

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const downloadExcel = (date) => {
    const txns = byDate[date];
    const summary = {};
    txns.forEach(t => {
      const name = userName(t.userId);
      if (!summary[name]) summary[name] = { Voluntario: name, Consumos: 0, "Total ($)": 0 };
      summary[name].Consumos++;
      summary[name]["Total ($)"] += t.amount;
    });
    const summaryRows = Object.values(summary).sort((a,b) => b["Total ($)"] - a["Total ($)"]);
    const totalRow = { Voluntario:"TOTAL", Consumos: summaryRows.reduce((s,r)=>s+r.Consumos,0), "Total ($)": summaryRows.reduce((s,r)=>s+r["Total ($)"],0) };
    const detailRows = txns.map(t => ({ Hora: fmt(t.date), Voluntario: userName(t.userId), "Importe ($)": t.amount }));
    const wb = XLSX.utils.book_new();
    const wsSum = XLSX.utils.json_to_sheet([...summaryRows, totalRow]);
    wsSum["!cols"] = [{ wch:28 }, { wch:12 }, { wch:14 }];
    XLSX.utils.book_append_sheet(wb, wsSum, "Resumen");
    const wsDet = XLSX.utils.json_to_sheet(detailRows);
    wsDet["!cols"] = [{ wch:10 }, { wch:28 }, { wch:14 }];
    XLSX.utils.book_append_sheet(wb, wsDet, "Detalle");
    XLSX.writeFile(wb, `camelot_${date}.xlsx`);
  };

  const dayTxns  = selectedDate ? byDate[selectedDate] : [];
  const dayTotal = dayTxns.reduce((s,t) => s + t.amount, 0);

  return (
    <div>
      {selectedDate && (
        <button onClick={() => setSelectedDate(null)} style={{ background:"none", color:c.muted, fontSize:13, fontWeight:700, marginBottom:14, padding:0 }}>
          ‹ Todos los días
        </button>
      )}
      {!selectedDate ? (
        dates.length === 0 ? <EmptyMsg text="Todavía no hay consumos registrados" /> : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {dates.map(date => {
              const txns  = byDate[date];
              const total = txns.reduce((s,t) => s + t.amount, 0);
              return (
                <button key={date} onClick={() => setSelectedDate(date)}
                  style={{ background:c.card, border:`1px solid ${c.border}`, borderRadius:14, padding:"16px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", textAlign:"left" }}>
                  <div>
                    <p style={{ fontWeight:700, fontSize:16, color:c.text }}>{displayDay(date)}</p>
                    <p style={{ color:c.muted, fontSize:13, marginTop:3 }}>{txns.length} consumo{txns.length!==1?"s":""}</p>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <p style={{ fontWeight:700, fontSize:18, color:c.green }}>${total}</p>
                    <p style={{ color:c.muted, fontSize:12, marginTop:2 }}>total</p>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div>
              <p style={{ fontWeight:700, fontSize:18, color:c.text }}>{displayDay(selectedDate)}</p>
              <p style={{ color:c.muted, fontSize:13 }}>{dayTxns.length} consumos · Total ${dayTotal}</p>
            </div>
            <button onClick={() => downloadExcel(selectedDate)}
              style={{ background:c.green, color:"#FFF", borderRadius:10, padding:"10px 16px", fontWeight:700, fontSize:13 }}>
              ⬇ Excel
            </button>
          </div>
          {(() => {
            const summary = {};
            dayTxns.forEach(t => {
              const name = userName(t.userId);
              if (!summary[name]) summary[name] = { name, total:0, count:0 };
              summary[name].total += t.amount; summary[name].count++;
            });
            return (
              <div style={{ marginBottom:20 }}>
                <p style={{ fontWeight:700, fontSize:13, color:c.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Resumen del día</p>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {Object.values(summary).sort((a,b)=>b.total-a.total).map(s => (
                    <div key={s.name} style={{ background:c.card, borderRadius:10, padding:"11px 14px", display:"flex", justifyContent:"space-between", border:`1px solid ${c.border}` }}>
                      <span style={{ fontWeight:600, color:c.text }}>{s.name}</span>
                      <span style={{ fontWeight:700, color:c.green }}>${s.total} <span style={{ color:c.muted, fontWeight:500, fontSize:12 }}>({s.count} consumo{s.count!==1?"s":""})</span></span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <p style={{ fontWeight:700, fontSize:13, color:c.muted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Detalle</p>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {dayTxns.map(t => (
              <div key={t.id} style={{ background:c.card, borderRadius:10, padding:"11px 14px", display:"flex", justifyContent:"space-between", border:`1px solid ${c.border}` }}>
                <div>
                  <p style={{ fontWeight:600, fontSize:14, color:c.text }}>{userName(t.userId)}</p>
                  <p style={{ color:c.muted, fontSize:12 }}>{fmt(t.date)}</p>
                </div>
                <span style={{ fontWeight:700, color:c.danger }}>−${t.amount}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── SHARED COMPONENTS ─────────────────────────────────────────────── */
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div style={{ position:"relative" }}>
      <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:16, opacity:0.4 }}>🔍</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, paddingLeft:36 }} />
    </div>
  );
}

function UserRow({ user, onClick, showBalance }) {
  return (
    <button onClick={onClick} style={{ background:c.card, border:`1px solid ${c.border}`, borderRadius:12, padding:"13px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", textAlign:"left" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:38, height:38, borderRadius:"50%", background:c.greenLight, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:c.green, fontSize:15, fontFamily:"'Playfair Display', serif" }}>
          {user.name[0].toUpperCase()}
        </div>
        <span style={{ fontWeight:600, color:c.text, fontSize:15 }}>{user.name}</span>
      </div>
      {showBalance && <span style={{ fontWeight:700, color:user.balance>0?c.green:c.muted, fontSize:15 }}>${user.balance}</span>}
    </button>
  );
}

function UserCard({ user, appUsers, onBack }) {
  const live = appUsers.find(u => u.id === user.id) || user;
  return (
    <div style={{ background:c.greenLight, borderRadius:14, padding:"14px 18px", marginBottom:18, border:`1px solid ${c.green}25`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div>
        <p style={{ color:c.green, fontSize:12 }}>Voluntario</p>
        <p style={{ fontWeight:700, fontSize:18, fontFamily:"'Playfair Display', serif", color:c.text, marginTop:1 }}>{live.name}</p>
        <p style={{ color:c.green, fontWeight:700, fontSize:16, marginTop:2 }}>Saldo: ${live.balance}</p>
      </div>
      <button onClick={onBack} style={{ background:"none", color:c.green, fontSize:13, fontWeight:700 }}>‹ Volver</button>
    </div>
  );
}

function Alert({ color, light, children }) {
  return (
    <div style={{ background:light, border:`1px solid ${color}30`, borderRadius:12, padding:"12px 16px", marginBottom:14, color, fontWeight:600, fontSize:14, lineHeight:1.5 }}>
      {children}
    </div>
  );
}

function EmptyMsg({ text }) {
  return <p style={{ color:c.muted, textAlign:"center", padding:"28px 0", fontSize:14 }}>{text}</p>;
}

function Btn({ onClick, bg, color, border, children, style={} }) {
  return (
    <button onClick={onClick} style={{ padding:"12px 16px", borderRadius:12, background:bg, color, fontWeight:700, fontSize:15, border:border||"none", flex:1, ...style }}>
      {children}
    </button>
  );
}
