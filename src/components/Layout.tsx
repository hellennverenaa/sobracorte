import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, Package, ArrowRightLeft, LogOut, User, UserCircle } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-500 p-2 rounded-lg">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">SobraCorte</h1>
                <p className="text-xs text-gray-300">Pavilhão do Corte Automático</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user?.nome}</p>
                <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
              </div>
              <div className="bg-gray-700 p-2 rounded-full">
                <UserCircle className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex space-x-1 overflow-x-auto">
            <Link
              to="/"
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors ${
                isActive('/')
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Home className="w-4 h-4" />
              <span className="font-medium whitespace-nowrap">Dashboard</span>
            </Link>

            <Link
              to="/materials"
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors ${
                isActive('/materials')
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Package className="w-4 h-4" />
              <span className="font-medium whitespace-nowrap">Materiais</span>
            </Link>

            <Link
              to="/movement"
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors ${
                isActive('/movement')
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span className="font-medium whitespace-nowrap">Movimentação</span>
            </Link>

            <Link
              to="/profile"
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors ${
                isActive('/profile')
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <UserCircle className="w-4 h-4" />
              <span className="font-medium whitespace-nowrap">Perfil</span>
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-3 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors ml-auto"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium whitespace-nowrap">Sair</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto py-4">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600">
          © 2025 SobraCorte - Sistema de Gerenciamento de Sobras
        </div>
      </footer>
    </div>
  );
}