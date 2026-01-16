import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Package2, TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface DashboardStats {
  totalMaterials: number;
  lowStock: number;
  todayTransactions: number;
  totalStock: number;
}

interface DashboardPageProps {
  onNavigate: (page: string) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalMaterials: 0,
    lowStock: 0,
    todayTransactions: 0,
    totalStock: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Fetch materials
      const materialsRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );
      const materialsData = await materialsRes.json();
      const materials = materialsData.materials || [];

      // Fetch today's transactions
      const transactionsRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/transactions/today`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );
      const transactionsData = await transactionsRes.json();

      // Calculate stats
      const lowStockCount = materials.filter((m: any) => m.quantidade_atual < 100).length;
      const totalStock = materials.reduce((sum: number, m: any) => sum + m.quantidade_atual, 0);

      setStats({
        totalMaterials: materials.length,
        lowStock: lowStockCount,
        todayTransactions: transactionsData.count || 0,
        totalStock
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total de Materiais',
      value: stats.totalMaterials,
      icon: Package2,
      color: 'bg-blue-500',
      textColor: 'text-blue-500'
    },
    {
      title: 'Baixo Estoque',
      value: stats.lowStock,
      icon: AlertTriangle,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-500'
    },
    {
      title: 'Movimentações Hoje',
      value: stats.todayTransactions,
      icon: Activity,
      color: 'bg-green-500',
      textColor: 'text-green-500'
    },
    {
      title: 'Estoque Total (unidades)',
      value: stats.totalStock.toLocaleString('pt-BR'),
      icon: TrendingUp,
      color: 'bg-purple-500',
      textColor: 'text-purple-500'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-slate-400">Visão geral do sistema de gerenciamento de sobras</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="h-4 bg-slate-700 rounded animate-pulse w-2/3"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-slate-700 rounded animate-pulse w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card, index) => (
            <Card key={index} className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-300">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${card.color}`}>
                  <card.icon className="h-4 w-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${card.textColor}`}>
                  {card.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Ações Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              onClick={() => onNavigate('movimentacao')}
              className="w-full p-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <TrendingUp className="h-5 w-5" />
              Registrar Entrada
            </button>
            <button
              onClick={() => onNavigate('movimentacao')}
              className="w-full p-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <TrendingDown className="h-5 w-5" />
              Registrar Saída
            </button>
            <button
              onClick={() => onNavigate('materiais')}
              className="w-full p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Package2 className="h-5 w-5" />
              Consultar Materiais
            </button>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Alertas do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.lowStock > 0 ? (
              <div className="space-y-2">
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-yellow-500 font-semibold">Estoque Baixo</p>
                      <p className="text-slate-400 text-sm">
                        {stats.lowStock} {stats.lowStock === 1 ? 'material está' : 'materiais estão'} com quantidade abaixo de 100 unidades
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('materiais')}
                  className="w-full p-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  Ver Materiais em Baixo Estoque
                </button>
              </div>
            ) : (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Activity className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-green-500 font-semibold">Sistema Normal</p>
                    <p className="text-slate-400 text-sm">
                      Todos os materiais estão com estoque adequado
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
