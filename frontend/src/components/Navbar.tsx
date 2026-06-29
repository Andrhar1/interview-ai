import { Mic } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/history', label: 'Riwayat' },
];

/** Navy app navbar shown on authenticated screens (handoff §Global navbar). */
export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  async function onLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex h-[60px] max-w-[1200px] items-center justify-between px-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex cursor-pointer items-center gap-2.5 bg-transparent"
        >
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-blue">
            <Mic size={15} color="#fff" strokeWidth={2.2} />
          </div>
          <span className="text-base font-semibold tracking-[-0.01em] text-white">InterviewAI</span>
        </button>

        <nav className="flex items-center gap-6">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? 'text-white' : 'text-[#94a3b8] hover:text-white'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <button
            onClick={onLogout}
            className="text-sm font-medium text-[#94a3b8] hover:text-white"
          >
            Keluar
          </button>
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-blue text-sm font-medium text-white">
            {initial}
          </div>
        </nav>
      </div>
    </header>
  );
}
