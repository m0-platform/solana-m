import { NavLink, useLocation } from 'react-router-dom';

export const Navbar = () => {
  let location = useLocation();

  return (
    <nav className="bg-off-black py-2 px-2">
      <div className="max-w-6xl mx-auto flex justify-between">
        <div className="flex">
          <a href="/" className="flex mr-15 space-x-3">
            <img
              src="https://dashboard.m0.org/img/logos/m0.svg"
              alt="M0 Logo"
              className="py-3 pr-3 mb-1 border-r border-gray-700"
            />
            <div className="text-white text-lg hidden md:flex items-center">Solana Dashboard</div>
          </a>
          <div className="space-x-4 flex items-center">
            {[
              { path: '/', label: 'Home' },
              { path: '/swap', label: 'Swap' },
              { path: '/bridge', label: 'Bridge' },
            ].map(({ path, label }) => (
              <NavLink
                key={path}
                to={path}
                className={`px-2 py-1.5 text-gray-300 text-sm ${location.pathname === path ? 'bg-gray-700' : ''}`}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="hidden md:flex items-center space-x-4">
          <appkit-button size="sm" balance="hide" />
        </div>
      </div>
    </nav>
  );
};
