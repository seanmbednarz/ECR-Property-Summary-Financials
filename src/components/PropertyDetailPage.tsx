import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Heart, MessageSquare, MapPin, ExternalLink, ChevronLeft, ChevronRight, Download, Upload, X, ZoomIn, Pencil } from 'lucide-react';
import { Property, Client } from '../types';
import ECRLogo from '../assets/ECR_Logo.svg';
import { safeHttpUrl } from '../lib/placeholders';
import { usePropertyPhotos } from '../hooks/usePropertyPhotos';
import { supabase } from '../lib/supabase';

function BrokerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name.split(' ').filter(w => /^[A-Z]/.test(w)).map(w => w[0]).slice(0, 2).join('');
  const [err, setErr] = useState(false);
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
      style={{ border: '1.5px solid rgba(255,255,255,0.6)', backgroundColor: 'rgba(212,31,39,0.12)' }}>
      {photoUrl && !err
        ? <img src={photoUrl} alt={name} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : <span className="text-xs font-bold" style={{ color: '#d41f27' }}>{initials}</span>
      }
    </div>
  );
}

interface PropertyDetailPageProps {
  property: Property;
  isFavorited: boolean;
  notesCount: number;
  isAdmin?: boolean;
  client?: Client | null;
  onBack: () => void;
  onFavoriteToggle: (id: string, current: boolean) => void;
  onOpenNotes: (p: Property) => void;
  onBrochureUploaded?: (propertyId: string, url: string) => void;
  onEdit?: (p: Property) => void;
}

function fmt$(v: number | null | undefined) {
  return v == null ? '—' : `$${Number(v).toFixed(2)}`;
}
function fmtSF(v: number | null | undefined) {
  return v == null ? '—' : `${Number(v).toLocaleString()} SF`;
}
function fmtMo(v: number | null | undefined) {
  if (v == null) return '—';
  return `$${Math.round(v).toLocaleString()}/mo`;
}



function Lightbox({ images, index, onClose, onPrev, onNext, onSetIndex }: {
  images: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSetIndex: (i: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onPrev, onNext]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      style={{ backgroundColor: 'rgba(20,26,24,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ backgroundColor: '#2a3330', border: '1px solid rgba(136,152,147,0.18)', maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar: counter + close */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(136,152,147,0.15)' }}>
          <span className="text-xs font-semibold tracking-wide" style={{ color: '#b5c5c1' }}>
            {index + 1} <span style={{ color: '#7a8a87' }}>/ {images.length}</span>
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ backgroundColor: '#37423f', color: '#b5c5c1' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#d41f27'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#37423f'; e.currentTarget.style.color = '#b5c5c1'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image area — fixed 3:2 frame; photos fill it (object-cover) so every one
            renders at exactly the same size regardless of its own aspect ratio. */}
        <div className="relative w-full" style={{ backgroundColor: '#222a28', aspectRatio: '3 / 2', maxHeight: '70vh' }}>
          <img
            src={images[index]}
            alt={`Photo ${index + 1}`}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ userSelect: 'none' }}
          />

          {images.length > 1 && (
            <>
              <button
                onClick={onPrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full transition-colors shadow-lg"
                style={{ backgroundColor: 'rgba(42,51,48,0.92)', color: '#b5c5c1' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#d41f27'; e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(42,51,48,0.92)'; e.currentTarget.style.color = '#b5c5c1'; }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={onNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full transition-colors shadow-lg"
                style={{ backgroundColor: 'rgba(42,51,48,0.92)', color: '#b5c5c1' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#d41f27'; e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(42,51,48,0.92)'; e.currentTarget.style.color = '#b5c5c1'; }}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="flex gap-2 px-4 py-3 overflow-x-auto shrink-0" style={{ borderTop: '1px solid rgba(136,152,147,0.15)' }}>
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => onSetIndex(i)}
                className="w-12 h-12 rounded-lg overflow-hidden transition-all duration-150 shrink-0"
                style={{
                  border: i === index ? '2px solid #d41f27' : '2px solid transparent',
                  opacity: i === index ? 1 : 0.55,
                }}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function PropertyDetailPage({
  property,
  isFavorited,
  notesCount,
  isAdmin,
  client,
  onBack,
  onFavoriteToggle,
  onOpenNotes,
  onBrochureUploaded,
  onEdit,
}: PropertyDetailPageProps) {
  const [imgIdx, setImgIdx] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [uploadingBrochure, setUploadingBrochure] = useState(false);
  const [brochureError, setBrochureError] = useState('');
  const brochureInputRef = useRef<HTMLInputElement>(null);
  const suites = property.suites ?? [];

  const { photos, loading } = usePropertyPhotos(property.id, property.slug);
  const heroUrl = safeHttpUrl(property.hero_image_url);
  const images = heroUrl && !photos.includes(heroUrl) ? [heroUrl, ...photos] : photos;

  // "Prepared by" brokers are always the selected client's brokers. Nothing
  // shows in the All Clients view or for a client with no brokers assigned.
  const footerBrokers = client?.brokers ?? [];

  useEffect(() => {
    if (imgIdx >= images.length && images.length > 0) setImgIdx(0);
  }, [images.length]);

  const openLightbox = useCallback((i: number) => { setImgIdx(i); setLightboxOpen(true); }, []);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const prevImage = useCallback(() => setImgIdx(i => (i - 1 + images.length) % images.length), [images.length]);
  const nextImage = useCallback(() => setImgIdx(i => (i + 1) % images.length), [images.length]);

  async function handleBrochureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBrochureError('');
    setUploadingBrochure(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const form = new FormData();
      form.append('file', file);
      form.append('property_id', property.id);
      form.append('slug', property.slug);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-brochure`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      onBrochureUploaded?.(property.id, json.url);
    } catch (err: unknown) {
      setBrochureError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingBrochure(false);
      if (brochureInputRef.current) brochureInputRef.current.value = '';
    }
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  const specs: { label: string; value: string }[] = [
    { label: 'Type', value: property.property_type },
    { label: 'Submarket', value: property.market },
    { label: 'Total SF', value: fmtSF(property.total_sf) },
    ...(property.target_sf != null ? [{ label: 'Target SF', value: fmtSF(property.target_sf) }] : []),
    ...(property.max_contiguous_sf != null ? [{ label: 'Max Contiguous', value: fmtSF(property.max_contiguous_sf) }] : []),
    { label: 'Suites', value: `${suites.length}` },
    ...(property.year_built ? [{ label: 'Year Built', value: `${property.year_built}` }] : []),
    ...(property.parking_ratio ? [{ label: 'Parking', value: property.parking_ratio }] : []),
    ...(property.walk_score != null ? [{ label: 'Walk Score', value: `${property.walk_score} / 100` }] : []),
    ...(property.scores ? [
      { label: 'Pedestrian Score', value: `${property.scores.pedestrian} / 100` },
      { label: 'Cycling Score', value: `${property.scores.cycling} / 100` },
      { label: 'Transit Score', value: `${property.scores.transit} / 100` },
    ] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'white' }}>
      {/* Top nav */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-8 h-14"
        style={{ backgroundColor: '#2a3330', borderBottom: '1px solid rgba(136,152,147,0.15)' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: '#889893' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Listings</span>
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs" style={{ color: 'rgba(136,152,147,0.5)' }}>
          <span>ECR</span>
          <span>&rsaquo;</span>
          <span>Property Detail</span>
          <span>&rsaquo;</span>
          <span className="font-medium" style={{ color: '#b5c5c1' }}>{property.property_type}</span>
        </div>

        <div className="flex items-center gap-2.5">
          {isAdmin && onEdit && (
            <button
              onClick={() => onEdit(property)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#37423f', color: '#b5c5c1' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#d41f27'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#37423f'; e.currentTarget.style.color = '#b5c5c1'; }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Property
            </button>
          )}
          <img src={ECRLogo} alt="ECR" className="h-7 w-auto" />
          {client && (
            <>
              <div className="h-6 w-px shrink-0" style={{ backgroundColor: 'rgba(136,152,147,0.25)' }} />
              {client.logo_url ? (
                <img
                  src={client.logo_url}
                  alt={client.company}
                  className="h-5 w-auto shrink-0 object-contain"
                  style={{ maxWidth: 80 }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'white' }}>
                  {client.company}
                </span>
              )}
            </>
          )}
        </div>
      </nav>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-8 py-8">
        {/* Top section: gallery + key info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Gallery */}
          <div>
            <div className="relative rounded-2xl overflow-hidden shadow-lg" style={{ backgroundColor: '#e8e4dc', aspectRatio: '16/10' }}>
              {loading ? (
                <div className="w-full h-full animate-pulse" style={{ backgroundColor: '#d4cfc6' }} />
              ) : images.length > 0 && !imgError ? (
                <img
                  src={images[imgIdx]}
                  alt={property.name}
                  className="w-full h-full object-cover cursor-zoom-in"
                  onClick={() => openLightbox(imgIdx)}
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1e2624' }} />
              )}
              {!loading && (
                <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: 'white' }}>
                  {imgIdx + 1} / {images.length}
                </div>
              )}
              {/* Zoom hint */}
              {!loading && images.length > 0 && !imgError && (
                <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs pointer-events-none"
                  style={{ backgroundColor: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.8)' }}>
                  <ZoomIn className="w-3 h-3" />
                  <span>Click to expand</span>
                </div>
              )}
              {!loading && images.length > 1 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i - 1 + images.length) % images.length); }} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: 'white' }}>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setImgIdx(i => (i + 1) % images.length); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: 'white' }}>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              <div className="absolute top-3 left-3 flex gap-2">
                <span className="px-2.5 py-1 rounded text-xs font-bold uppercase" style={{ backgroundColor: 'rgba(30,38,36,0.8)', color: 'white' }}>{property.property_type}</span>
                {suites.some(s => s.available === 'Available Now') && (
                  <span className="px-2.5 py-1 rounded text-xs font-bold uppercase" style={{ backgroundColor: '#d41f27', color: 'white' }}>For Lease</span>
                )}
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className="flex gap-2 mt-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex-1 rounded-lg animate-pulse" style={{ aspectRatio: '1', backgroundColor: '#d4cfc6' }} />
                ))
              ) : (
                images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => { setImgIdx(i); setImgError(false); openLightbox(i); }}
                    className="flex-1 rounded-lg overflow-hidden transition-all duration-150"
                    style={{
                      aspectRatio: '1',
                      border: imgIdx === i ? '2px solid #d41f27' : '2px solid transparent',
                      opacity: imgIdx === i ? 1 : 0.6,
                    }}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Key info */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#d41f27' }}>{property.market}</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight uppercase tracking-tight mb-2" style={{ color: '#1e2624' }}>
              {property.name}
            </h1>
            <div className="flex items-center gap-1.5 mb-5" style={{ color: '#7a8a87' }}>
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="text-sm">{property.address}</span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-px rounded-xl overflow-hidden mb-5 shadow-sm" style={{ backgroundColor: '#e5e1d8' }}>
              {[
                { label: 'Size', value: fmtSF(property.total_sf) },
                { label: 'Rate', value: suites[0]?.base_rent ? `${fmt$(suites[0].base_rent)} / SF NNN` : '—' },
                { label: 'Available', value: suites.some(s => s.available === 'Available Now') ? 'Available Now' : suites.length > 0 ? 'Check Suites' : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="px-4 py-3" style={{ backgroundColor: '#f5f2ec' }}>
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#7a8a87' }}>{label}</p>
                  <p className="text-sm font-bold" style={{ color: '#1e2624' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onFavoriteToggle(property.id, isFavorited)}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-200"
                style={isFavorited
                  ? { backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.25)' }
                  : { backgroundColor: '#d41f27', color: 'white' }
                }
              >
                <Heart className="w-4 h-4" fill={isFavorited ? 'currentColor' : 'none'} />
                {isFavorited ? 'Saved' : 'Save Property'}
              </button>
              <button
                onClick={() => onOpenNotes(property)}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                style={{ color: '#3a4a47', border: '1px solid #c8c3b8', backgroundColor: 'white' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ede9e2'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
              >
                <MessageSquare className="w-4 h-4" />
                {notesCount > 0 ? `${notesCount} Note${notesCount !== 1 ? 's' : ''}` : 'Add Notes'}
              </button>
              {safeHttpUrl(property.brochure_url) ? (
                <a
                  href={safeHttpUrl(property.brochure_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-200"
                  style={{ backgroundColor: '#879792', color: 'white' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#6e7f7a'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#879792'; }}
                >
                  <Download className="w-4 h-4" />
                  Download Brochure
                </a>
              ) : (
                <div
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold opacity-40 cursor-not-allowed"
                  style={{ backgroundColor: '#879792', color: 'white' }}
                >
                  <Download className="w-4 h-4" />
                  Download Brochure
                </div>
              )}
              {isAdmin && (
                <>
                  <input
                    ref={brochureInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleBrochureUpload}
                  />
                  <button
                    onClick={() => brochureInputRef.current?.click()}
                    disabled={uploadingBrochure}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ border: '1px dashed #c8c3b8', color: '#7a8a87', backgroundColor: 'transparent' }}
                    onMouseEnter={(e) => { if (!uploadingBrochure) { e.currentTarget.style.borderColor = '#879792'; e.currentTarget.style.color = '#3a4a47'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#c8c3b8'; e.currentTarget.style.color = '#7a8a87'; }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingBrochure ? 'Uploading…' : property.brochure_url ? 'Replace Brochure' : 'Upload Brochure'}
                  </button>
                  {brochureError && (
                    <p className="text-xs text-center" style={{ color: '#d41f27' }}>{brochureError}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Overview + Specifications */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <div>
            {property.description && (
              <>
                <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7a8a87' }}>Overview</h2>
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#3a4a47' }}>{property.description}</p>
              </>
            )}

            {property.property_notes && (
              <>
                <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7a8a87' }}>Notes</h2>
                <div
                  className="rounded-xl px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap mb-6"
                  style={{ backgroundColor: '#f5f2ec', color: '#3a4a47', border: '1px solid #e5e1d8' }}
                >
                  {property.property_notes}
                </div>
              </>
            )}

            {property.broker_notes && property.broker_notes.length > 0 && (
              <>
                <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7a8a87' }}>Broker Notes</h2>
                <ul className="space-y-2 mb-6">
                  {property.broker_notes.map((note, i) => (
                    <li key={i} className="flex gap-2.5 text-sm" style={{ color: '#3a4a47' }}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#d41f27' }} />
                      {note}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Specifications */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7a8a87' }}>Specifications</h2>
            <div className="rounded-xl overflow-hidden shadow-sm" style={{ border: '1px solid #e5e1d8' }}>
              {specs.map(({ label, value }, i) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-5 py-3"
                  style={{
                    backgroundColor: i % 2 === 0 ? '#f5f2ec' : 'white',
                    borderBottom: i < specs.length - 1 ? '1px solid #e5e1d8' : 'none',
                  }}
                >
                  <span className="text-xs uppercase tracking-widest" style={{ color: '#7a8a87' }}>{label}</span>
                  <span className="text-sm font-semibold text-right" style={{ color: '#1e2624' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Available Suites */}
        {suites.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#7a8a87' }}>Available Suites</h2>
            <div className="rounded-xl overflow-hidden shadow-sm" style={{ border: '1px solid #e5e1d8' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[780px]">
                  <thead>
                    <tr style={{ backgroundColor: '#f5f2ec', borderBottom: '1px solid #e5e1d8' }}>
                      {[
                        'Suite', 'SQ FT', 'Base Rent', `${currentYear} Op. Exp.`,
                        'Full Svc. Rate', 'Quoted Mo. Rent', 'Quoted Annual Rent', 'Available', 'Virtual Tour', 'Notes',
                      ].map(h => (
                        <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" style={{ color: '#7a8a87' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suites.map((s, i) => {
                      const fullSvc = s.full_svc ?? (s.base_rent != null && s.op_exp != null ? s.base_rent + s.op_exp : null);
                      const annualRent = s.monthly_rent ?? (fullSvc != null && s.sf != null ? fullSvc * s.sf : null);
                      const monthlyRent = annualRent != null ? annualRent / 12 : null;
                      return (
                        <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? '#f5f2ec' : 'white', borderBottom: i < suites.length - 1 ? '1px solid #e5e1d8' : 'none' }}>
                          <td className="px-4 py-3 font-semibold" style={{ color: '#1e2624' }}>{s.suite_name}</td>
                          <td className="px-4 py-3 tabular-nums" style={{ color: '#3a4a47' }}>{s.sf != null ? s.sf.toLocaleString() : '—'}</td>
                          <td className="px-4 py-3 tabular-nums" style={{ color: '#3a4a47' }}>{s.base_rent != null ? `${fmt$(s.base_rent)}/SF` : '—'}</td>
                          <td className="px-4 py-3 tabular-nums" style={{ color: '#3a4a47' }}>{s.op_exp != null ? `${fmt$(s.op_exp)}/SF` : '—'}</td>
                          <td className="px-4 py-3 tabular-nums font-medium" style={{ color: '#1e2624' }}>{fullSvc != null ? `${fmt$(fullSvc)}/SF` : '—'}</td>
                          <td className="px-4 py-3 tabular-nums font-medium" style={{ color: '#1e2624' }}>{fmtMo(monthlyRent)}</td>
                          <td className="px-4 py-3 tabular-nums font-medium" style={{ color: '#1e2624' }}>{annualRent != null ? `$${Math.round(annualRent).toLocaleString()}/yr` : '—'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                              style={s.available === 'Available Now'
                                ? { backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.2)' }
                                : { backgroundColor: 'rgba(122,138,135,0.08)', color: '#7a8a87', border: '1px solid rgba(122,138,135,0.2)' }
                              }
                            >{s.available ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            {s.tour_url && safeHttpUrl(s.tour_url)
                              ? <a href={safeHttpUrl(s.tour_url)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#d41f27' }}>View Tour <ExternalLink className="w-3 h-3" /></a>
                              : <span style={{ color: '#c8c3b8' }}>—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: '#7a8a87' }}>{s.notes ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="shrink-0" style={{ backgroundColor: '#2a3330', borderTop: '1px solid rgba(136,152,147,0.15)' }}>

        {/* Mobile footer: brokers in 2 columns, then logo + tagline row */}
        <div className="md:hidden px-4 py-4 space-y-3">
          {footerBrokers.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {footerBrokers.map(b => (
                <div key={b.id} className="flex items-start gap-2">
                  <BrokerAvatar name={b.name} photoUrl={b.photo_url} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight text-white">{b.name}</p>
                    {b.phone && <a href={`tel:${b.phone.replace(/\D/g, '')}`} className="text-xs block" style={{ color: '#889893' }}>{b.phone}</a>}
                    {b.email && <a href={`mailto:${b.email}`} className="text-xs block truncate" style={{ color: '#889893' }}>{b.email}</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid rgba(136,152,147,0.15)' }}>
            <img src={ECRLogo} alt="ECR" className="h-6 w-auto" />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#d41f27' }}>Beyond Real Estate.</p>
          </div>
        </div>

        {/* Desktop footer (md+): matches Dashboard footer exactly */}
        <div className="hidden md:flex flex-wrap items-center gap-4 px-4 sm:px-6 py-3">
          <img src={ECRLogo} alt="ECR" className="h-6 w-auto shrink-0" />
          {footerBrokers.length > 0 && (
            <>
              <div className="h-5 w-px shrink-0 hidden sm:block" style={{ backgroundColor: 'rgba(136,152,147,0.2)' }} />
              <span className="text-xs uppercase tracking-widest hidden sm:block" style={{ color: '#b5c5c1' }}>Prepared by</span>
              {footerBrokers.map((broker, i) => (
                <div key={broker.id} className="flex items-center gap-2">
                  {i > 0 && <div className="h-5 w-px hidden sm:block" style={{ backgroundColor: 'rgba(136,152,147,0.15)' }} />}
                  <BrokerAvatar name={broker.name} photoUrl={broker.photo_url} />
                  <div>
                    <p className="text-xs font-semibold leading-tight text-white">{broker.name}</p>
                    {broker.phone && (
                      <a href={`tel:${broker.phone.replace(/\D/g, '')}`} className="text-xs transition-colors block" style={{ color: '#889893' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#889893'; }}>{broker.phone}</a>
                    )}
                    {broker.email && (
                      <a href={`mailto:${broker.email}`} className="text-xs transition-colors block" style={{ color: '#889893' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#889893'; }}>{broker.email}</a>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
          <div className="h-5 w-px shrink-0 hidden lg:block" style={{ backgroundColor: 'rgba(136,152,147,0.15)' }} />
          <p className="text-xs hidden lg:block" style={{ color: '#b5c5c1' }}>
            ECR // 114 W 7th St // Suite 1000 // Austin, TX 78701 //
            <a href="https://ecrtx.com" target="_blank" rel="noopener noreferrer" className="transition-colors ml-1" style={{ color: '#889893' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#889893'; }}>ecrtx.com</a>
          </p>
          <div className="flex-1" />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#d41f27' }}>Beyond Real Estate.</p>
        </div>
      </footer>

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox
          images={images}
          index={imgIdx}
          onClose={closeLightbox}
          onPrev={prevImage}
          onNext={nextImage}
          onSetIndex={setImgIdx}
        />
      )}
    </div>
  );
}
