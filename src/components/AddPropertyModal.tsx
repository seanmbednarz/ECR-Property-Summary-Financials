import { useState, useRef, useEffect } from 'react';
import { X, Upload, MapPin, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resizeImageForUpload } from '../lib/resizeImage';
import { internalizeRemoteUrl, isExternalUrl } from '../lib/remoteImage';
import { Property, Client } from '../types';
import { PROPERTY_TYPES, LISTING_STATUSES, statusColor } from '../lib/propertyMeta';
import { AddressSuggestion, searchAddresses as geocodeSearch, geocodeAddress } from '../lib/geocode';

interface AddPropertyModalProps {
  onClose: () => void;
  onSaved: (property: Property) => void;
  clients?: Client[];
  defaultClientId?: string | null;
}

interface Suite {
  suite_name: string;
  sf: string;
  base_rent: string;
  op_exp: string;
  available: string;
  tour_url: string;
}

const LEASE_TYPES = ['Full Service', 'NNN', 'Modified Gross', 'Gross'];

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `prop-${Date.now()}`;
}

export default function AddPropertyModal({ onClose, onSaved, clients = [], defaultClientId }: AddPropertyModalProps) {
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  // Core fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressWrapperRef = useRef<HTMLDivElement>(null);
  const [propertyTypes, setPropertyTypes] = useState<string[]>(['Office']);
  const [listingStatus, setListingStatus] = useState<string[]>(['For Lease']);
  const [market, setMarket] = useState('');
  const [totalSf, setTotalSf] = useState('');
  const [askingRate, setAskingRate] = useState('');
  const [leaseType, setLeaseType] = useState('Full Service');
  const [availability, setAvailability] = useState('');
  const [classTag, setClassTag] = useState('');
  const [description, setDescription] = useState('');
  const [brokerNotes, setBrokerNotes] = useState<string[]>([]);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [parkingRatio, setParkingRatio] = useState('');
  const [opExp, setOpExp] = useState('');
  const [clientIds, setClientIds] = useState<string[]>(
    defaultClientId ? [defaultClientId] : []
  );

  function toggleClient(id: string) {
    setClientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // Suites
  const [suites, setSuites] = useState<Suite[]>([]);

  // Files
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroPreview, setHeroPreview] = useState('');
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [brochureUrl, setBrochureUrl] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [floorPlanFiles, setFloorPlanFiles] = useState<File[]>([]);

  const heroInputRef = useRef<HTMLInputElement>(null);
  const brochureInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const floorPlansInputRef = useRef<HTMLInputElement>(null);

  function handleHeroFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeroImageFile(file);
    setHeroPreview(URL.createObjectURL(file));
  }

  function handlePhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotoFiles(prev => [...prev, ...files].slice(0, 10));
  }

  function removePhoto(idx: number) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function searchAddresses(query: string) {
    if (query.trim().length < 4) { setAddressSuggestions([]); return; }
    try {
      const suggestions = await geocodeSearch(query);
      setAddressSuggestions(suggestions);
      setShowSuggestions(true);
    } catch {
      setAddressSuggestions([]);
    }
  }

  function handleAddressChange(value: string) {
    setAddress(value);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    addressDebounceRef.current = setTimeout(() => searchAddresses(value), 350);
  }

  function selectSuggestion(s: AddressSuggestion) {
    setAddress(s.label);
    setLat(s.lat.toFixed(6));
    setLng(s.lng.toFixed(6));
    setAddressSuggestions([]);
    setShowSuggestions(false);
  }

  // Close suggestions on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (addressWrapperRef.current && !addressWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleLocate() {
    if (!address.trim()) return;
    setLocating(true);
    const coords = await geocodeAddress(address);
    if (coords) {
      setLat(String(coords.lat));
      setLng(String(coords.lng));
    } else {
      setError('Could not locate address. Enter coordinates manually.');
    }
    setLocating(false);
  }

  function addSuite() {
    setSuites(prev => [...prev, { suite_name: '', sf: '', base_rent: '', op_exp: '', available: 'Available Now', tour_url: '' }]);
  }

  function removeSuite(idx: number) {
    setSuites(prev => prev.filter((_, i) => i !== idx));
  }

  function updateSuite(idx: number, patch: Partial<Suite>) {
    setSuites(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function addBrokerNote() { setBrokerNotes(prev => [...prev, '']); }
  function removeBrokerNote(idx: number) { setBrokerNotes(prev => prev.filter((_, i) => i !== idx)); }
  function updateBrokerNote(idx: number, val: string) { setBrokerNotes(prev => prev.map((n, i) => i === idx ? val : n)); }

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

  async function handleSave() {
    if (!name.trim()) { setError('Property name is required.'); return; }
    if (!address.trim()) { setError('Address is required.'); return; }

    setSaving(true);
    setError('');

    try {
      const slug = slugify(name);

      // Upload hero image
      let finalHeroUrl: string | null = heroImageUrl || null;
      if (heroImageFile) {
        const ext = heroImageFile.name.split('.').pop();
        finalHeroUrl = await uploadFile('property-photos', `${slug}/hero.${ext}`, heroImageFile);
      }

      // Upload brochure
      let finalBrochureUrl: string | null = brochureUrl || null;
      if (brochureFile) {
        finalBrochureUrl = await uploadFile('brochures', `${slug}.pdf`, brochureFile);
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

      // Insert property
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .insert({
          name: name.trim(),
          address: address.trim(),
          property_type: propertyTypes[0] ?? 'Office',
          property_types: propertyTypes,
          listing_status: listingStatus,
          market: market.trim(),
          total_sf: totalSf ? parseInt(totalSf) : null,
          description: description.trim() || null,
          broker_notes: brokerNotes.map(n => n.trim()).filter(Boolean),
          hero_image_url: finalHeroUrl,
          brochure_url: finalBrochureUrl,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          year_built: yearBuilt ? parseInt(yearBuilt) : null,
          parking_ratio: parkingRatio.trim() || null,
          op_exp: opExp ? parseFloat(opExp) : null,
          sublabel: classTag.trim() || null,
          slug,
          broker_name: '',
        })
        .select(`*, suites:property_suites(*), brokers:property_brokers(broker:brokers(*))`)
        .single();

      if (propError) throw propError;

      // Assign to selected clients
      if (clientIds.length > 0) {
        await supabase.from('property_clients').insert(
          clientIds.map(cid => ({ property_id: propData.id, client_id: cid }))
        );
      }

      // Upload additional photos
      const photoErrors: string[] = [];
      if (photoFiles.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        for (let i = 0; i < photoFiles.length; i++) {
          const file = photoFiles[i];
          const ext = file.name.split('.').pop() ?? 'jpg';
          const path = `${slug}/${slug}-${i + 1}.${ext}`;
          try {
            const uploaded = await uploadFile('property-photos', path, file);
            await supabase.from('property_photos').insert({
              property_id: propData.id,
              storage_path: uploaded.replace(/^.*\/property-photos\//, ''),
              display_order: i,
              created_by: user?.id ?? null,
            });
          } catch (photoErr: any) {
            photoErrors.push(file.name);
          }
        }
      }

      // Upload floor plans (stored under a floorplans/ path)
      if (floorPlanFiles.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        for (let i = 0; i < floorPlanFiles.length; i++) {
          const file = floorPlanFiles[i];
          const ext = file.name.split('.').pop() ?? 'jpg';
          const path = `${slug}/floorplans/${slug}-fp-${i + 1}.${ext}`;
          try {
            const uploaded = await uploadFile('property-photos', path, file);
            await supabase.from('property_photos').insert({
              property_id: propData.id,
              storage_path: uploaded.replace(/^.*\/property-photos\//, ''),
              display_order: 1000 + i,
              created_by: user?.id ?? null,
            });
          } catch (photoErr: any) {
            photoErrors.push(file.name);
          }
        }
      }

      // Insert suites
      if (suites.length > 0) {
        const suiteRows = suites.map((s, i) => ({
          property_id: propData.id,
          suite_name: s.suite_name || `Suite ${i + 1}`,
          sf: s.sf ? parseInt(s.sf) : null,
          base_rent: s.base_rent ? parseFloat(s.base_rent) : null,
          op_exp: s.op_exp ? parseFloat(s.op_exp) : null,
          available: s.available || 'Available Now',
          tour_url: s.tour_url.trim() || null,
          display_order: i,
        }));
        await supabase.from('property_suites').insert(suiteRows);
      }

      // Build a default suite from asking rate if no suites added
      if (suites.length === 0 && askingRate) {
        await supabase.from('property_suites').insert({
          property_id: propData.id,
          suite_name: 'Suite 100',
          sf: totalSf ? parseInt(totalSf) : null,
          base_rent: parseFloat(askingRate),
          available: availability || 'Available Now',
          display_order: 0,
        });
      }

      const mapped: Property = {
        ...propData,
        suites: (propData.suites ?? []).sort((a: any, b: any) => a.display_order - b.display_order),
        brokers: (propData.brokers ?? []).map((pb: any) => pb.broker).filter(Boolean),
        client_ids: clientIds,
      };

      if (photoErrors.length > 0) {
        setError(`Property saved, but ${photoErrors.length} photo(s) failed to upload: ${photoErrors.join(', ')}`);
        setSaving(false);
      }
      onSaved(mapped);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save property.');
      setSaving(false);
    }
  }

  // Shared input styles
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
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid #e5e1d8' }}
        >
          <h2 className="text-base font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>New Property</h2>
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
              <input className={inp} style={inpStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 7600 Burnet" {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Address *</label>
              <div ref={addressWrapperRef} className="relative">
                <input
                  className={inp}
                  style={inpStyle}
                  value={address}
                  onChange={e => handleAddressChange(e.target.value)}
                  onFocus={() => { addressSuggestions.length > 0 && setShowSuggestions(true); (document.activeElement as HTMLElement)?.style && (document.activeElement as HTMLInputElement).style.setProperty('border-color', 'rgba(212,31,39,0.5)'); }}
                  onBlur={e => e.currentTarget.style.borderColor = '#dedad3'}
                  placeholder="123 Main St, Austin, TX 78701"
                  autoComplete="off"
                />
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div
                    className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-xl z-50"
                    style={{ backgroundColor: 'white', border: '1px solid #dedad3' }}
                  >
                    {addressSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => selectSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 text-sm transition-colors"
                        style={{
                          borderTop: i > 0 ? '1px solid #e5e1d8' : undefined,
                          color: '#1e2624',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f7f5f1')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <MapPin className="inline w-3 h-3 mr-1.5 shrink-0" style={{ color: '#d41f27', verticalAlign: 'middle' }} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

          {/* Property Type (multi-select) */}
          <div>
            <label className={labelCls} style={labelStyle}>Property Type</label>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map(t => {
                const on = propertyTypes.includes(t);
                return (
                  <button key={t} type="button"
                    onClick={() => setPropertyTypes(prev => on ? prev.filter(x => x !== t) : [...prev, t])}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
                    style={on ? { backgroundColor: '#d41f27', color: 'white' } : { backgroundColor: 'white', color: '#7a8a87', border: '1px solid #dedad3' }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Listing Status (multi-select) */}
          <div>
            <label className={labelCls} style={labelStyle}>Listing Status</label>
            <div className="flex flex-wrap gap-1.5">
              {LISTING_STATUSES.map(s => {
                const on = listingStatus.includes(s);
                return (
                  <button key={s} type="button"
                    onClick={() => setListingStatus(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
                    style={on ? { backgroundColor: statusColor(s), color: 'white' } : { backgroundColor: 'white', color: '#7a8a87', border: '1px solid #dedad3' }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submarket / SF */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={labelStyle}>Submarket</label>
              <input className={inp} style={inpStyle} value={market} onChange={e => setMarket(e.target.value)} placeholder="e.g. North Austin" {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>RSF</label>
              <input type="number" className={inp} style={inpStyle} value={totalSf} onChange={e => setTotalSf(e.target.value)} placeholder="10,000" {...inpFocus} />
            </div>
          </div>

          {/* Asking / OPEX / Lease Type / Availability */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls} style={labelStyle}>Asking ($/SF/yr)</label>
              <input type="number" step="0.01" className={inp} style={inpStyle} value={askingRate} onChange={e => setAskingRate(e.target.value)} placeholder="38.50" {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>OPEX ($/SF/yr)</label>
              <input type="number" step="0.01" className={inp} style={inpStyle} value={opExp} onChange={e => setOpExp(e.target.value)} placeholder="12.00" {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Lease Type</label>
              <select className={inp} style={inpStyle} value={leaseType} onChange={e => setLeaseType(e.target.value)} {...inpFocus}>
                {LEASE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Availability</label>
              <input className={inp} style={inpStyle} value={availability} onChange={e => setAvailability(e.target.value)} placeholder="Available Now" {...inpFocus} />
            </div>
          </div>

          {/* Class / Year Built / Parking */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} style={labelStyle}>Class / Tag</label>
              <input className={inp} style={inpStyle} value={classTag} onChange={e => setClassTag(e.target.value)} placeholder="Class A" {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Year Built</label>
              <input type="number" className={inp} style={inpStyle} value={yearBuilt} onChange={e => setYearBuilt(e.target.value)} placeholder="2005" {...inpFocus} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Parking Ratio</label>
              <input className={inp} style={inpStyle} value={parkingRatio} onChange={e => setParkingRatio(e.target.value)} placeholder="4/1,000 SF" {...inpFocus} />
            </div>
          </div>

          {/* Hero Image */}
          <div>
            <label className={labelCls} style={labelStyle}>Property Image</label>
            {heroPreview ? (
              <div className="relative rounded-xl overflow-hidden mb-2" style={{ height: 140 }}>
                <img src={heroPreview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => { setHeroImageFile(null); setHeroPreview(''); setHeroImageUrl(''); }}
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
                value={heroImageUrl}
                onChange={e => { setHeroImageUrl(e.target.value); setHeroPreview(e.target.value); }}
                placeholder="Paste image URL or upload below"
                {...inpFocus}
              />
            )}
            <input ref={heroInputRef} type="file" accept="image/*" className="hidden" onChange={handleHeroFileChange} />
            <button
              onClick={() => heroInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e1d8')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
            >
              <Upload className="w-3 h-3" /> Upload image
            </button>
          </div>

          {/* Additional Photos */}
          <div>
            <label className={labelCls} style={labelStyle}>Additional Photos (up to 10)</label>
            {photoFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {photoFiles.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid #dedad3' }}>
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={photosInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotosChange} />
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

          {/* Floor Plans */}
          <div>
            <label className={labelCls} style={labelStyle}>Floor Plans</label>
            {floorPlanFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {floorPlanFiles.map((f, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid #dedad3' }}>
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setFloorPlanFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={floorPlansInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => setFloorPlanFiles(prev => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 10))} />
            <button
              onClick={() => floorPlansInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e1d8')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
            >
              <Upload className="w-3 h-3" /> Add floor plans
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
              <Upload className="w-3 h-3" /> Upload brochure
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
              placeholder="Brief property description…"
              {...inpFocus}
            />
          </div>

          {/* Broker Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls} style={{ ...labelStyle, marginBottom: 0 }}>Broker Notes</label>
              <button
                onClick={addBrokerNote}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.08)')}
              >
                <Plus className="w-3 h-3" /> Add Note
              </button>
            </div>
            {brokerNotes.length === 0 && (
              <p className="text-xs" style={{ color: '#9aaba8' }}>No notes — add bullet points shown under “Broker Notes” on the detail page.</p>
            )}
            {brokerNotes.map((note, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#d41f27' }} />
                <input
                  className={inp}
                  style={{ ...inpStyle, padding: '6px 10px' }}
                  value={note}
                  onChange={e => updateBrokerNote(idx, e.target.value)}
                  placeholder="e.g. Full floor (14,441 SF) opportunity in the heart of The Arboretum"
                  {...inpFocus}
                />
                <button onClick={() => removeBrokerNote(idx)} className="p-1.5 rounded-lg transition-colors shrink-0" style={{ color: '#7a8a87' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#d41f27')} onMouseLeave={e => (e.currentTarget.style.color = '#7a8a87')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
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
              <p className="text-xs" style={{ color: '#9aaba8' }}>
                No suites added — a default suite will be created from the asking rate above.
              </p>
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
        <div
          className="flex items-center justify-end gap-3 px-5 py-4 shrink-0"
          style={{ borderTop: '1px solid #e5e1d8' }}
        >
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
            {saving ? 'Saving…' : 'Save Property'}
          </button>
        </div>
      </div>
    </div>
  );
}
