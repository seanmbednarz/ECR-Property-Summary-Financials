export interface AddressSuggestion {
  label: string; // "311 E Saint Elmo Rd, Austin, TX 78745"
  lat: number;
  lng: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
  class?: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
    'ISO3166-2-lvl4'?: string; // "US-TX"
  };
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const HEADERS = { 'User-Agent': 'ECR-Property-Portal/1.0' };

function formatSuggestion(r: NominatimResult): AddressSuggestion | null {
  const a = r.address;
  // Only offer real street addresses (house number + road). Anything else
  // (neighborhoods, counties, road centroids) is dropped — those are the
  // results whose coordinates land in the wrong spot.
  if (!a?.house_number || !a.road) return null;
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || '';
  const state = a['ISO3166-2-lvl4']?.slice(-2) || a.state || '';
  const zip = a.postcode || '';
  const label = [`${a.house_number} ${a.road}`, city, `${state} ${zip}`.trim()]
    .filter(Boolean)
    .join(', ');
  return { label, lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const url = `${NOMINATIM}?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1&countrycodes=us&layer=address&dedupe=1`;
  const res = await fetch(url, { headers: HEADERS });
  const data: NominatimResult[] = await res.json();
  // Plain address points (class "place"/"building") carry the parcel's rooftop
  // coordinates; POIs sharing the address (shops etc.) can be mapped elsewhere.
  // Put address points first so dedupe keeps their coordinates.
  const ranked = [...data].sort((a, b) => {
    const rank = (r: NominatimResult) => (r.class === 'place' || r.class === 'building' ? 0 : 1);
    return rank(a) - rank(b);
  });
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const r of ranked) {
    const s = formatSuggestion(r);
    if (s && !seen.has(s.label)) {
      seen.add(s.label);
      out.push(s);
    }
  }
  return out.slice(0, 5);
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Prefer an exact street-address match; fall back to an unrestricted
    // search so partial addresses still locate something.
    for (const layer of ['&countrycodes=us&layer=address', '']) {
      const url = `${NOMINATIM}?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1${layer}`;
      const res = await fetch(url, { headers: HEADERS });
      const data: NominatimResult[] = await res.json();
      if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    /* fall through */
  }
  return null;
}
