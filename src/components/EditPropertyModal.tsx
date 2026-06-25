import { useState, useRef } from 'react';
import { X, Upload, MapPin, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resizeImageForUpload } from '../lib/resizeImage';
import { internalizeRemoteUrl, isExternalUrl } from '../lib/remoteImage';
import { Property, Client } from '../types';

interface EditPropertyModalProps {
  property: Property;
  onClose: () => void;
  onSaved: (property: Property) => void;
  onDeleted?: (id: string) => void;
  clients?: Client[];
}

interface SuiteRow {
  id: string | null; // null = new
  suite_name: string;
  sf: string;
  base_rent: string;
  op_exp: string;
  available: string;
  tour_url: string;
}

const PROPERTY_TYPES = ['Office', 'Flex', 'Industrial', 'Retail', 'Medical', 'Mixed Use'];

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ECR-Property-Portal/1.0' } });
    const data = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {}
  return null;
}

async function uploadFile(bucket: string, path: string, file: File): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const resized = await resizeImageForUpload(file);
  if (resized !== file) path = path.replace(/\.[^./\\]+$/, '.jpg'); // resized output is always jpeg
  file = resized;
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', bucket);
  form.append('path', path);
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-property-file`,
    { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` }, body: form }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Upload failed for ${file.name}: ${json.error ?? res.statusText}`);
  return json.url as string;
}

export default function EditPropertyModal({ property, onClose, onSaved, onDeleted, clients = [] }: EditPropertyModalProps) {
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError('');
    const { error: delErr } = await supabase.from('properties').delete().eq('id', property.id);
    if (delErr) {
      setError(delErr.message ?? 'Failed to delete property.');
      setDeleting(false);
      setConfirmDelete(false);
      return;
    }
    onDeleted?.(property.id);
    onClose();
  }

  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address);
  const [propertyType, setPropertyType] = useState(property.property_type);
  const [market, setMarket] = useState(property.market ?? '');
  const [totalSf, setTotalSf] = useState(property.total_sf != null ? String(property.total_sf) : '');
  const [classTag, setClassTag] = useState(property.sublabel ?? '');
  const [description, setDescription] = useState(property.description ?? '');
  const [lat, setLat] = useState(property.lat != null ? String(property.lat) : '');
  const [lng, setLng] = useState(property.lng != null ? String(property.lng) : '');
  const [yearBuilt, setYearBuilt] = useState(property.year_built != null ? String(property.year_built) : '');
  const [parkingRatio, setParkingRatio] = useState(property.parking_ratio ?? '');
  const [opExp, setOpExp] = useState(property.op_exp != null ? String(property.op_exp) : '');
  const [clientIds, setClientIds] = useState<string[]>(property.client_ids ?? (property.client_id ? [property.client_id] : []));

  function toggleClient(id: string) {
    setClientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // Hero image
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroPreview, setHeroPreview] = useState(property.hero_image_url ?? '');
  const heroInputRef = useRef<HTMLInputElement>(null);

  // Brochure
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [brochureUrl, setBrochureUrl] = useState(property.brochure_url ?? '');
  const brochureInputRef = useRef<HTMLInputElement>(null);

  // Additional photos (new only — existing are already in storage)
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const photosInputRef = useRef<HTMLInputElement>(null);

  // Suites — pre-populate from existing
  const [suites, setSuites] = useState<SuiteRow[]>(
    (property.suites ?? []).map(s => ({
      id: s.id,
      suite_name: s.suite_name ?? '',
      sf: s.sf != null ? String(s.sf) : '',
      base_rent: s.base_rent != null ? String(s.base_rent) : '',
      op_exp: s.op_exp != null ? String(s.op_exp) : '',
      available: s.available ?? 'Available Now',
      tour_url: s.tour_url ?? '',
    }))
  );
  const originalSuiteIds = useRef(new Set((property.suites ?? []).map(s => s.id)));

  function addSuite() {
    setSuites(prev => [...prev, { id: null, suite_name: '', sf: '', base_rent: '', op_exp: '', available: 'Available Now', tour_url: '' }]);
  }
  function removeSuite(idx: number) {
    setSuites(prev => prev.filter((_, i) => i !== idx));
  }
  function updateSuite(idx: number, patch: Partial<SuiteRow>) {
    setSuites(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  async function handleLocate() {
    if (!address.trim()) return;
    setLocating(true);
    const coords = await geocodeAddress(address);
    if (coords) { setLat(String(coords.lat)); setLng(String(coords.lng)); }
    else setError('Could not locate address. Enter coordinates manually.');
    setLocating(false);
  }

  async function handleSave() {
    if (!name.trim()) { setError('Property name is required.'); return; }
    if (!address.trim()) { setError('Address is required.'); return; }
    setSaving(true);
    setError('');

    try {
      const slug = property.slug;

      // Hero image
      let finalHeroUrl = heroPreview || property.hero_image_url || null;
      if (heroImageFile) {
        const ext = heroImageFile.name.split('.').pop();
        finalHeroUrl = await uploadFile('property-photos', `${slug}/hero.${ext}`, heroImageFile) ?? finalHeroUrl;
      }

      // Brochure
      let finalBrochureUrl = brochureUrl || property.brochure_url || null;
      if (brochureFile) {
        finalBrochureUrl = await uploadFile('brochures', `${slug}.pdf`, brochureFile) ?? finalBrochureUrl;
      }

      // Internalize pasted external links into our own storage (best-effort:
      // on failure keep the original URL so the save still succeeds).
      if (isExternalUrl(finalHeroUrl)) {
        try { finalHeroUrl = await internalizeRemoteUrl(finalHeroUrl!, 'property-photos', `${slug}/hero`); }
        catch (e) { console.warn('Could not internalize hero image URL, keeping external link:', e); }
      }
      if (isExternalUrl(finalBrochureUrl)) {
        try { finalBrochureUrl = await internalizeRemoteUrl(finalBrochureUrl!, 'brochures', slug); }
        catch (e) { console.warn('Could not internalize brochure URL, keeping external link:', e); }
      }

      // Update property
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .update({
          name: name.trim(),
          address: address.trim(),
          property_type: propertyType,
          market: market.trim(),
          total_sf: totalSf ? parseInt(totalSf) : null,
          description: description.trim() || null,
          hero_image_url: finalHeroUrl,
          brochure_url: finalBrochureUrl,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          year_built: yearBuilt ? parseInt(yearBuilt) : null,
          parking_ratio: parkingRatio.trim() || null,
          op_exp: opExp ? parseFloat(opExp) : null,
          sublabel: classTag.trim() || null,
        })
        .eq('id', property.id)
        .select(`*, suites:property_suites(*), brokers:property_brokers(broker:brokers(*))`)
        .single();

      if (propError) throw propError;

      // Sync property_clients: replace all existing assignments
      await supabase.from('property_clients').delete().eq('property_id', property.id);
      if (clientIds.length > 0) {
        await supabase.from('property_clients').insert(
          clientIds.map(cid => ({ property_id: property.id, client_id: cid }))
        );
      }

      // Suites: delete removed, upsert remaining
      const keptIds = new Set(suites.filter(s => s.id).map(s => s.id as string));
      const deletedIds = [...originalSuiteIds.current].filter(id => !keptIds.has(id));
      if (deletedIds.length > 0) {
        await supabase.from('property_suites').delete().in('id', deletedIds);
      }

      for (let i = 0; i < suites.length; i++) {
        const s = suites[i];
        const row = {
          property_id: property.id,
          suite_name: s.suite_name || `Suite ${i + 1}`,
          sf: s.sf ? parseInt(s.sf) : null,
          base_rent: s.base_rent ? parseFloat(s.base_rent) : null,
          op_exp: s.op_exp ? parseFloat(s.op_exp) : null,
          available: s.available || 'Available Now',
          tour_url: s.tour_url.trim() || null,
          display_order: i,
        };
        if (s.id) {
          await supabase.from('property_suites').update(row).eq('id', s.id);
        } else {
          const { data: newSuite } = await supabase.from('property_suites').insert(row).select().single();
          if (newSuite) setSuites(prev => prev.map((r, idx) => idx === i ? { ...r, id: newSuite.id } : r));
        }
      }

      // Upload new additional photos
      if (newPhotoFiles.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: existingPhotos } = await supabase
          .from('property_photos')
          .select('display_order')
          .eq('property_id', property.id)
          .order('display_order', { ascending: false })
          .limit(1);
        let startOrder = (existingPhotos?.[0]?.display_order ?? -1) + 1;
        for (const file of newPhotoFiles) {
          const ext = file.name.split('.').pop();
          const path = `${slug}/${slug}-${startOrder + 1}.${ext}`;
          const uploaded = await uploadFile('property-photos', path, file);
          if (uploaded) {
            await supabase.from('property_photos').insert({
              property_id: property.id,
              storage_path: uploaded.replace(/^.*\/property-photos\//, ''),
              display_order: startOrder,
              created_by: user?.id ?? null,
            });
            startOrder++;
          }
        }
      }

      const mapped: Property = {
        ...propData,
        suites: (propData.suites ?? []).sort((a: any, b: any) => a.display_order - b.display_order),
        brokers: (propData.brokers ?? []).map((pb: any) => pb.broker).filter(Boolean),
        client_ids: clientIds,
      };
      onSaved(mapped);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save changes.');
      setSaving(false);
    }
  }

  const inp = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors";
  const inpStyle = { backgroundColor: 'white', border: '1px solid #dedad3', color: '#1e2624' };
  const inpFocus = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = '#dedad3'; },
  };
  const labelCls = "block text-xs font-semibold uppercase tracking-widest mb-1";
  const labelStyle = { color: '#7a8a87' };

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'white' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #e5e1d8' }}>
          <div>
            <h2 className="text-base font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>Edit Property</h2>
            <p className="text-xs mt-0.5" style={{ color: '#7a8a87' }}>{property.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ color: '#7a8a87', backgroundColor: '#f0ede8' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e1d8')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Name + Address */}
          <div className="space-y-3">
            <div>
              <label className={labelCls} style={labelStyle}>Property Name *</label>
              <input className={inp} style={inpStyle} value={name} onChange={e => setName(e.target.value)} {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Address *</label>
              <input className={inp} style={inpStyle} value={address} onChange={e => setAddress(e.target.value)} {...inpFocus} />
            </div>
          </div>

          {/* Client Assignment */}
          {clients.length > 0 && (
            <div>
              <label className={labelCls} style={labelStyle}>Assign to Client(s)</label>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #dedad3' }}>
                {clients.map((c, i) => {
                  const checked = clientIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleClient(c.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                      style={{
                        backgroundColor: checked ? 'rgba(212,31,39,0.05)' : 'white',
                        borderTop: i > 0 ? '1px solid #e5e1d8' : undefined,
                      }}
                      onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.backgroundColor = '#f7f5f1'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = checked ? 'rgba(212,31,39,0.05)' : 'white'; }}
                    >
                      <span
                        className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
                        style={{
                          border: checked ? 'none' : '1.5px solid #c8c0b8',
                          backgroundColor: checked ? '#d41f27' : 'transparent',
                        }}
                      >
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className="text-sm font-medium" style={{ color: '#1e2624' }}>{c.company}</span>
                      <span className="text-xs ml-auto" style={{ color: '#7a8a87' }}>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Type / Market / SF */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} style={labelStyle}>Type</label>
              <select className={inp} style={inpStyle} value={propertyType} onChange={e => setPropertyType(e.target.value)} {...inpFocus}>
                {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Submarket</label>
              <input className={inp} style={inpStyle} value={market} onChange={e => setMarket(e.target.value)} {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>RSF</label>
              <input type="number" className={inp} style={inpStyle} value={totalSf} onChange={e => setTotalSf(e.target.value)} {...inpFocus} />
            </div>
          </div>

          {/* Class / Year Built / Parking / OPEX */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls} style={labelStyle}>Class / Tag</label>
              <input className={inp} style={inpStyle} value={classTag} onChange={e => setClassTag(e.target.value)} placeholder="Class A" {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Year Built</label>
              <input type="number" className={inp} style={inpStyle} value={yearBuilt} onChange={e => setYearBuilt(e.target.value)} {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Parking Ratio</label>
              <input className={inp} style={inpStyle} value={parkingRatio} onChange={e => setParkingRatio(e.target.value)} placeholder="4/1,000 SF" {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>OPEX ($/SF/yr)</label>
              <input type="number" step="0.01" className={inp} style={inpStyle} value={opExp} onChange={e => setOpExp(e.target.value)} placeholder="12.00" {...inpFocus} />
            </div>
          </div>

          {/* Hero Image */}
          <div>
            <label className={labelCls} style={labelStyle}>Property Image</label>
            {heroPreview ? (
              <div className="relative rounded-xl overflow-hidden mb-2" style={{ height: 140 }}>
                <img src={heroPreview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => { setHeroImageFile(null); setHeroPreview(''); }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <input
                className={inp + ' mb-2'}
                style={inpStyle}
                value={heroPreview}
                onChange={e => setHeroPreview(e.target.value)}
                placeholder="Paste image URL or upload below"
                {...inpFocus}
              />
            )}
            <input
              ref={heroInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setHeroImageFile(f); setHeroPreview(URL.createObjectURL(f)); }
              }}
            />
            <button
              onClick={() => heroInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e1d8')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
            >
              <Upload className="w-3 h-3" /> {heroPreview ? 'Replace image' : 'Upload image'}
            </button>
          </div>

          {/* Additional Photos */}
          <div>
            <label className={labelCls} style={labelStyle}>Add More Photos</label>
            {newPhotoFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {newPhotoFiles.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid #dedad3' }}>
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setNewPhotoFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={photosInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => setNewPhotoFiles(prev => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 10))}
            />
            <button
              onClick={() => photosInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e1d8')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
            >
              <Upload className="w-3 h-3" /> Add photos
            </button>
          </div>

          {/* Brochure */}
          <div>
            <label className={labelCls} style={labelStyle}>Brochure (PDF)</label>
            {brochureFile ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2" style={{ backgroundColor: '#f0ede8', border: '1px solid #dedad3' }}>
                <span className="text-xs font-medium truncate flex-1" style={{ color: '#3a4a47' }}>{brochureFile.name}</span>
                <button onClick={() => setBrochureFile(null)} style={{ color: '#7a8a87' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <input
                className={inp + ' mb-2'}
                style={inpStyle}
                value={brochureUrl}
                onChange={e => setBrochureUrl(e.target.value)}
                placeholder="Paste link or upload below"
                {...inpFocus}
              />
            )}
            <input
              ref={brochureInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setBrochureFile(f); setBrochureUrl(''); } }}
            />
            <button
              onClick={() => brochureInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e1d8')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
            >
              <Upload className="w-3 h-3" /> {brochureUrl ? 'Replace brochure' : 'Upload brochure'}
            </button>
          </div>

          {/* Map Location */}
          <div>
            <label className={labelCls} style={labelStyle}>Map Location</label>
            <div className="flex gap-2 mb-2">
              <input className={inp} style={inpStyle} value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude" {...inpFocus} />
              <input className={inp} style={inpStyle} value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude" {...inpFocus} />
            </div>
            <button
              onClick={handleLocate}
              disabled={locating || !address.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}
              onMouseEnter={e => { if (!locating && address.trim()) (e.currentTarget as HTMLElement).style.backgroundColor = '#e5e1d8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f0ede8'; }}
            >
              <MapPin className="w-3 h-3" />
              {locating ? 'Locating…' : 'Locate from address'}
            </button>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls} style={labelStyle}>Description</label>
            <textarea
              className={inp}
              style={{ ...inpStyle, minHeight: 80, resize: 'vertical' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              {...inpFocus}
            />
          </div>

          {/* Suites */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls} style={{ ...labelStyle, marginBottom: 0 }}>Suites / Spaces</label>
              <button
                onClick={addSuite}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.08)')}
              >
                <Plus className="w-3 h-3" /> Add Suite
              </button>
            </div>
            {suites.length === 0 && (
              <p className="text-xs" style={{ color: '#9aaba8' }}>No suites — add one above.</p>
            )}
            {suites.map((suite, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl mb-2"
                style={{ backgroundColor: '#f7f5f1', border: '1px solid #e5e1d8' }}
              >
                <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 80px 90px 90px 1fr auto' }}>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#7a8a87' }}>Suite</p>
                    <input className={inp} style={{ ...inpStyle, padding: '6px 10px' }} value={suite.suite_name} onChange={e => updateSuite(idx, { suite_name: e.target.value })} placeholder="Suite 100" {...inpFocus} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#7a8a87' }}>SF</p>
                    <input type="number" className={inp} style={{ ...inpStyle, padding: '6px 10px' }} value={suite.sf} onChange={e => updateSuite(idx, { sf: e.target.value })} placeholder="2,000" {...inpFocus} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#7a8a87' }}>Base$/SF</p>
                    <input type="number" step="0.01" className={inp} style={{ ...inpStyle, padding: '6px 10px' }} value={suite.base_rent} onChange={e => updateSuite(idx, { base_rent: e.target.value })} placeholder="38.50" {...inpFocus} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#7a8a87' }}>OPEX$/SF</p>
                    <input type="number" step="0.01" className={inp} style={{ ...inpStyle, padding: '6px 10px' }} value={suite.op_exp} onChange={e => updateSuite(idx, { op_exp: e.target.value })} placeholder="14.00" {...inpFocus} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#7a8a87' }}>Availability</p>
                    <input className={inp} style={{ ...inpStyle, padding: '6px 10px' }} value={suite.available} onChange={e => updateSuite(idx, { available: e.target.value })} placeholder="Available Now" {...inpFocus} />
                  </div>
                  <div className="flex items-end pb-0.5">
                    <button onClick={() => removeSuite(idx)} className="p-1.5 rounded-lg transition-colors" style={{ color: '#7a8a87' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#d41f27')} onMouseLeave={e => (e.currentTarget.style.color = '#7a8a87')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#7a8a87' }}>Virtual Tour Link</p>
                  <input type="url" className={inp} style={{ ...inpStyle, padding: '6px 10px' }} value={suite.tour_url} onChange={e => updateSuite(idx, { tour_url: e.target.value })} placeholder="https://my.matterport.com/show/?m=…" {...inpFocus} />
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 shrink-0" style={{ borderTop: '1px solid #e5e1d8' }}>
          {onDeleted ? (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete property"
              aria-label="Delete property"
              className="p-2 rounded-lg transition-colors"
              style={{ color: '#9aaba8' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#d41f27'; e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9aaba8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#d41f27' }}
              onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.backgroundColor = '#b81920'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#d41f27'; }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[950] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'white' }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: '#1e2624' }}>Delete property?</h3>
            <p className="text-xs mb-5" style={{ color: '#7a8a87' }}>This permanently removes “{property.name}” and all its suites, photos, and client/broker links. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ border: '1px solid #dedad3', color: '#3a4a47' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: '#d41f27' }}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
