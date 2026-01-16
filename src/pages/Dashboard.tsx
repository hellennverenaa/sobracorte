import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Package, TrendingDown, ArrowRightLeft, TrendingUp, ArrowDownCircle } from 'lucide-react';
import { Layout } from '../components/Layout';
import { InitialSetup } from '../components/InitialSetup';

interface Stats {
  total_materials: number;
  low_stock_count: number;
  today_transactions: number;
  total_entradas: number;
  total_saidas: number;
}

export function Dashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<Stats>({
    total_materials: 0,
    low_stock_count: 0,
    today_transactions: 0,
    total_entradas: 0,
    total_saidas: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb`;

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/stats`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color, 
    bgColor 
  }: { 
    title: string; 
    value: number; 
    icon: any; 
    color: string; 
    bgColor: string; 
  }) => (
    <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`${bgColor} p-4 rounded-xl`}>
          <Icon className={`w-8 h-8 ${color}`} />
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h2>
          <p className="text-gray-600">Visão geral do estoque de sobras de materiais</p>
        </div>

        {/* Initial Setup - Show if no materials */}
        {stats.total_materials === 0 && !isLoading && (
          <div className="mb-6">
            <InitialSetup />
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total de Materiais"
            value={stats.total_materials}
            icon={Package}
            color="text-blue-600"
            bgColor="bg-blue-100"
          />

          <StatCard
            title="Baixo Estoque"
            value={stats.low_stock_count}
            icon={TrendingDown}
            color="text-red-600"
            bgColor="bg-red-100"
          />

          <StatCard
            title="Movimentações Hoje"
            value={stats.today_transactions}
            icon={ArrowRightLeft}
            color="text-purple-600"
            bgColor="bg-purple-100"
          />

          <StatCard
            title="Total de Entradas"
            value={stats.total_entradas}
            icon={TrendingUp}
            color="text-green-600"
            bgColor="bg-green-100"
          />
        </div>

        {/* Additional Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h3>
            <div className="space-y-3">
              <a
                href="/materials"
                className="flex items-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <Package className="w-5 h-5 text-blue-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Consultar Materiais</p>
                  <p className="text-sm text-gray-600">Visualize e gerencie o estoque</p>
                </div>
              </a>

              <a
                href="/movement"
                className="flex items-center p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
              >
                <ArrowRightLeft className="w-5 h-5 text-green-600 mr-3" />
                <div>
                  <p className="font-medium text-gray-900">Registrar Movimentação</p>
                  <p className="text-sm text-gray-600">Entrada ou saída de materiais</p>
                </div>
              </a>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumo de Transações</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <TrendingUp className="w-5 h-5 text-green-600 mr-3" />
                  <span className="font-medium text-gray-900">Entradas</span>
                </div>
                <span className="text-xl font-bold text-green-600">{stats.total_entradas}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                <div className="flex items-center">
                  <ArrowDownCircle className="w-5 h-5 text-red-600 mr-3" />
                  <span className="font-medium text-gray-900">Saídas</span>
                </div>
                <span className="text-xl font-bold text-red-600">{stats.total_saidas}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Alert for low stock */}
        {stats.low_stock_count > 0 && (
          <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <TrendingDown className="h-5 w-5 text-yellow-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <span className="font-medium">Atenção:</span> Você tem {stats.low_stock_count} {stats.low_stock_count === 1 ? 'material' : 'materiais'} com estoque baixo (menos de 10 unidades).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}