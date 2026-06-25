import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Upload, X, ExternalLink, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Broker, Client } from '../types';

interface ClientsPageProps {
  brokers: Broker[];
  properties: { id: string; client_id: string | null; client_ids?: string[] }[];
  onClientsChange: (clients: Client[]) => void;
}

interface ClientModalProps {
  client: Partial<Client> | null;
  brokers: Broker[];
  onClose: () => void;
  onSaved: (c: Client) => void;
  onDelete?: () => void;
}

function ClientModal({ client, brokers, onClose, onSaved, onDelete }: ClientModalProps) {
  const isEdit = !!client?.id;
  const [name, setName] = useState(client?.name ?? '');
  const [company, setCompany] = useState(client?.company ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [password, setPassword] = useState(client?.login_password ?? 'demo');
  const [website, setWebsite] = useState(client?.website ?? '');
  const [logoUrl, setLogoUrl] = useState(client?.logo_url ?? '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(client?.logo_url ?? '');
  const [fetching, setFetching] = useState(false);
  const [officeAddress, setOfficeAddress] = useState(client?.office_address ?? '');
  const [officeLat, setOfficeLat] = useState(client?.office_lat != null ? String(client.office_lat) : '');
  const [officeLng, setOfficeLng] = useState(client?.office_lng != null ? String(client.office_lng) : '');
  const [geoSuggestions, setGeoSuggestions] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const geoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geoWrapperRef = useRef<HTMLDivElement>(null);
  const [selectedBrokers, setSelectedBrokers] = useState<Set<string>>(
    new Set(client?.brokers?.map(b => b.id) ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const logoFileRef = useRef<HTMLInputElement>(null);

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  async function fetchLogo() {
    const domain = website.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    setFetching(true);
    const url = `https://logo.clearbit.com/${domain}`;
    setLogoUrl(url);
    setLogoPreview(url);
    setFetching(false);
  }

  function toggleBroker(id: string) {
    setSelectedBrokers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Debounced Nominatim geocoding
  useEffect(() => {
    if (geoDebounceRef.current) clearTimeout(geoDebounceRef.current);
    const q = officeAddress.trim();
    if (q.length < 4) { setGeoSuggestions([]); setShowSuggestions(false); return; }
    geoDebounceRef.current = setTimeout(async () => {
      setGeoLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setGeoSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        setGeoSuggestions([]);
      } finally {
        setGeoLoading(false);
      }
    }, 350);
    return () => { if (geoDebounceRef.current) clearTimeout(geoDebounceRef.current); };
  }, [officeAddress]);

  // Close suggestions on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (geoWrapperRef.current && !geoWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function selectSuggestion(s: { display_name: string; lat: string; lon: string }) {
    setOfficeAddress(s.display_name);
    setOfficeLat(parseFloat(s.lat).toFixed(6));
    setOfficeLng(parseFloat(s.lon).toFixed(6));
    setShowSuggestions(false);
    setGeoSuggestions([]);
  }

  async function handleSave() {
    if (!name.trim()) { setError('Full name is required.'); return; }
    if (!company.trim()) { setError('Company is required.'); return; }
    setSaving(true); setError('');
    try {
      let finalLogoUrl = logoUrl || client?.logo_url || null;
      if (logoFile) {
        const slug = company.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const ext = logoFile.name.split('.').pop()?.toLowerCase() ?? 'png';
        const path = `${slug}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('client-logos')
          .upload(path, logoFile, { upsert: false, contentType: logoFile.type });
        if (upErr) throw new Error(`Logo upload failed: ${upErr.message}`);
        const { data } = supabase.storage.from('client-logos').getPublicUrl(path);
        finalLogoUrl = data.publicUrl;
      }

      const payload = {
        name: name.trim(),
        company: company.trim(),
        email: email.trim() || null,
        login_password: password.trim() || 'demo',
        website: website.trim() || null,
        logo_url: finalLogoUrl,
        office_address: officeAddress.trim() || null,
        office_lat: officeLat !== '' ? parseFloat(officeLat) : null,
        office_lng: officeLng !== '' ? parseFloat(officeLng) : null,
      };

      let savedClient: Client;
      if (isEdit && client?.id) {
        const { data, error: dbErr } = await supabase.from('clients').update(payload).eq('id', client.id).select().single();
        if (dbErr) throw dbErr;
        savedClient = data as Client;
        // Sync broker assignments
        await supabase.from('client_brokers').delete().eq('client_id', client.id);
      } else {
        const { data, error: dbErr } = await supabase.from('clients').insert(payload).select().single();
        if (dbErr) throw dbErr;
        savedClient = data as Client;
      }

      if (selectedBrokers.size > 0) {
        const rows = Array.from(selectedBrokers).map(broker_id => ({ client_id: savedClient.id, broker_id }));
        await supabase.from('client_brokers').insert(rows);
      }

      savedClient.brokers = brokers.filter(b => selectedBrokers.has(b.id));
      onSaved(savedClient);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  const inp = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors";
  const inpStyle = { backgroundColor: 'white', border: '1px solid #dedad3', color: '#1e2624' };
  const focus = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#dedad3'; },
  };
  const lbl = "block text-xs font-semibold uppercase tracking-widest mb-1";
  const lblStyle = { color: '#7a8a87' };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: 'white', maxHeight: '90dvh' }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #e5e1d8' }}>
          <h2 className="text-base font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>{isEdit ? 'Edit Client' : 'Add Client'}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: '#7a8a87', backgroundColor: '#f0ede8' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Name + Company */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Full Name *</label>
              <input className={inp} style={inpStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Jordan Lee" {...focus} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Company *</label>
              <input className={inp} style={inpStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Austin Capital Bank" {...focus} />
            </div>
          </div>

          {/* Email + Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Email (login)</label>
              <input type="email" className={inp} style={inpStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="jordan@example.com" {...focus} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Password</label>
              <input className={inp} style={inpStyle} value={password} onChange={e => setPassword(e.target.value)} {...focus} />
            </div>
          </div>

          {/* Website */}
          <div>
            <label className={lbl} style={lblStyle}>Company Website</label>
            <input className={inp} style={inpStyle} value={website} onChange={e => setWebsite(e.target.value)} placeholder="e.g. acme.com" {...focus} />
          </div>

          {/* Current Office Location */}
          <div ref={geoWrapperRef}>
            <label className={lbl} style={lblStyle}>Current Office Location</label>
            <div className="relative mb-2">
              <input
                className={inp}
                style={inpStyle}
                value={officeAddress}
                onChange={e => { setOfficeAddress(e.target.value); setShowSuggestions(true); }}
                placeholder="e.g. 3305 Steck Ave, Austin, TX 78757"
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; setShowSuggestions(geoSuggestions.length > 0); }}
                onBlur={e => { e.currentTarget.style.borderColor = '#dedad3'; }}
                autoComplete="off"
              />
              {geoLoading && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(212,31,39,0.4)', borderTopColor: 'transparent' }} />
                </div>
              )}
              {showSuggestions && geoSuggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-xl z-[1000]"
                  style={{ backgroundColor: 'white', border: '1px solid #dedad3', maxHeight: 220, overflowY: 'auto' }}
                >
                  {geoSuggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={() => selectSuggestion(s)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left text-sm transition-colors"
                      style={{ color: '#1e2624', borderBottom: i < geoSuggestions.length - 1 ? '1px solid #f0ede8' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f7f5f1')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#d41f27' }} />
                      <span className="text-xs leading-relaxed" style={{ color: '#3a4a47' }}>{s.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9aaba8' }}>Latitude</label>
                <input
                  className={inp}
                  style={inpStyle}
                  value={officeLat}
                  onChange={e => setOfficeLat(e.target.value)}
                  placeholder="30.3661"
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#dedad3'; }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9aaba8' }}>Longitude</label>
                <input
                  className={inp}
                  style={inpStyle}
                  value={officeLng}
                  onChange={e => setOfficeLng(e.target.value)}
                  placeholder="-97.7396"
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#dedad3'; }}
                />
              </div>
            </div>
            <p className="text-xs mt-1.5" style={{ color: '#9aaba8' }}>Shown as a star pin on the map when viewing this client.</p>
          </div>

          {/* Company Logo */}
          <div>
            <label className={lbl} style={lblStyle}>Company Logo</label>
            {logoPreview ? (
              <div className="flex items-center gap-3 mb-2">
                <img src={logoPreview} alt="" className="h-10 max-w-[120px] object-contain rounded" style={{ border: '1px solid #dedad3', padding: '4px', backgroundColor: 'white' }}
                  onError={() => { setLogoPreview(''); setLogoUrl(''); }}
                />
                <button onClick={() => { setLogoFile(null); setLogoPreview(''); setLogoUrl(''); }} className="text-xs" style={{ color: '#d41f27' }}>Remove</button>
              </div>
            ) : (
              <input className={`${inp} mb-2`} style={inpStyle} value={logoUrl} onChange={e => { setLogoUrl(e.target.value); setLogoPreview(e.target.value); }} placeholder="Logo URL, fetch, or upload" {...focus} />
            )}
            <div className="flex gap-2">
              <button onClick={fetchLogo} disabled={fetching || !website.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed" style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}
                onMouseEnter={e => { if (website.trim()) (e.currentTarget as HTMLElement).style.backgroundColor = '#e5e1d8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f0ede8'; }}>
                <ExternalLink className="w-3 h-3" /> {fetching ? 'Fetching…' : 'Fetch from website'}
              </button>
              <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFileChange} />
              <button onClick={() => logoFileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e1d8')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}>
                <Upload className="w-3 h-3" /> Upload
              </button>
            </div>
            <p className="text-xs mt-1.5" style={{ color: '#9aaba8' }}>Fetch pulls the logo from the company domain automatically; upload is the reliable fallback.</p>
          </div>

          {/* Assign Brokers */}
          {brokers.length > 0 && (
            <div>
              <label className={lbl} style={lblStyle}>Assign Broker(s)</label>
              <div className="space-y-2">
                {brokers.map(b => (
                  <label key={b.id} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBrokers.has(b.id)}
                      onChange={() => toggleBroker(b.id)}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: '#d41f27' }}
                    />
                    <span className="text-sm" style={{ color: '#1e2624' }}>
                      {b.name}{b.title ? <span style={{ color: '#7a8a87' }}> · {b.title}</span> : ''}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 shrink-0" style={{ borderTop: '1px solid #e5e1d8' }}>
          {isEdit && onDelete ? (
            <button onClick={onDelete} title="Delete client" aria-label="Delete client" className="p-2 rounded-lg transition-colors" style={{ color: '#9aaba8' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#d41f27'; e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9aaba8'; e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <Trash2 className="w-4 h-4" />
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: '#d41f27' }}>
              {saving ? 'Saving…' : 'Save Client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage({ brokers, properties, onClientsChange }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalClient, setModalClient] = useState<Partial<Client> | null | false>(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    const { data } = await supabase
      .from('clients')
      .select(`*, brokers:client_brokers(broker:brokers(*))`)
      .order('created_at');
    if (data) {
      const mapped = (data as any[]).map(c => ({
        ...c,
        brokers: (c.brokers ?? []).map((cb: any) => cb.broker).filter(Boolean),
      }));
      setClients(mapped);
      onClientsChange(mapped);
    }
    setLoading(false);
  }

  function propCountFor(clientId: string) {
    // Assignments live in the property_clients junction (client_ids); also honor
    // the legacy single client_id for any older single-assignment properties.
    return properties.filter(p => (p.client_ids ?? []).includes(clientId) || p.client_id === clientId).length;
  }

  async function handleDelete(id: string) {
    await supabase.from('clients').delete().eq('id', id);
    const updated = clients.filter(c => c.id !== id);
    setClients(updated);
    onClientsChange(updated);
    setConfirmDelete(null);
    setModalClient(false);
  }

  function handleSaved(c: Client) {
    const updated = (() => {
      const idx = clients.findIndex(x => x.id === c.id);
      if (idx >= 0) { const next = [...clients]; next[idx] = c; return next; }
      return [...clients, c];
    })();
    setClients(updated);
    onClientsChange(updated);
    setModalClient(false);
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8" style={{ backgroundColor: '#f0ede8' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>Clients</h1>
            <p className="text-sm mt-0.5" style={{ color: '#7a8a87' }}>Create logins, set company branding, and assign brokers</p>
          </div>
          <button
            onClick={() => setModalClient({})}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: '#d41f27' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#b81920')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#d41f27')}
          >
            <Plus className="w-3.5 h-3.5" /> Add Client
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#dedad3', borderTopColor: '#d41f27' }} />
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: 'white', border: '1px solid #e5e1d8' }}>
            <p className="text-sm font-semibold" style={{ color: '#7a8a87' }}>No clients yet</p>
            <p className="text-xs mt-1" style={{ color: '#9aaba8' }}>Click "+ Add Client" to create your first client.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'white', border: '1px solid #e5e1d8' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f7f5f1', borderBottom: '1px solid #e5e1d8' }}>
                  {['Client', 'Company', 'Login', 'Brokers', 'Properties', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest" style={{ color: '#7a8a87' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((c, idx) => (
                  <tr key={c.id} style={{ borderTop: idx > 0 ? '1px solid #f0ede8' : undefined }}>
                    <td className="px-4 py-3 font-medium" style={{ color: '#1e2624' }}>{c.name}</td>
                    <td className="px-4 py-3" style={{ color: '#3a4a47' }}>
                      <div className="flex items-center gap-2">
                        {c.logo_url && <img src={c.logo_url} alt="" className="h-5 w-auto max-w-[60px] object-contain" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                        <span>{c.company}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: '#3a4a47' }}>{c.email ?? '—'}</span>
                        {c.login_password && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: 'rgba(136,152,147,0.15)', color: '#889893' }}>
                            {c.login_password}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {(c.brokers ?? []).map(b => (
                          <span key={b.id} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#b81920' }}>
                            {b.name.split(' ')[0]} {b.name.split(' ').slice(1).join(' ')}
                          </span>
                        ))}
                        {(!c.brokers || c.brokers.length === 0) && <span className="text-xs" style={{ color: '#9aaba8' }}>—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium" style={{ color: '#3a4a47' }}>{propCountFor(c.id)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setModalClient(c)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ color: '#3a4a47', border: '1px solid #dedad3' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>Edit</button>
                        <button onClick={() => setConfirmDelete(c.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ color: '#d41f27', border: '1px solid rgba(212,31,39,0.2)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalClient !== false && (
        <ClientModal client={modalClient} brokers={brokers} onClose={() => setModalClient(false)} onSaved={handleSaved} onDelete={modalClient && (modalClient as Client).id ? () => setConfirmDelete((modalClient as Client).id!) : undefined} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'white' }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: '#1e2624' }}>Delete client?</h3>
            <p className="text-xs mb-5" style={{ color: '#7a8a87' }}>This will remove the client and their broker assignments. Properties will not be deleted.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ border: '1px solid #dedad3', color: '#3a4a47' }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#d41f27' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
