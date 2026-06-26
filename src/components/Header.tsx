import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ECRLogo from '../assets/ECR_Logo.svg';
import { Client, UserRole } from '../types';

export type NavTab = 'properties' | 'clients' | 'brokers';

interface HeaderProps {
  userEmail: string;
  userRole: UserRole;
  favoritesCount: number;
  showFavoritesOnly: boolean;
  activeTab: NavTab;
  clients: Client[];
  selectedClientId: string | null;
  onToggleFavorites: () => void;
  onTabChange: (tab: NavTab) => void;
  onClientChange: (id: string | null) => void;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const ALL_TABS: { key: NavTab; label: string }[] = [
  { key: 'properties', label: 'Properties' },
  { key: 'clients', label: 'Clients' },
  { key: 'brokers', label: 'Brokers' },
];

export default function Header({
  userEmail, userRole, favoritesCount, showFavoritesOnly, activeTab,
  clients, selectedClientId, onToggleFavorites, onTabChange, onClientChange
}: HeaderProps) {
  const [showClientMenu, setShowClientMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Only admins manage Clients/Brokers. Brokers and clients see just Properties;
  // brokers switch between their clients via the "Viewing as" dropdown.
  const visibleTabs = userRole === 'admin'
    ? ALL_TABS
    : ALL_TABS.filter(t => t.key === 'properties');

  useEffect(() => {
    if (!showClientMenu) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowClientMenu(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showClientMenu]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const now = new Date();
  const monthYear = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  return (
    <header
      className="sticky top-0 z-40 shrink-0"
      style={{ backgroundColor: '#2a3330', borderBottom: '1px solid rgba(136,152,147,0.15)' }}
    >
      <div className="flex items-center h-14 px-4 gap-3">
        {/* ECR Logo */}
        <img src={ECRLogo} alt="ECR" className="h-7 w-auto shrink-0" />

        {/* Divider */}
        <div className="h-7 w-px shrink-0" style={{ backgroundColor: 'rgba(136,152,147,0.25)' }} />

        {/* Client logo or name */}
        {selectedClient?.logo_url ? (
          <img
            src={selectedClient.logo_url}
            alt={selectedClient.company}
            className="h-6 w-auto shrink-0 object-contain"
            style={{ maxWidth: 80 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className="text-xs font-bold uppercase tracking-widest hidden sm:block" style={{ color: 'white' }}>
            {selectedClient?.company ?? 'All Clients'}
          </span>
        )}

        {/* Month/year + label */}
        <div className="hidden sm:flex flex-col leading-none ml-1">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'white' }}>{monthYear}</span>
          <span className="text-xs uppercase tracking-wider mt-0.5" style={{ color: '#889893' }}>Property Dashboard</span>
        </div>

        {/* Nav tabs */}
        <div className="hidden sm:flex items-center gap-1 ml-4">
          {visibleTabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-widest transition-all duration-150"
              style={activeTab === key
                ? { backgroundColor: '#d41f27', color: 'white' }
                : { color: '#889893' }
              }
              onMouseEnter={e => { if (activeTab !== key) (e.currentTarget as HTMLElement).style.color = '#b5c5c1'; }}
              onMouseLeave={e => { if (activeTab !== key) (e.currentTarget as HTMLElement).style.color = '#889893'; }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Viewing as dropdown — admin and broker only */}
        {userRole !== 'client' && clients.length > 0 && (
          <div className="relative hidden sm:block" ref={menuRef}>
            <button
              onClick={() => setShowClientMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ color: '#b5c5c1', border: '1px solid rgba(136,152,147,0.2)', backgroundColor: showClientMenu ? 'rgba(255,255,255,0.08)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => { if (!showClientMenu) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <span style={{ color: '#889893' }}>Viewing as</span>
              <span className="font-semibold" style={{ color: 'white' }}>
                {selectedClient ? `${selectedClient.name} · ${selectedClient.company}` : 'All Clients'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: '#889893' }} />
            </button>

            {showClientMenu && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden min-w-[220px]"
                style={{ backgroundColor: 'white', border: '1px solid #dedad3', zIndex: 1500 }}
              >
                {[{ id: null, name: 'All Clients', company: '' }, ...clients].map(c => {
                  const isSelected = c.id === selectedClientId;
                  return (
                    <button
                      key={c.id ?? 'all'}
                      onClick={() => { onClientChange(c.id); setShowClientMenu(false); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors"
                      style={isSelected ? { color: '#d41f27', backgroundColor: 'rgba(212,31,39,0.05)' } : { color: '#3a4a47' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f7f5f1'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <span>
                        <span className="font-semibold">{c.name}</span>
                        {c.company && <span className="text-xs ml-1.5" style={{ color: '#7a8a87' }}>{c.company}</span>}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5" style={{ color: '#d41f27' }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Favorites toggle (only on properties tab) */}
        {activeTab === 'properties' && (
          <button
            onClick={onToggleFavorites}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
            style={showFavoritesOnly
              ? { backgroundColor: 'rgba(212,31,39,0.15)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.3)' }
              : { color: '#889893', border: '1px solid transparent' }
            }
            onMouseEnter={e => { if (!showFavoritesOnly) { e.currentTarget.style.color = '#b5c5c1'; e.currentTarget.style.borderColor = 'rgba(136,152,147,0.3)'; } }}
            onMouseLeave={e => { if (!showFavoritesOnly) { e.currentTarget.style.color = '#889893'; e.currentTarget.style.borderColor = 'transparent'; } }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            Saved ({favoritesCount})
          </button>
        )}

        {/* Divider */}
        <div className="hidden sm:block h-5 w-px" style={{ backgroundColor: 'rgba(136,152,147,0.2)' }} />

        {/* Phone + website */}
        <div className="hidden sm:flex items-center gap-3">
          <a href="tel:5125050000" className="text-xs font-medium transition-colors" style={{ color: '#b5c5c1' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#b5c5c1'; }}>
            512.505.0000
          </a>
          <a href="https://ecrtx.com" target="_blank" rel="noopener noreferrer" className="text-xs font-medium uppercase tracking-widest transition-colors" style={{ color: '#d41f27' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#d41f27'; }}>
            ECRTX.COM
          </a>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
          style={{ color: '#889893', border: '1px solid transparent' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.backgroundColor = 'rgba(55,66,63,0.8)'; e.currentTarget.style.borderColor = 'rgba(136,152,147,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#889893'; e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
